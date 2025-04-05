import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';
import { isValid, format, parseISO } from 'date-fns';
import { isMonthlyPeriodClosed } from './accountingPeriodService';
import { v4 as uuidv4 } from 'uuid';

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

export interface JournalEntriesFilter {
  monthlyPeriodId?: string;
  fiscalYearId?: string;
  status?: string;
  searchTerm?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  entryType?: 'regular' | 'adjustment' | 'all'; // <- Nuevo filtro
  excludeVoided?: boolean; // <- Nuevo filtro para excluir asientos anulados
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
  // Si no hay líneas, no está balanceado
  if (!items || items.length === 0) {
    return { 
      valid: false, 
      message: 'El asiento debe tener al menos una línea' 
    };
  }
  
  // El asiento debe tener al menos 2 líneas (débito y crédito)
  if (items.length < 2) {
    return { 
      valid: false, 
      message: 'El asiento debe tener al menos una línea de débito y una de crédito' 
    };
  }
  
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);
  let hasDebit = false;
  let hasCredit = false;
  
  // Verificar que todas las líneas tengan campos obligatorios
  for (const item of items) {
    if (!item.account_id) {
      return { valid: false, message: 'Todas las líneas deben tener una cuenta seleccionada' };
    }
    
    // Verificar que haya un monto
    const hasAmount = (item.amount !== undefined && item.amount !== null && item.amount > 0) || 
                     (item.debit !== undefined && item.debit !== null && item.debit > 0) || 
                     (item.credit !== undefined && item.credit !== null && item.credit > 0);
                     
    if (!hasAmount) {
      return { valid: false, message: 'Todas las líneas deben tener un monto mayor que cero' };
    }
    
    // Sumar el debe y el haber
    if (item.is_debit && item.amount) {
      totalDebit = totalDebit.plus(new Decimal(item.amount));
      hasDebit = true;
    } 
    else if (!item.is_debit && item.amount) {
      totalCredit = totalCredit.plus(new Decimal(item.amount));
      hasCredit = true;
    }
    else {
      if (item.debit) {
        totalDebit = totalDebit.plus(new Decimal(item.debit));
        hasDebit = true;
      }
      if (item.credit) {
        totalCredit = totalCredit.plus(new Decimal(item.credit));
        hasCredit = true;
      }
    }
  }
  
  // Debe haber al menos una línea de débito y una de crédito
  if (!hasDebit || !hasCredit) {
    return { 
      valid: false, 
      message: 'El asiento debe tener al menos una línea de débito y una de crédito' 
    };
  }
  
  totalDebit = totalDebit.toDecimalPlaces(2);
  totalCredit = totalCredit.toDecimalPlaces(2);
  
  const difference = totalDebit.minus(totalCredit).abs();
  const isBalanced = difference.lessThanOrEqualTo(new Decimal(0.01));
  
  if (isBalanced) {
    return { valid: true, message: 'Asiento balanceado' };
  } else {
    const formattedDifference = difference.toFixed(2);
    return { 
      valid: false, 
      message: `El asiento no está balanceado. Diferencia: ${formattedDifference}. El debe y el haber deben ser iguales.`
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
      console.log('Filtrando por período mensual:', filters.monthlyPeriodId);
      query = query.eq('monthly_period_id', filters.monthlyPeriodId);
    }
    
    // Filtro por año fiscal - usar otro enfoque
    if (filters.fiscalYearId) {
      console.log('Filtrando por año fiscal:', filters.fiscalYearId);
      try {
        // Primero, obtener los ids de los períodos mensuales de este año fiscal
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
    // Obtener el asiento
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .single();
      
    if (entryError) {
      throw entryError;
    }

    // Obtener las líneas del asiento
    const { data: itemsData, error: itemsError } = await supabase
      .from('journal_entry_items')
      .select('*, account:accounts(id, code, name, type, nature)')
      .eq('journal_entry_id', id)
      .order('id');

    if (itemsError) {
      throw itemsError;
    }

    return { entry, items: itemsData, error: null };
  } catch (error) {
    console.error('Error al obtener asiento contable:', error);
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
    // Calcular totales
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    
    items.forEach(item => {
      // Usar roundAmount para consistencia
      if (item.debit) totalDebit = totalDebit.plus(roundAmount(item.debit));
      if (item.credit) totalCredit = totalCredit.plus(roundAmount(item.credit));
    });
    
    // Verificar balance
    const balance = validateBalance(items);
    if (!balance.valid) {
      throw new Error(balance.message);
    }
    
    // Obtener el siguiente número de asiento de forma segura
    const nextEntryNumber = await getNextEntryNumber();
    
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
    console.debug('Datos del asiento a crear:', entryData);
    
    // Insertar asiento
    const { error: entryError } = await supabase
      .from('journal_entries')
      .insert(entryData);
    
    if (entryError) {
      console.error('Error al insertar asiento:', entryError);
      throw entryError;
    }
    
    // Preparar líneas del asiento
    const entryItems = items.map(item => ({
      journal_entry_id: entryId,
      account_id: item.account_id,
      description: item.description || null,
      // Usar roundAmount aquí también
      debit: roundAmount(item.debit),
      credit: roundAmount(item.credit),
      created_by: userId,
      created_at: new Date().toISOString()
    }));
    
    // Insertar líneas
    const { error: itemsError } = await supabase
      .from('journal_entry_items')
      .insert(entryItems);
    
    if (itemsError) {
        // Considerar transacción: Si fallan las líneas, ¿debería eliminarse el asiento?
        // Por ahora, solo lanzamos el error.
        console.error('Error al insertar líneas de asiento:', itemsError);
        throw itemsError;
    }
    
    return { id: entryId, error: null };
  } catch (error) {
    console.error('Error al crear asiento contable:', error);
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
    // Verificar si el asiento existe y su estado
    const { data: existingEntry, error: checkError } = await supabase
      .from('journal_entries')
      .select('id, status, is_approved, is_posted')
      .eq('id', entryId)
      .single();
    
    if (checkError) throw checkError;
    if (!existingEntry) throw new Error('El asiento contable no existe');
    if (existingEntry.is_approved) throw new Error('No se puede modificar un asiento aprobado');
    if (existingEntry.is_posted) throw new Error('No se puede modificar un asiento contabilizado');
    if (existingEntry.status === 'voided') throw new Error('No se puede modificar un asiento anulado');
    
    // Calcular totales
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    items.forEach(item => {
      if (item.debit) totalDebit = totalDebit.plus(roundAmount(item.debit));
      if (item.credit) totalCredit = totalCredit.plus(roundAmount(item.credit));
    });
    
    // Verificar balance
    const balance = validateBalance(items);
    if (!balance.valid) throw new Error(balance.message);
    
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
    
    // Actualizar asiento
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update(entryData)
      .eq('id', entryId);
    if (updateError) throw updateError;
    
    // ----- Gestión de Líneas: Estrategia de Borrar e Insertar -----
    // Podría optimizarse comparando líneas existentes y nuevas si fuera necesario
    
    // Eliminar líneas existentes
    const { error: deleteError } = await supabase
      .from('journal_entry_items')
      .delete()
      .eq('journal_entry_id', entryId);
    if (deleteError) throw deleteError;
    
    // Preparar nuevas líneas
    const entryItems = items.map(item => ({
      journal_entry_id: entryId,
      account_id: item.account_id,
      description: item.description || null,
      debit: roundAmount(item.debit),
      credit: roundAmount(item.credit),
      // Asumimos que created_by/at no se actualizan, pero podríamos añadir updated_by/at si el esquema lo soporta
      created_by: userId, // O mantener el original si es necesario rastrear creación vs actualización de línea
      created_at: new Date().toISOString() // O mantener el original
    }));
    
    // Insertar nuevas líneas
    const { error: insertError } = await supabase
      .from('journal_entry_items')
      .insert(entryItems);
    if (insertError) throw insertError; // Considerar rollback si es posible/necesario
    
    return { error: null };
  } catch (error) {
    console.error('Error al actualizar asiento contable:', error);
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
    
    if (entry.status === 'voided') {
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
    
    if (entry.status === 'voided') {
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
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (updateError) {
      throw updateError;
    }
    
    return { error: null };
  } catch (error) {
    console.error('Error al anular asiento contable:', error);
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