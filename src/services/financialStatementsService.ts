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
 * Obtiene los datos financieros para un período específico
 */
export async function fetchFinancialData(periodId: string): Promise<FinancialData> {
  try {
    if (!periodId) {
      throw new Error('Es necesario especificar un período contable');
    }

    // Obtener detalles del período seleccionado
    const { data: periodDetails, error: periodError } = await supabase
      .from('accounting_periods')
      .select('start_date, end_date')
      .eq('id', periodId)
      .single();

    if (periodError) throw periodError;
    if (!periodDetails) throw new Error('No se encontró el período contable');

    // Obtener todas las cuentas contables activas
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('code');

    if (accountsError) throw accountsError;
    if (!accounts || accounts.length === 0) {
      throw new Error('No se encontraron cuentas contables activas');
    }

    // Obtener todos los movimientos del período
    const { data: allMovements, error: movementsError } = await supabase
      .from('journal_entry_items')
      .select(`
        id,
        account_id,
        debit,
        credit,
        journal_entries!inner(id, date, is_adjustment, is_approved, status)
      `)
      .gte('journal_entries.date', periodDetails.start_date)
      .lte('journal_entries.date', periodDetails.end_date)
      .eq('journal_entries.is_approved', true)
      .neq('journal_entries.status', 'voided');

    if (movementsError) throw movementsError;

    // Procesar movimientos por cuenta
    // Crear un mapa de id de cuenta -> cuenta
    const accountsMap = new Map<string, Account & { balance: number; hasActivity: boolean }>();
    
    // Inicializar todas las cuentas con saldo cero
    for (const account of accounts) {
      accountsMap.set(account.id, {
        ...account,
        balance: 0,
        hasActivity: false
      });
    }
    
    // Sumar los movimientos por cuenta
    (allMovements || []).forEach(movement => {
      const accountId = movement.account_id;
      const account = accountsMap.get(accountId);
      
      if (account) {
        const debit = new Decimal(movement.debit || 0);
        const credit = new Decimal(movement.credit || 0);
        
        // Calcular balance según el tipo de cuenta
        let delta = 0;
        if (account.type === 'activo' || account.type === 'gasto' || account.type === 'costo') {
          // Cuentas de naturaleza deudora: débitos aumentan, créditos disminuyen
          delta = debit.minus(credit).toNumber();
        } else {
          // Cuentas de naturaleza acreedora: créditos aumentan, débitos disminuyen
          delta = credit.minus(debit).toNumber();
        }
        
        account.balance += delta;
        account.hasActivity = true;
      }
    });

    // Inicializar estructura de datos financieros
    const financialData: FinancialData = {
      assets: [],
      liabilities: [],
      equity: [],
      revenue: [],
      expenses: [],
      costs: [],
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      totalCosts: 0,
      netIncome: 0,
    };

    // Clasificar cuentas y calcular totales
    accountsMap.forEach(account => {
      // Solo incluir cuentas con balance o actividad
      if (Math.abs(account.balance) > 0.001 || account.hasActivity) {
        const financialAccount: FinancialAccount = {
          ...account,
          balance: Math.abs(account.balance) // Siempre positivo para presentación
        };

        // Clasificar por tipo de cuenta
        switch (account.type) {
          case 'activo':
            financialData.assets.push(financialAccount);
            financialData.totalAssets += account.balance;
            break;
          case 'pasivo':
            financialData.liabilities.push(financialAccount);
            financialData.totalLiabilities += account.balance;
            break;
          case 'patrimonio':
            financialData.equity.push(financialAccount);
            financialData.totalEquity += account.balance;
            break;
          case 'ingreso':
            financialData.revenue.push(financialAccount);
            financialData.totalRevenue += account.balance;
            break;
          case 'gasto':
            financialData.expenses.push(financialAccount);
            financialData.totalExpenses += account.balance;
            break;
          case 'costo':
            financialData.costs.push(financialAccount);
            financialData.totalCosts += account.balance;
            break;
        }
      }
    });

    // Calcular utilidad neta (ingresos - gastos - costos)
    financialData.netIncome = financialData.totalRevenue - financialData.totalExpenses - financialData.totalCosts;

    // Ordenar cuentas por código
    financialData.assets.sort((a, b) => a.code.localeCompare(b.code));
    financialData.liabilities.sort((a, b) => a.code.localeCompare(b.code));
    financialData.equity.sort((a, b) => a.code.localeCompare(b.code));
    financialData.revenue.sort((a, b) => a.code.localeCompare(b.code));
    financialData.expenses.sort((a, b) => a.code.localeCompare(b.code));
    financialData.costs.sort((a, b) => a.code.localeCompare(b.code));

    return financialData;
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