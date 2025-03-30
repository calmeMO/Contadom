import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';

// Interfaces para la reapertura de períodos
export interface ReopeningData {
  previousPeriodId: string;
  newPeriodId: string;
  userId: string;
  date: string;
  notes?: string;
}

export interface ReopeningResult {
  success: boolean;
  message: string;
  openingEntryId?: string;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

/**
 * Verifica si se puede realizar la reapertura de un período
 * Comprueba que el período anterior esté cerrado y que el nuevo período exista y esté vacío
 */
export async function verifyReadyForReopening(
  previousPeriodId: string, 
  newPeriodId: string
): Promise<{ ready: boolean; message: string }> {
  try {
    // 1. Verificar que el período anterior esté cerrado
    const { data: previousPeriod, error: prevError } = await supabase
      .from('accounting_periods')
      .select('is_closed, name')
      .eq('id', previousPeriodId)
      .single();
    
    if (prevError) throw prevError;
    
    if (!previousPeriod.is_closed) {
      return {
        ready: false,
        message: `El período anterior "${previousPeriod.name}" debe estar cerrado para poder realizar la reapertura.`
      };
    }
    
    // 2. Verificar que el nuevo período exista y esté vacío
    const { data: newPeriod, error: newError } = await supabase
      .from('accounting_periods')
      .select('name, is_closed')
      .eq('id', newPeriodId)
      .single();
    
    if (newError) throw newError;
    
    if (newPeriod.is_closed) {
      return {
        ready: false,
        message: `El nuevo período "${newPeriod.name}" no debe estar cerrado.`
      };
    }
    
    // 3. Verificar que el nuevo período no tenga asientos
    const { data: entries, error: entriesError } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('accounting_period_id', newPeriodId)
      .limit(1);
    
    if (entriesError) throw entriesError;
    
    if (entries && entries.length > 0) {
      return {
        ready: false,
        message: `El nuevo período "${newPeriod.name}" ya tiene asientos contables. Debe estar vacío para realizar la reapertura.`
      };
    }
    
    // Si pasa todas las verificaciones, está listo para la reapertura
    return {
      ready: true,
      message: 'Todo está listo para realizar la reapertura del período.'
    };
  } catch (error) {
    console.error('Error al verificar si está listo para reapertura:', error);
    return {
      ready: false,
      message: 'Error al verificar el estado de los períodos.'
    };
  }
}

/**
 * Genera y guarda el asiento de apertura para el nuevo período
 */
export async function generateOpeningEntries(data: ReopeningData): Promise<ReopeningResult> {
  try {
    // Verificar si está listo para reapertura
    const verificationResult = await verifyReadyForReopening(data.previousPeriodId, data.newPeriodId);
    if (!verificationResult.ready) {
      return {
        success: false,
        message: verificationResult.message,
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0
      };
    }
    
    // Iniciar transacción
    const { error: transactionError } = await supabase.rpc('begin_transaction');
    if (transactionError) throw transactionError;
    
    try {
      // 1. Obtener los saldos finales de todas las cuentas de balance (activo, pasivo, patrimonio)
      // Las cuentas de ingresos y gastos deberían estar en cero después del cierre
      
      // Obtener cuentas de activo con sus saldos finales
      const { data: assetAccounts, error: assetError } = await supabase
        .from('accounts')
        .select(`
          id, code, name, type,
          balance:journal_entry_items(
            sum(debit) - sum(credit)
          )
        `)
        .eq('type', 'asset')
        .eq('is_active', true)
        .filter('journal_entry_items.journal_entry.accounting_period_id', 'eq', data.previousPeriodId)
        .filter('journal_entry_items.journal_entry.is_approved', 'eq', true)
        .group('id');
      
      if (assetError) throw assetError;
      
      // Obtener cuentas de pasivo con sus saldos finales
      const { data: liabilityAccounts, error: liabilityError } = await supabase
        .from('accounts')
        .select(`
          id, code, name, type,
          balance:journal_entry_items(
            sum(credit) - sum(debit)
          )
        `)
        .eq('type', 'liability')
        .eq('is_active', true)
        .filter('journal_entry_items.journal_entry.accounting_period_id', 'eq', data.previousPeriodId)
        .filter('journal_entry_items.journal_entry.is_approved', 'eq', true)
        .group('id');
      
      if (liabilityError) throw liabilityError;
      
      // Obtener cuentas de patrimonio con sus saldos finales
      const { data: equityAccounts, error: equityError } = await supabase
        .from('accounts')
        .select(`
          id, code, name, type,
          balance:journal_entry_items(
            sum(credit) - sum(debit)
          )
        `)
        .eq('type', 'equity')
        .eq('is_active', true)
        .filter('journal_entry_items.journal_entry.accounting_period_id', 'eq', data.previousPeriodId)
        .filter('journal_entry_items.journal_entry.is_approved', 'eq', true)
        .group('id');
      
      if (equityError) throw equityError;
      
      // 2. Calcular totales
      const totalAssets = assetAccounts?.reduce((sum, account) => {
        const balance = account.balance?.[0]?.sum || 0;
        const balanceNum = parseFloat(balance.toString());
        return sum + (balanceNum > 0 ? balanceNum : 0); // Solo saldos positivos para activos
      }, 0) || 0;
      
      const totalLiabilities = liabilityAccounts?.reduce((sum, account) => {
        const balance = account.balance?.[0]?.sum || 0;
        const balanceNum = parseFloat(balance.toString());
        return sum + (balanceNum > 0 ? balanceNum : 0); // Solo saldos positivos para pasivos
      }, 0) || 0;
      
      const totalEquity = equityAccounts?.reduce((sum, account) => {
        const balance = account.balance?.[0]?.sum || 0;
        const balanceNum = parseFloat(balance.toString());
        return sum + (balanceNum > 0 ? balanceNum : 0); // Solo saldos positivos para patrimonio
      }, 0) || 0;
      
      // 3. Crear el asiento de apertura
      const { data: openingEntry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          accounting_period_id: data.newPeriodId,
          description: 'Asiento de apertura - Saldos iniciales',
          date: data.date,
          is_approved: true, // Los asientos de apertura se aprueban automáticamente
          is_posted: true,
          created_by: data.userId,
          notes: data.notes || 'Asiento generado automáticamente en el proceso de reapertura',
          is_opening_entry: true,
          total_debit: totalAssets,
          total_credit: totalLiabilities + totalEquity
        })
        .select('id')
        .single();
      
      if (entryError) throw entryError;
      
      // 4. Crear los ítems del asiento de apertura
      const openingItems = [];
      
      // Para cada cuenta de activo con saldo, crear un débito
      for (const account of assetAccounts || []) {
        const balance = account.balance?.[0]?.sum || 0;
        const balanceNum = parseFloat(balance.toString());
        if (balanceNum > 0) {
          openingItems.push({
            journal_entry_id: openingEntry.id,
            account_id: account.id,
            debit: balanceNum,
            credit: 0,
            description: `Saldo inicial de ${account.name}`
          });
        }
      }
      
      // Para cada cuenta de pasivo con saldo, crear un crédito
      for (const account of liabilityAccounts || []) {
        const balance = account.balance?.[0]?.sum || 0;
        const balanceNum = parseFloat(balance.toString());
        if (balanceNum > 0) {
          openingItems.push({
            journal_entry_id: openingEntry.id,
            account_id: account.id,
            debit: 0,
            credit: balanceNum,
            description: `Saldo inicial de ${account.name}`
          });
        }
      }
      
      // Para cada cuenta de patrimonio con saldo, crear un crédito
      for (const account of equityAccounts || []) {
        const balance = account.balance?.[0]?.sum || 0;
        const balanceNum = parseFloat(balance.toString());
        if (balanceNum > 0) {
          openingItems.push({
            journal_entry_id: openingEntry.id,
            account_id: account.id,
            debit: 0,
            credit: balanceNum,
            description: `Saldo inicial de ${account.name}`
          });
        }
      }
      
      // Insertar todos los ítems
      if (openingItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('journal_entry_items')
          .insert(openingItems);
        
        if (itemsError) throw itemsError;
      }
      
      // 5. Actualizar el nuevo período para indicar que tiene saldos iniciales
      const { error: periodUpdateError } = await supabase
        .from('accounting_periods')
        .update({
          has_opening_balances: true,
          updated_at: new Date().toISOString(),
          updated_by: data.userId
        })
        .eq('id', data.newPeriodId);
      
      if (periodUpdateError) throw periodUpdateError;
      
      // Confirmar transacción
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) throw commitError;
      
      return {
        success: true,
        message: 'Período reabierto exitosamente con los saldos iniciales.',
        openingEntryId: openingEntry.id,
        totalAssets,
        totalLiabilities,
        totalEquity
      };
    } catch (error) {
      // Revertir transacción en caso de error
      await supabase.rpc('rollback_transaction');
      throw error;
    }
  } catch (error) {
    console.error('Error al generar asientos de apertura:', error);
    return {
      success: false,
      message: `Error al generar asientos de apertura: ${(error as Error).message}`,
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0
    };
  }
}

/**
 * Obtiene los períodos disponibles para reapertura (períodos cerrados)
 */
export async function getPeriodsForReopening(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('id, name, start_date, end_date, is_closed, closed_at')
      .eq('is_closed', true)
      .order('end_date', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error al obtener períodos para reapertura:', error);
    return [];
  }
}

/**
 * Obtiene los períodos disponibles para ser destino de reapertura (no cerrados)
 */
export async function getTargetPeriodsForReopening(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('id, name, start_date, end_date, is_closed')
      .eq('is_closed', false)
      .order('start_date', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error al obtener períodos destino para reapertura:', error);
    return [];
  }
}

/**
 * Obtiene el asiento de apertura de un período específico
 */
export async function getOpeningEntry(periodId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id, 
        date, 
        description, 
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
      .eq('is_opening_entry', true)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') { // No se encontró ningún resultado
        return null;
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error al obtener asiento de apertura:', error);
    return null;
  }
}

/**
 * Actualiza el estado de la base de datos para reflejar que se agregó un campo is_opening_entry
 * a la tabla journal_entries si aún no existe
 */
export async function updateDatabaseSchema(): Promise<void> {
  try {
    // Verificar si la columna is_opening_entry existe en journal_entries
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'journal_entries')
      .eq('column_name', 'is_opening_entry');
    
    if (error) {
      console.error('Error al verificar schema:', error);
      return;
    }
    
    // Si la columna no existe, agregarla
    if (!data || data.length === 0) {
      await supabase.rpc('run_sql', { 
        sql: 'ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_opening_entry BOOLEAN DEFAULT FALSE;' 
      });
      
      await supabase.rpc('run_sql', { 
        sql: 'ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS has_opening_balances BOOLEAN DEFAULT FALSE;' 
      });
      
      console.log('Schema actualizado: columnas para reapertura agregadas');
    }
  } catch (error) {
    console.error('Error al actualizar schema:', error);
  }
} 