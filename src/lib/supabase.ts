// Archivo supabase.ts - Cliente de Supabase con manejo de errores mejorado y reintentos

import { createClient } from '@supabase/supabase-js';
import { toast } from 'react-toastify';

// Definición de tipos
interface Account {
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
}

interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  accounting_period_id: string;
  is_posted: boolean;
  total_debit: number;
  total_credit: number;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Función para retrasar la ejecución
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Función para reintentar una operación
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Intento ${i + 1} fallido:`, error);
      
      if (i < maxRetries - 1) {
        await delay(delayMs * Math.pow(2, i)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

// Opciones para configurar el cliente
const supabaseOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  },
  global: {
    headers: {
      'Content-Type': 'application/json'
    },
    fetch: async (...args: Parameters<typeof fetch>) => {
      const fetchWithRetry = () => fetch(...args);
      try {
        return await retryOperation(fetchWithRetry);
      } catch (error) {
        console.error('Error en la conexión con Supabase:', error);
        toast.error('Error de conexión. Intentando reconectar...');
        throw error;
      }
    }
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, supabaseOptions);

// Función para verificar la conexión
export const checkConnection = async () => {
  try {
    const { error } = await supabase.from('accounts').select('id').limit(1);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error de conexión con Supabase:', error);
    return false;
  }
};

// Función para crear una cuenta con mejor manejo de errores
export const createAccount = async (accountData: Partial<Account>) => {
  return retryOperation(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Debes iniciar sesión para realizar esta acción');
      }
      
      const { data, error } = await supabase
        .from('accounts')
        .insert(accountData)
        .select();
        
      if (error) {
        console.error('Error al guardar la cuenta:', error);
        
        if (error.code === '42501') {
          throw new Error('No tienes permisos para crear cuentas. Contacta al administrador.');
        }
        
        throw new Error(`Error al guardar la cuenta: ${error.message}`);
      }
      
      return data;
    } catch (err) {
      console.error('Error inesperado:', err);
      throw err;
    }
  });
};

// Función para actualizar una cuenta con mejor manejo de errores
export const updateAccount = async (id: string, accountData: Partial<Account>) => {
  return retryOperation(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Debes iniciar sesión para realizar esta acción');
      }
      
      const { data, error } = await supabase
        .from('accounts')
        .update(accountData)
        .eq('id', id)
        .select();
        
      if (error) {
        console.error('Error al actualizar la cuenta:', error);
        
        if (error.code === '42501') {
          throw new Error('No tienes permisos para actualizar cuentas. Contacta al administrador.');
        }
        
        throw new Error(`Error al actualizar la cuenta: ${error.message}`);
      }
      
      return data;
    } catch (err) {
      console.error('Error inesperado:', err);
      throw err;
    }
  });
};

// Función para obtener todas las cuentas
export const getAccounts = async () => {
  return retryOperation(async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*');
      
    if (error) {
      console.error('Error al obtener cuentas:', error);
      throw new Error(`Error al obtener cuentas: ${error.message}`);
    }
    
    return data;
  });
};

// Especificar tipos en lugar de 'any'
export async function fetchAccountsByType(type: string): Promise<Account[]> {
  return retryOperation(async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('type', type)
      .eq('is_active', true);
      
    if (error) {
      console.error('Error al obtener cuentas por tipo:', error);
      throw new Error(`Error al obtener cuentas: ${error.message}`);
    }
    
    return data || [];
  });
}

export async function fetchJournalEntryById(id: string): Promise<JournalEntry | null> {
  return retryOperation(async () => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) {
      console.error('Error al obtener asiento contable:', error);
      throw new Error(`Error al obtener asiento: ${error.message}`);
    }
    
    return data;
  });
}