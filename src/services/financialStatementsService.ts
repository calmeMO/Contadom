import { supabase } from '../lib/supabase';
import { Account } from './accountService';
import Decimal from 'decimal.js';
import { format } from 'date-fns';

export interface FinancialData {
  assets: FinancialAccount[];
  liabilities: FinancialAccount[];
  equity: FinancialAccount[];
  revenue: FinancialAccount[];
  expenses: FinancialAccount[];
  costs: FinancialAccount[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpenses: number;
  totalCosts: number;
  netIncome: number;
}

export interface FinancialAccount extends Account {
  balance: number;
  hasActivity: boolean;
}

/**
 * Función base para obtener los datos financieros
 */
export async function fetchFinancialData(periodId: string) {
  try {
    console.log('Obteniendo datos financieros para el período:', periodId);
    
    if (!periodId) {
      throw new Error('ID de período no especificado');
    }
    
    // Verificar si es un período mensual o un año fiscal
    let startDate, endDate;
    
    // Intentar obtener datos del período mensual
    const { data: monthlyPeriod, error: monthlyError } = await supabase
      .from('monthly_accounting_periods')
      .select('start_date, end_date')
      .eq('id', periodId)
      .maybeSingle();
      
    if (monthlyPeriod) {
      startDate = monthlyPeriod.start_date;
      endDate = monthlyPeriod.end_date;
    } else {
      // Si no es un período mensual, intentar como año fiscal
      const { data: yearlyPeriod, error: yearlyError } = await supabase
        .from('accounting_periods')
        .select('start_date, end_date')
        .eq('id', periodId)
        .maybeSingle();
        
      if (yearlyPeriod) {
        startDate = yearlyPeriod.start_date;
        endDate = yearlyPeriod.end_date;
      } else {
        throw new Error('Período no encontrado');
      }
    }
    
    // Verificar que tenemos fechas válidas
    if (!startDate || !endDate) {
      throw new Error('Fechas de período incorrectas o no disponibles');
    }
    
    console.log('Período encontrado:', { startDate, endDate });

    // Obtener cuentas de activos
    const { data: assets, error: assetsError } = await supabase
      .from('accounts')
      .select('id, code, name, parent_id')
      .eq('type', 'activo')
      .eq('is_active', true)
      .order('code');

    if (assetsError) throw assetsError;

    // Obtener cuentas de pasivos
    const { data: liabilities, error: liabilitiesError } = await supabase
      .from('accounts')
      .select('id, code, name, parent_id')
      .eq('type', 'pasivo')
      .eq('is_active', true)
      .order('code');

    if (liabilitiesError) throw liabilitiesError;

    // Obtener cuentas de patrimonio
    const { data: equity, error: equityError } = await supabase
      .from('accounts')
      .select('id, code, name, parent_id')
      .eq('type', 'patrimonio')
      .eq('is_active', true)
      .order('code');

    if (equityError) throw equityError;

    // Obtener cuentas de ingresos
    const { data: revenue, error: revenueError } = await supabase
      .from('accounts')
      .select('id, code, name, parent_id')
      .eq('type', 'ingreso')
      .eq('is_active', true)
      .order('code');

    if (revenueError) throw revenueError;

    // Obtener cuentas de gastos
    const { data: expenses, error: expensesError } = await supabase
      .from('accounts')
      .select('id, code, name, parent_id')
      .eq('type', 'gasto')
      .eq('is_active', true)
      .order('code');

    if (expensesError) throw expensesError;

    // Obtener cuentas de costos
    const { data: costs, error: costsError } = await supabase
      .from('accounts')
      .select('id, code, name, parent_id')
      .eq('type', 'costo')
      .eq('is_active', true)
      .order('code');

    if (costsError) throw costsError;

    // Combinar todas las cuentas en un solo arreglo
    const allAccounts = [
      ...(assets || []).map(account => ({ ...account, type: 'activo' })),
      ...(liabilities || []).map(account => ({ ...account, type: 'pasivo' })),
      ...(equity || []).map(account => ({ ...account, type: 'patrimonio' })),
      ...(revenue || []).map(account => ({ ...account, type: 'ingreso' })),
      ...(expenses || []).map(account => ({ ...account, type: 'gasto' })),
      ...(costs || []).map(account => ({ ...account, type: 'costo' }))
    ];

    // Obtener todos los movimientos del período aprobados y no anulados
    const { data: movements, error: movementsError } = await supabase
      .from('journal_entry_items')
      .select(`
        id,
        account_id,
        debit,
        credit,
        journal_entries!inner(id, date, is_approved, status)
      `)
      .gte('journal_entries.date', startDate)
      .lte('journal_entries.date', endDate)
      .eq('journal_entries.is_approved', true)
      .neq('journal_entries.status', 'voided');

    if (movementsError) throw movementsError;

    // Procesar los movimientos para calcular los saldos
    const accountBalances: { [accountId: string]: number } = {};
    
    // Inicializar saldos en 0
    allAccounts.forEach(account => {
      accountBalances[account.id] = 0;
    });
    
    // Calcular saldos según los movimientos
    movements.forEach(movement => {
      const accountId = movement.account_id;
      if (accountId in accountBalances) {
        const debit = parseFloat(movement.debit || '0');
        const credit = parseFloat(movement.credit || '0');
        
        // Obtener el tipo de cuenta
        const account = allAccounts.find(acc => acc.id === accountId);
        if (account) {
          // Naturaleza de la cuenta
          const isDebitType = ['activo', 'gasto', 'costo'].includes(account.type);
          
          if (isDebitType) {
            // Para activos, gastos y costos: débito aumenta, crédito disminuye
            accountBalances[accountId] += debit - credit;
          } else {
            // Para pasivos, patrimonio e ingresos: crédito aumenta, débito disminuye
            accountBalances[accountId] += credit - debit;
          }
        }
      }
    });

    // Construir objetos para los estados financieros
    const assetAccountsWithBalance = assets.map(account => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: 'activo',
      nature: 'debit',
      is_active: true,
      parentId: account.parent_id,
      balance: accountBalances[account.id] || 0,
      hasActivity: (movements || []).some(m => m.account_id === account.id)
    })).filter(account => account.balance !== 0 || account.hasActivity);

    const liabilityAccountsWithBalance = liabilities.map(account => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: 'pasivo',
      nature: 'credit',
      is_active: true,
      parentId: account.parent_id,
      balance: accountBalances[account.id] || 0,
      hasActivity: (movements || []).some(m => m.account_id === account.id)
    })).filter(account => account.balance !== 0 || account.hasActivity);

    const equityAccountsWithBalance = equity.map(account => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: 'patrimonio',
      nature: 'credit',
      is_active: true,
      parentId: account.parent_id,
      balance: accountBalances[account.id] || 0,
      hasActivity: (movements || []).some(m => m.account_id === account.id)
    })).filter(account => account.balance !== 0 || account.hasActivity);

    const revenueAccountsWithBalance = revenue.map(account => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: 'ingreso',
      nature: 'credit',
      is_active: true,
      parentId: account.parent_id,
      balance: accountBalances[account.id] || 0,
      hasActivity: (movements || []).some(m => m.account_id === account.id)
    })).filter(account => account.balance !== 0 || account.hasActivity);

    const expenseAccountsWithBalance = expenses.map(account => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: 'gasto',
      nature: 'debit',
      is_active: true,
      parentId: account.parent_id,
      balance: accountBalances[account.id] || 0,
      hasActivity: (movements || []).some(m => m.account_id === account.id)
    })).filter(account => account.balance !== 0 || account.hasActivity);

    const costAccountsWithBalance = costs.map(account => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: 'costo',
      nature: 'debit',
      is_active: true,
      parentId: account.parent_id,
      balance: accountBalances[account.id] || 0,
      hasActivity: (movements || []).some(m => m.account_id === account.id)
    })).filter(account => account.balance !== 0 || account.hasActivity);

    // Calcular totales
    const totalAssets = assetAccountsWithBalance.reduce((sum, account) => sum + account.balance, 0);
    const totalLiabilities = liabilityAccountsWithBalance.reduce((sum, account) => sum + account.balance, 0);
    const totalEquity = equityAccountsWithBalance.reduce((sum, account) => sum + account.balance, 0);
    const totalRevenue = revenueAccountsWithBalance.reduce((sum, account) => sum + account.balance, 0);
    const totalExpenses = expenseAccountsWithBalance.reduce((sum, account) => sum + account.balance, 0);
    const totalCosts = costAccountsWithBalance.reduce((sum, account) => sum + account.balance, 0);
    
    // Calcular utilidad neta
    const netIncome = totalRevenue - totalExpenses - totalCosts;

    return {
      assets: assetAccountsWithBalance,
      liabilities: liabilityAccountsWithBalance,
      equity: equityAccountsWithBalance,
      revenue: revenueAccountsWithBalance,
      expenses: expenseAccountsWithBalance,
      costs: costAccountsWithBalance,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
      totalCosts,
      netIncome
    };
  } catch (error) {
    console.error('Error obteniendo datos financieros:', error);
    throw error;
  }
}

/**
 * Genera los datos para el Balance General (Estado de Situación Financiera)
 */
export async function generateBalanceSheet(periodId: string) {
  try {
    const financialData = await fetchFinancialData(periodId);
    
    return {
      assets: financialData.assets,
      liabilities: financialData.liabilities,
      equity: financialData.equity,
      totalAssets: financialData.totalAssets,
      totalLiabilities: financialData.totalLiabilities,
      totalEquity: financialData.totalEquity,
      netIncome: financialData.netIncome,
      balanceTotal: financialData.totalLiabilities + financialData.totalEquity + financialData.netIncome
    };
  } catch (error) {
    console.error('Error generando balance general:', error);
    throw error;
  }
}

/**
 * Genera los datos para el Estado de Resultados
 */
export async function generateIncomeStatement(periodId: string) {
  try {
    const financialData = await fetchFinancialData(periodId);
    
    return {
      revenue: financialData.revenue,
      expenses: financialData.expenses,
      costs: financialData.costs,
      totalRevenue: financialData.totalRevenue,
      totalExpenses: financialData.totalExpenses,
      totalCosts: financialData.totalCosts,
      netIncome: financialData.netIncome
    };
  } catch (error) {
    console.error('Error generando estado de resultados:', error);
    throw error;
  }
}

/**
 * Formatea un valor de moneda para presentación
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('es-DO', { 
    style: 'currency', 
    currency: 'DOP',
    minimumFractionDigits: 2
  });
}

/**
 * Prepara datos para exportación del Balance General a Excel
 */
export function prepareBalanceSheetExport(
  periodName: string,
  assets: FinancialAccount[],
  liabilities: FinancialAccount[],
  equity: FinancialAccount[],
  totalAssets: number,
  totalLiabilities: number,
  totalEquity: number,
  netIncome: number
) {
  return [
    ['BALANCE GENERAL'],
    [`Periodo: ${periodName}`],
    [`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`],
    [''],
    ['ACTIVOS'],
    ['Código', 'Cuenta', 'Monto'],
    ...assets.map(account => [
      account.code,
      account.name,
      account.balance,
    ]),
    ['', 'Total Activos', totalAssets],
    [''],
    ['PASIVOS'],
    ['Código', 'Cuenta', 'Monto'],
    ...liabilities.map(account => [
      account.code,
      account.name,
      account.balance,
    ]),
    ['', 'Total Pasivos', totalLiabilities],
    [''],
    ['CAPITAL'],
    ['Código', 'Cuenta', 'Monto'],
    ...equity.map(account => [
      account.code,
      account.name,
      account.balance,
    ]),
    ['', 'Utilidad del Periodo', netIncome],
    ['', 'Total Capital', totalEquity + netIncome],
    [''],
    ['', 'Total Pasivo y Capital', totalLiabilities + totalEquity + netIncome],
  ];
}

/**
 * Prepara datos para exportación del Estado de Resultados a Excel
 */
export function prepareIncomeStatementExport(
  periodName: string,
  revenue: FinancialAccount[],
  expenses: FinancialAccount[],
  costs: FinancialAccount[],
  totalRevenue: number,
  totalExpenses: number,
  totalCosts: number,
  netIncome: number
) {
  return [
    ['ESTADO DE RESULTADOS'],
    [`Periodo: ${periodName}`],
    [`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`],
    [''],
    ['INGRESOS'],
    ['Código', 'Cuenta', 'Monto'],
    ...revenue.map(account => [
      account.code,
      account.name,
      account.balance,
    ]),
    ['', 'Total Ingresos', totalRevenue],
    [''],
    ['COSTOS'],
    ['Código', 'Cuenta', 'Monto'],
    ...costs.map(account => [
      account.code,
      account.name,
      account.balance,
    ]),
    ['', 'Total Costos', totalCosts],
    [''],
    ['GASTOS'],
    ['Código', 'Cuenta', 'Monto'],
    ...expenses.map(account => [
      account.code,
      account.name,
      account.balance,
    ]),
    ['', 'Total Gastos', totalExpenses],
    [''],
    ['', 'UTILIDAD NETA', netIncome],
  ];
} 