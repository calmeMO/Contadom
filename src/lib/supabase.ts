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
        const url = args[0] instanceof Request ? args[0].url : String(args[0]);
        console.log(`Iniciando petición a: ${url.split('?')[0]}`);
        
        // Corregir problemas con peticiones a user_profiles y company_settings
        if (url.includes('/user_profiles') && url.includes('id=eq.')) {
          // Corregir formato de consulta para user_profiles
          const newUrl = url.replace(/id=eq\.([^&]+)/, 'id=eq.$1');
          args[0] = newUrl;
        }
        
        // Corregir problema con campo 'logo' vs 'logo_url' en company_settings
        if (url.includes('/company_settings') && args[1] && typeof args[1] === 'object') {
          const options = args[1] as RequestInit;
          if ((options.method === 'PATCH' || options.method === 'POST') && options.body) {
            try {
              const body = JSON.parse(options.body as string);
              // Si hay un campo 'logo', cambiarlo a 'logo_url'
              if (body.logo !== undefined) {
                body.logo_url = body.logo;
                delete body.logo;
                options.body = JSON.stringify(body);
              }
            } catch (e) {
              console.warn('Error al parsear body para corregir logo:', e);
            }
          }
        }
        
        // Aumentar el número de reintentos para operaciones críticas
        const isAccountsQuery = url.includes('/accounts');
        const maxRetries = isAccountsQuery ? 5 : 3;
        const response = await retryOperation(fetchWithRetry, maxRetries);
        
        // Log de respuesta exitosa
        if (response.ok) {
          console.log(`Petición exitosa a: ${url.split('?')[0]} - Status: ${response.status}`);
        } else {
          console.warn(`Respuesta con error: ${url.split('?')[0]} - Status: ${response.status}`);
        }
        
        return response;
      } catch (error) {
        console.error('Error en la conexión con Supabase:', error);
        toast.error('Error de conexión con la base de datos. Intentando reconectar...');
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