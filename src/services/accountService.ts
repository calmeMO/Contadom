import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  is_active: boolean;
  description?: string;
  category_id?: string;
  parent_id?: string;
  created_by?: string;
  has_children?: boolean;
}

/**
 * Obtiene todas las cuentas contables
 */
export async function fetchAccounts() {
  try {
    console.log('Iniciando fetchAccounts()...');
    
    // Obtener todas las cuentas activas
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('code');
      
    if (error) {
      console.error('Error en la consulta de cuentas:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.warn('No se encontraron cuentas activas en la base de datos');
    } else {
      console.log(`Se encontraron ${data.length} cuentas activas`);
    }
    
    // Verificar si las cuentas tienen el campo has_children
    const cuentasSinHasChildren = data?.filter(account => account.has_children === undefined);
    if (cuentasSinHasChildren && cuentasSinHasChildren.length > 0) {
      console.warn('Algunas cuentas no tienen definido el campo has_children');
      
      // Procesamos las cuentas para asignar has_children basado en si tienen parent_id
      const accountsWithParentInfo = data?.map(account => {
        // Una cuenta es padre si otras cuentas la referencian como parent_id
        const isParent = data.some(childAccount => childAccount.parent_id === account.id);
        return {
          ...account,
          has_children: isParent
        };
      });
      
      return accountsWithParentInfo || [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error al obtener cuentas:', error);
    toast.error('Error al cargar las cuentas contables');
    return [];
  }
}

/**
 * Obtiene cuentas por tipo
 */
export async function fetchAccountsByType(type: string) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('type', type)
      .eq('is_active', true)
      .order('code');
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error al obtener cuentas por tipo:', error);
    toast.error(`Error al cargar las cuentas de tipo ${type}`);
    return [];
  }
}

/**
 * Verifica si una cuenta tiene movimientos contables
 */
export async function checkAccountHasEntries(accountId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('journal_entry_items')
      .select('id')
      .eq('account_id', accountId)
      .limit(1);
      
    if (error) throw error;
    return (data && data.length > 0);
  } catch (error) {
    console.error('Error al verificar movimientos de la cuenta:', error);
    return false;
  }
}

/**
 * Verifica si una cuenta tiene cuentas hijas
 */
export async function checkAccountHasChildren(accountId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('id')
      .eq('parent_id', accountId)
      .limit(1);
      
    if (error) throw error;
    return (data && data.length > 0);
  } catch (error) {
    console.error('Error al verificar cuentas hijas:', error);
    return false;
  }
}

/**
 * Crea una nueva cuenta contable
 */
export async function createAccount(accountData: Partial<Account>) {
  try {
    // Verificar código único
    const { data: existingAccount, error: checkError } = await supabase
      .from('accounts')
      .select('id, code')
      .eq('code', accountData.code)
      .limit(1);
      
    if (checkError) throw checkError;
    
    if (existingAccount && existingAccount.length > 0) {
      throw new Error(`Ya existe una cuenta con el código ${accountData.code}`);
    }
    
    const { data, error } = await supabase
      .from('accounts')
      .insert(accountData)
      .select();
      
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error al crear cuenta:', error);
    throw new Error(error.message || 'Error al crear la cuenta');
  }
}

/**
 * Actualiza una cuenta existente
 */
export async function updateAccount(id: string, accountData: Partial<Account>) {
  try {
    // Verificar código único (excepto para esta cuenta)
    if (accountData.code) {
      const { data: existingAccount, error: checkError } = await supabase
        .from('accounts')
        .select('id, code')
        .eq('code', accountData.code)
        .neq('id', id)
        .limit(1);
        
      if (checkError) throw checkError;
      
      if (existingAccount && existingAccount.length > 0) {
        throw new Error(`Ya existe otra cuenta con el código ${accountData.code}`);
      }
    }
    
    const { data, error } = await supabase
      .from('accounts')
      .update(accountData)
      .eq('id', id)
      .select();
      
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error al actualizar cuenta:', error);
    throw new Error(error.message || 'Error al actualizar la cuenta');
  }
}

/**
 * Desactiva una cuenta (alternativa segura a la eliminación)
 */
export async function deactivateAccount(id: string) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', id)
      .select();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error al desactivar cuenta:', error);
    throw new Error('Error al desactivar la cuenta');
  }
}

/**
 * Elimina una cuenta (solo si no tiene movimientos ni cuentas hijas)
 */
export async function deleteAccount(id: string) {
  try {
    const hasEntries = await checkAccountHasEntries(id);
    if (hasEntries) {
      throw new Error('No se puede eliminar la cuenta porque tiene movimientos contables');
    }
    
    const hasChildren = await checkAccountHasChildren(id);
    if (hasChildren) {
      throw new Error('No se puede eliminar la cuenta porque tiene cuentas hijas');
    }
    
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error: any) {
    console.error('Error al eliminar cuenta:', error);
    throw new Error(error.message || 'Error al eliminar la cuenta');
  }
} 