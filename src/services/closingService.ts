import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';

// Tipos de asientos de cierre
export enum ClosingEntryType {
  INCOME_SUMMARY = 'income_summary',
  EXPENSE_SUMMARY = 'expense_summary',
  PROFIT_LOSS = 'profit_loss',
  BALANCE_TRANSFER = 'balance_transfer'
}

// Estructura para datos de cierre
export interface ClosingData {
  periodId: string;
  userId: string;
  date: string;
  notes?: string;
}

// Resultado del proceso de cierre
export interface ClosingResult {
  success: boolean;
  message: string;
  closingEntryIds?: string[];
  totalIncome?: number;
  totalExpenses?: number;
  netResult?: number;
}

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  balance: Array<{ sum: number }>;
}

/**
 * Verifica si un período contable está listo para ser cerrado
 */
export const verifyPeriodReadyForClosing = async (
  periodId: string
): Promise<{ ready: boolean; message: string }> => {
  const { data, error } = await supabase
    .rpc('verify_period_ready_for_closing', {
      p_period_id: periodId
    });

  if (error) {
    throw new Error(`Error al verificar el cierre: ${error.message}`);
  }

  return data[0] || { ready: false, message: 'Error al verificar el cierre' };
};

/**
 * Genera los asientos de cierre para un período contable
 */
export const generateClosingEntries = async (
  periodId: string,
  userId: string,
  date: Date,
  notes?: string
): Promise<ClosingResult> => {
  const { data, error } = await supabase
    .rpc('generate_closing_entries', {
      p_period_id: periodId,
      p_user_id: userId,
      p_date: date.toISOString().split('T')[0],
      p_notes: notes
    });

  if (error) {
    throw new Error(`Error al generar asientos de cierre: ${error.message}`);
  }

  const result = data[0];
  return {
    success: result.success,
    message: result.message,
    closingEntryIds: result.closing_entry_ids,
    totalIncome: result.total_income,
    totalExpenses: result.total_expenses,
    netResult: result.net_result
  };
};

/**
 * Obtiene los asientos de cierre de un período específico
 */
export async function getClosingEntries(periodId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id, 
        date, 
        description, 
        closing_entry_type,
        total_debit,
        total_credit,
        items:journal_entry_lines(
          id,
          account_id,
          debit,
          credit,
          description,
          account:accounts(id, code, name, type)
        )
      `)
      .eq('accounting_period_id', periodId)
      .eq('is_closing_entry', true)
      .order('date');
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error al obtener asientos de cierre:', error);
    return [];
  }
}

/**
 * Reabre un período contable
 */
export async function reopenAccountingPeriod(
  periodId: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Verificar que el período esté cerrado
    const { data: period, error: periodError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();

    if (periodError) throw periodError;

    if (!period.is_closed) {
      return {
        success: false,
        message: 'El período ya está abierto'
      };
    }

    // 2. Eliminar asientos de cierre
    const { error: deleteError } = await supabase
      .from('journal_entries')
      .delete()
      .eq('accounting_period_id', periodId)
      .eq('is_closing_entry', true);

    if (deleteError) throw deleteError;

    // 3. Reabrir el período
    const { error: updateError } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: false,
        is_reopened: true,
        reopened_at: new Date().toISOString(),
        reopened_by: userId,
        notes: period.notes 
          ? `${period.notes} | Reabierto: ${reason}` 
          : `Reabierto: ${reason}`
      })
      .eq('id', periodId);

    if (updateError) throw updateError;

    return {
      success: true,
      message: 'Período reabierto exitosamente'
    };
  } catch (error) {
    console.error('Error al reabrir período:', error);
    return {
      success: false,
      message: `Error al reabrir período: ${(error as Error).message}`
    };
  }
}

/**
 * Actualiza el esquema de la base de datos para incluir las columnas necesarias
 */
export async function updateDatabaseSchema(): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_closing_schema');
    
    if (error) {
      console.error('Error al actualizar schema:', error);
      throw error;
    }
    
    console.log('Schema actualizado correctamente');
  } catch (error) {
    console.error('Error al actualizar schema:', error);
    throw error;
  }
} 