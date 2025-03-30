import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';
import { format } from 'date-fns';

// Interfaces para los datos financieros
export interface AccountData {
  id: string;
  code: string;
  name: string;
  balance: number;
  parent_id: string | null;
  is_parent: boolean;
  level: number;
  type: string;
  nature?: string;
  hasActivity?: boolean;
}

export interface FinancialStatementData {
  id?: string;
  period_id: string;
  type: 'balance_sheet' | 'income_statement';
  data: BalanceSheetData | IncomeStatementData;
  generated_at: string;
  generated_by: string;
  created_at?: string;
}

export interface BalanceSheetData {
  periodName: string;
  date: string;
  assets: AccountData[];
  liabilities: AccountData[];
  equity: AccountData[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number;
}

export interface IncomeStatementData {
  periodName: string;
  date: string;
  revenue: AccountData[];
  costs: AccountData[];
  expenses: AccountData[];
  totalRevenue: number;
  totalCosts: number;
  totalExpenses: number;
  netIncome: number;
}

/**
 * Genera un balance general para un período contable específico
 */
export async function generateBalanceSheet(accountingPeriodId: string, userId: string): Promise<BalanceSheetData> {
  try {
    // Obtener información del período contable
    const { data: periodData, error: periodError } = await supabase
      .from('accounting_periods')
      .select('id, name, end_date')
      .eq('id', accountingPeriodId)
      .single();

    if (periodError) throw new Error(`Error al obtener el período contable: ${periodError.message}`);
    if (!periodData) throw new Error('No se encontró el período contable');

    // Obtener todas las cuentas activas
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, code, name, type, nature, parent_id, is_parent, is_active')
      .eq('is_active', true);

    if (accountsError) throw new Error(`Error al obtener las cuentas: ${accountsError.message}`);
    if (!accounts || accounts.length === 0) throw new Error('No se encontraron cuentas activas');

    // Obtener todos los asientos aprobados para el período
    const { data: journalEntries, error: journalError } = await supabase
      .from('journal_entries')
      .select(`
        id, 
        date, 
        description,
        journal_entry_items (
          id,
          account_id,
          debit,
          credit
        )
      `)
      .eq('accounting_period_id', accountingPeriodId)
      .eq('is_approved', true);

    if (journalError) throw new Error(`Error al obtener los asientos: ${journalError.message}`);

    // Calcular saldos para cada cuenta
    const accountBalances = new Map<string, Decimal>();

    // Inicializar saldos en cero
    accounts.forEach(account => {
      accountBalances.set(account.id, new Decimal(0));
    });

    // Sumar débitos y créditos
    journalEntries?.forEach(entry => {
      entry.journal_entry_items?.forEach(item => {
        const currentBalance = accountBalances.get(item.account_id) || new Decimal(0);
        const debit = new Decimal(item.debit || 0);
        const credit = new Decimal(item.credit || 0);
        
        // Actualizar saldo según naturaleza de la cuenta
        const account = accounts.find(a => a.id === item.account_id);
        if (account) {
          if (account.nature === 'debit') {
            accountBalances.set(item.account_id, currentBalance.plus(debit).minus(credit));
          } else {
            accountBalances.set(item.account_id, currentBalance.plus(credit).minus(debit));
          }
        }
      });
    });

    // Preparar la estructura jerárquica de cuentas
    const accountsMap = new Map<string, any>();
    accounts.forEach(account => {
      accountsMap.set(account.id, {
        ...account,
        balance: accountBalances.get(account.id)?.toNumber() || 0,
        children: []
      });
    });

    // Construir la jerarquía
    accounts.forEach(account => {
      if (account.parent_id && accountsMap.has(account.parent_id)) {
        const parent = accountsMap.get(account.parent_id);
        const child = accountsMap.get(account.id);
        if (parent && child) {
          parent.children.push(child);
        }
      }
    });

    // Propagar saldos de hijos a padres
    function propagateBalances(accountId: string): Decimal {
      const account = accountsMap.get(accountId);
      if (!account) return new Decimal(0);

      let totalBalance = new Decimal(account.balance || 0);

      account.children.forEach((child: any) => {
        const childBalance = propagateBalances(child.id);
        totalBalance = totalBalance.plus(childBalance);
      });

      account.balance = totalBalance.toNumber();
      return totalBalance;
    }

    // Encontrar cuentas raíz y propagar saldos
    accounts
      .filter(account => !account.parent_id)
      .forEach(account => propagateBalances(account.id));

    // Calcular niveles de jerarquía
    function calculateLevels(accountId: string, level: number) {
      const account = accountsMap.get(accountId);
      if (!account) return;

      account.level = level;
      account.children.forEach((child: any) => calculateLevels(child.id, level + 1));
    }

    // Establecer niveles para cuentas raíz
    accounts
      .filter(account => !account.parent_id)
      .forEach(account => calculateLevels(account.id, 1));

    // Función para aplanar la jerarquía y mantener el orden
    function flattenHierarchy(accountId: string, result: AccountData[] = []): AccountData[] {
      const account = accountsMap.get(accountId);
      if (!account) return result;

      result.push({
        id: account.id,
        code: account.code,
        name: account.name,
        balance: account.balance,
        parent_id: account.parent_id,
        is_parent: account.is_parent,
        level: account.level,
        type: account.type
      });

      account.children
        .sort((a: any, b: any) => a.code.localeCompare(b.code))
        .forEach((child: any) => flattenHierarchy(child.id, result));

      return result;
    }

    // Obtener cuentas planas ordenadas por tipo
    const assets = accounts
      .filter(account => !account.parent_id && account.type === 'asset')
      .sort((a, b) => a.code.localeCompare(b.code))
      .flatMap(account => flattenHierarchy(account.id, []));

    const liabilities = accounts
      .filter(account => !account.parent_id && account.type === 'liability')
      .sort((a, b) => a.code.localeCompare(b.code))
      .flatMap(account => flattenHierarchy(account.id, []));

    const equity = accounts
      .filter(account => !account.parent_id && account.type === 'equity')
      .sort((a, b) => a.code.localeCompare(b.code))
      .flatMap(account => flattenHierarchy(account.id, []));

    // Calcular totales
    const totalAssets = assets.reduce((sum, account) => 
      !account.parent_id ? sum + account.balance : sum, 0);
    
    const totalLiabilities = liabilities.reduce((sum, account) => 
      !account.parent_id ? sum + account.balance : sum, 0);
    
    const totalEquity = equity.reduce((sum, account) => 
      !account.parent_id ? sum + account.balance : sum, 0);

    // Obtener la utilidad del período del estado de resultados
    let netIncome = 0;
    try {
      const incomeStatement = await generateIncomeStatement(accountingPeriodId, userId);
      netIncome = incomeStatement.netIncome;
    } catch (error) {
      console.error('Error al obtener la utilidad del período:', error);
      // Continuar sin la utilidad del período si hay un error
    }

    // Preparar datos del balance general
    const balanceSheet: BalanceSheetData = {
      periodName: periodData.name,
      date: periodData.end_date,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      netIncome
    };

    // Guardar el balance general en la base de datos
    await saveFinancialStatement({
      period_id: accountingPeriodId,
      type: 'balance_sheet',
      generated_at: new Date().toISOString(),
      generated_by: userId,
      data: balanceSheet
    });

    return balanceSheet;
  } catch (error) {
    console.error('Error generando balance general:', error);
    throw error;
  }
}

/**
 * Genera un estado de resultados para un período contable específico
 */
export async function generateIncomeStatement(accountingPeriodId: string, userId: string): Promise<IncomeStatementData> {
  try {
    // Obtener información del período contable
    const { data: periodData, error: periodError } = await supabase
      .from('accounting_periods')
      .select('id, name, start_date, end_date')
      .eq('id', accountingPeriodId)
      .single();

    if (periodError) throw new Error(`Error al obtener el período contable: ${periodError.message}`);
    if (!periodData) throw new Error('No se encontró el período contable');

    // Obtener todas las cuentas activas
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, code, name, type, nature, parent_id, is_parent, is_active')
      .eq('is_active', true);

    if (accountsError) throw new Error(`Error al obtener las cuentas: ${accountsError.message}`);
    if (!accounts || accounts.length === 0) throw new Error('No se encontraron cuentas activas');

    // Obtener todos los asientos aprobados para el período
    const { data: journalEntries, error: journalError } = await supabase
      .from('journal_entries')
      .select(`
        id, 
        date, 
        description,
        journal_entry_items (
          id,
          account_id,
          debit,
          credit
        )
      `)
      .eq('accounting_period_id', accountingPeriodId)
      .eq('is_approved', true);

    if (journalError) throw new Error(`Error al obtener los asientos: ${journalError.message}`);

    // Calcular saldos para cada cuenta
    const accountBalances = new Map<string, Decimal>();

    // Inicializar saldos en cero
    accounts.forEach(account => {
      accountBalances.set(account.id, new Decimal(0));
    });

    // Sumar débitos y créditos
    journalEntries?.forEach(entry => {
      entry.journal_entry_items?.forEach(item => {
        const currentBalance = accountBalances.get(item.account_id) || new Decimal(0);
        const debit = new Decimal(item.debit || 0);
        const credit = new Decimal(item.credit || 0);
        
        // Actualizar saldo según naturaleza de la cuenta
        const account = accounts.find(a => a.id === item.account_id);
        if (account) {
          if (account.nature === 'debit') {
            accountBalances.set(item.account_id, currentBalance.plus(debit).minus(credit));
          } else {
            accountBalances.set(item.account_id, currentBalance.plus(credit).minus(debit));
          }
        }
      });
    });

    // Preparar la estructura jerárquica de cuentas
    const accountsMap = new Map<string, any>();
    accounts.forEach(account => {
      accountsMap.set(account.id, {
        ...account,
        balance: accountBalances.get(account.id)?.toNumber() || 0,
        children: []
      });
    });

    // Construir la jerarquía
    accounts.forEach(account => {
      if (account.parent_id && accountsMap.has(account.parent_id)) {
        const parent = accountsMap.get(account.parent_id);
        const child = accountsMap.get(account.id);
        if (parent && child) {
          parent.children.push(child);
        }
      }
    });

    // Propagar saldos de hijos a padres
    function propagateBalances(accountId: string): Decimal {
      const account = accountsMap.get(accountId);
      if (!account) return new Decimal(0);

      let totalBalance = new Decimal(account.balance || 0);

      account.children.forEach((child: any) => {
        const childBalance = propagateBalances(child.id);
        totalBalance = totalBalance.plus(childBalance);
      });

      account.balance = totalBalance.toNumber();
      return totalBalance;
    }

    // Encontrar cuentas raíz y propagar saldos
    accounts
      .filter(account => !account.parent_id)
      .forEach(account => propagateBalances(account.id));

    // Calcular niveles de jerarquía
    function calculateLevels(accountId: string, level: number) {
      const account = accountsMap.get(accountId);
      if (!account) return;

      account.level = level;
      account.children.forEach((child: any) => calculateLevels(child.id, level + 1));
    }

    // Establecer niveles para cuentas raíz
    accounts
      .filter(account => !account.parent_id)
      .forEach(account => calculateLevels(account.id, 1));

    // Función para aplanar la jerarquía y mantener el orden
    function flattenHierarchy(accountId: string, result: AccountData[] = []): AccountData[] {
      const account = accountsMap.get(accountId);
      if (!account) return result;

      result.push({
        id: account.id,
        code: account.code,
        name: account.name,
        balance: account.balance,
        parent_id: account.parent_id,
        is_parent: account.is_parent,
        level: account.level,
        type: account.type
      });

      account.children
        .sort((a: any, b: any) => a.code.localeCompare(b.code))
        .forEach((child: any) => flattenHierarchy(child.id, result));

      return result;
    }

    // Obtener cuentas planas ordenadas por tipo
    const revenue = accounts
      .filter(account => !account.parent_id && account.type === 'revenue')
      .sort((a, b) => a.code.localeCompare(b.code))
      .flatMap(account => flattenHierarchy(account.id, []));

    const costs = accounts
      .filter(account => !account.parent_id && account.type === 'cost')
      .sort((a, b) => a.code.localeCompare(b.code))
      .flatMap(account => flattenHierarchy(account.id, []));

    const expenses = accounts
      .filter(account => !account.parent_id && account.type === 'expense')
      .sort((a, b) => a.code.localeCompare(b.code))
      .flatMap(account => flattenHierarchy(account.id, []));

    // Calcular totales
    const totalRevenue = revenue.reduce((sum, account) => 
      !account.parent_id ? sum + account.balance : sum, 0);
    
    const totalCosts = costs.reduce((sum, account) => 
      !account.parent_id ? sum + account.balance : sum, 0);
    
    const totalExpenses = expenses.reduce((sum, account) => 
      !account.parent_id ? sum + account.balance : sum, 0);

    // Calcular utilidad neta
    const netIncome = totalRevenue - totalCosts - totalExpenses;

    // Preparar datos del estado de resultados
    const incomeStatement: IncomeStatementData = {
      periodName: periodData.name,
      date: periodData.end_date,
      revenue,
      costs,
      expenses,
      totalRevenue,
      totalCosts,
      totalExpenses,
      netIncome
    };

    // Guardar el estado de resultados en la base de datos
    await saveFinancialStatement({
      period_id: accountingPeriodId,
      type: 'income_statement',
      generated_at: new Date().toISOString(),
      generated_by: userId,
      data: incomeStatement
    });

    return incomeStatement;
  } catch (error) {
    console.error('Error generando estado de resultados:', error);
    throw error;
  }
}

/**
 * Guarda un estado financiero en la base de datos
 */
async function saveFinancialStatement(statement: FinancialStatementData): Promise<void> {
  try {
    // Verificar si ya existe un estado financiero para este período y tipo
    const { data: existingStatement, error: fetchError } = await supabase
      .from('financial_statements')
      .select('id')
      .eq('period_id', statement.period_id)
      .eq('type', statement.type)
      .maybeSingle();

    if (fetchError) throw new Error(`Error al verificar estados financieros existentes: ${fetchError.message}`);

    if (existingStatement) {
      // Actualizar el estado financiero existente
      const { error: updateError } = await supabase
        .from('financial_statements')
        .update({
          data: statement.data,
          generated_at: statement.generated_at,
          generated_by: statement.generated_by
        })
        .eq('id', existingStatement.id);

      if (updateError) throw new Error(`Error al actualizar el estado financiero: ${updateError.message}`);
    } else {
      // Crear un nuevo estado financiero
      const { error: insertError } = await supabase
        .from('financial_statements')
        .insert(statement);

      if (insertError) throw new Error(`Error al insertar el estado financiero: ${insertError.message}`);
    }
  } catch (error) {
    console.error('Error guardando estado financiero:', error);
    throw error;
  }
}

/**
 * Obtiene un estado financiero de la base de datos
 */
export async function getFinancialStatement(
  accountingPeriodId: string, 
  type: 'balance_sheet' | 'income_statement'
): Promise<FinancialStatementData | null> {
  try {
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('period_id', accountingPeriodId)
      .eq('type', type)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Error al obtener el estado financiero: ${error.message}`);
    
    return data;
  } catch (error) {
    console.error('Error obteniendo estado financiero:', error);
    return null;
  }
}

/**
 * Formatea un valor monetario a una cadena con formato de moneda
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(value);
} 