import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format, parseISO, startOfMonth, endOfMonth, addMonths } from 'date-fns';

export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  is_annual: boolean;
  parent_id?: string | null;
  created_by: string;
  created_at: string;
  closed_at?: string | null;
  closed_by?: string | null;
  notes?: string | null;
  year?: number;
  month?: number;
}

export interface MonthlyPeriod {
  id?: string;
  fiscal_year_id: string;
  month?: number;
  year?: number;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  is_active: boolean;
  closed_at?: string;
  closed_by?: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  notes?: string;
  is_reopened?: boolean;
  reopened_at?: string;
  reopened_by?: string;
  reclosed_at?: string;
  reclosed_by?: string;
  fiscal_year_name?: string;
}

// Interfaces
export interface FiscalYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  is_active: boolean;
  closed_at?: string;
  closed_by?: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  period_type: 'monthly' | 'quarterly';
  fiscal_purpose?: string;
  dgii_submission_date?: string;
  has_balanced_accounts: boolean;
  notes?: string;
  parent_id?: string;
  is_month: false;
  is_reopened: boolean;
  reopened_at?: string;
  reopened_by?: string;
  reclosed_at?: string;
  reclosed_by?: string;
  fiscal_year_type: 'calendar' | 'custom';
  months?: MonthlyPeriod[];
  monthly_periods?: MonthlyPeriod[];
}

export interface PeriodForm {
  name: string;
  start_date: string;
  end_date: string;
  notes?: string;
  fiscal_year_type: 'calendar' | 'custom';
}

/**
 * Obtiene todos los períodos contables
 */
export async function fetchAccountingPeriods(): Promise<AccountingPeriod[]> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .order('start_date', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching accounting periods:', error);
    toast.error('Error al cargar los períodos contables');
    return [];
  }
}

/**
 * Obtiene un período contable específico por ID
 */
export async function getAccountingPeriodById(id: string): Promise<AccountingPeriod | null> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching accounting period:', error);
    return null;
  }
}

/**
 * Obtiene períodos anuales (períodos padre)
 */
export async function fetchAnnualPeriods(): Promise<AccountingPeriod[]> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('is_annual', true)
      .order('start_date', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching annual periods:', error);
    toast.error('Error al cargar los períodos anuales');
    return [];
  }
}

/**
 * Obtiene los períodos mensuales de un período anual
 */
export async function fetchMonthlyPeriods(annualPeriodId: string): Promise<AccountingPeriod[]> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('parent_id', annualPeriodId)
      .order('start_date');
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching monthly periods:', error);
    toast.error('Error al cargar los períodos mensuales');
    return [];
  }
}

/**
 * Crea un nuevo período contable anual
 */
export async function createAnnualPeriod(
  name: string,
  startDate: string,
  endDate: string,
  userId: string,
  createMonthlyPeriods: boolean = true
): Promise<string | null> {
  try {
    // 1. Crear el período anual
    const { data: annualPeriod, error: annualError } = await supabase
      .from('accounting_periods')
      .insert([{
        name,
        start_date: startDate,
        end_date: endDate,
        is_closed: false,
        is_annual: true,
        created_by: userId,
        year: new Date(startDate).getFullYear()
      }])
      .select()
      .single();
      
    if (annualError) throw annualError;
    
    if (!annualPeriod) {
      throw new Error('No se pudo crear el período anual');
    }
    
    // 2. Si se solicita, crear los períodos mensuales automáticamente
    if (createMonthlyPeriods) {
      const monthlyPeriods = generateMonthlyPeriods(
        annualPeriod.id,
        startDate,
        endDate
      );
      
      // Insertar períodos mensuales
      if (monthlyPeriods.length > 0) {
        const monthlyPeriodsToInsert = monthlyPeriods.map(period => ({
          name: period.name,
          start_date: period.start_date,
          end_date: period.end_date,
          is_closed: false,
          is_annual: false,
          parent_id: annualPeriod.id,
          created_by: userId,
          year: period.year,
          month: period.month
        }));
        
        const { error: monthlyError } = await supabase
          .from('accounting_periods')
          .insert(monthlyPeriodsToInsert);
          
        if (monthlyError) {
          console.error('Error creating monthly periods:', monthlyError);
          // No interrumpimos el flujo, ya se creó el período anual
        }
      }
    }
    
    toast.success('Período contable creado con éxito');
    return annualPeriod.id;
  } catch (error) {
    console.error('Error creating accounting period:', error);
    toast.error('Error al crear el período contable');
    return null;
  }
}

/**
 * Genera períodos mensuales a partir de un rango de fechas
 */
export function generateMonthlyPeriods(
  parentId: string,
  startDate: string,
  endDate: string
): MonthlyPeriod[] {
  const periods: MonthlyPeriod[] = [];
  
  // Convertir a objetos Date
  let currentDate = startOfMonth(parseISO(startDate));
  const lastDate = endOfMonth(parseISO(endDate));
  
  // Generar períodos para cada mes en el rango
  while (currentDate <= lastDate) {
    const periodEndDate = endOfMonth(currentDate);
    const month = currentDate.getMonth() + 1; // 1-12
    const year = currentDate.getFullYear();
    
    periods.push({
      name: `${format(currentDate, 'MMMM yyyy')}`,
      month,
      year,
      start_date: format(currentDate, 'yyyy-MM-dd'),
      end_date: format(periodEndDate, 'yyyy-MM-dd'),
      is_closed: false,
      is_active: true,
      fiscal_year_id: parentId
    });
    
    // Avanzar al siguiente mes
    currentDate = addMonths(currentDate, 1);
  }
  
  return periods;
}

/**
 * Cierra un período contable
 */
export async function closePeriod(periodId: string, userId: string, notes?: string): Promise<boolean> {
  try {
    // 1. Verificar si el período ya está cerrado
    const { data: period, error: periodError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();
      
    if (periodError) throw periodError;
    
    if (period.is_closed) {
      toast.warning('Este período ya está cerrado');
      return false;
    }
    
    // 2. Si es un período mensual, verificar que no haya asientos pendientes
    if (!period.is_annual) {
      const { count, error: countError } = await supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('accounting_period_id', periodId)
        .eq('is_approved', false);
        
      if (countError) throw countError;
      
      if (count && count > 0) {
        toast.error(`No se puede cerrar el período porque hay ${count} asientos pendientes de aprobar`);
        return false;
      }
    }
    
    // 3. Realizar el cierre del período
    const { error: updateError } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        notes: notes || null
      })
      .eq('id', periodId);
      
    if (updateError) throw updateError;
    
    // 4. Si es un período anual, cerrar también los períodos mensuales
    if (period.is_annual) {
      const { error: monthlyUpdateError } = await supabase
        .from('accounting_periods')
        .update({
          is_closed: true,
          closed_at: new Date().toISOString(),
          closed_by: userId
        })
        .eq('parent_id', periodId)
        .eq('is_closed', false);
        
      if (monthlyUpdateError) {
        console.error('Error closing monthly periods:', monthlyUpdateError);
        // No interrumpimos el flujo, ya se cerró el período anual
      }
    }
    
    toast.success('Período contable cerrado con éxito');
    return true;
  } catch (error) {
    console.error('Error closing accounting period:', error);
    toast.error('Error al cerrar el período contable');
    return false;
  }
}

/**
 * Reabre un período contable
 */
export async function reopenPeriod(periodId: string): Promise<boolean> {
  try {
    // 1. Verificar si el período está cerrado
    const { data: period, error: periodError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();
      
    if (periodError) throw periodError;
    
    if (!period.is_closed) {
      toast.warning('Este período ya está abierto');
      return false;
    }
    
    // 2. Si es un período mensual, verificar que el período anual no esté cerrado
    if (!period.is_annual && period.parent_id) {
      const { data: parentPeriod, error: parentError } = await supabase
        .from('accounting_periods')
        .select('is_closed')
        .eq('id', period.parent_id)
        .single();
        
      if (parentError) throw parentError;
      
      if (parentPeriod.is_closed) {
        toast.error('No se puede reabrir el período mensual porque el período anual está cerrado');
        return false;
      }
    }
    
    // 3. Reabrir el período
    const { error: updateError } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: false,
        closed_at: null,
        closed_by: null
      })
      .eq('id', periodId);
      
    if (updateError) throw updateError;
    
    // 4. Si es un período anual, reabrir también los períodos mensuales
    if (period.is_annual) {
      const { error: monthlyUpdateError } = await supabase
        .from('accounting_periods')
        .update({
          is_closed: false,
          closed_at: null,
          closed_by: null
        })
        .eq('parent_id', periodId);
        
      if (monthlyUpdateError) {
        console.error('Error reopening monthly periods:', monthlyUpdateError);
        // No interrumpimos el flujo, ya se reabrió el período anual
      }
    }
    
    toast.success('Período contable reabierto con éxito');
    return true;
  } catch (error) {
    console.error('Error reopening accounting period:', error);
    toast.error('Error al reabrir el período contable');
    return false;
  }
}

/**
 * Verificar si un período está cerrado
 */
export async function isPeriodClosed(periodId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('is_closed')
      .eq('id', periodId)
      .single();
      
    if (error) throw error;
    return data?.is_closed || false;
  } catch (error) {
    console.error('Error checking if period is closed:', error);
    return false; // Por defecto, asumimos que no está cerrado en caso de error
  }
}

/**
 * Verifica si una fecha pertenece a un período contable específico
 */
export function isDateInPeriod(date: string, period: AccountingPeriod): boolean {
  const dateObj = new Date(date);
  const startDate = new Date(period.start_date);
  const endDate = new Date(period.end_date);
  
  return dateObj >= startDate && dateObj <= endDate;
}

/**
 * Encuentra el período mensual correspondiente a una fecha
 */
export async function findMonthlyPeriodForDate(date: string): Promise<AccountingPeriod | null> {
  try {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // 1-12
    
    // Buscar período mensual que coincida con año y mes
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .eq('is_annual', false)
      .limit(1);
      
    if (error) throw error;
    
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error finding monthly period for date:', error);
    return null;
  }
}

/**
 * Valida si un asiento contable puede ser registrado en un período
 */
export async function validateJournalEntryDate(date: string, periodId?: string): Promise<{
  valid: boolean;
  message?: string;
  period?: AccountingPeriod | MonthlyPeriod;
}> {
  try {
    // Si hay un ID de período específico, verificar que la fecha corresponda a ese período
    if (periodId) {
      // Intentar obtener como período mensual primero
      const { data: monthlyPeriod, error: monthlyError } = await supabase
        .from('monthly_accounting_periods')
        .select('*, fiscal_year:fiscal_year_id(name, is_closed, is_active)')
        .eq('id', periodId)
        .single();
        
      if (!monthlyError && monthlyPeriod) {
        // Es un período mensual
        
        // Verificar que el período esté activo
        if (!monthlyPeriod.is_active) {
          return {
            valid: false,
            message: 'No se pueden registrar asientos en un período inactivo'
          };
        }
        
        // Verificar que el período no esté cerrado
        if (monthlyPeriod.is_closed) {
          return {
            valid: false,
            message: 'No se pueden registrar asientos en un período cerrado'
          };
        }
        
        // Verificar que el año fiscal esté activo y no cerrado
        if (monthlyPeriod.fiscal_year?.is_closed) {
          return {
            valid: false,
            message: `No se pueden registrar asientos en un período cuyo año fiscal (${monthlyPeriod.fiscal_year.name}) está cerrado`
          };
        }
        
        if (!monthlyPeriod.fiscal_year?.is_active) {
          return {
            valid: false,
            message: `No se pueden registrar asientos en un período cuyo año fiscal (${monthlyPeriod.fiscal_year.name}) está inactivo`
          };
        }
        
        // Verificar que la fecha esté dentro del período
        const entryDate = new Date(date);
        const startDate = new Date(monthlyPeriod.start_date);
        const endDate = new Date(monthlyPeriod.end_date);
        
        if (entryDate < startDate || entryDate > endDate) {
          return {
            valid: false,
            message: `La fecha del asiento (${new Date(date).toLocaleDateString()}) debe estar dentro del período ${monthlyPeriod.name} (${new Date(monthlyPeriod.start_date).toLocaleDateString()} - ${new Date(monthlyPeriod.end_date).toLocaleDateString()})`
          };
        }
        
        return {
          valid: true,
          period: monthlyPeriod
        };
      }
      
      // Intentar obtener como período fiscal (año)
      const period = await getAccountingPeriodById(periodId);
      
      if (!period) {
        return {
          valid: false,
          message: 'El período contable seleccionado no existe'
        };
      }
      
      if (period.is_closed) {
        return {
          valid: false,
          message: 'No se pueden registrar asientos en un período cerrado'
        };
      }
      
      if (!isDateInPeriod(date, period)) {
        return {
          valid: false,
          message: `La fecha del asiento debe estar dentro del período ${period.name} (${period.start_date} - ${period.end_date})`
        };
      }
      
      return {
        valid: true,
        period
      };
    }
    
    // Si no hay ID de período, buscar el período correspondiente a la fecha
    const period = await findMonthlyPeriodForDate(date);
    
    if (!period) {
      return {
        valid: false,
        message: 'No existe un período contable para la fecha seleccionada'
      };
    }
    
    if (period.is_closed) {
      return {
        valid: false,
        message: `El período ${period.name} está cerrado. No se pueden registrar asientos en períodos cerrados.`
      };
    }
    
    return {
      valid: true,
      period
    };
  } catch (error) {
    console.error('Error validating journal entry date:', error);
    return {
      valid: false,
      message: 'Error al validar la fecha del asiento'
    };
  }
}

/**
 * Obtiene el período activo actual (el período mensual abierto más reciente)
 */
export async function getCurrentPeriod(): Promise<AccountingPeriod | null> {
  try {
    // Buscar períodos activos (no cerrados)
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('is_closed', false)
      .order('end_date', { ascending: false })
      .limit(1);
      
    if (error) throw error;
    
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error fetching current period:', error);
    return null;
  }
}

/**
 * Función para obtener todos los años fiscales
 */
export async function fetchFiscalYears(): Promise<{ data: FiscalYear[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('is_month', false)
      .order('start_date', { ascending: false });

    if (error) throw error;

    // Obtener períodos mensuales para cada año fiscal
    const fiscalYearsWithMonths = await Promise.all(
      (data || []).map(async (year) => {
        const { data: monthsData, error: monthsError } = await supabase
          .from('monthly_accounting_periods')
          .select('*')
          .eq('fiscal_year_id', year.id)
          .order('month');

        if (monthsError) throw monthsError;

        return {
          ...year,
          months: monthsData || []
        };
      })
    );

    return { data: fiscalYearsWithMonths, error: null };
  } catch (error) {
    console.error('Error al obtener años fiscales:', error);
    return { data: [], error };
  }
}

/**
 * Función para obtener un año fiscal específico con sus meses
 */
export async function getFiscalYear(id: string): Promise<{ data: FiscalYear | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return { data: null, error: null };

    // Obtener períodos mensuales
    const { data: monthsData, error: monthsError } = await supabase
      .from('monthly_accounting_periods')
      .select('*')
      .eq('fiscal_year_id', id)
      .order('month');

    if (monthsError) throw monthsError;

    return { 
      data: {
        ...data,
        months: monthsData || []
      }, 
      error: null 
    };
  } catch (error) {
    console.error('Error al obtener año fiscal:', error);
    return { data: null, error };
  }
}

/**
 * Crea un nuevo año fiscal con sus períodos mensuales
 */
export async function createFiscalYear(
  formData: PeriodForm,
  userId: string
): Promise<{ data: FiscalYear | null; error: any }> {
  try {
    if (!userId) {
      throw new Error('Usuario no autenticado');
    }

    // Crear año fiscal
    const { data, error } = await supabase
      .from('accounting_periods')
      .insert({
        name: formData.name,
        start_date: formData.start_date,
        end_date: formData.end_date,
        notes: formData.notes || null,
        is_closed: false,
        is_active: true,
        period_type: 'monthly',
        is_month: false,
        is_reopened: false,
        has_balanced_accounts: false,
        fiscal_year_type: formData.fiscal_year_type,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) throw error;
    if (!data) throw new Error('Error al crear año fiscal');

    // Generar períodos mensuales
    const monthlyPeriods = generateMonthlyPeriods(data.id, formData.start_date, formData.end_date);
    
    // Enriquecer los datos de período mensual
    const monthsToInsert = monthlyPeriods.map(period => ({
      ...period,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    // Insertar períodos mensuales
    const { error: monthsError } = await supabase
      .from('monthly_accounting_periods')
      .insert(monthsToInsert);
    
    if (monthsError) {
      // Si hay error al crear los meses, eliminar el año fiscal para mantener consistencia
      console.error('Error al crear períodos mensuales, revirtiendo creación de año fiscal:', monthsError);
      await supabase.from('accounting_periods').delete().eq('id', data.id);
      throw new Error(`Error al crear períodos mensuales: ${monthsError.message}`);
    }
    
    console.log(`Año fiscal ${formData.name} creado con ${monthsToInsert.length} períodos mensuales`);
    
    // Obtener el año fiscal con sus meses
    return getFiscalYear(data.id);
  } catch (error: any) {
    console.error('Error al crear año fiscal:', error);
    return { data: null, error: error.message || 'Error desconocido al crear año fiscal' };
  }
}

/**
 * Cierra un período mensual permanentemente (no puede ser reabierto)
 */
export async function closeMonthlyPeriod(
  periodId: string,
  userId: string
): Promise<{ success: boolean; error: any }> {
  try {
    // Verificar que el período existe y está activo
    const { data: period, error: checkError } = await supabase
      .from('monthly_accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();
    
    if (checkError) throw checkError;
    
    if (!period) {
      return { success: false, error: 'Período no encontrado' };
    }
    
    if (period.is_closed) {
      return { success: false, error: 'El período ya está cerrado permanentemente' };
    }
    
    // Verificar que no hay asientos pendientes
    const { count, error: pendingError } = await supabase
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('monthly_period_id', periodId)
      .or('is_approved.eq.false,status.eq.draft');
    
    if (pendingError) throw pendingError;
    
    if (count && count > 0) {
      return { success: false, error: 'No se puede cerrar el período. Hay asientos pendientes de aprobación.' };
    }
    
    // Cerrar el período (permanentemente)
    const { error } = await supabase
      .from('monthly_accounting_periods')
      .update({
        is_closed: true,
        is_active: false,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId);
    
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error al cerrar período mensual:', error);
    return { success: false, error };
  }
}

/**
 * Activa o inactiva un período mensual (pero no cerrado)
 */
export async function toggleMonthlyPeriodActive(
  periodId: string,
  isActive: boolean,
  userId: string
): Promise<{ success: boolean; error: any }> {
  try {
    // Verificar que el período existe y no está cerrado
    const { data: period, error: checkError } = await supabase
      .from('monthly_accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();
    
    if (checkError) throw checkError;
    
    if (!period) {
      return { success: false, error: 'Período no encontrado' };
    }
    
    if (period.is_closed) {
      return { success: false, error: 'No se puede modificar un período cerrado permanentemente' };
    }
    
    // Activar o inactivar el período
    const { error } = await supabase
      .from('monthly_accounting_periods')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
        ...(isActive && {
          is_reopened: true,
          reopened_at: new Date().toISOString(),
          reopened_by: userId
        })
      })
      .eq('id', periodId);
    
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error(`Error al ${isActive ? 'activar' : 'inactivar'} período mensual:`, error);
    return { success: false, error };
  }
}

/**
 * Reabre un período mensual
 */
export async function reopenMonthlyPeriod(
  periodId: string,
  reason: string,
  userId: string
): Promise<{ success: boolean; error: any }> {
  try {
    if (!userId) {
      throw new Error('Usuario no autenticado');
    }

    if (!reason || reason.trim() === '') {
      throw new Error('Debe proporcionar un motivo para reabrir el período');
    }

    // Verificar que el período esté cerrado
    const { data: period, error: periodError } = await supabase
      .from('monthly_accounting_periods')
      .select('is_closed, fiscal_year_id')
      .eq('id', periodId)
      .single();

    if (periodError) throw periodError;

    if (!period) {
      throw new Error('Período no encontrado');
    }

    if (!period.is_closed) {
      throw new Error('El período ya está abierto');
    }

    // Verificar que el año fiscal no esté cerrado
    const { data: fiscalYear, error: fiscalYearError } = await supabase
      .from('accounting_periods')
      .select('is_closed')
      .eq('id', period.fiscal_year_id)
      .single();

    if (fiscalYearError) throw fiscalYearError;

    if (!fiscalYear) {
      throw new Error('Año fiscal no encontrado');
    }

    if (fiscalYear.is_closed) {
      throw new Error('No se puede reabrir un período de un año fiscal cerrado');
    }

    // Reabrir el período
    const { error } = await supabase
      .from('monthly_accounting_periods')
      .update({
        is_closed: false,
        is_reopened: true,
        reopened_at: new Date().toISOString(),
        reopened_by: userId,
        updated_at: new Date().toISOString(),
        notes: `Reabierto: ${reason}`
      })
      .eq('id', periodId);

    if (error) throw error;

    return { success: true, error: null };
  } catch (error) {
    console.error('Error al reabrir período mensual:', error);
    return { success: false, error };
  }
}

/**
 * Cierra un año fiscal y todos sus períodos mensuales
 */
export async function closeFiscalYear(
  fiscalYearId: string,
  userId: string
): Promise<{ success: boolean; error: any }> {
  try {
    if (!userId) {
      throw new Error('Usuario no autenticado');
    }

    // 1. Verificar que todos los períodos mensuales estén listos para cerrar
    // (no pueden haber asientos pendientes de aprobación)
    const { data: monthlyPeriods, error: monthsQueryError } = await supabase
      .from('monthly_accounting_periods')
      .select('id, name')
      .eq('fiscal_year_id', fiscalYearId);
      
    if (monthsQueryError) throw monthsQueryError;
    
    if (!monthlyPeriods || monthlyPeriods.length === 0) {
      return { success: false, error: 'El año fiscal no tiene períodos mensuales asociados' };
    }
    
    // Verificar que no haya asientos pendientes en ninguno de los períodos
    const monthlyPeriodIds = monthlyPeriods.map(p => p.id);
    const { data: pendingEntries, error: pendingError } = await supabase
      .from('journal_entries')
      .select('id, entry_number, monthly_period_id')
      .in('monthly_period_id', monthlyPeriodIds)
      .or('is_approved.eq.false,status.eq.draft,status.eq.pendiente');
      
    if (pendingError) throw pendingError;
    
    if (pendingEntries && pendingEntries.length > 0) {
      return { 
        success: false, 
        error: `No se puede cerrar el año fiscal porque hay ${pendingEntries.length} asientos pendientes de aprobación` 
      };
    }

    // 2. Cerrar todos los períodos mensuales que no estén cerrados
    const { data: openMonths, error: openMonthsError } = await supabase
      .from('monthly_accounting_periods')
      .select('id, name')
      .eq('fiscal_year_id', fiscalYearId)
      .eq('is_closed', false);

    if (openMonthsError) throw openMonthsError;

    if (openMonths && openMonths.length > 0) {
      // Cerrar los períodos mensuales abiertos
      const { error: closeMonthsError } = await supabase
        .from('monthly_accounting_periods')
        .update({
          is_closed: true,
          is_active: false,
          closed_at: new Date().toISOString(),
          closed_by: userId,
          updated_at: new Date().toISOString()
        })
        .in('id', openMonths.map(m => m.id));
        
      if (closeMonthsError) {
        throw new Error(`Error al cerrar períodos mensuales: ${closeMonthsError.message}`);
      }
      
      console.log(`Cerrados ${openMonths.length} períodos mensuales del año fiscal`);
    }

    // 3. Cerrar el año fiscal
    const { error } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: true,
        is_active: false,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', fiscalYearId);

    if (error) throw error;
    
    console.log(`Año fiscal ${fiscalYearId} cerrado correctamente`);

    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error al cerrar año fiscal:', error);
    return { success: false, error: error.message || 'Error desconocido al cerrar año fiscal' };
  }
}

/**
 * Obtiene los períodos mensuales disponibles para un asiento contable
 * Prioriza los períodos del año fiscal actual que estén activos y no cerrados
 */
export async function getAvailablePeriodsForEntry(): Promise<{ data: MonthlyPeriod[]; error: any }> {
  try {
    // 1. Obtener el año fiscal activo más reciente
    const { data: fiscalYears, error: fiscalYearError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('is_closed', false)
      .eq('is_active', true)
      .is('is_month', false)
      .order('end_date', { ascending: false })
      .limit(1);
      
    if (fiscalYearError) throw fiscalYearError;
    
    // Si no hay año fiscal activo, retornar una lista vacía
    if (!fiscalYears || fiscalYears.length === 0) {
      return { data: [], error: 'No hay años fiscales activos disponibles' };
    }
    
    const currentFiscalYear = fiscalYears[0];
    
    // 2. Obtener todos los períodos mensuales activos y no cerrados del año fiscal actual
    const { data, error } = await supabase
      .from('monthly_accounting_periods')
      .select(`
        *,
        fiscal_year:fiscal_year_id (name, is_closed, is_active)
      `)
      .eq('fiscal_year_id', currentFiscalYear.id)
      .eq('is_closed', false)
      .eq('is_active', true)
      .order('start_date', { ascending: false });

    if (error) throw error;

    // 3. Procesar los períodos para el formato adecuado
    const availablePeriods = data || [];

    return { 
      data: availablePeriods.map(period => ({
        ...period,
        fiscal_year_id: period.fiscal_year_id,
        fiscal_year_name: period.fiscal_year?.name,
        // Asegurar que las fechas sean cadenas de texto adecuadas
        start_date: period.start_date ? period.start_date.split('T')[0] : period.start_date,
        end_date: period.end_date ? period.end_date.split('T')[0] : period.end_date
      })), 
      error: null 
    };
  } catch (error) {
    console.error('Error al obtener períodos disponibles:', error);
    return { data: [], error };
  }
}

/**
 * Verifica si un período mensual está cerrado
 */
export async function isMonthlyPeriodClosed(periodId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('monthly_accounting_periods')
      .select('is_closed, fiscal_year_id')
      .eq('id', periodId)
      .single();
      
    if (error) throw error;
    
    if (!data) return true; // Si no existe, considerarlo cerrado
    
    // Verificar también si el año fiscal está cerrado
    if (data.is_closed) return true;
    
    const { data: fiscalYear, error: fiscalYearError } = await supabase
      .from('accounting_periods')
      .select('is_closed')
      .eq('id', data.fiscal_year_id)
      .single();
      
    if (fiscalYearError) throw fiscalYearError;
    
    return fiscalYear?.is_closed || false;
  } catch (error) {
    console.error('Error al verificar estado del período mensual:', error);
    return true; // Por seguridad, si hay error, considerarlo cerrado
  }
}

/**
 * Inicializa períodos mensuales para un año fiscal existente
 * Solo el período correspondiente al mes actual se establece como activo
 */
export async function initializeMonthlyPeriodsForFiscalYear(fiscalYearId: string, userId: string): Promise<{ success: boolean, error?: any }> {
  try {
    // Obtener información del año fiscal
    const { data: fiscalYear, error: fiscalYearError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', fiscalYearId)
      .single();
      
    if (fiscalYearError) throw fiscalYearError;
    if (!fiscalYear) throw new Error('No se encontró el año fiscal');
    
    // Verificar si ya existen períodos
    const { data: existingPeriods, error: existingError } = await supabase
      .from('monthly_accounting_periods')
      .select('id')
      .eq('fiscal_year_id', fiscalYearId);
      
    if (existingError) throw existingError;
    
    // Si existen períodos, eliminarlos para regenerarlos
    if (existingPeriods && existingPeriods.length > 0) {
      const { error: deleteError } = await supabase
        .from('monthly_accounting_periods')
        .delete()
        .in('id', existingPeriods.map(p => p.id));
        
      if (deleteError) throw deleteError;
      
      console.log(`Eliminados ${existingPeriods.length} períodos mensuales existentes`);
    }
    
    // Generar períodos mensuales
    const startDate = new Date(fiscalYear.start_date);
    const endDate = new Date(fiscalYear.end_date);
    const periods = [];
    
    // Obtener mes y año actual para activar solo el período correspondiente
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    
    // Crear un período para cada mes en el rango
    let currentDate2 = new Date(startDate);
    while (currentDate2 <= endDate) {
      const year = currentDate2.getFullYear();
      const month = currentDate2.getMonth() + 1; // 1-12
      
      // Calcular el primer día del mes
      const firstDay = new Date(year, month - 1, 1);
      
      // Calcular el último día del mes
      const lastDay = new Date(year, month, 0);
      
      // Crear nombre del período (ej: "Enero 2025")
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const periodName = `${monthNames[month - 1]} ${year}`;
      
      // Determinar si este período debe estar activo
      const isActive = (year === currentYear && month === currentMonth) && fiscalYear.is_active;
      
      periods.push({
        fiscal_year_id: fiscalYearId,
        month,
        year,
        name: periodName,
        start_date: firstDay.toISOString().split('T')[0],
        end_date: lastDay.toISOString().split('T')[0],
        is_closed: false,
        is_active: isActive,
        created_by: userId,
        created_at: new Date().toISOString()
      });
      
      // Avanzar al siguiente mes
      currentDate2.setMonth(currentDate2.getMonth() + 1);
    }
    
    // Insertar los períodos mensuales en la base de datos
    if (periods.length > 0) {
      const { error } = await supabase
        .from('monthly_accounting_periods')
        .insert(periods);
        
      if (error) throw error;
      
      console.log(`Creados ${periods.length} períodos mensuales para el año fiscal ${fiscalYear.name}`);
      console.log(`Período activo: ${periods.find(p => p.is_active)?.name || 'Ninguno'}`);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Error al inicializar períodos mensuales:', error);
    return { success: false, error: error.message || 'Error al inicializar períodos mensuales' };
  }
}

/**
 * Reabre un año fiscal y todos sus períodos mensuales
 * Esta operación solo es posible si el año fiscal fue cerrado previamente
 * y no hay otro año fiscal activo para el mismo período
 */
export async function reopenFiscalYear(
  fiscalYearId: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; error: any }> {
  try {
    if (!userId) {
      throw new Error('Usuario no autenticado');
    }
    
    if (!reason || reason.trim() === '') {
      throw new Error('Debe proporcionar un motivo para reabrir el año fiscal');
    }

    // 1. Verificar que el año fiscal existe y está cerrado
    const { data: fiscalYear, error: yearError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', fiscalYearId)
      .single();
      
    if (yearError) throw yearError;
    
    if (!fiscalYear) {
      return { success: false, error: 'Año fiscal no encontrado' };
    }
    
    if (!fiscalYear.is_closed) {
      return { success: false, error: 'Este año fiscal ya está abierto' };
    }
    
    // 2. Verificar que no haya otro año fiscal activo para el mismo período
    const { data: overlappingYears, error: overlapError } = await supabase
      .from('accounting_periods')
      .select('id, name')
      .neq('id', fiscalYearId)
      .eq('is_closed', false)
      .or(`start_date.lte.${fiscalYear.end_date},end_date.gte.${fiscalYear.start_date}`)
      .is('is_month', false);
      
    if (overlapError) throw overlapError;
    
    if (overlappingYears && overlappingYears.length > 0) {
      const yearNames = overlappingYears.map(y => y.name).join(', ');
      return { 
        success: false, 
        error: `No se puede reabrir el año fiscal porque hay otros años fiscales activos en el mismo período: ${yearNames}` 
      };
    }
    
    // 3. Reabrir el año fiscal
    const { error: updateError } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: false,
        is_active: true,
        is_reopened: true,
        reopened_at: new Date().toISOString(),
        reopened_by: userId,
        closed_at: null,
        closed_by: null,
        updated_at: new Date().toISOString(),
        notes: fiscalYear.notes 
          ? `${fiscalYear.notes} | Reabierto: ${reason}` 
          : `Reabierto: ${reason}`
      })
      .eq('id', fiscalYearId);
      
    if (updateError) throw updateError;
    
    // 4. Reabrir los períodos mensuales
    const { data: monthlyPeriods, error: monthsError } = await supabase
      .from('monthly_accounting_periods')
      .select('id')
      .eq('fiscal_year_id', fiscalYearId);
      
    if (monthsError) throw monthsError;
    
    if (monthlyPeriods && monthlyPeriods.length > 0) {
      // Reabrir todos los períodos mensuales
      const { error: reopenMonthsError } = await supabase
        .from('monthly_accounting_periods')
        .update({
          is_closed: false,
          is_active: true,
          is_reopened: true,
          reopened_at: new Date().toISOString(),
          reopened_by: userId,
          closed_at: null,
          closed_by: null,
          updated_at: new Date().toISOString()
        })
        .in('id', monthlyPeriods.map(p => p.id));
        
      if (reopenMonthsError) {
        // Si hubo error al reabrir los meses, volver a cerrar el año fiscal
        await supabase
          .from('accounting_periods')
          .update({
            is_closed: true,
            is_active: false,
            closed_at: new Date().toISOString(),
            closed_by: userId,
            updated_at: new Date().toISOString()
          })
          .eq('id', fiscalYearId);
          
        throw new Error(`Error al reabrir períodos mensuales: ${reopenMonthsError.message}`);
      }
      
      console.log(`Reabiertos ${monthlyPeriods.length} períodos mensuales del año fiscal`);
    }
    
    console.log(`Año fiscal ${fiscalYear.name} reabierto correctamente`);
    
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error al reabrir año fiscal:', error);
    return { success: false, error: error.message || 'Error desconocido al reabrir año fiscal' };
  }
}

/**
 * Activa o desactiva un año fiscal y sus períodos mensuales
 * Al activar un año fiscal, solo se activa el período mensual actual
 * Al desactivar un año fiscal, se desactivan todos sus períodos mensuales
 */
export async function toggleFiscalYearActive(
  fiscalYearId: string,
  isActive: boolean,
  userId: string
): Promise<{ success: boolean; error: any; message?: string }> {
  try {
    if (!userId) {
      throw new Error('Usuario no autenticado');
    }

    // 1. Verificar que el año fiscal existe y no está cerrado
    const { data: fiscalYear, error: yearError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', fiscalYearId)
      .single();
      
    if (yearError) throw yearError;
    
    if (!fiscalYear) {
      return { success: false, error: 'Año fiscal no encontrado' };
    }
    
    if (fiscalYear.is_closed) {
      return { success: false, error: 'No se puede modificar un año fiscal cerrado' };
    }
    
    // Si ya está en el estado deseado, no hacer nada
    if (fiscalYear.is_active === isActive) {
      return { 
        success: true, 
        error: null, 
        message: `El año fiscal ya está ${isActive ? 'activo' : 'inactivo'}` 
      };
    }
    
    // 2. Si estamos desactivando, verificar que no hay asientos pendientes
    if (!isActive) {
      // Obtener períodos mensuales
      const { data: monthlyPeriods, error: monthsError } = await supabase
        .from('monthly_accounting_periods')
        .select('id')
        .eq('fiscal_year_id', fiscalYearId);
        
      if (monthsError) throw monthsError;
      
      if (monthlyPeriods && monthlyPeriods.length > 0) {
        // Verificar asientos pendientes
        const { data: pendingEntries, error: pendingError } = await supabase
          .from('journal_entries')
          .select('id', { count: 'exact', head: true })
          .in('monthly_period_id', monthlyPeriods.map(p => p.id))
          .or('is_approved.eq.false,status.eq.draft,status.eq.pendiente');
          
        if (pendingError) throw pendingError;
        
        if (pendingEntries && pendingEntries.length > 0) {
          return { 
            success: false, 
            error: `No se puede desactivar el año fiscal porque hay asientos pendientes de aprobación` 
          };
        }
      }
    }
    
    // 3. Activar/desactivar el año fiscal
    const { error: updateError } = await supabase
      .from('accounting_periods')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
        ...(isActive && {
          is_reopened: true,
          reopened_at: new Date().toISOString(),
          reopened_by: userId
        })
      })
      .eq('id', fiscalYearId);
      
    if (updateError) throw updateError;
    
    // 4. Para los períodos mensuales:
    if (isActive) {
      // 4.1 Cuando activamos: solo activar el período actual según fecha del sistema
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1; // 1-12
      
      // Buscar el período mensual correspondiente al mes actual
      const { data: currentPeriod, error: currentPeriodError } = await supabase
        .from('monthly_accounting_periods')
        .select('*')
        .eq('fiscal_year_id', fiscalYearId)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .eq('is_closed', false)
        .single();
      
      if (currentPeriodError && currentPeriodError.code !== 'PGRST116') {
        // Si es un error distinto a "no se encontró un solo registro", es un error real
        throw currentPeriodError;
      }
      
      if (currentPeriod) {
        // Si existe un período para el mes actual, activarlo
        const { error: activatePeriodError } = await supabase
          .from('monthly_accounting_periods')
          .update({
            is_active: true,
            updated_at: new Date().toISOString(),
            is_reopened: true,
            reopened_at: new Date().toISOString(),
            reopened_by: userId
          })
          .eq('id', currentPeriod.id);
          
        if (activatePeriodError) throw activatePeriodError;
        
        console.log(`Período mensual activado: ${currentPeriod.name}`);
      } else {
        // Si no existe un período para el mes actual, buscar el período más cercano
        const { data: periods, error: periodsError } = await supabase
          .from('monthly_accounting_periods')
          .select('*')
          .eq('fiscal_year_id', fiscalYearId)
          .eq('is_closed', false)
          .order('start_date', { ascending: false });
          
        if (periodsError) throw periodsError;
        
        if (periods && periods.length > 0) {
          // Activar el período más reciente
          const latestPeriod = periods[0];
          const { error: activateLatestError } = await supabase
            .from('monthly_accounting_periods')
            .update({
              is_active: true,
              updated_at: new Date().toISOString(),
              is_reopened: true,
              reopened_at: new Date().toISOString(),
              reopened_by: userId
            })
            .eq('id', latestPeriod.id);
            
          if (activateLatestError) throw activateLatestError;
          
          console.log(`Período mensual más reciente activado: ${latestPeriod.name}`);
        }
      }
      
      // Asegurarse de que los demás períodos estén inactivos
      const { error: deactivateOthersError } = await supabase
        .from('monthly_accounting_periods')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('fiscal_year_id', fiscalYearId)
        .eq('is_closed', false)
        .neq('month', currentMonth)
        .neq('year', currentYear);
        
      if (deactivateOthersError) throw deactivateOthersError;
      
    } else {
      // 4.2 Cuando desactivamos: desactivar todos los períodos mensuales
      const { error: monthsUpdateError } = await supabase
        .from('monthly_accounting_periods')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('fiscal_year_id', fiscalYearId)
        .eq('is_closed', false); // Solo actualizar los que no están cerrados permanentemente
        
      if (monthsUpdateError) {
        // Si hay error, revertir el cambio en el año fiscal
        await supabase
          .from('accounting_periods')
          .update({
            is_active: !isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', fiscalYearId);
          
        throw new Error(`Error al desactivar períodos mensuales: ${monthsUpdateError.message}`);
      }
    }
    
    console.log(`Año fiscal ${fiscalYear.name} ${isActive ? 'activado' : 'desactivado'} correctamente`);
    
    return { 
      success: true, 
      error: null,
      message: `Año fiscal ${fiscalYear.name} ${isActive ? 'activado' : 'desactivado'} correctamente` 
    };
  } catch (error: any) {
    console.error(`Error al ${isActive ? 'activar' : 'desactivar'} año fiscal:`, error);
    return { success: false, error: error.message || `Error desconocido al ${isActive ? 'activar' : 'desactivar'} año fiscal` };
  }
}