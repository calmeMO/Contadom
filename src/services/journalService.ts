import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';
import { isValid, format, parseISO } from 'date-fns';
import { isMonthlyPeriodClosed } from './accountingPeriodService';
import { v4 as uuidv4 } from 'uuid';
import { es } from 'date-fns/locale';

// Tipos de Ajuste Contable
export type AdjustmentType = 
  | 'depreciation' 
  | 'amortization' 
  | 'accrual' // Devengo (gasto o ingreso)
  | 'deferred' // Diferido (gasto o ingreso)
  | 'inventory' 
  | 'correction' 
  | 'provision' // Provisiones
  | 'valuation' // Ajustes de valoración
  | 'other';

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
  // Campos de Ajuste
  is_adjustment: boolean; // <- Nuevo campo
  adjustment_type?: AdjustmentType | null; // <- Nuevo campo
  adjusted_entry_id?: string | null; // <- Nuevo campo
  // Relaciones
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
  // Campos de Ajuste
  is_adjustment?: boolean;
  adjustment_type?: AdjustmentType | null;
  adjusted_entry_id?: string | null;
}

/**
 * Interface para el filtro de asientos contables
 */
export interface JournalEntriesFilter {
  monthlyPeriodId?: string;
  fiscalYearId?: string;
  status?: string;
  entryType?: 'all' | 'regular' | 'adjustment';
  searchTerm?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  excludeVoided?: boolean;
}

/**
 * Redondea un valor a 2 decimales para evitar problemas de precisión
 */
function roundAmount(amount: number | string | Decimal | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  return new Decimal(amount.toString()).toDecimalPlaces(2).toNumber();
}

/**
 * Validar el balance de un conjunto de líneas de asiento
 */
export function validateBalance(items: JournalEntryItem[]): { valid: boolean; message: string } {
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);
  
  // Contadores para depuración
  let linesDebit = 0;
  let linesCredit = 0;
  
  // Mejor manejo de todos los formatos posibles
  items.forEach(item => {
    // Manejar formato directo debit/credit
    if (item.debit !== undefined) {
      const debitValue = Number(item.debit);
      if (!isNaN(debitValue) && debitValue > 0) {
        totalDebit = totalDebit.plus(roundAmount(debitValue));
        linesDebit++;
      }
    }
    
    if (item.credit !== undefined) {
      const creditValue = Number(item.credit);
      if (!isNaN(creditValue) && creditValue > 0) {
        totalCredit = totalCredit.plus(roundAmount(creditValue));
        linesCredit++;
      }
    }
    
    // Manejar formato is_debit/amount
    if (item.debit === undefined && item.credit === undefined && 
        item.amount !== undefined && item.is_debit !== undefined) {
      const amount = Number(item.amount);
      if (!isNaN(amount) && amount > 0) {
        if (item.is_debit) {
          totalDebit = totalDebit.plus(roundAmount(amount));
          linesDebit++;
        } else {
          totalCredit = totalCredit.plus(roundAmount(amount));
          linesCredit++;
        }
      }
    }
  });
  
  // Log para depuración
  console.log(`Validación de balance: Débito ${totalDebit} (${linesDebit} líneas), Crédito ${totalCredit} (${linesCredit} líneas)`);
  
  // Verificar que haya al menos una línea de débito y una de crédito
  if (linesDebit === 0) {
    return { 
      valid: false, 
      message: 'El asiento debe tener al menos una línea de débito' 
    };
  }
  
  if (linesCredit === 0) {
    return { 
      valid: false, 
      message: 'El asiento debe tener al menos una línea de crédito' 
    };
  }
  
  // Verificar el balance con una tolerancia para errores de redondeo
  const diff = totalDebit.minus(totalCredit).abs();
  
  // Una pequeña tolerancia para errores de redondeo (0.00001)
  // En sistemas financieros reales esto sería configurado según las políticas de la empresa
  if (diff.lessThanOrEqualTo(new Decimal('0.00001'))) {
    return { valid: true, message: '' };
  } else {
    return { 
      valid: false, 
      message: `El asiento no está balanceado. Débito: ${totalDebit.toString()}, Crédito: ${totalCredit.toString()}, Diferencia: ${diff.toString()}` 
    };
  }
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
      // Formatear fechas en formato español
      const formattedStartDate = format(startDate, 'dd/MM/yyyy', { locale: es });
      const formattedEndDate = format(endDate, 'dd/MM/yyyy', { locale: es });
      const formattedCheckDate = format(checkDate, 'dd/MM/yyyy', { locale: es });
      
      return { 
        valid: false, 
        message: `La fecha ${formattedCheckDate} debe estar dentro del período ${data.name} (${formattedStartDate} - ${formattedEndDate})` 
      };
    }
    
    return { valid: true, message: 'Fecha válida' };
  } catch (error: any) {
    console.error('Error al validar fecha en período:', error);
    return { valid: false, message: error.message || 'Error al validar la fecha' };
  }
}

/**
 * Obtener listado de asientos contables con filtros
 */
export async function fetchJournalEntries(filters: JournalEntriesFilter = {}): Promise<{ data: JournalEntry[]; error: any }> {
  try {
    console.log('Iniciando fetchJournalEntries con filtros:', filters);
    
    let query = supabase
      .from('journal_entries')
      .select(`
        *,
        is_adjustment, 
        adjustment_type, 
        adjusted_entry_id, 
        monthly_period:monthly_accounting_periods(id, name, fiscal_year_id, start_date, end_date, is_closed),
        accounting_period:accounting_periods(id, name, start_date, end_date, is_closed)
      `);
    
    // Aplicar filtros
    if (filters.monthlyPeriodId) {
      // Si hay un período mensual específico seleccionado, filtrar solo por ese
      console.log('Filtrando por período mensual específico:', filters.monthlyPeriodId);
      query = query.eq('monthly_period_id', filters.monthlyPeriodId);
    } else if (filters.fiscalYearId) {
      // Si no hay período mensual específico pero sí hay año fiscal, mostrar todos los períodos de ese año
      console.log('Filtrando por todos los períodos del año fiscal:', filters.fiscalYearId);
      try {
        // Obtener los ids de los períodos mensuales de este año fiscal
        const { data: periodIds, error: periodsError } = await supabase
          .from('monthly_accounting_periods')
          .select('id')
          .eq('fiscal_year_id', filters.fiscalYearId);
        
        if (periodsError) {
          console.error('Error al obtener períodos para año fiscal:', periodsError);
          throw periodsError;
        }
        
        if (periodIds && periodIds.length > 0) {
          // Usar in() para filtrar por múltiples IDs
          const ids = periodIds.map(p => p.id);
          console.log(`Encontrados ${ids.length} períodos para el año fiscal`);
          query = query.in('monthly_period_id', ids);
        } else {
          console.warn('No se encontraron períodos mensuales para el año fiscal:', filters.fiscalYearId);
          // Si no hay períodos mensuales, forzar resultado vacío con un ID que no existirá
          return { data: [], error: null };
        }
      } catch (e) {
        console.error('Error crítico obteniendo períodos para filtrar por año fiscal:', e);
        // Si hay error al obtener períodos, retornar un array vacío
        return { data: [], error: e };
      }
    }
    
    // Filtro por estado del asiento
    if (filters.status && filters.status !== 'all') {
      console.log('Filtrando por estado:', filters.status);
      query = query.eq('status', filters.status);
    }

    // Filtro para excluir asientos anulados
    if (filters.excludeVoided) {
      console.log('Excluyendo asientos anulados');
      query = query.neq('status', 'voided');
    }
    
    // Filtro por tipo de asiento (regular o ajuste)
    if (filters.entryType && filters.entryType !== 'all') {
      const isAdjustment = filters.entryType === 'adjustment';
      console.log(`Filtrando por tipo de asiento: ${filters.entryType} (is_adjustment=${isAdjustment})`);
      query = query.eq('is_adjustment', isAdjustment);
    }
    
    // Búsqueda de texto
    if (filters.searchTerm) {
      const searchTerm = `%${filters.searchTerm}%`;
      console.log('Aplicando término de búsqueda:', filters.searchTerm);
      query = query.or(
        `entry_number.ilike.${searchTerm},description.ilike.${searchTerm},reference_number.ilike.${searchTerm}`
      );
    }
    
    // Aplicar orden
    const sortField = filters.sortField || 'date';
    const sortOrder = filters.sortOrder || 'desc';
    
    // Validar que sortField sea una columna válida para evitar errores SQL
    const validSortFields = ['entry_number', 'date', 'description', 'total_debit', 'total_credit', 'status', 'created_at'];
    if (validSortFields.includes(sortField)) {
      console.log(`Ordenando por ${sortField} en orden ${sortOrder}`);
      query = query.order(sortField, { ascending: sortOrder === 'asc' });
    } else {
      console.log(`Campo de ordenamiento inválido: ${sortField}, usando 'date' por defecto`);
      query = query.order('date', { ascending: false });
    }
    
    // Limitar el número de resultados para mejorar el rendimiento
    query = query.limit(100);
    
    console.log('Ejecutando consulta de asientos contables...');
    // Ejecutar consulta
    const { data, error } = await query;
    
    if (error) {
      console.error('Error al obtener asientos contables:', error);
      throw error;
    }
    
    // Asegurarse que is_adjustment tenga un valor booleano
    const processedData = (data || []).map(entry => ({
      ...entry,
      is_adjustment: entry.is_adjustment ?? false 
    }));

    console.log(`Consulta exitosa: ${processedData.length} asientos encontrados`);
    return { data: processedData, error: null };
  } catch (error) {
    console.error('Error al obtener asientos contables:', error);
    // Devolver el error para que el componente lo maneje
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
    console.log('⏳ Obteniendo asiento contable con ID:', id);
    
    // Obtener el asiento
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .single();
      
    if (entryError) {
      console.error('❌ Error al obtener cabecera del asiento:', entryError);
      throw entryError;
    }
    
    if (!entry) {
      console.warn('⚠️ No se encontró asiento con ID:', id);
      return { entry: null, items: null, error: new Error('No se encontró el asiento') };
    }
    
    console.log('✅ Cabecera de asiento obtenida:', entry);

    // Obtener las líneas del asiento
    console.log('⏳ Consultando líneas del asiento de journal_entry_items...');
    const { data: items, error: itemsError } = await supabase
      .from('journal_entry_items')
      .select('*, account:accounts(id, code, name, type, nature)')
      .eq('journal_entry_id', id)
      .order('id');

    if (itemsError) {
      console.error('❌ Error al obtener líneas del asiento:', itemsError);
      // A diferencia de antes, no lanzamos error aquí para que al menos se devuelva la cabecera
      console.warn('⚠️ Se devolverá solo la cabecera sin líneas');
      return { entry, items: [], error: null };
    }
    
    // Log para depuración
    if (!items || items.length === 0) {
      console.warn('⚠️ No se encontraron líneas para el asiento ID:', id);
    } else {
      console.log(`✅ Se encontraron ${items.length} líneas para el asiento ID:`, id);
      items.forEach((item, index) => {
        console.log(`Línea ${index + 1}:`, item);
      });
    }
    
    // Formatear las líneas para que tengan un formato consistente con la interfaz JournalEntryItem
    const formattedItems = (items || []).map(item => {
      // Calcular si es débito o crédito basado en los valores
      const isDebit = Number(item.debit || 0) > 0;
      const amount = isDebit ? Number(item.debit || 0) : Number(item.credit || 0);
      
      return {
        id: item.id,
        journal_entry_id: item.journal_entry_id,
        account_id: item.account_id,
        description: item.description || '',
        is_debit: isDebit,
        amount: amount,
        debit: Number(item.debit || 0),
        credit: Number(item.credit || 0),
        account: item.account,
        created_at: item.created_at,
        created_by: item.created_by
      };
    });

    return { entry, items: formattedItems, error: null };
  } catch (error) {
    console.error('❌ Error al obtener asiento contable:', error);
    return { entry: null, items: null, error };
  }
}

/**
 * Asegura que existe la tabla de secuencia para números de asiento
 */
async function ensureSequenceTableExists(): Promise<boolean> {
  try {
    // Verificar si la tabla existe consultando registros
    const { data, error } = await supabase
      .from('journal_sequence')
      .select('id, last_number')
      .limit(1);
    
    if (error) {
      // Si hay error, probablemente la tabla no existe
      console.warn('Error al verificar tabla de secuencia, probablemente no existe:', error);
      
      // No podemos crear la tabla directamente desde el cliente
      // En su lugar, verificamos si hay asientos existentes para inicializar correctamente
      return false;
    }
    
    // Si no hay datos, insertar valor inicial
    if (!data || data.length === 0) {
      // Intentar insertar el valor inicial
      const { error: insertError } = await supabase
        .from('journal_sequence')
        .insert({ id: 1, last_number: await getLastEntryNumberFromJournal() })
        .select();
      
      if (insertError) {
        console.error('Error al insertar valor inicial en secuencia:', insertError);
        return false;
      }
    }
    
    return true;
  } catch (err) {
    console.error('Error al verificar tabla de secuencia:', err);
    return false;
  }
}

/**
 * Obtiene el último número de asiento de la tabla journal_entries
 */
async function getLastEntryNumberFromJournal(): Promise<number> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .order('entry_number', { ascending: false })
    .limit(1);
    
  if (error || !data || data.length === 0) {
    return 0; // Si hay error o no hay asientos, comenzar con 0
  }
  
  // Convertir a número
  const lastNumber = parseInt(data[0].entry_number, 10);
  return isNaN(lastNumber) ? 0 : lastNumber;
}

/**
 * Obtiene el siguiente número de asiento consultando la tabla de secuencia
 * o usando el método de respaldo si la tabla no existe
 */
async function getNextEntryNumber(): Promise<string> {
  // Verificar si podemos usar la tabla journal_sequence
  const sequenceExists = await ensureSequenceTableExists();
  
  // Si la tabla de secuencia existe, intentar usarla
  if (sequenceExists) {
    try {
      // Intentar obtener y actualizar la secuencia
      const { data, error } = await supabase
        .from('journal_sequence')
        .select('last_number')
        .eq('id', 1)
        .single();
      
      if (error || !data) {
        console.warn('Error al leer secuencia, usando método alternativo:', error);
        return getNextEntryNumberFallback();
      }
      
      // Incrementar el contador
      const nextNumber = data.last_number + 1;
      
      // Actualizar el valor en la tabla
      const { error: updateError } = await supabase
        .from('journal_sequence')
        .update({ last_number: nextNumber })
        .eq('id', 1);
      
      if (updateError) {
        console.warn('Error al actualizar secuencia, usando método alternativo:', updateError);
        return getNextEntryNumberFallback();
      }
      
      return nextNumber.toString();
    } catch (err) {
      console.error('Error en secuencia, usando método alternativo:', err);
      return getNextEntryNumberFallback();
    }
  }
  
  // Si no podemos usar la tabla de secuencia, usar el método fallback
  return getNextEntryNumberFallback();
}

/**
 * Método de respaldo para obtener el siguiente número de asiento
 * (anterior implementación)
 */
async function getNextEntryNumberFallback(): Promise<string> {
  const { data: lastEntryData, error: lastEntryError } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .order('entry_number', { ascending: false })
    .limit(1);
    
  if (lastEntryError) {
    console.error('Error al obtener último número de asiento:', lastEntryError);
    return '1'; // Si hay error, comenzar con 1
  }
  
  // Determinar el próximo número de asiento
  let nextEntryNumber = '1'; // Si no hay asientos previos, comenzar con 1
  if (lastEntryData && lastEntryData.length > 0 && lastEntryData[0].entry_number) {
    // Intentar convertir a número y sumar 1
    const lastNumber = parseInt(lastEntryData[0].entry_number, 10);
    if (!isNaN(lastNumber)) {
      nextEntryNumber = (lastNumber + 1).toString();
    }
  }
  
  return nextEntryNumber;
}

/**
 * Crear un nuevo asiento contable (incluye ajustes)
 */
export async function createJournalEntry(
  formData: JournalEntryForm, 
  items: JournalEntryItem[],
  userId: string
): Promise<{ id: string | null; error: any }> {
  try {
    console.log('⏳ Iniciando creación de asiento contable');
    console.log('Datos del formulario:', formData);
    console.log('Líneas a crear:', items);
    
    if (!items || items.length === 0) {
      console.error('❌ No se proporcionaron líneas para el asiento');
      throw new Error('No se pueden crear asientos sin líneas. Debe tener al menos una línea de débito y una de crédito');
    }
    
    // Verificar que todas las líneas tengan cuenta y monto
    for (const item of items) {
      if (!item.account_id) {
        console.error('❌ Una línea no tiene cuenta seleccionada');
        throw new Error('Todas las líneas deben tener una cuenta seleccionada');
      }
      
      // Verificar que las líneas tengan montos válidos - Versión mejorada
      // Ahora acepta tanto el formato con is_debit/amount como el directo debit/credit
      const debitValue = Number(item.debit || 0);
      const creditValue = Number(item.credit || 0);
      
      // Si no hay valores en debit o credit, intentar usar is_debit y amount
      if (debitValue === 0 && creditValue === 0 && item.amount !== undefined) {
        // Si tiene is_debit y amount, verificar consistencia
        if ((item.is_debit && item.amount <= 0) || (!item.is_debit && item.amount <= 0)) {
          console.error('❌ Una línea tiene montos inválidos (usando is_debit/amount)', item);
          throw new Error('Todas las líneas deben tener montos válidos (mayores a cero)');
        }
      } else {
        // Si usa el formato directo debit/credit
        if (debitValue === 0 && creditValue === 0) {
          console.error('❌ Una línea no tiene valores de débito ni crédito', item);
          throw new Error('Todas las líneas deben tener un valor de débito o crédito mayor a cero');
        }
        
        // Si tiene ambos valores, es un error (un asiento no puede tener débito y crédito a la vez)
        if (debitValue > 0 && creditValue > 0) {
          console.error('❌ Una línea tiene valores tanto en débito como en crédito', item);
          throw new Error('Una línea no puede tener valores tanto en débito como en crédito');
        }
      }
    }
    
    // Calcular totales
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    
    items.forEach(item => {
      // Usar roundAmount para consistencia
      if (item.debit) totalDebit = totalDebit.plus(roundAmount(item.debit));
      if (item.credit) totalCredit = totalCredit.plus(roundAmount(item.credit));
      
      // También considerar el formato is_debit/amount si es necesario
      if (!item.debit && !item.credit && item.amount && item.is_debit !== undefined) {
        if (item.is_debit) {
          totalDebit = totalDebit.plus(roundAmount(item.amount));
        } else {
          totalCredit = totalCredit.plus(roundAmount(item.amount));
        }
      }
    });
    
    console.log(`Total débito: ${totalDebit}, Total crédito: ${totalCredit}`);
    
    // Verificar balance
    const balance = validateBalance(items);
    if (!balance.valid) {
      console.error('❌ Error de balance:', balance.message);
      throw new Error(balance.message);
    }
    
    // Obtener el siguiente número de asiento de forma segura
    const nextEntryNumber = await getNextEntryNumber();
    console.log('Próximo número de asiento:', nextEntryNumber);
    
    // Generar ID del asiento
    const entryId = uuidv4();
    
    // Preparar datos del asiento
    const entryData = {
      id: entryId,
      entry_number: nextEntryNumber,
      date: formData.date,
      description: formData.description,
      monthly_period_id: formData.monthly_period_id,
      accounting_period_id: formData.accounting_period_id, // Asegurarse que se obtenga correctamente si es necesario
      notes: formData.notes || null,
      reference_number: formData.reference_number || null,
      reference_date: formData.reference_date || null,
      total_debit: totalDebit.toNumber(),
      total_credit: totalCredit.toNumber(),
      is_balanced: true,
      is_approved: false,
      is_posted: false,
      status: 'pendiente',
      // Campos de ajuste
      is_adjustment: formData.is_adjustment ?? false,
      adjustment_type: formData.is_adjustment ? formData.adjustment_type : null,
      adjusted_entry_id: formData.is_adjustment ? formData.adjusted_entry_id : null,
      // Auditoría
      created_by: userId,
      created_at: new Date().toISOString()
    };
    
    // Mostrar los datos que se están enviando en depuración
    console.log('⏳ Insertando cabecera del asiento:', entryData);
    
    // Insertar asiento
    const { error: entryError } = await supabase
      .from('journal_entries')
      .insert(entryData);
    
    if (entryError) {
      console.error('❌ Error al insertar asiento:', entryError);
      throw entryError;
    }
    
    console.log('✅ Cabecera de asiento creada correctamente con ID:', entryId);
    
    // Preparar líneas del asiento - Verificar que coincida con la estructura de la tabla
    // Asegurarse de que las líneas tengan un UUID válido, no se use temp_id
    const entryItems = items.map(item => {
      // Asegurar que los valores numéricos son correctos
      let debitValue = 0;
      let creditValue = 0;
      
      // Si usa el formato debit/credit directamente
      if (item.debit !== undefined || item.credit !== undefined) {
        debitValue = Number(item.debit || 0);
        creditValue = Number(item.credit || 0);
      } 
      // Si usa el formato is_debit/amount
      else if (item.amount !== undefined && item.is_debit !== undefined) {
        debitValue = item.is_debit ? Number(item.amount) : 0;
        creditValue = !item.is_debit ? Number(item.amount) : 0;
      }
      
      // Asegurar que los valores sean números válidos
      debitValue = isNaN(debitValue) ? 0 : debitValue;
      creditValue = isNaN(creditValue) ? 0 : creditValue;
      
      console.log(`Línea procesada: Cuenta ${item.account_id}, Débito ${debitValue}, Crédito ${creditValue}`);
      
      return {
        id: uuidv4(), // Generar un ID único para cada línea
        journal_entry_id: entryId,
        account_id: item.account_id,
        description: item.description || null,
        debit: roundAmount(debitValue),
        credit: roundAmount(creditValue),
        created_by: userId,
        created_at: new Date().toISOString()
      };
    });
    
    console.log('⏳ Insertando líneas del asiento en journal_entry_items:', entryItems);
    
    // Verificar que haya líneas para insertar
    if (entryItems.length === 0) {
      console.error('❌ No hay líneas para insertar');
      throw new Error('No se pueden crear asientos sin líneas');
    }
    
    // Insertar líneas
    const { error: itemsError } = await supabase
      .from('journal_entry_items')
      .insert(entryItems);
    
    if (itemsError) {
      console.error('❌ Error al insertar líneas de asiento:', itemsError);
      
      // Verificar si el error es porque la tabla no existe o hay problemas con la estructura
      const errorMessage = itemsError.message || '';
      if (errorMessage.includes('does not exist') || errorMessage.includes('column')) {
        console.error('❌ Posible problema con la tabla journal_entry_items:', errorMessage);
        console.error('Estructura de líneas enviada:', entryItems[0]);
      }
      
      // Considerar eliminar el asiento cabecera si fallan las líneas
      console.warn('⚠️ La cabecera fue creada pero las líneas fallaron. Considerando eliminar cabecera...');
      try {
        const { error: deleteError } = await supabase
          .from('journal_entries')
          .delete()
          .eq('id', entryId);
          
        if (deleteError) {
          console.error('❌ No se pudo eliminar la cabecera después del error en líneas:', deleteError);
        } else {
          console.log('✅ Cabecera eliminada para mantener consistencia');
        }
      } catch (deleteError) {
        console.error('❌ Error al intentar eliminar cabecera:', deleteError);
      }
      
      throw itemsError;
    }
    
    console.log('✅ Líneas de asiento creadas correctamente');
    console.log('✅ Asiento completo creado con ID:', entryId);
    
    // Verificar que las líneas se crearon correctamente
    try {
      const { data: insertedItems, error: checkError } = await supabase
        .from('journal_entry_items')
        .select('*')
        .eq('journal_entry_id', entryId);
      
      if (checkError) {
        console.warn('⚠️ No se pudo verificar la inserción de líneas:', checkError);
      } else {
        console.log(`✅ Verificación: Se insertaron ${insertedItems?.length || 0} líneas para el asiento`);
      }
    } catch (error) {
      console.warn('⚠️ Error al verificar líneas insertadas:', error);
    }
    
    return { id: entryId, error: null };
  } catch (error) {
    console.error('❌ Error al crear asiento contable:', error);
    return { id: null, error };
  }
}

/**
 * Actualizar un asiento contable existente (incluye ajustes)
 */
export async function updateJournalEntry(
  entryId: string,
  formData: JournalEntryForm,
  items: JournalEntryItem[],
  userId: string
): Promise<{ error: any }> {
  try {
    console.log('⏳ Iniciando actualización de asiento contable ID:', entryId);
    console.log('Datos del formulario:', formData);
    console.log('Líneas a actualizar:', items);
    
    if (!items || items.length === 0) {
      console.error('❌ No se proporcionaron líneas para actualizar el asiento');
      throw new Error('No se pueden guardar asientos sin líneas. Debe tener al menos una línea de débito y una de crédito');
    }
    
    // Verificar que todas las líneas tengan cuenta y monto
    for (const item of items) {
      if (!item.account_id) {
        console.error('❌ Una línea no tiene cuenta seleccionada');
        throw new Error('Todas las líneas deben tener una cuenta seleccionada');
      }
      
      // Verificar que las líneas tengan montos válidos - Versión mejorada
      // Ahora acepta tanto el formato con is_debit/amount como el directo debit/credit
      const debitValue = Number(item.debit || 0);
      const creditValue = Number(item.credit || 0);
      
      // Si no hay valores en debit o credit, intentar usar is_debit y amount
      if (debitValue === 0 && creditValue === 0 && item.amount !== undefined) {
        // Si tiene is_debit y amount, verificar consistencia
        if ((item.is_debit && item.amount <= 0) || (!item.is_debit && item.amount <= 0)) {
          console.error('❌ Una línea tiene montos inválidos (usando is_debit/amount)', item);
          throw new Error('Todas las líneas deben tener montos válidos (mayores a cero)');
        }
      } else {
        // Si usa el formato directo debit/credit
        if (debitValue === 0 && creditValue === 0) {
          console.error('❌ Una línea no tiene valores de débito ni crédito', item);
          throw new Error('Todas las líneas deben tener un valor de débito o crédito mayor a cero');
        }
        
        // Si tiene ambos valores, es un error (un asiento no puede tener débito y crédito a la vez)
        if (debitValue > 0 && creditValue > 0) {
          console.error('❌ Una línea tiene valores tanto en débito como en crédito', item);
          throw new Error('Una línea no puede tener valores tanto en débito como en crédito');
        }
      }
    }
    
    // Verificar si el asiento existe y su estado
    const { data: existingEntry, error: checkError } = await supabase
      .from('journal_entries')
      .select('id, status, is_approved, is_posted')
      .eq('id', entryId)
      .single();
    
    if (checkError) {
      console.error('❌ Error al verificar asiento existente:', checkError);
      throw checkError;
    }
    
    if (!existingEntry) {
      console.error('❌ No se encontró el asiento a actualizar');
      throw new Error('El asiento contable no existe');
    }
    
    // Verificar estado
    if (existingEntry.is_approved) {
      console.error('❌ No se puede modificar un asiento aprobado');
      throw new Error('No se puede modificar un asiento aprobado');
    }
    
    if (existingEntry.is_posted) {
      console.error('❌ No se puede modificar un asiento contabilizado');
      throw new Error('No se puede modificar un asiento contabilizado');
    }
    
    if (existingEntry.status === 'anulado') {
      console.error('❌ No se puede modificar un asiento anulado');
      throw new Error('No se puede modificar un asiento anulado');
    }
    
    console.log('✅ Verificación de asiento existente correcta');
    
    // Calcular totales
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    
    items.forEach(item => {
      // Calcular totales considerando ambos formatos
      if (item.debit) totalDebit = totalDebit.plus(roundAmount(item.debit));
      if (item.credit) totalCredit = totalCredit.plus(roundAmount(item.credit));
      
      // También considerar el formato is_debit/amount si es necesario
      if (!item.debit && !item.credit && item.amount && item.is_debit !== undefined) {
        if (item.is_debit) {
          totalDebit = totalDebit.plus(roundAmount(item.amount));
        } else {
          totalCredit = totalCredit.plus(roundAmount(item.amount));
        }
      }
    });
    
    console.log(`Total débito: ${totalDebit}, Total crédito: ${totalCredit}`);
    
    // Verificar balance
    const balance = validateBalance(items);
    if (!balance.valid) {
      console.error('❌ Error de balance:', balance.message);
      throw new Error(balance.message);
    }
    
    // Preparar datos del asiento para actualizar
    const entryData = {
      date: formData.date,
      description: formData.description,
      monthly_period_id: formData.monthly_period_id,
      accounting_period_id: formData.accounting_period_id,
      notes: formData.notes || null,
      reference_number: formData.reference_number || null,
      reference_date: formData.reference_date || null,
      total_debit: totalDebit.toNumber(),
      total_credit: totalCredit.toNumber(),
      is_balanced: true,
      // Campos de ajuste (asumimos que no se cambia el tipo de asiento de regular a ajuste o viceversa en edición)
      // Si se quisiera permitir, se necesitaría lógica adicional
      adjustment_type: formData.is_adjustment ? formData.adjustment_type : null,
      adjusted_entry_id: formData.is_adjustment ? formData.adjusted_entry_id : null,
      // Auditoría
      updated_at: new Date().toISOString()
    };
    
    console.log('⏳ Actualizando cabecera del asiento:', entryData);
    
    // Actualizar asiento
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update(entryData)
      .eq('id', entryId);
    
    if (updateError) {
      console.error('❌ Error al actualizar cabecera del asiento:', updateError);
      throw updateError;
    }
    
    console.log('✅ Cabecera de asiento actualizada correctamente');
    
    // Primero verificamos si hay líneas existentes
    const { data: existingItems, error: checkItemsError } = await supabase
      .from('journal_entry_items')
      .select('id')
      .eq('journal_entry_id', entryId);
      
    if (checkItemsError) {
      console.warn('⚠️ Error al verificar líneas existentes:', checkItemsError);
    } else {
      console.log(`ℹ️ El asiento tiene ${existingItems?.length || 0} líneas existentes`);
    }
    
    // Eliminar líneas existentes
    console.log('⏳ Eliminando líneas existentes del asiento en journal_entry_items');
    
    const { error: deleteError } = await supabase
      .from('journal_entry_items')
      .delete()
      .eq('journal_entry_id', entryId);
    
    if (deleteError) {
      console.error('❌ Error al eliminar líneas existentes:', deleteError);
      throw deleteError;
    }
    
    console.log('✅ Líneas existentes eliminadas correctamente');
    
    // Preparar nuevas líneas del asiento
    const entryItems = items.map(item => {
      // Asegurar que los valores numéricos son correctos
      let debitValue = 0;
      let creditValue = 0;
      
      // Si usa el formato debit/credit directamente
      if (item.debit !== undefined || item.credit !== undefined) {
        debitValue = Number(item.debit || 0);
        creditValue = Number(item.credit || 0);
      } 
      // Si usa el formato is_debit/amount
      else if (item.amount !== undefined && item.is_debit !== undefined) {
        debitValue = item.is_debit ? Number(item.amount) : 0;
        creditValue = !item.is_debit ? Number(item.amount) : 0;
      }
      
      // Asegurar que los valores sean números válidos
      debitValue = isNaN(debitValue) ? 0 : debitValue;
      creditValue = isNaN(creditValue) ? 0 : creditValue;
      
      console.log(`Línea procesada: Cuenta ${item.account_id}, Débito ${debitValue}, Crédito ${creditValue}`);
      
      return {
        id: item.id || uuidv4(), // Usar ID existente o generar uno nuevo
        journal_entry_id: entryId,
        account_id: item.account_id,
        description: item.description || null,
        debit: roundAmount(debitValue),
        credit: roundAmount(creditValue),
        created_by: userId,
        created_at: new Date().toISOString()
      };
    });
    
    console.log('⏳ Insertando nuevas líneas del asiento en journal_entry_items:', entryItems);
    
    // Verificar que haya líneas para insertar
    if (entryItems.length === 0) {
      console.error('❌ No hay líneas para insertar');
      throw new Error('No se pueden guardar asientos sin líneas');
    }
    
    // Insertar nuevas líneas
    const { error: insertError } = await supabase
      .from('journal_entry_items')
      .insert(entryItems);
    
    if (insertError) {
      console.error('❌ Error al insertar nuevas líneas:', insertError);
      
      // Verificar si el error es porque la tabla no existe o hay problemas con la estructura
      const errorMessage = insertError.message || '';
      if (errorMessage.includes('does not exist') || errorMessage.includes('column')) {
        console.error('❌ Posible problema con la tabla journal_entry_items:', errorMessage);
        console.error('Estructura de líneas enviada:', entryItems[0]);
      }
      
      throw insertError;
    }
    
    console.log('✅ Nuevas líneas insertadas correctamente');
    
    // Verificar que las líneas se crearon correctamente
    try {
      const { data: insertedItems, error: checkError } = await supabase
        .from('journal_entry_items')
        .select('*')
        .eq('journal_entry_id', entryId);
      
      if (checkError) {
        console.warn('⚠️ No se pudo verificar la inserción de líneas:', checkError);
      } else {
        console.log(`✅ Verificación: Se insertaron ${insertedItems?.length || 0} líneas para el asiento`);
      }
    } catch (error) {
      console.warn('⚠️ Error al verificar líneas insertadas:', error);
    }
    
    console.log('✅ Asiento actualizado completamente');
    
    return { error: null };
  } catch (error) {
    console.error('❌ Error al actualizar asiento contable:', error);
    return { error };
  }
}

/**
 * Aprobar un asiento contable
 */
export async function approveJournalEntry(id: string, userId: string): Promise<{ error: any }> {
  try {
    // Verificar si el asiento existe
    const { data: entry, error: checkError } = await supabase
      .from('journal_entries')
      .select('id, status, is_approved')
      .eq('id', id)
      .single();
    
    if (checkError) throw checkError;
    
    if (!entry) {
      throw new Error('El asiento contable no existe');
    }
    
    // Verificar que el asiento no esté ya aprobado o anulado
    if (entry.is_approved) {
      throw new Error('El asiento ya está aprobado');
    }
    
    if (entry.status === 'anulado') {
      throw new Error('No se puede aprobar un asiento anulado');
    }
    
    // Aprobar el asiento
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update({
        is_approved: true,
        status: 'aprobado',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (updateError) throw updateError;
    
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
    // Verificar si el asiento existe
    const { data: entry, error: checkError } = await supabase
      .from('journal_entries')
      .select('id, status, is_approved, is_posted')
      .eq('id', id)
      .single();
    
    if (checkError) throw checkError;
    
    if (!entry) {
      throw new Error('El asiento contable no existe');
    }
    
    // Verificar que el asiento no esté aprobado, contabilizado o anulado
    if (entry.is_approved) {
      throw new Error('No se puede eliminar un asiento aprobado');
    }
    
    if (entry.is_posted) {
      throw new Error('No se puede eliminar un asiento contabilizado');
    }
    
    if (entry.status === 'anulado') {
      throw new Error('No se puede eliminar un asiento anulado');
    }
    
    // Primero eliminar las líneas del asiento
    const { error: deleteItemsError } = await supabase
      .from('journal_entry_items')
      .delete()
      .eq('journal_entry_id', id);
    
    if (deleteItemsError) throw deleteItemsError;
    
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
 * Anular un asiento contable
 */
export async function cancelJournalEntry(id: string, userId: string, reason: string): Promise<{ error: any }> {
  try {
    console.log('⏳ Iniciando anulación de asiento ID:', id, 'por usuario:', userId);
    
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
    console.log('⏳ Verificando estado actual del asiento...');
    const { data: entry, error: fetchError } = await supabase
      .from('journal_entries')
      .select('status, is_approved, accounting_period_id, notes, entry_number')
      .eq('id', id)
      .single();
      
    if (fetchError) {
      console.error('❌ Error al verificar asiento:', fetchError);
      throw fetchError;
    }
    
    if (!entry) {
      console.error('❌ Asiento contable no encontrado');
      throw new Error('Asiento contable no encontrado');
    }
    
    console.log('✅ Asiento encontrado:', entry);
    
    // Verificar que el asiento no esté ya anulado
    if (entry.status === 'voided') {
      console.error('❌ Este asiento ya ha sido anulado');
      throw new Error('Este asiento ya ha sido anulado');
    }
    
    // Anular el asiento con manejo administrativo (evitando el trigger de permisos)
    console.log('⏳ Anulando asiento contable...');
    
    // Asegurarnos que el usuario actual esté autenticado antes de actualizar
    const { data: currentUser, error: authError } = await supabase.auth.getUser();
    
    if (authError || !currentUser) {
      console.error('❌ Error de autenticación:', authError);
      throw new Error('Sesión expirada o usuario no autenticado');
    }
    
    console.log('✅ Usuario autenticado:', currentUser.user.id);
    
    // Preparar los datos de actualización - IMPORTANTE: Usar 'voided' en lugar de 'anulado'
    const updatePayload = {
      status: 'voided', // Usar 'voided' que es el valor válido en la restricción de la base de datos
      notes: `${entry.notes ? entry.notes + ' | ' : ''}ANULADO: ${reason}`,
      updated_at: new Date().toISOString(),
      // Conservar estos valores para evitar conflictos de validación
      is_approved: true // Mantenemos como aprobado aunque esté anulado
    };
    
    console.log('📝 Datos de actualización:', updatePayload);
    
    // Intentar actualizar con el enfoque estándar
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update(updatePayload)
      .eq('id', id);
    
    if (updateError) {
      console.error('❌ Error al anular asiento:', updateError);
      
      // Si falla, proporcionar un mensaje más claro
      if (updateError.message?.includes('permission')) {
        throw new Error('No tiene permisos para anular este asiento. Esta acción requiere privilegios de administrador.');
      } else {
        throw updateError;
      }
    }
    
    console.log('✅ Asiento anulado correctamente:', id, entry.entry_number);
    
    // Registrar en log de actividad
    try {
      await supabase.from('activity_logs').insert({
        user_id: userId,
        action: 'cancel',
        table_name: 'journal_entries',
        record_id: id,
        description: `Asiento #${entry.entry_number} anulado. Motivo: ${reason}`,
        created_at: new Date().toISOString()
      });
      console.log('✅ Actividad registrada en log');
    } catch (logError) {
      console.error('⚠️ No se pudo registrar en log (no crítico):', logError);
      // No lanzamos error para no fallar la operación principal
    }
    
    return { error: null };
  } catch (error) {
    console.error('❌ Error al anular asiento contable:', error);
    return { error };
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

// Marcar un asiento existente como ajuste
export async function markAsAdjustment(
  entryId: string, 
  adjustmentType: AdjustmentType, 
  userId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('journal_entries')
      .update({
        is_adjustment: true,
        adjustment_type: adjustmentType,
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId);
    
    if (error) throw error;
    
    // Registrar la acción en el log de actividad
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action: 'update',
      table_name: 'journal_entries',
      record_id: entryId,
      description: `Asiento marcado como ajuste de tipo "${adjustmentType}"`,
      created_at: new Date().toISOString()
    });
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error al marcar asiento como ajuste:', error);
    return { success: false, error: error as Error };
  }
} 