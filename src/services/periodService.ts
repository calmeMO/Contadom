import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';

export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  closed_by?: string;
  created_by?: string;
}

/**
 * Obtiene todos los períodos contables
 */
export async function fetchAccountingPeriods() {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .order('start_date', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error al obtener períodos contables:', error);
    toast.error('Error al cargar los períodos contables');
    return [];
  }
}

/**
 * Obtiene un período contable por ID
 */
export async function fetchAccountingPeriodById(periodId: string) {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error al obtener período contable:', error);
    return null;
  }
}

/**
 * Obtiene los períodos contables abiertos
 */
export async function fetchOpenAccountingPeriods() {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('is_closed', false)
      .order('start_date', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error al obtener períodos contables abiertos:', error);
    toast.error('Error al cargar los períodos contables');
    return [];
  }
}

/**
 * Verifica si existen asientos contables en un período
 */
export async function checkPeriodHasEntries(periodId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('accounting_period_id', periodId)
      .limit(1);
      
    if (error) throw error;
    return (data && data.length > 0);
  } catch (error) {
    console.error('Error al verificar asientos del período:', error);
    return false;
  }
}

/**
 * Verifica si hay períodos que se solapan con el rango de fechas dado
 */
export async function checkOverlappingPeriods(
  startDate: string,
  endDate: string,
  excludePeriodId?: string
): Promise<boolean> {
  try {
    let query = supabase
      .from('accounting_periods')
      .select('id')
      .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);
      
    if (excludePeriodId) {
      query = query.neq('id', excludePeriodId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return (data && data.length > 0);
  } catch (error) {
    console.error('Error al verificar solapamiento de períodos:', error);
    return false;
  }
}

/**
 * Crea un nuevo período contable con validaciones
 */
export async function createAccountingPeriod(
  periodData: Partial<AccountingPeriod>,
  userId: string
) {
  try {
    // Validar fechas
    if (!periodData.start_date || !periodData.end_date) {
      throw new Error('Las fechas de inicio y fin son requeridas');
    }
    
    const startDate = new Date(periodData.start_date);
    const endDate = new Date(periodData.end_date);
    
    if (endDate < startDate) {
      throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio');
    }
    
    // Verificar solapamiento con otros períodos
    const hasOverlap = await checkOverlappingPeriods(
      periodData.start_date,
      periodData.end_date
    );
    
    if (hasOverlap) {
      throw new Error('El período se solapa con otro período existente');
    }
    
    // Crear período
    const { data, error } = await supabase
      .from('accounting_periods')
      .insert({
        ...periodData,
        is_closed: false,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();
      
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error al crear período contable:', error);
    throw new Error(error.message || 'Error al crear el período contable');
  }
}

/**
 * Actualiza un período contable existente
 */
export async function updateAccountingPeriod(
  periodId: string,
  periodData: Partial<AccountingPeriod>
) {
  try {
    // Verificar si el período está cerrado
    const { data: currentPeriod, error: checkError } = await supabase
      .from('accounting_periods')
      .select('is_closed')
      .eq('id', periodId)
      .single();
      
    if (checkError) throw checkError;
    
    if (currentPeriod?.is_closed) {
      throw new Error('No se puede modificar un período cerrado');
    }
    
    // Si se están actualizando las fechas, verificar solapamiento
    if (periodData.start_date || periodData.end_date) {
      // Obtener período actual
      const { data: fullPeriod, error: fetchError } = await supabase
        .from('accounting_periods')
        .select('start_date, end_date')
        .eq('id', periodId)
        .single();
        
      if (fetchError) throw fetchError;
      
      const startDate = periodData.start_date || fullPeriod?.start_date;
      const endDate = periodData.end_date || fullPeriod?.end_date;
      
      if (startDate && endDate) {
        const hasOverlap = await checkOverlappingPeriods(
          startDate,
          endDate,
          periodId
        );
        
        if (hasOverlap) {
          throw new Error('El período se solapa con otro período existente');
        }
      }
    }
    
    // Actualizar período
    const { data, error } = await supabase
      .from('accounting_periods')
      .update({
        ...periodData,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId)
      .select();
      
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error al actualizar período contable:', error);
    throw new Error(error.message || 'Error al actualizar el período contable');
  }
}

/**
 * Cierra un período contable
 */
export async function closeAccountingPeriod(periodId: string, userId: string) {
  try {
    // Verificar si el período está cerrado
    const { data: currentPeriod, error: checkError } = await supabase
      .from('accounting_periods')
      .select('is_closed')
      .eq('id', periodId)
      .single();
      
    if (checkError) throw checkError;
    
    if (currentPeriod?.is_closed) {
      throw new Error('El período ya está cerrado');
    }
    
    // Cerrar período
    const { data, error } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId)
      .select();
      
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error al cerrar período contable:', error);
    throw new Error(error.message || 'Error al cerrar el período contable');
  }
}

/**
 * Elimina un período contable (solo si no tiene asientos)
 */
export async function deleteAccountingPeriod(periodId: string) {
  try {
    // Verificar si hay asientos en el período
    const hasEntries = await checkPeriodHasEntries(periodId);
    if (hasEntries) {
      throw new Error('No se puede eliminar un período que contiene asientos contables');
    }
    
    // Eliminar período
    const { error } = await supabase
      .from('accounting_periods')
      .delete()
      .eq('id', periodId);
      
    if (error) throw error;
    return true;
  } catch (error: any) {
    console.error('Error al eliminar período contable:', error);
    throw new Error(error.message || 'Error al eliminar el período contable');
  }
} 