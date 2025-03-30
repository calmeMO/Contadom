import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';
import { Account } from './accountService';

// Definición de tipos
export interface Movement {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number | null;
  credit: number | null;
  journal_entry?: JournalEntryRef;
  description?: string;
}

export interface JournalEntryRef {
  id: string;
  date: string;
  entry_number: string;
  description: string;
}

export interface LedgerAccount {
  accountId: string;
  account: any;
  level: number; // Nivel de jerarquía para mejor visualización
  parentName?: string; // Nombre de la cuenta padre para referencia
  initialBalance: number; // Saldo inicial del período
  movements: FormattedMovement[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  expanded: boolean;
  hasChildren: boolean; // Indica si la cuenta tiene hijos
  children?: string[]; // IDs de las cuentas hijas
  isParent: boolean; // Indicador explícito de si es cuenta padre
  isRootAccount: boolean; // Indicador de si es una cuenta raíz (nivel superior)
  childrenCount: number; // Número de hijos directos
}

export interface FormattedMovement {
  id: string;
  date: string;
  entry_number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * Determina la naturaleza contable de una cuenta basada en su tipo
 * @returns 'deudora' o 'acreedora'
 */
export function getAccountNature(account: Account): 'deudora' | 'acreedora' {
  if (account.nature && (account.nature === 'deudora' || account.nature === 'acreedora')) {
    // Si tiene naturaleza definida específicamente, usar esa
    return account.nature;
  }
  
  // Determinar por tipo de cuenta
  switch (account.type) {
    case 'activo':
    case 'gasto':
    case 'costo':
      return 'deudora';
    case 'pasivo':
    case 'patrimonio':
    case 'ingreso':
      return 'acreedora';
    default:
      // En caso de duda, usar 'deudora' como fallback
      return 'deudora';
  }
}

/**
 * Determina si una cuenta puede cambiar de naturaleza según su tipo
 */
export function canChangeNature(account: Account): boolean {
  // Algunas cuentas nunca cambian su naturaleza
  const fixedNatureTypes = ['activo', 'pasivo', 'patrimonio'];
  return !fixedNatureTypes.includes(account.type);
}

/**
 * Redondea un valor a 2 decimales para evitar imprecisiones
 */
function roundAmount(amount: number | string | null | undefined | Decimal): number {
  if (amount === null || amount === undefined) return 0;
  return new Decimal(amount.toString()).toDecimalPlaces(2).toNumber();
}

/**
 * Calcula el efecto de un movimiento en el saldo según la naturaleza de la cuenta
 */
export function calculateBalanceEffect(
  debit: number,
  credit: number,
  nature: 'deudora' | 'acreedora'
): number {
  const debitDecimal = new Decimal(debit || 0);
  const creditDecimal = new Decimal(credit || 0);
  
  if (nature === 'deudora') {
    // En cuentas de naturaleza deudora, débitos aumentan, créditos disminuyen
    return debitDecimal.minus(creditDecimal).toNumber();
  } else {
    // En cuentas de naturaleza acreedora, créditos aumentan, débitos disminuyen
    return creditDecimal.minus(debitDecimal).toNumber();
  }
}

/**
 * Obtiene los movimientos de una cuenta en un período específico
 * Sólo incluye asientos aprobados
 */
export async function fetchAccountMovements(
  accountId: string,
  filters: {
    startDate?: string;
    endDate?: string;
    periodId?: string;
  }
): Promise<Movement[]> {
  try {
    let query = supabase
      .from('journal_entry_items')
      .select(`
        id,
        journal_entry_id,
        account_id,
        debit,
        credit,
        description,
        journal_entry:journal_entries!journal_entry_id(
          id,
          date,
          entry_number,
          description,
          status,
          is_approved
        )
      `)
      .eq('account_id', accountId)
      .eq('journal_entries.is_approved', true) // Solo asientos aprobados
      .eq('journal_entries.status', 'aprobado'); // Solo asientos con estado 'aprobado'
    
    // Si hay un período específico, filtramos por él
    if (filters.periodId) {
      query = query.eq('journal_entries.accounting_period_id', filters.periodId);
    }
    
    // Si hay rango de fechas, lo aplicamos
    if (filters.startDate && filters.endDate) {
      query = query
        .gte('journal_entries.date', filters.startDate)
        .lte('journal_entries.date', filters.endDate);
    }
    
    // Ordenar por fecha y número de asiento
    query = query
      .order('journal_entry(date)', { ascending: true })
      .order('journal_entry(entry_number)', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Garantizar que los resultados sean compatibles con el tipo Movement[]
    const formattedMovements: Movement[] = (data || []).map(item => {
      // Asegurarse de que journal_entry sea un objeto del tipo correcto
      let journalEntry: JournalEntryRef | undefined;
      
      if (item.journal_entry) {
        // Si es un array, tomar el primer elemento
        if (Array.isArray(item.journal_entry) && item.journal_entry.length > 0) {
          const entry = item.journal_entry[0];
          journalEntry = {
            id: entry.id,
            date: entry.date,
            entry_number: entry.entry_number,
            description: entry.description
          };
        }
        // Si ya es un objeto, asegurar que tenga la estructura correcta
        else if (typeof item.journal_entry === 'object') {
          const entry = item.journal_entry as any;
          journalEntry = {
            id: entry.id,
            date: entry.date,
            entry_number: entry.entry_number,
            description: entry.description
          };
        }
      }
      
      return {
        id: item.id,
        journal_entry_id: item.journal_entry_id,
        account_id: item.account_id,
        debit: item.debit,
        credit: item.credit,
        description: item.description,
        journal_entry: journalEntry
      };
    });
    
    return formattedMovements;
  } catch (error) {
    console.error('Error al obtener movimientos de cuenta:', error);
    toast.error('Error al cargar los movimientos de la cuenta');
    return [];
  }
}

/**
 * Obtiene el saldo anterior de una cuenta (antes del período seleccionado)
 * Solo considera asientos aprobados
 */
export async function fetchPreviousBalance(
  accountId: string,
  startDate: string,
  periodId?: string
) {
  try {
    // 1. Obtener la cuenta para determinar su naturaleza
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single();
      
    if (accountError) throw accountError;
    
    if (!account) {
      throw new Error('Cuenta no encontrada');
    }
    
    // 2. Construir consulta para movimientos anteriores a la fecha de inicio
    let query = supabase
      .from('journal_entry_items')
      .select(`
        debit,
        credit,
        journal_entry:journal_entries!journal_entry_id(
          accounting_period_id,
          date,
          status,
          is_approved
        )
      `)
      .eq('account_id', accountId)
      .lt('journal_entries.date', startDate)
      .eq('journal_entries.is_approved', true) // Solo asientos aprobados
      .eq('journal_entries.status', 'aprobado'); // Solo asientos con estado 'aprobado'
    
    // Si se especifica un período, excluimos los movimientos de ese período
    if (periodId) {
      query = query.neq('journal_entries.accounting_period_id', periodId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // 3. Calcular el saldo anterior agregando todos los movimientos
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    
    (data || []).forEach(item => {
      if (item.debit) totalDebit = totalDebit.plus(new Decimal(item.debit));
      if (item.credit) totalCredit = totalCredit.plus(new Decimal(item.credit));
    });
    
    // 4. Determinar la naturaleza de la cuenta
    const nature = getAccountNature(account as Account);
    
    // 5. Calcular el saldo según la naturaleza
    let balance = 0;
    if (nature === 'deudora') {
      balance = totalDebit.minus(totalCredit).toNumber();
    } else {
      balance = totalCredit.minus(totalDebit).toNumber();
    }
    
    return roundAmount(balance);
  } catch (error) {
    console.error('Error al obtener saldo anterior:', error);
    return 0; // En caso de error, asumir saldo cero
  }
}

/**
 * Determina la naturaleza actual de la cuenta considerando su saldo
 */
export function determineActualNature(
  account: Account, 
  currentBalance: number = 0
): 'deudora' | 'acreedora' {
  // Obtener la naturaleza base de la cuenta
  const baseNature = getAccountNature(account);
  
  // Si la cuenta no puede cambiar de naturaleza, devolver la naturaleza base
  if (!canChangeNature(account)) {
    return baseNature;
  }
  
  // Si el saldo es cero, mantener la naturaleza base
  if (currentBalance === 0) {
    return baseNature;
  }
  
  // Si el saldo es negativo, la naturaleza actual es contraria a la base
  return currentBalance < 0 
    ? (baseNature === 'deudora' ? 'acreedora' : 'deudora') 
    : baseNature;
}

/**
 * Procesa los movimientos de una cuenta y calcula saldos progresivos
 */
export function processMovements(
  movements: Movement[],
  account: Account,
  initialBalance: number = 0
): {
  formattedMovements: FormattedMovement[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
} {
  let balance = new Decimal(initialBalance);
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);
  
  // Determinar naturaleza base de la cuenta
  const nature = getAccountNature(account);
  
  const formattedMovements: FormattedMovement[] = movements.map(movement => {
    // Convertir valores a decimal para precisión
    const debit = new Decimal(movement.debit || 0);
    const credit = new Decimal(movement.credit || 0);
    
    // Actualizar totales
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
    
    // Calcular efecto en el saldo según naturaleza
    const effect = nature === 'deudora'
      ? debit.minus(credit)
      : credit.minus(debit);
    
    // Actualizar saldo
    balance = balance.plus(effect);
    
    // Movimiento formateado con saldo
    return {
      id: movement.id,
      date: movement.journal_entry?.date || '',
      entry_number: movement.journal_entry?.entry_number || '',
      description: movement.journal_entry?.description || movement.description || '',
      debit: debit.toNumber(),
      credit: credit.toNumber(),
      balance: balance.toNumber()
    };
  });
  
  return {
    formattedMovements,
    totalDebit: totalDebit.toNumber(),
    totalCredit: totalCredit.toNumber(),
    finalBalance: balance.toNumber()
  };
}

/**
 * Construye un árbol de cuentas para determinar jerarquías
 */
export async function buildAccountHierarchy(accounts: Account[]): Promise<Map<string, string[]>> {
  const hierarchy = new Map<string, string[]>();
  
  // Agrupar cuentas por su padre
  accounts.forEach(account => {
    if (account.parent_id) {
      if (!hierarchy.has(account.parent_id)) {
        hierarchy.set(account.parent_id, []);
      }
      
      const children = hierarchy.get(account.parent_id);
      if (children) {
        children.push(account.id);
      }
    }
  });
  
  return hierarchy;
}

/**
 * Determina el nivel de una cuenta en la jerarquía basado en su código
 */
export function getAccountLevel(code: string): number {
  // La profundidad se puede determinar por la cantidad de puntos en el código
  // o la longitud del código en sistemas numéricos
  const segments = code.split('.');
  return segments.length;
}

/**
 * Obtiene los datos del libro mayor con jerarquía de cuentas mejorada
 */
export async function fetchLedgerData(
  accounts: Account[],
  filters: {
    startDate?: string;
    endDate?: string;
    periodId?: string;
    showZeroBalances?: boolean;
    accountTypes?: string[];
  }
) {
  try {
    // 1. Filtrar cuentas según los tipos seleccionados
    let filteredAccounts = [...accounts];
    
    if (filters.accountTypes && filters.accountTypes.length > 0) {
      filteredAccounts = accounts.filter(account => 
        filters.accountTypes?.includes(account.type)
      );
    }
    
    // 2. Crear mapa de cuentas para acceso rápido
    const accountsMap = new Map<string, Account>();
    filteredAccounts.forEach(account => {
      accountsMap.set(account.id, account);
    });
    
    // 3. Construir jerarquía de cuentas
    const hierarchy = await buildAccountHierarchy(filteredAccounts);
    
    // 3.1. Crear un mapa de nivel de profundidad por cuenta
    // Esto será útil para mostrar la jerarquía de forma visual
    const depthMap = new Map<string, number>();
    
    // Función para calcular profundidad recursivamente
    const calculateDepth = (accountId: string, depth: number = 1) => {
      depthMap.set(accountId, depth);
      const children = hierarchy.get(accountId) || [];
      children.forEach(childId => {
        calculateDepth(childId, depth + 1);
      });
    };
    
    // Calcular profundidad para cuentas raíz
    filteredAccounts
      .filter(account => !account.parent_id)
      .forEach(account => calculateDepth(account.id, 1));
    
    // 4. Organizar cuentas en orden jerárquico para presentación
    const hierarchicalResults: Account[] = [];
    
    // Función recursiva para agregar cuentas en orden jerárquico
    const addAccountsRecursively = (parentId: string | null = null, level: number = 1) => {
      const accountsAtLevel = parentId 
        ? (hierarchy.get(parentId) || []).map(id => accountsMap.get(id)).filter(Boolean) as Account[]
        : filteredAccounts.filter(a => !a.parent_id);
      
      // Ordenar por código para presentación coherente
      accountsAtLevel.sort((a, b) => a.code.localeCompare(b.code));
      
      for (const account of accountsAtLevel) {
        hierarchicalResults.push(account);
        if (hierarchy.has(account.id)) {
          addAccountsRecursively(account.id, level + 1);
        }
      }
    };
    
    // Comenzar con cuentas raíz
    addAccountsRecursively();
    
    // 4. Procesar cada cuenta y sus movimientos
    const ledgerPromises = hierarchicalResults.map(async (account) => {
      // 4.1. Obtener saldo inicial
      const initialBalance = await fetchPreviousBalance(
        account.id,
        filters.startDate || '',
        filters.periodId
      );
      
      // 4.2. Obtener movimientos para esta cuenta
      const movements = await fetchAccountMovements(account.id, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        periodId: filters.periodId
      });
      
      // 4.3. Procesar movimientos y calcular saldos
      const { 
        formattedMovements, 
        totalDebit, 
        totalCredit, 
        finalBalance 
      } = processMovements(movements, account, initialBalance);
      
      // 4.4. Determinar si la cuenta tiene hijos
      const hasChildren = hierarchy.has(account.id);
      
      // 4.5. Obtener nombre de la cuenta padre si existe
      let parentName;
      if (account.parent_id && accountsMap.has(account.parent_id)) {
        parentName = accountsMap.get(account.parent_id)?.name;
      }
      
      // 4.6. Determinar nivel de la cuenta en la jerarquía
      const level = depthMap.get(account.id) || getAccountLevel(account.code);
      
      // 4.7. Crear objeto de cuenta para el libro mayor
      const ledgerAccount: LedgerAccount = {
        accountId: account.id,
        account,
        level,
        parentName,
        initialBalance,
        movements: formattedMovements,
        totalDebit,
        totalCredit,
        finalBalance,
        expanded: false, // Inicialmente colapsado
        hasChildren,
        children: hierarchy.get(account.id),
        isParent: account.is_parent || false, // Indicador explícito de si es cuenta padre
        isRootAccount: !account.parent_id, // Indicador de si es una cuenta raíz (nivel superior)
        childrenCount: (hierarchy.get(account.id) || []).length, // Número de hijos directos
      };
      
      return ledgerAccount;
    });
    
    // 5. Esperar que se resuelvan todas las promesas
    let ledgerResults = await Promise.all(ledgerPromises);
    
    // 6. Filtrar cuentas sin movimientos si así se solicita
    if (!filters.showZeroBalances) {
      ledgerResults = ledgerResults.filter(account => 
        account.initialBalance !== 0 || 
        account.totalDebit !== 0 || 
        account.totalCredit !== 0 ||
        account.hasChildren // Mantener cuentas padre aunque no tengan movimientos
      );
    }
    
    // 7. Ordenar por código de cuenta para asegurar que la jerarquía se visualice correctamente
    ledgerResults.sort((a, b) => a.account.code.localeCompare(b.account.code));
    
    return ledgerResults;
  } catch (error) {
    console.error('Error obteniendo datos del libro mayor:', error);
    throw error;
  }
} 