import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';
import { isValid, format, parseISO } from 'date-fns';
import { isMonthlyPeriodClosed } from './accountingPeriodService';
import { v4 as uuidv4 } from 'uuid';

// Interfaces
export interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  accounting_period_id: string;
  monthly_period_id: string;
  is_posted: boolean;
  is_balanced: boolean;
  is_approved: boolean;
  total_debit: number;
  total_credit: number;
  status: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  posted_at?: string;
  posted_by?: string;
  approved_at?: string;
  approved_by?: string;
  reference_number?: string;
  reference_date?: string;
  accounting_period?: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    is_closed: boolean;
  };
  monthly_period?: {
    id: string;
    name: string;
    fiscal_year_id: string;
    start_date: string;
    end_date: string;
    is_closed: boolean;
  };
}

export interface JournalEntryItem {
  id?: string;
  journal_entry_id?: string;
  account_id: string;
  description?: string;
  debit?: number;
  credit?: number;
  temp_id?: string;
  is_debit?: boolean;
  amount?: number;
  account?: {
  id: string;
    code: string;
  name: string;
    type: string;
    nature: string;
  };
}

export interface JournalEntryForm {
  date: string;
  description: string;
  monthly_period_id: string;
  accounting_period_id?: string;
  notes?: string;
  reference_number?: string;
  reference_date?: string;
}

/**
 * Redondea un valor a 2 decimales para evitar problemas de precisión
 */
function roundAmount(amount: number | string | Decimal | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  return new Decimal(amount.toString()).toDecimalPlaces(2).toNumber();
}

/**
 * Valida si un asiento contable está balanceado
 */
export function validateBalance(items: JournalEntryItem[]): { valid: boolean; message: string } {
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);
  
  // Verificar que todas las líneas tengan campos obligatorios
  for (const item of items) {
    if (!item.account_id) {
      return { valid: false, message: 'Todas las líneas deben tener una cuenta seleccionada' };
    }
    
    // Verificar que haya un monto
    const hasAmount = (item.amount !== undefined && item.amount !== null) || 
                     (item.debit !== undefined && item.debit !== null) || 
                     (item.credit !== undefined && item.credit !== null);
                     
    if (!hasAmount) {
      return { valid: false, message: 'Todas las líneas deben tener un monto' };
    }
    
    // Sumar el debe y el haber
    if (item.is_debit && item.amount) {
      totalDebit = totalDebit.plus(new Decimal(item.amount));
    } 
    else if (!item.is_debit && item.amount) {
      totalCredit = totalCredit.plus(new Decimal(item.amount));
    }
    else {
      if (item.debit) {
        totalDebit = totalDebit.plus(new Decimal(item.debit));
      }
      if (item.credit) {
        totalCredit = totalCredit.plus(new Decimal(item.credit));
      }
    }
  }
  
  totalDebit = totalDebit.toDecimalPlaces(2);
  totalCredit = totalCredit.toDecimalPlaces(2);
  
  const isBalanced = totalDebit.minus(totalCredit).abs().lessThanOrEqualTo(new Decimal(0.01));
  
  return { 
    valid: isBalanced,
    message: isBalanced ? 'Asiento balanceado' : 'El asiento no está balanceado. El debe y el haber deben ser iguales.'
  };
}

/**
 * Verifica si un período contable mensual está cerrado
 */
export async function isPeriodClosed(periodId: string): Promise<boolean> {
  return isMonthlyPeriodClosed(periodId);
}

/**
 * Valida si una fecha está dentro del rango de un período contable mensual
 * o si el período está configurado para permitir fechas fuera de rango
 */
export async function validateDateInPeriod(date: string, periodId: string): Promise<{ valid: boolean; message: string }> {
  try {
    const { data, error } = await supabase
      .from('monthly_accounting_periods')
      .select('start_date, end_date, name, is_closed')
      .eq('id', periodId)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return { valid: false, message: 'El período contable no existe' };
    }
    
    if (data.is_closed) {
      return { valid: false, message: 'El período contable está cerrado' };
    }
    
    const startDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);
    const checkDate = new Date(date);
    
    // Normalizar fechas a medianoche para comparación
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    checkDate.setHours(12, 0, 0, 0);
    
    if (checkDate < startDate || checkDate > endDate) {
      return { 
        valid: false, 
        message: `La fecha debe estar dentro del período ${data.name} (${data.start_date} - ${data.end_date})` 
      };
    }
    
    return { valid: true, message: 'Fecha válida' };
  } catch (error: any) {
    console.error('Error al validar fecha en período:', error);
    return { valid: false, message: error.message || 'Error al validar la fecha' };
  }
}

/**
 * Genera un número secuencial para el asiento contable
 */
async function generateEntryNumber(periodId: string): Promise<string> {
  try {
    if (!periodId) {
      throw new Error('Se requiere ID del período contable para generar número de asiento');
    }
    
    console.log('Generando número de asiento para el período:', periodId);
    
    // Usar la fecha actual en lugar de la fecha del período
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}${month}`;
    
    console.log('Año-Mes actual:', yearMonth);
    
    // Consultar el último número con el mismo prefijo de año-mes
    const prefix = `A-${yearMonth}`;
    
    const { data, error } = await supabase
      .from('journal_entries')
      .select('entry_number')
      .like('entry_number', `${prefix}-%`)
      .order('entry_number', { ascending: false })
      .limit(1);
      
    if (error) {
      console.error('Error al consultar último número de asiento:', error);
      throw error;
    }
    
    console.log('Último número de asiento encontrado:', data);
    
    let nextNumber = 1;
    
    if (data && data.length > 0 && data[0].entry_number) {
      const parts = data[0].entry_number.split('-');
      if (parts.length > 2) {
        const lastNumber = parseInt(parts[2], 10);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }
    }
    
    // Formatear el número con ceros a la izquierda (3 dígitos)
    const formattedNumber = nextNumber.toString().padStart(3, '0');
    
    // Formato A-YYYYMM-NNN
    const entryNumber = `A-${yearMonth}-${formattedNumber}`;
    console.log('Número de asiento generado:', entryNumber);
    
    return entryNumber;
  } catch (error) {
    console.error('Error al generar número de asiento:', error);
    // En caso de error, usar timestamp como fallback
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = now.getTime();
    const fallbackNumber = `A-${year}${month}-${timestamp.toString().slice(-3)}`;
    console.log('Usando número de asiento de respaldo:', fallbackNumber);
    return fallbackNumber;
  }
}

/**
 * Obtener los asientos contables con opcional filtrado
 */
export async function fetchJournalEntries({
  periodId,
  monthlyPeriodId,
  fiscalYearId,
  startDate,
  endDate,
  status,
  searchTerm,
  sortField = 'date',
  sortOrder = 'desc'
}: {
  periodId?: string;
  monthlyPeriodId?: string;
  fiscalYearId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  searchTerm?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ data: JournalEntry[]; error: any }> {
  try {
    // Primero obtener los asientos contables básicos
    let query = supabase
      .from('journal_entries')
      .select('*');

    // Aplicar filtros
    if (periodId) {
      query = query.eq('accounting_period_id', periodId);
    }

    if (monthlyPeriodId) {
      query = query.eq('monthly_period_id', monthlyPeriodId);
    }

    if (fiscalYearId) {
      query = query.eq('accounting_period_id', fiscalYearId);
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (searchTerm) {
      query = query.or(`description.ilike.%${searchTerm}%,entry_number.ilike.%${searchTerm}%,reference_number.ilike.%${searchTerm}%`);
    }

    // Ordenar resultados
    query = query.order(sortField, { ascending: sortOrder === 'asc' });
    
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return { data: [], error: null };
    }

    // Obtener períodos contables para los asientos
    const periodIds = [...new Set(data.filter(entry => entry.accounting_period_id).map(entry => entry.accounting_period_id))];
    
    let periods: any[] = [];
    if (periodIds.length > 0) {
      const { data: periodsData } = await supabase
        .from('accounting_periods')
        .select('*')
        .in('id', periodIds);
      
      periods = periodsData || [];
    }

    // Calcular el total de débito y crédito para cada asiento
    const entriesWithTotals = await Promise.all(
      data.map(async entry => {
        const { data: items, error: itemsError } = await supabase
          .from('journal_entry_items')
          .select('debit, credit')
          .eq('journal_entry_id', entry.id);

        if (itemsError) {
          throw itemsError;
        }

        const totalDebit = items.reduce((sum, item) => sum + (parseFloat(item.debit) || 0), 0);
        const totalCredit = items.reduce((sum, item) => sum + (parseFloat(item.credit) || 0), 0);

        // Agregar el periodo correspondiente
        const accountingPeriod = periods.find(p => p.id === entry.accounting_period_id);

        return {
          ...entry,
          total_debit: totalDebit,
          total_credit: totalCredit,
          accounting_period: accountingPeriod || null
        };
      })
    );

    return { data: entriesWithTotals, error: null };
  } catch (error) {
    console.error('Error al obtener asientos contables:', error);
    return { data: [], error };
  }
}

/**
 * Obtener un asiento contable específico con sus líneas
 */
export async function getJournalEntry(id: string): Promise<{ 
  entry: JournalEntry | null; 
  items: JournalEntryItem[] | null; 
  error: any 
}> {
  try {
    // Obtener el asiento
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .single();
      
    if (entryError) {
      throw entryError;
    }

    // Obtener el período contable si existe
    let accountingPeriod = null;
    if (entry.accounting_period_id) {
      const { data: periodData } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('id', entry.accounting_period_id)
        .single();
      
      accountingPeriod = periodData;
    }
    
    // Obtener las líneas del asiento
    const { data: itemsData, error: itemsError } = await supabase
      .from('journal_entry_items')
      .select('*')
      .eq('journal_entry_id', id)
      .order('id');

    if (itemsError) {
      throw itemsError;
    }

    // Obtener cuentas asociadas a las líneas
    const accountIds = [...new Set(itemsData.map(item => item.account_id))];
    let accounts: any[] = [];
    
    if (accountIds.length > 0) {
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('*')
        .in('id', accountIds);
      
      accounts = accountsData || [];
    }

    // Agregar información de cuenta a cada línea
    const items = itemsData.map(item => {
      const account = accounts.find(acc => acc.id === item.account_id);
    return {
        ...item,
        account
      };
    });

    // Agregar período contable al asiento
    const entryWithPeriod = {
      ...entry,
      accounting_period: accountingPeriod
    };

    return { entry: entryWithPeriod, items, error: null };
  } catch (error) {
    console.error('Error al obtener asiento contable:', error);
    return { entry: null, items: null, error };
  }
}

/**
 * Verifica que no se estén usando cuentas padre en las líneas del asiento
 */
export async function validateAccountsForJournal(items: JournalEntryItem[]): Promise<{ valid: boolean; message: string }> {
  // Verificar que al menos hay líneas para validar
  if (!items || items.length === 0) {
    return { valid: false, message: 'No hay líneas de asiento para validar' };
  }
  
  // Obtener la lista de IDs de cuentas a verificar (solo las que no son vacías)
  const accountIds = items
    .filter(item => item.account_id && item.account_id.trim() !== '')
    .map(item => item.account_id);
  
  if (accountIds.length === 0) {
    return { valid: false, message: 'No hay cuentas seleccionadas' };
  }
  
  // Verificar si hay duplicados (opcional, solo si queremos impedir líneas con mismas cuentas)
  const uniqueAccountIds = new Set(accountIds);
  if (uniqueAccountIds.size !== accountIds.length) {
    // Hay cuentas duplicadas - Nota: Dejamos esto comentado porque podría ser válido tener varias líneas con la misma cuenta
    // Aquí podríamos agregar un mensaje de advertencia si es necesario
  }
  
  try {
    // Verificar cuáles de las cuentas son de tipo "padre"
    const { data, error } = await supabase
      .from('accounts')
      .select('id, code, name, is_parent, is_active')
      .in('id', accountIds);
    
    if (error) {
      console.error('Error al verificar cuentas:', error);
      throw error;
    }
    
    // Verificar si faltan cuentas (puede ocurrir si una cuenta fue eliminada)
    if (!data || data.length !== accountIds.length) {
      const foundIds = data ? data.map(acc => acc.id) : [];
      const missingIds = accountIds.filter(id => !foundIds.includes(id));
      
      if (missingIds.length > 0) {
        return { 
          valid: false, 
          message: `Algunas cuentas no existen o han sido eliminadas (IDs: ${missingIds.join(', ')})`
        };
      }
    }
    
    // Verificar cuentas inactivas
    const inactiveAccounts = data.filter(acc => !acc.is_active);
    if (inactiveAccounts.length > 0) {
      const inactiveList = inactiveAccounts.map(acc => `${acc.code} - ${acc.name}`).join(', ');
      return { 
        valid: false, 
        message: `No se pueden usar cuentas inactivas: ${inactiveList}`
      };
    }
    
    // Verificar cuentas padre
    const parentAccounts = data.filter(acc => acc.is_parent);
    if (parentAccounts.length > 0) {
      const parentList = parentAccounts.map(acc => `${acc.code} - ${acc.name}`).join(', ');
      return { 
        valid: false, 
        message: `No se pueden usar cuentas padre en asientos contables: ${parentList}`
      };
    }
    
    return { valid: true, message: 'Cuentas válidas para el asiento' };
  } catch (error: any) {
    console.error('Error al validar cuentas para asiento:', error);
    return { valid: false, message: error.message || 'Error al validar las cuentas' };
  }
}

/**
 * Crear un nuevo asiento contable
 */
export async function createJournalEntry(
  formData: JournalEntryForm,
  items: JournalEntryItem[],
  userId: string
): Promise<string> {
  try {
    // Validaciones preliminares
    if (!formData) {
      throw new Error('Se requiere información del asiento contable');
    }
    
    if (!items || items.length < 2) {
      throw new Error('Se requieren al menos dos líneas para crear un asiento contable');
    }
    
    if (!userId) {
      throw new Error('Se requiere el ID del usuario para crear el asiento');
    }
    
    if (!formData.monthly_period_id) {
      throw new Error('Se requiere el período mensual para crear el asiento');
    }
    
    // Validar balance
    const balanceValidation = validateBalance(items);
    if (!balanceValidation.valid) {
      throw new Error(balanceValidation.message);
    }
    
    // Validar que no se usen cuentas padre
    const accountsValidation = await validateAccountsForJournal(items);
    if (!accountsValidation.valid) {
      throw new Error(accountsValidation.message);
    }
    
    // Validar fecha en el período
    const dateValidation = await validateDateInPeriod(formData.date, formData.monthly_period_id);
    if (!dateValidation.valid) {
      throw new Error(dateValidation.message);
    }
    
    // Obtener el período contable correspondiente al período mensual
    let accounting_period_id = formData.accounting_period_id;
    
    if (!accounting_period_id) {
      console.log('Obteniendo accounting_period_id para el período mensual:', formData.monthly_period_id);
      
      // Consultar el período mensual para obtener su fiscal_year_id (que es el accounting_period_id)
      const { data: monthlyPeriod, error: monthlyPeriodError } = await supabase
        .from('monthly_accounting_periods')
        .select('fiscal_year_id')
        .eq('id', formData.monthly_period_id)
        .single();
      
      if (monthlyPeriodError) {
        console.error('Error al obtener el período mensual:', monthlyPeriodError);
        throw new Error(`Error al obtener el período contable: ${monthlyPeriodError.message}`);
      }
      
      if (!monthlyPeriod || !monthlyPeriod.fiscal_year_id) {
        throw new Error('No se pudo obtener el período fiscal asociado al período mensual');
      }
      
      accounting_period_id = monthlyPeriod.fiscal_year_id;
      console.log('Se obtuvo el accounting_period_id:', accounting_period_id);
    }
    
    // Calcular totales
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    
    items.forEach(item => {
      // Usar debit/credit si están definidos, de lo contrario usar amount con is_debit
      if (item.debit !== undefined && item.debit !== null) {
        totalDebit = totalDebit.plus(new Decimal(item.debit));
      } else if (item.is_debit && item.amount !== undefined && item.amount !== null) {
        totalDebit = totalDebit.plus(new Decimal(item.amount));
      }
      
      if (item.credit !== undefined && item.credit !== null) {
        totalCredit = totalCredit.plus(new Decimal(item.credit));
      } else if (!item.is_debit && item.amount !== undefined && item.amount !== null) {
        totalCredit = totalCredit.plus(new Decimal(item.amount));
      }
    });
    
    // Generar ID para el asiento
    const entryId = uuidv4();
    
    // Generar número de asiento
    const entryNumber = await generateEntryNumber(formData.monthly_period_id);
    
    // Crear asiento contable
    const { error: entryError } = await supabase
      .from('journal_entries')
      .insert([{
        id: entryId,
        entry_number: entryNumber,
        date: formData.date,
        description: formData.description,
        monthly_period_id: formData.monthly_period_id,
        accounting_period_id: accounting_period_id,
        notes: formData.notes || null,
        reference_number: formData.reference_number || null,
        reference_date: formData.reference_date || null,
        total_debit: totalDebit.toNumber(),
        total_credit: totalCredit.toNumber(),
        is_balanced: true,
        is_approved: false,
        is_posted: false,
        status: 'pendiente',
        created_by: userId
      }]);
    
    if (entryError) {
      console.error('Error al crear el asiento:', entryError);
      throw new Error(`Error al crear el asiento: ${entryError.message}`);
    }
    
    // Crear detalles del asiento
    const journalEntryItems = items.map(item => {
      // Determinar los valores de debe y haber
      let debit = 0;
      let credit = 0;
      
      if (item.debit !== undefined && item.debit !== null) {
        debit = parseFloat(item.debit.toString());
      } else if (item.is_debit && item.amount !== undefined && item.amount !== null) {
        debit = parseFloat(item.amount.toString());
      }
      
      if (item.credit !== undefined && item.credit !== null) {
        credit = parseFloat(item.credit.toString());
      } else if (!item.is_debit && item.amount !== undefined && item.amount !== null) {
        credit = parseFloat(item.amount.toString());
      }
      
      return {
        id: uuidv4(),
        journal_entry_id: entryId,
        account_id: item.account_id,
        description: item.description || null,
        debit: debit,
        credit: credit,
        created_by: userId
      };
    });
    
    const { error: itemsError } = await supabase
      .from('journal_entry_items')
      .insert(journalEntryItems);
    
    if (itemsError) {
      // Si hay error en los items, eliminar el asiento creado previamente
      await supabase.from('journal_entries').delete().eq('id', entryId);
      console.error('Error al crear los detalles del asiento:', itemsError);
      throw new Error(`Error al crear los detalles del asiento: ${itemsError.message}`);
    }
    
    return entryId;
  } catch (error: any) {
    console.error('Error al crear asiento contable:', error);
    throw new Error(error.message || 'Error al crear el asiento contable');
  }
}

/**
 * Actualizar un asiento contable existente
 */
export async function updateJournalEntry(
  entryId: string,
  formData: JournalEntryForm,
  items: JournalEntryItem[],
  userId: string
): Promise<void> {
  try {
    // Validar balance
    const balanceValidation = validateBalance(items);
    if (!balanceValidation.valid) {
      throw new Error(balanceValidation.message);
    }
    
    // Validar que no se usen cuentas padre
    const accountsValidation = await validateAccountsForJournal(items);
    if (!accountsValidation.valid) {
      throw new Error(accountsValidation.message);
    }
    
    // Validar fecha en el período
    const dateValidation = await validateDateInPeriod(formData.date, formData.monthly_period_id);
    if (!dateValidation.valid) {
      throw new Error(dateValidation.message);
    }
    
    // Verificar si el asiento ya está publicado o aprobado
    const { data: existingEntry, error: checkError } = await supabase
      .from('journal_entries')
      .select('is_approved, is_posted, accounting_period_id')
      .eq('id', entryId)
      .single();
    
    if (checkError) throw checkError;
    
    if (existingEntry.is_posted) {
      throw new Error('No se puede modificar un asiento que ya está publicado');
    }
    
    if (existingEntry.is_approved) {
      throw new Error('No se puede modificar un asiento que ya está aprobado');
    }
    
    // Obtener el período contable si no se ha especificado y ha cambiado el período mensual
    let accounting_period_id = formData.accounting_period_id || existingEntry.accounting_period_id;
    
    if (!accounting_period_id) {
      console.log('Obteniendo accounting_period_id para la actualización del período mensual:', formData.monthly_period_id);
      
      // Consultar el período mensual para obtener su fiscal_year_id (que es el accounting_period_id)
      const { data: monthlyPeriod, error: monthlyPeriodError } = await supabase
        .from('monthly_accounting_periods')
        .select('fiscal_year_id')
        .eq('id', formData.monthly_period_id)
        .single();
      
      if (monthlyPeriodError) {
        console.error('Error al obtener el período mensual:', monthlyPeriodError);
        throw new Error(`Error al obtener el período contable: ${monthlyPeriodError.message}`);
      }
      
      if (!monthlyPeriod || !monthlyPeriod.fiscal_year_id) {
        throw new Error('No se pudo obtener el período fiscal asociado al período mensual');
      }
      
      accounting_period_id = monthlyPeriod.fiscal_year_id;
      console.log('Se obtuvo el accounting_period_id para actualización:', accounting_period_id);
    }
    
    // Calcular totales
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    
    items.forEach(item => {
      // Usar debit/credit si están definidos, de lo contrario usar amount con is_debit
      if (item.debit !== undefined && item.debit !== null) {
        totalDebit = totalDebit.plus(new Decimal(item.debit));
      } else if (item.is_debit && item.amount !== undefined && item.amount !== null) {
        totalDebit = totalDebit.plus(new Decimal(item.amount));
      }
      
      if (item.credit !== undefined && item.credit !== null) {
        totalCredit = totalCredit.plus(new Decimal(item.credit));
      } else if (!item.is_debit && item.amount !== undefined && item.amount !== null) {
        totalCredit = totalCredit.plus(new Decimal(item.amount));
      }
    });
    
    // Actualizar asiento
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update({
        date: formData.date,
        description: formData.description,
        monthly_period_id: formData.monthly_period_id,
        accounting_period_id: accounting_period_id,
        notes: formData.notes || null,
        reference_number: formData.reference_number || null,
        reference_date: formData.reference_date || null,
        total_debit: totalDebit.toNumber(),
        total_credit: totalCredit.toNumber(),
        is_balanced: true,
        status: 'pendiente',
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId);
    
    if (updateError) throw updateError;
    
    // Eliminar líneas antiguas
    const { error: deleteError } = await supabase
      .from('journal_entry_items')
      .delete()
      .eq('journal_entry_id', entryId);
    
    if (deleteError) throw deleteError;
    
    // Insertar nuevas líneas
    const journalEntryItems = items.map(item => {
      // Determinar los valores de debe y haber
      let debit = 0;
      let credit = 0;
      
      if (item.debit !== undefined && item.debit !== null) {
        debit = parseFloat(item.debit.toString());
      } else if (item.is_debit && item.amount !== undefined && item.amount !== null) {
        debit = parseFloat(item.amount.toString());
      }
      
      if (item.credit !== undefined && item.credit !== null) {
        credit = parseFloat(item.credit.toString());
      } else if (!item.is_debit && item.amount !== undefined && item.amount !== null) {
        credit = parseFloat(item.amount.toString());
      }
      
      return {
        id: uuidv4(),
        journal_entry_id: entryId,
        account_id: item.account_id,
        description: item.description || null,
        debit: debit,
        credit: credit,
        created_by: userId
      };
    });
    
    const { error: insertError } = await supabase
      .from('journal_entry_items')
      .insert(journalEntryItems);
    
    if (insertError) throw insertError;
  } catch (error: any) {
    console.error('Error al actualizar asiento contable:', error);
    throw new Error(error.message || 'Error al actualizar el asiento contable');
  }
}

/**
 * Aprobar un asiento contable
 */
export async function approveJournalEntry(id: string, userId?: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('journal_entries')
      .update({
        status: 'aprobado',
        is_approved: true,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        approved_by: userId || null
      })
      .eq('id', id);

    if (error) {
      throw error;
    }

    return { error: null };
  } catch (error) {
    console.error('Error al aprobar asiento contable:', error);
    return { error };
  }
}

/**
 * Eliminar un asiento contable
 */
export async function deleteJournalEntry(id: string): Promise<{ error: any }> {
  try {
    // Primero eliminar las líneas del asiento
    const { error: itemsError } = await supabase
      .from('journal_entry_items')
      .delete()
      .eq('journal_entry_id', id);

    if (itemsError) {
      throw itemsError;
    }

    // Luego eliminar el asiento
    const { error } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return { error: null };
  } catch (error) {
    console.error('Error al eliminar asiento contable:', error);
    return { error };
  }
}

/**
 * Duplica un asiento contable
 */
export async function duplicateJournalEntry(entryId: string, userId: string): Promise<{ id: string | null; error: any }> {
  try {
    // Obtener el asiento original con sus líneas
    const { entry, items, error } = await getJournalEntry(entryId);
    
    if (error) throw error;
    if (!entry || !items) {
      throw new Error('No se pudo encontrar el asiento contable o sus líneas');
    }
    
    // Crear un nuevo asiento basado en el original
    const newEntryData = {
      date: new Date().toISOString().split('T')[0], // Fecha actual
      description: `Copia de: ${entry.description}`,
      accounting_period_id: entry.accounting_period_id,
      status: 'pendiente',
      is_approved: false,
      is_balanced: entry.is_balanced,
      notes: entry.notes,
      reference_number: entry.reference_number,
      reference_date: entry.reference_date,
      total_debit: entry.total_debit,
      total_credit: entry.total_credit,
      created_by: userId
    };
    
    // Insertar el nuevo asiento
    const { data: newEntry, error: insertError } = await supabase
      .from('journal_entries')
      .insert(newEntryData)
      .select('id')
      .single();
    
    if (insertError) throw insertError;
    
    // Duplicar todas las líneas del asiento
    const newItems = items.map(item => ({
      journal_entry_id: newEntry.id,
      account_id: item.account_id,
      description: item.description,
      debit: item.debit,
      credit: item.credit,
      created_by: userId
    }));
    
    const { error: itemsError } = await supabase
        .from('journal_entry_items')
      .insert(newItems);
    
    if (itemsError) throw itemsError;
    
    return { id: newEntry.id, error: null };
  } catch (error) {
    console.error('Error al duplicar asiento contable:', error);
    return { id: null, error };
  }
}

/**
 * Obtiene los usuarios que tienen permisos para crear/editar asientos
 */
export async function getJournalUsers(): Promise<{ id: string; email: string; full_name: string }[]> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name');
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return [];
  }
}

/**
 * Anular un asiento contable
 */
export async function cancelJournalEntry(id: string, userId: string, reason: string): Promise<{ error: any }> {
  try {
    if (!id) {
      throw new Error('ID de asiento no proporcionado');
    }
    
    if (!userId) {
      throw new Error('Usuario no autenticado');
    }
    
    if (!reason || reason.trim() === '') {
      throw new Error('Debe proporcionar un motivo para anular el asiento');
    }
    
    // Verificar si el asiento existe y obtener su estado actual
    const { data: entry, error: fetchError } = await supabase
      .from('journal_entries')
      .select('status, is_approved, accounting_period_id, notes')
      .eq('id', id)
      .single();
      
    if (fetchError) {
      throw fetchError;
    }
    
    if (!entry) {
      throw new Error('Asiento contable no encontrado');
    }
    
    // Verificar si el período está cerrado
    const isClosed = await isPeriodClosed(entry.accounting_period_id);
    if (isClosed) {
      throw new Error('No se pueden anular asientos en un período contable cerrado');
    }
    
    // Verificar que el asiento no esté ya anulado
    if (entry.status === 'voided') {
      throw new Error('Este asiento ya ha sido anulado');
    }
    
    // Anular el asiento
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update({
        status: 'voided',
        notes: `${entry.notes ? entry.notes + ' | ' : ''}ANULADO: ${reason}`,
        updated_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('id', id);
    
    if (updateError) {
      throw updateError;
    }
    
    // Verificar que el asiento realmente se haya anulado
    const { data: updatedEntry, error: verifyError } = await supabase
        .from('journal_entries')
      .select('status')
      .eq('id', id)
      .single();
    
    if (verifyError) {
      throw verifyError;
    }
    
    if (!updatedEntry || updatedEntry.status !== 'voided') {
      throw new Error('Error al verificar la anulación del asiento');
    }
    
    console.log('Asiento anulado correctamente:', id);
    return { error: null };
  } catch (error) {
    console.error('Error al anular asiento contable:', error);
    return { error };
  }
} 