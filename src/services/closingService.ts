import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';

/**
 * Verifica si un período está listo para ser cerrado
 */
export async function checkPeriodReadyForClosing(periodId: string) {
  try {
    // Verificar asientos desbalanceados
    const { data: unbalancedEntries, error: entriesError } = await supabase
      .from('journal_entries')
      .select('id, entry_number')
      .eq('accounting_period_id', periodId)
      .eq('is_balanced', false);
      
    if (entriesError) throw entriesError;
    
    // Obtener datos financieros del período
    const { data: periodData, error: periodError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();
      
    if (periodError) throw periodError;
    
    return {
      isReady: unbalancedEntries?.length === 0,
      hasUnbalancedEntries: unbalancedEntries?.length > 0,
      unbalancedEntries: unbalancedEntries || [],
      periodData
    };
  } catch (error) {
    console.error('Error verificando estado para cierre:', error);
    throw error;
  }
}

/**
 * Obtiene los saldos de cuentas para un período
 */
export async function getAccountBalancesForPeriod(periodId: string) {
  try {
    // Obtener período
    const { data: period, error: periodError } = await supabase
      .from('accounting_periods')
      .select('start_date, end_date')
      .eq('id', periodId)
      .single();
      
    if (periodError) throw periodError;
    
    // Obtener cuentas activas
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true);
      
    if (accountsError) throw accountsError;
    
    // Obtener movimientos del período para todas las cuentas
    const { data: movements, error: movementsError } = await supabase
      .from('journal_entry_items')
      .select(`
        id,
        account_id,
        debit,
        credit,
        journal_entry:journal_entries!journal_entry_id(
          date, 
          is_approved, 
          status,
          accounting_period_id
        )
      `)
      .gte('journal_entry.date', period.start_date)
      .lte('journal_entry.date', period.end_date)
      .eq('journal_entry.accounting_period_id', periodId)
      .eq('journal_entry.is_approved', true)
      .eq('journal_entry.status', 'aprobado');
      
    if (movementsError) throw movementsError;
    
    // Calcular saldos por cuenta
    const balances = new Map();
    
    accounts.forEach(account => {
      balances.set(account.id, {
        account,
        debit: 0,
        credit: 0,
        balance: 0
      });
    });
    
    movements.forEach(movement => {
      const accountData = balances.get(movement.account_id);
      if (accountData) {
        accountData.debit += Number(movement.debit || 0);
        accountData.credit += Number(movement.credit || 0);
        
        // Calcular saldo según tipo de cuenta
        if (accountData.account.type === 'activo' || accountData.account.type === 'gasto' || accountData.account.type === 'costo') {
          accountData.balance = accountData.debit - accountData.credit;
        } else {
          accountData.balance = accountData.credit - accountData.debit;
        }
      }
    });
    
    return Array.from(balances.values());
  } catch (error) {
    console.error('Error obteniendo saldos de cuentas:', error);
    throw error;
  }
}

/**
 * Genera el asiento de cierre de resultados
 */
export async function generateClosingEntry(periodId: string, userId: string) {
  try {
    // Obtener período
    const { data: period, error: periodError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', periodId)
      .single();
      
    if (periodError) throw periodError;
    
    // Obtener saldos de cuentas
    const accountBalances = await getAccountBalancesForPeriod(periodId);
    
    // Filtrar cuentas de resultado (ingresos y gastos) con saldo
    const resultAccountItems = accountBalances.filter(item => 
      (item.account.type === 'ingreso' || item.account.type === 'gasto' || item.account.type === 'costo') && 
      Math.abs(item.balance) > 0.001
    );
    
    if (resultAccountItems.length === 0) {
      throw new Error('No hay cuentas de resultado con saldo para generar el asiento de cierre');
    }
    
    // Preparar líneas para el asiento de cierre
    const closingLines = [];
    let totalIncome = new Decimal(0);
    let totalExpense = new Decimal(0);
    
    // Procesar cuentas de ingresos (se debitan para cerrarlas)
    for (const item of resultAccountItems.filter(a => a.account.type === 'ingreso')) {
      const balance = new Decimal(item.balance);
      if (balance.greaterThan(0)) {
        totalIncome = totalIncome.plus(balance);
        closingLines.push({
          account_id: item.account.id,
          debit: balance.toNumber(),
          credit: 0,
          description: `Cierre de ${item.account.name}`
        });
      }
    }
    
    // Procesar cuentas de gastos (se acreditan para cerrarlas)
    for (const item of resultAccountItems.filter(a => a.account.type === 'gasto' || a.account.type === 'costo')) {
      const balance = new Decimal(item.balance);
      if (balance.greaterThan(0)) {
        totalExpense = totalExpense.plus(balance);
        closingLines.push({
          account_id: item.account.id,
          debit: 0,
          credit: balance.toNumber(),
          description: `Cierre de ${item.account.name}`
        });
      }
    }
    
    // Obtener cuenta de resultados
    const { data: resultAccountsList, error: resultAccountError } = await supabase
      .from('accounts')
      .select('*')
      .or('code.eq.3105,name.ilike.%resultado%ejercicio%')
      .eq('type', 'patrimonio')
      .limit(1);
      
    if (resultAccountError) throw resultAccountError;
    
    if (!resultAccountsList || resultAccountsList.length === 0) {
      throw new Error('No se encontró la cuenta de Resultados del Ejercicio');
    }
    
    const resultAccount = resultAccountsList[0];
    
    // Balancear el asiento con cuenta de resultados
    const netResult = totalIncome.minus(totalExpense);
    closingLines.push({
      account_id: resultAccount.id,
      debit: netResult.lessThan(0) ? Math.abs(netResult.toNumber()) : 0,
      credit: netResult.greaterThan(0) ? netResult.toNumber() : 0,
      description: 'Traslado de resultados del ejercicio'
    });
    
    // Crear asiento de cierre
    const { data: closingEntry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        entry_number: `CIERRE-${period.name}`,
        date: period.end_date,
        description: `Asiento de cierre del período ${period.name}`,
        accounting_period_id: periodId,
        created_by: userId,
        is_closing_entry: true,
        is_balanced: true,
        status: 'pendiente',
        total_debit: totalIncome.plus(netResult.lessThan(0) ? Math.abs(netResult.toNumber()) : 0).toNumber(),
        total_credit: totalExpense.plus(netResult.greaterThan(0) ? netResult.toNumber() : 0).toNumber()
      })
      .select()
      .single();
      
    if (entryError) throw entryError;
    
    // Insertar líneas del asiento
    const entryLines = closingLines.map(line => ({
      ...line,
      journal_entry_id: closingEntry.id
    }));
    
    const { error: linesError } = await supabase
      .from('journal_entry_items')
      .insert(entryLines);
      
    if (linesError) throw linesError;
    
    return closingEntry;
  } catch (error) {
    console.error('Error generando asiento de cierre:', error);
    throw error;
  }
}

/**
 * Cierra un período contable
 */
export async function closePeriod(periodId: string, userId: string) {
  try {
    // Cerrar el período
    const { data, error } = await supabase
      .from('accounting_periods')
      .update({
        is_closed: true,
        closed_by: userId,
        closed_at: new Date().toISOString()
      })
      .eq('id', periodId)
      .select();
      
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Error cerrando período:', error);
    throw error;
  }
}

/**
 * Genera asiento de apertura para el siguiente período
 */
export async function generateOpeningEntry(
  currentPeriodId: string, 
  nextPeriodId: string, 
  userId: string
) {
  try {
    // Obtener datos de los períodos
    const { data: periods, error: periodError } = await supabase
      .from('accounting_periods')
      .select('*')
      .in('id', [currentPeriodId, nextPeriodId]);
      
    if (periodError) throw periodError;
    
    const currentPeriod = periods.find(p => p.id === currentPeriodId);
    const nextPeriod = periods.find(p => p.id === nextPeriodId);
    
    if (!currentPeriod || !nextPeriod) {
      throw new Error('No se pudieron obtener los datos de los períodos');
    }
    
    // Obtener saldos de cuentas permanentes (activo, pasivo, patrimonio)
    const accountBalances = await getAccountBalancesForPeriod(currentPeriodId);
    const permanentAccounts = accountBalances.filter(item => 
      (item.account.type === 'activo' || item.account.type === 'pasivo' || item.account.type === 'patrimonio') && 
      Math.abs(item.balance) > 0.001
    );
    
    if (permanentAccounts.length === 0) {
      throw new Error('No hay cuentas permanentes con saldo para generar el asiento de apertura');
    }
    
    // Preparar líneas para el asiento de apertura
    const openingLines = [];
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    
    // Procesar cuentas de activo (se debitan)
    for (const item of permanentAccounts.filter(a => a.account.type === 'activo')) {
      const balance = new Decimal(item.balance);
      if (balance.greaterThan(0)) {
        totalDebit = totalDebit.plus(balance);
        openingLines.push({
          account_id: item.account.id,
          debit: balance.toNumber(),
          credit: 0,
          description: `Apertura de ${item.account.name}`
        });
      }
    }
    
    // Procesar cuentas de pasivo y patrimonio (se acreditan)
    for (const item of permanentAccounts.filter(a => a.account.type === 'pasivo' || a.account.type === 'patrimonio')) {
      const balance = new Decimal(item.balance);
      if (balance.greaterThan(0)) {
        totalCredit = totalCredit.plus(balance);
        openingLines.push({
          account_id: item.account.id,
          debit: 0,
          credit: balance.toNumber(),
          description: `Apertura de ${item.account.name}`
        });
      }
    }
    
    // Crear asiento de apertura
    const { data: openingEntry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        entry_number: `APERTURA-${nextPeriod.name}`,
        date: nextPeriod.start_date,
        description: `Asiento de apertura del período ${nextPeriod.name}`,
        accounting_period_id: nextPeriodId,
        created_by: userId,
        is_opening_entry: true,
        is_balanced: true,
        status: 'pendiente',
        total_debit: totalDebit.toNumber(),
        total_credit: totalCredit.toNumber()
      })
      .select()
      .single();
      
    if (entryError) throw entryError;
    
    // Insertar líneas del asiento
    const entryLines = openingLines.map(line => ({
      ...line,
      journal_entry_id: openingEntry.id
    }));
    
    const { error: linesError } = await supabase
      .from('journal_entry_items')
      .insert(entryLines);
      
    if (linesError) throw linesError;
    
    return openingEntry;
  } catch (error) {
    console.error('Error generando asiento de apertura:', error);
    throw error;
  }
}

/**
 * Crea el período siguiente
 */
export async function createNextPeriod(currentPeriodId: string, userId: string) {
  try {
    // Obtener período actual
    const { data: currentPeriod, error: periodError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('id', currentPeriodId)
      .single();
      
    if (periodError) throw periodError;
    
    // Calcular fechas del nuevo período
    const startDate = new Date(currentPeriod.end_date);
    startDate.setDate(startDate.getDate() + 1);
    
    const endDate = new Date(startDate);
    // Si es período mensual
    if (currentPeriod.period_type === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // Último día del mes
    } else {
      // Si es período anual
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(endDate.getDate() - 1);
    }
    
    // Formatear fechas como strings YYYY-MM-DD
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Crear nuevo período
    const { data: newPeriod, error: newPeriodError } = await supabase
      .from('accounting_periods')
      .insert({
        name: `Período ${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
        start_date: startDateStr,
        end_date: endDateStr,
        is_active: true,
        is_closed: false,
        period_type: currentPeriod.period_type,
        fiscal_year_id: currentPeriod.fiscal_year_id,
        created_by: userId
      })
      .select()
      .single();
      
    if (newPeriodError) throw newPeriodError;
    
    return newPeriod;
  } catch (error) {
    console.error('Error creando siguiente período:', error);
    throw error;
  }
} 