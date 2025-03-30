import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';

// Tipos de asientos de cierre
export enum ClosingEntryType {
  INCOME_EXPENSE = 'income_expense',
  RESULT_TO_EQUITY = 'result_to_equity'
}

// Estructura para datos de cierre
export interface ClosingData {
  periodId: string;
  userId: string;
  date: string;
  notes?: string;
}

// Estructura para resultado del cierre
export interface ClosingResult {
  success: boolean;
  message: string;
  incomeExpenseEntryId?: string;
  resultToEquityEntryId?: string;
  totalIncome: number;
  totalExpense: number;
  netResult: number;
}

/**
 * Verifica si un período contable está listo para ser cerrado
 * Comprueba que todos los asientos estén aprobados y que existan estados financieros
 */
export async function verifyPeriodReadyForClosing(periodId: string): Promise<{ ready: boolean; message: string }> {
  try {
    // 1. Verificar que no existan asientos sin aprobar
    const { data: pendingEntries, error: entriesError } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('accounting_period_id', periodId)
      .eq('is_approved', false)
      .limit(1);
    
    if (entriesError) throw entriesError;
    
    if (pendingEntries && pendingEntries.length > 0) {
      return {
        ready: false,
        message: 'Existen asientos sin aprobar en este período. Debe aprobarlos antes de cerrar el período.'
      };
    }
    
    // 2. Verificar que existan estados financieros generados
    const { data: financialStatements, error: fsError } = await supabase
      .from('financial_statements')
      .select('id')
      .eq('accounting_period_id', periodId)
      .limit(1);
    
    if (fsError) throw fsError;
    
    if (!financialStatements || financialStatements.length === 0) {
      return {
        ready: false,
        message: 'No se han generado los estados financieros para este período. Debe generarlos antes de cerrar el período.'
      };
    }
    
    // 3. Verificar que el período no esté ya cerrado
    const { data: period, error: periodError } = await supabase
      .from('accounting_periods')
      .select('is_closed')
      .eq('id', periodId)
      .single();
    
    if (periodError) throw periodError;
    
    if (period.is_closed) {
      return {
        ready: false,
        message: 'Este período ya se encuentra cerrado.'
      };
    }
    
    // Si pasa todas las verificaciones, está listo para cerrar
    return {
      ready: true,
      message: 'El período está listo para ser cerrado.'
    };
  } catch (error) {
    console.error('Error al verificar si el período está listo para cerrar:', error);
    return {
      ready: false,
      message: 'Error al verificar el estado del período.'
    };
  }
}

/**
 * Genera y guarda los asientos de cierre para un período contable
 */
export async function generateClosingEntries(data: ClosingData): Promise<ClosingResult> {
  try {
    // Verificar si el período está listo para cerrar
    const verificationResult = await verifyPeriodReadyForClosing(data.periodId);
    if (!verificationResult.ready) {
      return {
        success: false,
        message: verificationResult.message,
        totalIncome: 0,
        totalExpense: 0,
        netResult: 0
      };
    }
    
    // Iniciar transacción
    const { error: transactionError } = await supabase.rpc('begin_transaction');
    if (transactionError) throw transactionError;
    
    try {
      // 1. Obtener cuentas de ingresos y gastos con saldos
      const { data: incomeAccounts, error: incomeError } = await supabase
        .from('accounts')
        .select(`
          id, code, name,
          balance:journal_entry_items(
            sum(credit) - sum(debit)
          )
        `)
        .eq('type', 'revenue')
        .eq('is_active', true)
        .filter('journal_entry_items.journal_entry.accounting_period_id', 'eq', data.periodId)
        .filter('journal_entry_items.journal_entry.is_approved', 'eq', true)
        .group('id');
      
      if (incomeError) throw incomeError;
      
      const { data: expenseAccounts, error: expenseError } = await supabase
        .from('accounts')
        .select(`
          id, code, name,
          balance:journal_entry_items(
            sum(debit) - sum(credit)
          )
        `)
        .eq('type', 'expense')
        .eq('is_active', true)
        .filter('journal_entry_items.journal_entry.accounting_period_id', 'eq', data.periodId)
        .filter('journal_entry_items.journal_entry.is_approved', 'eq', true)
        .group('id');
      
      if (expenseError) throw expenseError;
      
      // 2. Calcular totales
      const totalIncome = incomeAccounts?.reduce((sum, account) => {
        const balance = account.balance?.[0]?.sum || 0;
        return sum + parseFloat(balance.toString());
      }, 0) || 0;
      
      const totalExpense = expenseAccounts?.reduce((sum, account) => {
        const balance = account.balance?.[0]?.sum || 0;
        return sum + parseFloat(balance.toString());
      }, 0) || 0;
      
      const netResult = totalIncome - totalExpense;
      
      // 3. Obtener o crear la cuenta de resultados del ejercicio
      const { data: resultAccount, error: resultAccountError } = await supabase
        .from('accounts')
        .select('id, code, name')
        .or('name.ilike.%resultado%ejercicio%, name.ilike.%utilidad%periodo%')
        .eq('type', 'equity')
        .eq('is_active', true)
        .limit(1);
      
      if (resultAccountError) throw resultAccountError;
      
      if (!resultAccount || resultAccount.length === 0) {
        throw new Error('No se encontró la cuenta de resultados del ejercicio');
      }
      
      const resultAccountId = resultAccount[0].id;
      
      // 4. Crear el asiento de cierre de ingresos y gastos
      const { data: incomeExpenseEntry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          accounting_period_id: data.periodId,
          description: 'Asiento de cierre de ingresos y gastos',
          date: data.date,
          is_approved: true, // Los asientos de cierre se aprueban automáticamente
          is_posted: true,
          created_by: data.userId,
          notes: data.notes || 'Asiento generado automáticamente en el proceso de cierre',
          is_closing_entry: true,
          closing_entry_type: ClosingEntryType.INCOME_EXPENSE,
          total_debit: totalIncome,
          total_credit: totalExpense
        })
        .select('id')
        .single();
      
      if (entryError) throw entryError;
      
      // 5. Crear los ítems del asiento de cierre (ingresos y gastos)
      const closingItems = [];
      
      // Para cada cuenta de ingreso, crear un débito por su saldo
      for (const account of incomeAccounts || []) {
        const balance = account.balance?.[0]?.sum || 0;
        if (parseFloat(balance.toString()) > 0) {
          closingItems.push({
            journal_entry_id: incomeExpenseEntry.id,
            account_id: account.id,
            debit: balance,
            credit: 0,
            description: `Cierre de ${account.name}`
          });
        }
      }
      
      // Para cada cuenta de gasto, crear un crédito por su saldo
      for (const account of expenseAccounts || []) {
        const balance = account.balance?.[0]?.sum || 0;
        if (parseFloat(balance.toString()) > 0) {
          closingItems.push({
            journal_entry_id: incomeExpenseEntry.id,
            account_id: account.id,
            debit: 0,
            credit: balance,
            description: `Cierre de ${account.name}`
          });
        }
      }
      
      // Insertar todos los ítems
      if (closingItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('journal_entry_items')
          .insert(closingItems);
        
        if (itemsError) throw itemsError;
      }
      
      // 6. Crear el asiento de traspaso del resultado a la cuenta de resultados
      const { data: resultToEquityEntry, error: resultEntryError } = await supabase
        .from('journal_entries')
        .insert({
          accounting_period_id: data.periodId,
          description: `Asiento de traspaso del resultado del ejercicio (${netResult >= 0 ? 'utilidad' : 'pérdida'})`,
          date: data.date,
          is_approved: true,
          is_posted: true,
          created_by: data.userId,
          notes: data.notes || 'Asiento generado automáticamente en el proceso de cierre',
          is_closing_entry: true,
          closing_entry_type: ClosingEntryType.RESULT_TO_EQUITY,
          total_debit: netResult < 0 ? Math.abs(netResult) : 0,
          total_credit: netResult >= 0 ? netResult : 0
        })
        .select('id')
        .single();
      
      if (resultEntryError) throw resultEntryError;
      
      // 7. Crear los ítems del asiento de traspaso del resultado
      if (netResult !== 0) {
        const { error: resultItemsError } = await supabase
          .from('journal_entry_items')
          .insert([
            {
              journal_entry_id: resultToEquityEntry.id,
              account_id: resultAccountId,
              debit: netResult < 0 ? Math.abs(netResult) : 0,
              credit: netResult >= 0 ? netResult : 0,
              description: `Traspaso del ${netResult >= 0 ? 'utilidad' : 'pérdida'} del ejercicio`
            }
          ]);
        
        if (resultItemsError) throw resultItemsError;
      }
      
      // 8. Actualizar el período como cerrado
      const { error: periodUpdateError } = await supabase
        .from('accounting_periods')
        .update({
          is_closed: true,
          closed_at: new Date().toISOString(),
          closed_by: data.userId
        })
        .eq('id', data.periodId);
      
      if (periodUpdateError) throw periodUpdateError;
      
      // Confirmar transacción
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) throw commitError;
      
      return {
        success: true,
        message: 'Período cerrado exitosamente.',
        incomeExpenseEntryId: incomeExpenseEntry.id,
        resultToEquityEntryId: resultToEquityEntry.id,
        totalIncome,
        totalExpense,
        netResult
      };
    } catch (error) {
      // Revertir transacción en caso de error
      await supabase.rpc('rollback_transaction');
      throw error;
    }
  } catch (error) {
    console.error('Error al generar asientos de cierre:', error);
    return {
      success: false,
      message: `Error al generar asientos de cierre: ${(error as Error).message}`,
      totalIncome: 0,
      totalExpense: 0,
      netResult: 0
    };
  }
}

/**
 * Reabre un período contable cerrado
 */
export async function reopenAccountingPeriod(periodId: string, userId: string, reason: string): Promise<{ success: boolean; message: string }> {
  try {
    // Iniciar transacción
    const { error: transactionError } = await supabase.rpc('begin_transaction');
    if (transactionError) throw transactionError;
    
    try {
      // 1. Verificar si el período está cerrado
      const { data: period, error: periodError } = await supabase
        .from('accounting_periods')
        .select('is_closed')
        .eq('id', periodId)
        .single();
      
      if (periodError) throw periodError;
      
      if (!period.is_closed) {
        return {
          success: false,
          message: 'Este período no está cerrado, por lo que no puede reabrirse.'
        };
      }
      
      // 2. Eliminar los asientos de cierre
      const { data: closingEntries, error: entriesError } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('accounting_period_id', periodId)
        .eq('is_closing_entry', true);
      
      if (entriesError) throw entriesError;
      
      if (closingEntries && closingEntries.length > 0) {
        const entryIds = closingEntries.map(entry => entry.id);
        
        // Eliminar primero los ítems de los asientos
        const { error: itemsDeleteError } = await supabase
          .from('journal_entry_items')
          .delete()
          .in('journal_entry_id', entryIds);
        
        if (itemsDeleteError) throw itemsDeleteError;
        
        // Luego eliminar los asientos
        const { error: entriesDeleteError } = await supabase
          .from('journal_entries')
          .delete()
          .in('id', entryIds);
        
        if (entriesDeleteError) throw entriesDeleteError;
      }
      
      // 3. Actualizar el período como reabierto
      const { error: periodUpdateError } = await supabase
        .from('accounting_periods')
        .update({
          is_closed: false,
          is_reopened: true,
          reopened_at: new Date().toISOString(),
          reopened_by: userId,
          notes: reason
        })
        .eq('id', periodId);
      
      if (periodUpdateError) throw periodUpdateError;
      
      // Confirmar transacción
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) throw commitError;
      
      return {
        success: true,
        message: 'Período reabierto exitosamente.'
      };
    } catch (error) {
      // Revertir transacción en caso de error
      await supabase.rpc('rollback_transaction');
      throw error;
    }
  } catch (error) {
    console.error('Error al reabrir período contable:', error);
    return {
      success: false,
      message: `Error al reabrir período: ${(error as Error).message}`
    };
  }
}

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
        items:journal_entry_items(
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
 * Actualiza el estado de la base de datos para reflejar que se agregó un campo is_closing_entry
 * a la tabla journal_entries si aún no existe
 */
export async function updateDatabaseSchema(): Promise<void> {
  try {
    // Verificar si la columna is_closing_entry existe en journal_entries
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'journal_entries')
      .eq('column_name', 'is_closing_entry');
    
    if (error) {
      console.error('Error al verificar schema:', error);
      return;
    }
    
    // Si la columna no existe, agregarla
    if (!data || data.length === 0) {
      await supabase.rpc('run_sql', { 
        sql: 'ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_closing_entry BOOLEAN DEFAULT FALSE;' 
      });
      
      await supabase.rpc('run_sql', { 
        sql: 'ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS closing_entry_type TEXT;' 
      });
      
      console.log('Schema actualizado: columnas de cierre agregadas a journal_entries');
    }
  } catch (error) {
    console.error('Error al actualizar schema:', error);
  }
} 