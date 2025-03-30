import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';
import { Account } from './accountService';
import { getAccountNature, calculateBalanceEffect } from './ledgerService';

// Tipos
export interface TrialBalanceAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  has_children: boolean;
  opening_balance: number;
  period_debits: number;
  period_credits: number;
  closing_balance: number;
  level?: number;
}

export interface TrialBalanceTotals {
  totalDebits: number;
  totalCredits: number;
  difference: number;
}

/**
 * Calcula el nivel jerárquico de una cuenta basado en su código
 */
function calculateAccountLevel(code: string): number {
  const segments = code.split('.');
  return segments.length;
}

/**
 * Redondea un valor a 2 decimales para evitar imprecisiones
 */
function roundAmount(amount: number | string | null | undefined | Decimal): number {
  if (amount === null || amount === undefined) return 0;
  return new Decimal(amount.toString()).toDecimalPlaces(2).toNumber();
}

/**
 * Obtiene los datos para la balanza de comprobación
 */
export async function fetchTrialBalanceData(
  startDate: string,
  endDate: string,
  accountTypes: string[] = ['activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'costo']
): Promise<{
  accounts: TrialBalanceAccount[];
  totals: TrialBalanceTotals;
  isBalanced: boolean;
}> {
  try {
    // 1. Obtener todas las cuentas de los tipos especificados
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .in('type', accountTypes)
      .order('code');

    if (accountsError) throw accountsError;

    if (!accounts || accounts.length === 0) {
      return {
        accounts: [],
        totals: { totalDebits: 0, totalCredits: 0, difference: 0 },
        isBalanced: true
      };
    }
    
    // 1.1. Crear un mapa de cuentas para facilitar el acceso
    const accountsMap = new Map<string, any>();
    accounts.forEach(account => {
      accountsMap.set(account.id, account);
    });
    
    // 1.2. Construir la jerarquía de cuentas (padre-hijo)
    const parentToChildrenMap = new Map<string, string[]>();
    const rootAccounts: string[] = [];
    
    // Identificar cuentas raíz y construir relaciones padre-hijo
    accounts.forEach(account => {
      if (!account.parent_id) {
        rootAccounts.push(account.id);
      } else {
        if (!parentToChildrenMap.has(account.parent_id)) {
          parentToChildrenMap.set(account.parent_id, []);
        }
        parentToChildrenMap.get(account.parent_id)?.push(account.id);
      }
    });
    
    // 1.3. Crear un mapa de profundidad para cada cuenta
    const depthMap = new Map<string, number>();
    
    const calculateDepth = (accountId: string, depth: number = 1) => {
      depthMap.set(accountId, depth);
      const children = parentToChildrenMap.get(accountId) || [];
      children.forEach(childId => {
        calculateDepth(childId, depth + 1);
      });
    };
    
    // Calcular profundidad para cuentas raíz
    rootAccounts.forEach(rootId => {
      calculateDepth(rootId, 1);
    });
    
    // 1.4. Organizar cuentas en orden jerárquico para presentación
    const hierarchicalAccounts: any[] = [];
    
    const addAccountsRecursively = (parentId: string | null = null, level: number = 1) => {
      const accountsAtLevel = parentId 
        ? (parentToChildrenMap.get(parentId) || []).map(id => accountsMap.get(id)).filter(Boolean)
        : rootAccounts.map(id => accountsMap.get(id)).filter(Boolean);
      
      // Ordenar por código para presentación coherente
      accountsAtLevel.sort((a, b) => a.code.localeCompare(b.code));
      
      for (const account of accountsAtLevel) {
        hierarchicalAccounts.push(account);
        if (parentToChildrenMap.has(account.id)) {
          addAccountsRecursively(account.id, level + 1);
        }
      }
    };
    
    // Comenzar con cuentas raíz
    addAccountsRecursively();

    // 2. Obtener todos los movimientos hasta la fecha de inicio (para saldos iniciales)
    const { data: initialMovements, error: initialError } = await supabase
      .from('journal_entry_items')
      .select(`
        id,
        account_id,
        debit,
        credit,
        journal_entries(
          id,
          date,
          is_approved,
          status
        )
      `)
      .lt('journal_entries.date', startDate)
      .eq('journal_entries.is_approved', true)
      .eq('journal_entries.status', 'aprobado')
      .order('id');

    if (initialError) throw initialError;

    // 3. Obtener los movimientos del período (para débitos y créditos del período)
    const { data: periodMovements, error: periodError } = await supabase
      .from('journal_entry_items')
      .select(`
        id,
        account_id,
        debit,
        credit,
        journal_entries(
          id,
          date,
          is_approved,
          status
        )
      `)
      .gte('journal_entries.date', startDate)
      .lte('journal_entries.date', endDate)
      .eq('journal_entries.is_approved', true)
      .eq('journal_entries.status', 'aprobado')
      .order('id');

    if (periodError) throw periodError;

    // 4. Calcular saldos iniciales, movimientos y saldos finales para cada cuenta
    const accountsWithBalances: TrialBalanceAccount[] = hierarchicalAccounts.map(account => {
      // Calcular saldo inicial
      let openingBalance = 0;

      if (initialMovements && initialMovements.length > 0) {
        initialMovements.forEach(movement => {
          // Solo considerar asientos aprobados
          if (movement.journal_entries) {
            let isApproved = false;
            let hasCorrectStatus = false;
            
            if (Array.isArray(movement.journal_entries)) {
              isApproved = movement.journal_entries[0] && 
                           typeof movement.journal_entries[0] === 'object' && 
                           'is_approved' in movement.journal_entries[0] && 
                           !!movement.journal_entries[0].is_approved;
              hasCorrectStatus = movement.journal_entries[0] && 
                                typeof movement.journal_entries[0] === 'object' &&
                                'status' in movement.journal_entries[0] &&
                                movement.journal_entries[0].status === 'aprobado';
            } else if (typeof movement.journal_entries === 'object' && movement.journal_entries !== null) {
              isApproved = 'is_approved' in movement.journal_entries && 
                           !!(movement.journal_entries as {is_approved?: boolean}).is_approved;
              hasCorrectStatus = 'status' in movement.journal_entries &&
                                (movement.journal_entries as {status?: string}).status === 'aprobado';
            }
            
            if (isApproved && hasCorrectStatus && movement.account_id === account.id) {
              const debit = parseFloat(movement.debit || 0);
              const credit = parseFloat(movement.credit || 0);

              // Aplicar regla según el tipo de cuenta
              if (['activo', 'gasto', 'costo'].includes(account.type)) {
                // Activos y Gastos: aumentan con débito, disminuyen con crédito
                openingBalance += debit - credit;
              } else {
                // Pasivos, Patrimonio, Ingresos: aumentan con crédito, disminuyen con débito
                openingBalance += credit - debit;
              }
            }
          }
        });
      }

      // Calcular movimientos del período
      let periodDebits = 0;
      let periodCredits = 0;

      if (periodMovements && periodMovements.length > 0) {
        periodMovements.forEach(movement => {
          // Solo considerar asientos aprobados
          if (movement.journal_entries) {
            let isApproved = false;
            let hasCorrectStatus = false;
            
            if (Array.isArray(movement.journal_entries)) {
              isApproved = movement.journal_entries[0] && 
                           typeof movement.journal_entries[0] === 'object' && 
                           'is_approved' in movement.journal_entries[0] && 
                           !!movement.journal_entries[0].is_approved;
              hasCorrectStatus = movement.journal_entries[0] && 
                                typeof movement.journal_entries[0] === 'object' &&
                                'status' in movement.journal_entries[0] &&
                                movement.journal_entries[0].status === 'aprobado';
            } else if (typeof movement.journal_entries === 'object' && movement.journal_entries !== null) {
              isApproved = 'is_approved' in movement.journal_entries && 
                           !!(movement.journal_entries as {is_approved?: boolean}).is_approved;
              hasCorrectStatus = 'status' in movement.journal_entries &&
                                (movement.journal_entries as {status?: string}).status === 'aprobado';
            }
            
            if (isApproved && hasCorrectStatus && movement.account_id === account.id) {
              periodDebits += parseFloat(movement.debit || 0);
              periodCredits += parseFloat(movement.credit || 0);
            }
          }
        });
      }

      // Calcular nivel de la cuenta
      const level = depthMap.get(account.id) || calculateAccountLevel(account.code);

      // Calcular saldo final
      let closingBalance = openingBalance;
      
      if (['activo', 'gasto', 'costo'].includes(account.type)) {
        closingBalance += periodDebits - periodCredits;
      } else {
        closingBalance += periodCredits - periodDebits;
      }

      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        parent_id: account.parent_id,
        has_children: account.has_children || false,
        opening_balance: openingBalance,
        period_debits: periodDebits,
        period_credits: periodCredits,
        closing_balance: closingBalance,
        level
      };
    });

    // 5. Calcular totales
    let totalDebits = 0;
    let totalCredits = 0;

    accountsWithBalances.forEach(account => {
      totalDebits += account.period_debits;
      totalCredits += account.period_credits;
    });

    const difference = totalDebits - totalCredits;
    const isBalanced = Math.abs(difference) < 0.01; // Permitir pequeñas diferencias por redondeo

    return {
      accounts: accountsWithBalances,
      totals: {
        totalDebits,
        totalCredits,
        difference
      },
      isBalanced
    };
  } catch (error) {
    console.error('Error fetching trial balance data:', error);
    toast.error('Error al cargar los datos de la balanza de comprobación');
    return {
      accounts: [],
      totals: { totalDebits: 0, totalCredits: 0, difference: 0 },
      isBalanced: true
    };
  }
}

/**
 * Devuelve un objeto de totales vacío (todos en cero)
 */
function getEmptyTotals(): TrialBalanceTotals {
  return {
    totalDebits: 0,
    totalCredits: 0,
    difference: 0
  };
}

/**
 * Exporta los datos de la balanza a formato Excel
 */
export function prepareTrialBalanceExport(
  accounts: TrialBalanceAccount[],
  totals: TrialBalanceTotals,
  startDate: string,
  endDate: string
): { headers: string[][], data: any[][] } {
  const formattedStartDate = new Date(startDate).toLocaleDateString('es-DO');
  const formattedEndDate = new Date(endDate).toLocaleDateString('es-DO');
  
  // Encabezado
  const headers = [
    ['BALANZA DE COMPROBACIÓN'],
    [`Período: ${formattedStartDate} al ${formattedEndDate}`],
    [],
    ['Código', 'Cuenta', 'Saldo Inicial Débito', 'Saldo Inicial Crédito', 'Movimientos Débito', 'Movimientos Crédito', 'Saldo Final Débito', 'Saldo Final Crédito']
  ];
  
  // Datos de cuentas
  const data: any[][] = [];
  
  accounts.forEach(account => {
    // Usar espacios en blanco para la indentación según el nivel de la cuenta
    const indentation = account.level && account.level > 1 ? '  '.repeat(account.level - 1) : '';
    
    // Calcular los saldos iniciales y finales según naturaleza de la cuenta
    let initialDebit = 0;
    let initialCredit = 0;
    let finalDebit = 0;
    let finalCredit = 0;
    
    // Separar el saldo inicial en débito o crédito según el tipo de cuenta
    if (['activo', 'gasto', 'costo'].includes(account.type)) {
      // Para activos y gastos, saldo positivo va en débito
      initialDebit = account.opening_balance > 0 ? roundAmount(account.opening_balance) : 0;
      initialCredit = account.opening_balance < 0 ? roundAmount(Math.abs(account.opening_balance)) : 0;
      
      // Saldo final
      finalDebit = account.closing_balance > 0 ? roundAmount(account.closing_balance) : 0;
      finalCredit = account.closing_balance < 0 ? roundAmount(Math.abs(account.closing_balance)) : 0;
    } else {
      // Para pasivos, patrimonio e ingresos, saldo positivo va en crédito
      initialCredit = account.opening_balance > 0 ? roundAmount(account.opening_balance) : 0;
      initialDebit = account.opening_balance < 0 ? roundAmount(Math.abs(account.opening_balance)) : 0;
      
      // Saldo final
      finalCredit = account.closing_balance > 0 ? roundAmount(account.closing_balance) : 0;
      finalDebit = account.closing_balance < 0 ? roundAmount(Math.abs(account.closing_balance)) : 0;
    }
    
    data.push([
      account.code,
      `${indentation}${account.name}`,
      initialDebit,
      initialCredit,
      roundAmount(account.period_debits),
      roundAmount(account.period_credits),
      finalDebit,
      finalCredit
    ]);
  });
  
  // Agregar fila de totales
  // Calcular totales de saldos iniciales y finales
  let totalInitialDebit = 0;
  let totalInitialCredit = 0;
  let totalFinalDebit = 0;
  let totalFinalCredit = 0;
  
  accounts.forEach(account => {
    if (['activo', 'gasto', 'costo'].includes(account.type)) {
      if (account.opening_balance > 0) totalInitialDebit += account.opening_balance;
      if (account.opening_balance < 0) totalInitialCredit += Math.abs(account.opening_balance);
      
      if (account.closing_balance > 0) totalFinalDebit += account.closing_balance;
      if (account.closing_balance < 0) totalFinalCredit += Math.abs(account.closing_balance);
    } else {
      if (account.opening_balance > 0) totalInitialCredit += account.opening_balance;
      if (account.opening_balance < 0) totalInitialDebit += Math.abs(account.opening_balance);
      
      if (account.closing_balance > 0) totalFinalCredit += account.closing_balance;
      if (account.closing_balance < 0) totalFinalDebit += Math.abs(account.closing_balance);
    }
  });
  
  data.push([
    '', 'TOTALES',
    roundAmount(totalInitialDebit),
    roundAmount(totalInitialCredit),
    roundAmount(totals.totalDebits),
    roundAmount(totals.totalCredits),
    roundAmount(totalFinalDebit),
    roundAmount(totalFinalCredit)
  ]);
  
  return { headers, data };
} 