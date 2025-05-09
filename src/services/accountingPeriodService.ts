import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, lastDayOfMonth, startOfDay, isBefore, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
import { FiscalYearType } from '../types/database';

export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  is_active: boolean;
  is_annual: boolean;
  parent_id?: string | null;
  created_by: string;
  created_at: string;
  closed_at?: string | null;
  closed_by?: string | null;
  notes?: string | null;
  year?: number;
  month?: number;
  closed_by_email?: string;
  reopened_by_email?: string;
  reclosed_by_email?: string;
  created_by_email?: string;
  type: 'fiscal_year' | 'month';
  fiscal_year_id?: string;
}

export interface MonthlyPeriod {
  id?: string;
  name: string;
  month: number;
  year: number;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  is_active: boolean;
  fiscal_year_id: string;
  fiscal_year?: FiscalYearType;
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
  closed_by_email?: string;
  reopened_by_email?: string;
  reclosed_by_email?: string;
  created_by_email?: string;
}

export interface ValidationResult {
  valid: boolean;
  message: string;
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
  fiscal_year_type: FiscalYearType;
  months?: MonthlyPeriod[];
  monthly_periods?: MonthlyPeriod[];
  closed_by_email?: string;
  reopened_by_email?: string;
  reclosed_by_email?: string;
  created_by_email?: string;
}

export interface PeriodForm {
  name: string;
  start_date: string;
  end_date: string;
  notes?: string;
  fiscal_year_type: FiscalYearType;
}

/**
 * Obtiene todos los períodos contables
 */
export async function fetchAccountingPeriods(): Promise<AccountingPeriod[]> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods_with_users')
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
      .from('accounting_periods_with_users')
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
      .from('accounting_periods_with_users')
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
      .from('accounting_periods_with_users')
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
 * @param parentId ID del año fiscal padre
 * @param startDate Fecha de inicio del año fiscal
 * @param endDate Fecha de fin del año fiscal
 * @param fiscalYearType Tipo de año fiscal: 'calendar', 'fiscal_mar', 'fiscal_jun', 'fiscal_sep'
 */
export function generateMonthlyPeriods(
  parentId: string,
  startDate: string,
  endDate: string,
  fiscalYearType: FiscalYearType = 'calendar'
): MonthlyPeriod[] {
  const periods: MonthlyPeriod[] = [];
  
  // Convertir a objetos Date
  let currentDate = startOfMonth(parseISO(startDate));
  const lastDate = endOfMonth(parseISO(endDate));
  
  // Nombres de los meses en español
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  // Obtener mes y año actual para determinar el período activo
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentYear = today.getFullYear();
  
  // Generar períodos para cada mes en el rango
  while (currentDate <= lastDate) {
    const month = currentDate.getMonth() + 1; // 1-12
    const year = currentDate.getFullYear();
    
    // Asegurar que el período comienza el primer día del mes y termina el último día
    const periodStartDate = startOfMonth(currentDate);
    const periodEndDate = lastDayOfMonth(currentDate);
    
    // Determinar si este mes debe estar activo (solo el mes actual)
    const isActive = month === currentMonth && year === currentYear;
    
    // Nombre del mes según el tipo de año fiscal
    // Para años fiscales, indicamos el orden dentro del año fiscal (1er mes, 2do mes, etc.)
    let periodName = '';
    let fiscalOrder = 0;
    
    switch (fiscalYearType) {
      case 'calendar':
        // Año calendario: simplemente el nombre del mes y año
        periodName = `${monthNames[month - 1]} ${year}`;
        break;
      case 'fiscal_mar': // Año fiscal Abr-Mar
        // Abril es el primer mes, Marzo es el último
        fiscalOrder = month < 4 ? month + 9 : month - 3;
        periodName = `${monthNames[month - 1]} ${year} (${fiscalOrder}° mes)`;
        break;
      case 'fiscal_jun': // Año fiscal Jul-Jun
        // Julio es el primer mes, Junio es el último
        fiscalOrder = month < 7 ? month + 6 : month - 6;
        periodName = `${monthNames[month - 1]} ${year} (${fiscalOrder}° mes)`;
        break;
      case 'fiscal_sep': // Año fiscal Oct-Sep
        // Octubre es el primer mes, Septiembre es el último
        fiscalOrder = month < 10 ? month + 3 : month - 9;
        periodName = `${monthNames[month - 1]} ${year} (${fiscalOrder}° mes)`;
        break;
      default:
        periodName = `${monthNames[month - 1]} ${year}`;
    }
    
    periods.push({
      name: periodName,
      month,
      year,
      start_date: format(periodStartDate, 'yyyy-MM-dd'),
      end_date: format(periodEndDate, 'yyyy-MM-dd'),
      is_closed: false,
      is_active: isActive,
      fiscal_year_id: parentId
    });
    
    // Avanzar al siguiente mes
    currentDate = addMonths(currentDate, 1);
  }
  
  return periods;
}

/**
 * Cierra un período mensual permanentemente (no puede ser reabierto)
 */
export async function closeMonthlyPeriod(
  periodId: string,
  userId: string,
  notes?: string
): Promise<{ success: boolean; error: any }> {
  try {
    // Verificar que el período existe y está activo
    const { data: period, error: checkError } = await supabase
      .from('monthly_accounting_periods_with_users')
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
    
    // Cerrar el período
    const { error } = await supabase
      .from('monthly_accounting_periods')
      .update({
        is_closed: true,
        is_active: false,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        notes: notes,
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
 * Reabre un período mensual
 */
export async function reopenMonthlyPeriod(
  periodId: string,
  userId: string,
  notes?: string
): Promise<{ success: boolean; error: any }> {
  try {
    // Verificar que el período existe y está cerrado
    const { data: period, error: checkError } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select('*')
      .eq('id', periodId)
      .single();
    
    if (checkError) throw checkError;
    
    if (!period) {
      return { success: false, error: 'Período no encontrado' };
    }
    
    if (!period.is_closed) {
      return { success: false, error: 'El período ya está abierto' };
    }
    
    // Reabrir el período
    const { error } = await supabase
      .from('monthly_accounting_periods')
      .update({
        is_closed: false,
        is_reopened: true,
        reopened_at: new Date().toISOString(),
        reopened_by: userId,
        notes: notes,
        updated_at: new Date().toISOString()
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
 * Vuelve a cerrar un período mensual reabierto
 */
export async function recloseMonthlyPeriod(
  periodId: string,
  userId: string,
  notes?: string
): Promise<{ success: boolean; error: any }> {
  try {
    // Verificar que el período existe y está reabierto
    const { data: period, error: checkError } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select('*')
      .eq('id', periodId)
      .single();
    
    if (checkError) throw checkError;
    
    if (!period) {
      return { success: false, error: 'Período no encontrado' };
    }
    
    if (!period.is_reopened) {
      return { success: false, error: 'El período no ha sido reabierto previamente' };
    }
    
    // Volver a cerrar el período
    const { error } = await supabase
      .from('monthly_accounting_periods')
      .update({
        is_closed: true,
        reclosed_at: new Date().toISOString(),
        reclosed_by: userId,
        notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId);
    
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error al volver a cerrar período mensual:', error);
    return { success: false, error };
  }
}

/**
 * Cierra un período contable
 */
export async function closePeriod(periodId: string, userId: string, notes?: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error closing period:', error);
    toast.error('Error al cerrar el período');
    return false;
  }
}

/**
 * Reabre un período contable
 */
export async function reopenPeriod(periodId: string, userId: string, notes?: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: false,
        is_reopened: true,
        reopened_at: new Date().toISOString(),
        reopened_by: userId,
        notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error reopening period:', error);
    toast.error('Error al reabrir el período');
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

export const validateJournalEntryDate = (
  date: string | null,
  periodDates: { start_date: string | null; end_date: string | null; name: string } | null
): ValidationResult => {
  if (!date) {
    return { valid: false, message: 'La fecha es requerida' };
  }

  if (!periodDates || !periodDates.start_date || !periodDates.end_date) {
    return { valid: false, message: 'No hay período contable activo seleccionado' };
  }

  try {
    // Normalizar las fechas para evitar problemas de zona horaria
    const entryDate = startOfDay(new Date(date));
    const periodStartDate = startOfDay(new Date(periodDates.start_date));
    const periodEndDate = startOfDay(new Date(periodDates.end_date));

    // Formatear las fechas para los mensajes
    const formatDateEs = (date: Date) => format(date, 'dd/MM/yyyy');
    const formattedEntryDate = formatDateEs(entryDate);
    const formattedStartDate = formatDateEs(periodStartDate);
    const formattedEndDate = formatDateEs(periodEndDate);

    // Verificar que no sea fecha futura respecto a hoy
    const today = startOfDay(new Date());
    if (isAfter(entryDate, today)) {
      return {
        valid: false,
        message: 'No se pueden registrar asientos con fechas futuras'
      };
    }

    // MODIFICADO: Ahora permitimos fechas anteriores al inicio del período con advertencia
    if (isBefore(entryDate, periodStartDate)) {
      return {
        valid: true, // Ahora es válido con advertencia
        message: `La fecha seleccionada (${formattedEntryDate}) es anterior al inicio del período ${periodDates.name} (${formattedStartDate}). Considere usar el período correspondiente.`
      };
    }

    // MODIFICADO: Ahora permitimos fechas posteriores al fin del período con advertencia
    if (isAfter(entryDate, periodEndDate)) {
      return {
        valid: true, // Ahora es válido con advertencia
        message: `La fecha seleccionada (${formattedEntryDate}) es posterior al fin del período ${periodDates.name} (${formattedEndDate}). Considere seleccionar un período más reciente.`
      };
    }

    return { valid: true, message: '' };
  } catch (error) {
    console.error('Error validando fecha:', error);
    return { valid: false, message: 'Error al validar la fecha' };
  }
};

/**
 * Obtiene el período activo actual (el período mensual abierto más reciente)
 */
export async function getCurrentPeriod(): Promise<AccountingPeriod | null> {
  try {
    // Buscar períodos activos (no cerrados)
    const { data, error } = await supabase
      .from('accounting_periods_with_users')
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
      .from('accounting_periods_with_users')
      .select('*')
      .eq('is_month', false)
      .order('start_date', { ascending: false });

    if (error) throw error;

    // Obtener períodos mensuales para cada año fiscal
    const fiscalYearsWithMonths = await Promise.all(
      (data || []).map(async (year) => {
        const { data: monthsData, error: monthsError } = await supabase
          .from('monthly_accounting_periods_with_users')
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
      .from('accounting_periods_with_users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return { data: null, error: null };

    // Obtener períodos mensuales
    const { data: monthsData, error: monthsError } = await supabase
      .from('monthly_accounting_periods_with_users')
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

    // Validar fechas de inicio y fin según el tipo de año fiscal
    const { start_date, end_date, fiscal_year_type } = formData;
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    // Validar que las fechas correspondan al tipo de año fiscal seleccionado
    let isValid = true;
    let errorMessage = '';
    
    switch (fiscal_year_type) {
      case 'calendar':
        // Debe comenzar el 1 de enero y terminar el 31 de diciembre del mismo año
        if (startDate.getMonth() !== 0 || startDate.getDate() !== 1) {
          isValid = false;
          errorMessage = 'El año calendario debe comenzar el 1 de enero';
        } else if (endDate.getMonth() !== 11 || endDate.getDate() !== 31) {
          isValid = false;
          errorMessage = 'El año calendario debe terminar el 31 de diciembre';
        } else if (startDate.getFullYear() !== endDate.getFullYear()) {
          isValid = false;
          errorMessage = 'El año calendario debe tener el mismo año de inicio y fin';
        }
        break;
        
      case 'fiscal_mar':
        // Debe comenzar el 1 de abril y terminar el 31 de marzo del año siguiente
        if (startDate.getMonth() !== 3 || startDate.getDate() !== 1) {
          isValid = false;
          errorMessage = 'Este año fiscal debe comenzar el 1 de abril';
        } else if (endDate.getMonth() !== 2 || endDate.getDate() !== 31) {
          isValid = false;
          errorMessage = 'Este año fiscal debe terminar el 31 de marzo';
        } else if (endDate.getFullYear() - startDate.getFullYear() !== 1) {
          isValid = false;
          errorMessage = 'Este año fiscal debe terminar en el año siguiente al de inicio';
        }
        break;
        
      case 'fiscal_jun':
        // Debe comenzar el 1 de julio y terminar el 30 de junio del año siguiente
        if (startDate.getMonth() !== 6 || startDate.getDate() !== 1) {
          isValid = false;
          errorMessage = 'Este año fiscal debe comenzar el 1 de julio';
        } else if (endDate.getMonth() !== 5 || endDate.getDate() !== 30) {
          isValid = false;
          errorMessage = 'Este año fiscal debe terminar el 30 de junio';
        } else if (endDate.getFullYear() - startDate.getFullYear() !== 1) {
          isValid = false;
          errorMessage = 'Este año fiscal debe terminar en el año siguiente al de inicio';
        }
        break;
        
      case 'fiscal_sep':
        // Debe comenzar el 1 de octubre y terminar el 30 de septiembre del año siguiente
        if (startDate.getMonth() !== 9 || startDate.getDate() !== 1) {
          isValid = false;
          errorMessage = 'Este año fiscal debe comenzar el 1 de octubre';
        } else if (endDate.getMonth() !== 8 || endDate.getDate() !== 30) {
          isValid = false;
          errorMessage = 'Este año fiscal debe terminar el 30 de septiembre';
        } else if (endDate.getFullYear() - startDate.getFullYear() !== 1) {
          isValid = false;
          errorMessage = 'Este año fiscal debe terminar en el año siguiente al de inicio';
        }
        break;
    }
    
    if (!isValid) {
      throw new Error(errorMessage);
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
    const monthlyPeriods = generateMonthlyPeriods(data.id, formData.start_date, formData.end_date, formData.fiscal_year_type);
    
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

/**
 * Obtiene todos los períodos mensuales
 */
export async function fetchAllMonthlyPeriods(): Promise<MonthlyPeriod[]> {
  try {
    const { data, error } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching monthly periods:', error);
    toast.error('Error al cargar los períodos mensuales');
    return [];
  }
}

/**
 * Obtiene un período mensual específico por ID
 */
export async function getMonthlyPeriodById(id: string): Promise<MonthlyPeriod | null> {
  try {
    const { data, error } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching monthly period:', error);
    return null;
  }
}

/**
 * Obtiene los períodos mensuales de un año fiscal
 */
export async function getMonthlyPeriodsForFiscalYear(fiscalYearId: string): Promise<MonthlyPeriod[]> {
  try {
    const { data, error } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select('*')
      .eq('fiscal_year_id', fiscalYearId)
      .order('month');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching monthly periods for fiscal year:', error);
    toast.error('Error al cargar los períodos mensuales del año fiscal');
    return [];
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
      .from('monthly_accounting_periods_with_users')
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

    // 1. Verificar que el año fiscal existe y está activo
    const { data: fiscalYear, error: yearError } = await supabase
      .from('accounting_periods_with_users')
      .select('*')
      .eq('id', fiscalYearId)
      .single();
      
    if (yearError) throw yearError;
    
    if (!fiscalYear) {
      return { success: false, error: 'Año fiscal no encontrado' };
    }
    
    if (fiscalYear.is_closed) {
      return { success: false, error: 'Este año fiscal ya está cerrado' };
    }

    // 2. Verificar que todos los períodos mensuales estén listos para cerrar
    const { data: monthlyPeriods, error: monthsQueryError } = await supabase
      .from('monthly_accounting_periods_with_users')
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

    // 3. Primero registrar el año fiscal en el historial (antes de cerrar los meses)
    // Esto evita la posibilidad de problemas con las referencias
    console.log('Registrando cierre de año fiscal en historial...');
    
    try {
      // Intentar insertar solo el registro del año fiscal primero
      const { error: fiscalYearHistoryError } = await supabase.from('closing_history').insert([{
        period_id: fiscalYearId,
        period_type: 'fiscal_year',
        period_name: fiscalYear.name || 'Año fiscal',
        closed_at: new Date().toISOString(),
        closed_by: userId,
        notes: 'Cierre de año fiscal',
        action_type: 'close',
        created_by: userId
      }]);
      
      if (fiscalYearHistoryError) {
        console.error('Error al registrar año fiscal en historial:', fiscalYearHistoryError);
        throw new Error(`Error al registrar año fiscal en historial: ${fiscalYearHistoryError.message}`);
      }
    } catch (historyError) {
      console.error('Excepción al registrar año fiscal en historial:', historyError);
      throw historyError;
    }

    // 4. Cerrar los períodos mensuales uno por uno
    const { data: openMonths, error: openMonthsError } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select('id, name')
      .eq('fiscal_year_id', fiscalYearId)
      .eq('is_closed', false);

    if (openMonthsError) throw openMonthsError;

    console.log(`Cerrando ${openMonths?.length || 0} períodos mensuales...`);
    
    if (openMonths && openMonths.length > 0) {
      for (const month of openMonths) {
        // 4.1 Primero registrar el cierre en el historial
        try {
          console.log(`Registrando cierre del período ${month.name} (${month.id}) en historial...`);
          
          const { error: monthHistoryError } = await supabase.from('closing_history').insert([{
            period_id: month.id,
            period_type: 'monthly',
            period_name: month.name || `Período ${month.id}`,
            closed_at: new Date().toISOString(),
            closed_by: userId,
            notes: `Cerrado durante cierre de año fiscal`,
            action_type: 'close',
            created_by: userId
          }]);
          
          if (monthHistoryError) {
            console.error(`Error al registrar período ${month.id} en historial:`, monthHistoryError);
            // Continue con el siguiente mes en lugar de interrumpir todo el proceso
            continue;
          }
        } catch (monthHistoryError) {
          console.error(`Excepción al registrar período ${month.id} en historial:`, monthHistoryError);
          // Continue con el siguiente mes
          continue;
        }
        
        // 4.2 Luego cerrar el período mensual
        try {
          const { error: updateError } = await supabase
            .from('monthly_accounting_periods')
            .update({
              is_closed: true,
              is_active: false,
              closed_at: new Date().toISOString(),
              closed_by: userId,
              updated_at: new Date().toISOString()
            })
            .eq('id', month.id);
            
          if (updateError) {
            console.error(`Error al cerrar período mensual ${month.id}:`, updateError);
          } else {
            console.log(`Período mensual ${month.name} cerrado correctamente`);
          }
        } catch (updateError) {
          console.error(`Excepción al cerrar período mensual ${month.id}:`, updateError);
        }
      }
    }
    
    // 5. Finalmente, cerrar el año fiscal
    console.log('Cerrando año fiscal...');
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

    if (error) {
      console.error('Error al cerrar año fiscal:', error);
      throw error;
    }
    
    console.log(`Año fiscal ${fiscalYear.name} cerrado correctamente`);
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error al cerrar año fiscal:', error);
    return { success: false, error: error.message || 'Error desconocido al cerrar año fiscal' };
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
      .from('accounting_periods_with_users')
      .select('*')
      .eq('id', fiscalYearId)
      .single();
      
    if (yearError) throw yearError;
    
    if (!fiscalYear) {
      return { success: false, error: 'Año fiscal no encontrado' };
    }
    
    // 2. Verificar que no haya otro año fiscal activo para el mismo período
    const { data: overlappingYears, error: overlapError } = await supabase
      .from('accounting_periods_with_users')
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
      .from('monthly_accounting_periods_with_users')
      .select('id')
      .eq('fiscal_year_id', fiscalYearId);
      
    if (monthsError) throw monthsError;
    
    if (monthlyPeriods && monthlyPeriods.length > 0) {
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
          updated_at: new Date().toISOString(),
          notes: `Reabierto automáticamente por reapertura del año fiscal. Motivo: ${reason}`
        })
        .in('id', monthlyPeriods.map(p => p.id));
        
      if (reopenMonthsError) throw reopenMonthsError;
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error al reabrir año fiscal:', error);
    return { success: false, error: error.message || 'Error desconocido al reabrir año fiscal' };
  }
}

/**
 * Inicializa períodos mensuales para un año fiscal existente
 * Solo el período correspondiente al mes actual se establece como activo
 */
export async function initializeMonthlyPeriodsForFiscalYear(
  fiscalYearId: string,
  userId: string
): Promise<{ success: boolean, error?: any, data?: MonthlyPeriod[] }> {
  try {
    // Verificar si el año fiscal existe
    const { data: fiscalYear, error: yearError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', fiscalYearId)
      .single();
      
    if (yearError) {
      return { success: false, error: 'No se pudo encontrar el año fiscal' };
    }
    
    if (!fiscalYear) {
      return { success: false, error: 'El año fiscal no existe' };
    }
    
    // Verificar que sea un año fiscal (no un período mensual)
    if (fiscalYear.is_month) {
      return { success: false, error: 'El ID proporcionado no corresponde a un año fiscal' };
    }
    
    // Verificar que no tenga ya períodos mensuales creados
    const { data: existingPeriods, error: existingError } = await supabase
      .from('monthly_accounting_periods')
      .select('count')
      .eq('fiscal_year_id', fiscalYearId);
      
    if (existingError) {
      return { success: false, error: 'No se pudo verificar si ya existen períodos mensuales' };
    }
    
    if (existingPeriods && existingPeriods.length > 0 && existingPeriods[0].count > 0) {
      return { success: false, error: 'Este año fiscal ya tiene períodos mensuales creados' };
    }
    
    // Obtener las fechas de inicio y fin
    const startDate = parseISO(fiscalYear.start_date);
    const endDate = parseISO(fiscalYear.end_date);
    
    // Crear un array para almacenar los períodos mensuales
    const monthlyPeriods: MonthlyPeriod[] = [];
    
    // Obtener mes y año actual para determinar el período activo
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();
    
    // Inicializar el primer mes como el mes de inicio
    const startMonth = startDate.getMonth();
    const startYear = startDate.getFullYear();
    const endMonth = endDate.getMonth();
    const endYear = endDate.getFullYear();
    
    // Calcular número total de meses (diferencia entre el mes final e inicial)
    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    
    // Generar períodos mensuales (máximo 12 para un año fiscal)
    for (let i = 0; i < totalMonths; i++) {
      // Calcular el mes actual en la iteración
      const currentDate = addMonths(startOfMonth(startDate), i);
      
      // Si ya hemos pasado la fecha final, salir del bucle
      if (currentDate > endDate) {
        break;
      }
      
      // Asegurar que estamos en el primer día del mes
      const periodStartDate = startOfMonth(currentDate);
      
      // Calcular el último día del mes
      const periodEndDate = endOfMonth(currentDate);
      
      // Si el final del mes excede la fecha de fin del año fiscal, ajustar
      const adjustedEndDate = periodEndDate > endDate ? endDate : periodEndDate;
      
      // El mes y año calendario
      const calendarMonth = periodStartDate.getMonth() + 1; // 1-12
      const calendarYear = periodStartDate.getFullYear();
      
      // Determinar si este período debe estar activo (solo el del mes actual)
      const isActive = calendarMonth === currentMonth && calendarYear === currentYear;
      
      // Crear el nombre del período mensual "Enero 2023 (1° mes)"
      const monthName = format(periodStartDate, 'MMMM yyyy', { locale: es });
      const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      const periodName = `${capitalizedMonthName} (${i + 1}° mes)`;
      
      console.log(`Creando período: ${periodName} (${format(periodStartDate, 'yyyy-MM-dd')} - ${format(adjustedEndDate, 'yyyy-MM-dd')})`);
      
      // Añadir el período al array
      monthlyPeriods.push({
        fiscal_year_id: fiscalYearId,
        month: calendarMonth,
        year: calendarYear,
        name: periodName,
        start_date: format(periodStartDate, 'yyyy-MM-dd'),
        end_date: format(adjustedEndDate, 'yyyy-MM-dd'),
        is_closed: false,
        is_active: isActive, // Solo activo si es el mes actual
        created_by: userId
      });
    }
    
    console.log(`Total de períodos mensuales a crear: ${monthlyPeriods.length}`);
    
    // Insertar los períodos mensuales en la base de datos
    if (monthlyPeriods.length > 0) {
      const { data: insertedPeriods, error: insertError } = await supabase
        .from('monthly_accounting_periods')
        .insert(monthlyPeriods)
        .select();
        
      if (insertError) {
        return { success: false, error: `Error al crear los períodos mensuales: ${insertError.message}` };
      }
      
      // Devolver éxito y los períodos creados
      return { success: true, data: insertedPeriods };
    }
    
    return { success: true, data: [] };
  } catch (error: any) {
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

/**
 * Verifica si un período mensual está cerrado
 */
export async function isMonthlyPeriodClosed(periodId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select('is_closed, fiscal_year_id')
      .eq('id', periodId)
      .single();
      
    if (error) throw error;
    
    if (!data) return true; // Si no existe, considerarlo cerrado
    
    // Verificar también si el año fiscal está cerrado
    if (data.is_closed) return true;
    
    const { data: fiscalYear, error: fiscalYearError } = await supabase
      .from('accounting_periods_with_users')
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
 * Obtiene los períodos mensuales disponibles para registrar asientos contables
 * Solo retorna períodos que:
 * 1. No están cerrados
 * 2. Están activos
 * 3. Pertenecen a un año fiscal activo y no cerrado
 */
export async function getAvailablePeriodsForEntry(): Promise<{ data: MonthlyPeriod[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('monthly_accounting_periods_with_users')
      .select(`
        *,
        fiscal_year:fiscal_year_id(
          id,
          name,
          is_closed,
          is_active
        )
      `)
      .eq('is_closed', false)
      .eq('is_active', true)
      .order('year', { ascending: false })
      .order('month', { ascending: true });

    if (error) throw error;

    // Filtrar solo los períodos cuyo año fiscal está activo y no cerrado
    const filteredData = (data || []).filter(period => 
      period.fiscal_year && 
      !period.fiscal_year.is_closed && 
      period.fiscal_year.is_active
    );
    
    return { data: filteredData, error: null };
  } catch (error) {
    console.error('Error al obtener períodos disponibles:', error);
    toast.error('Error al cargar los períodos disponibles');
    return { data: [], error };
  }
}