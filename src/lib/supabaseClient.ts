import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';
import { toast } from 'react-toastify';

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
        await delay(delayMs * Math.pow(2, i));
      }
    }
  }
  
  throw lastError;
}

// Clase Singleton para el cliente de Supabase
class SupabaseClientSingleton {
  private static instance: SupabaseClient<Database>;

  private static createInstance() {
    const options = {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        storageKey: 'contadom-auth-token'
      },
      global: {
        headers: { 'Content-Type': 'application/json' },
        fetch: async (...args: Parameters<typeof fetch>) => {
          const fetchWithRetry = () => fetch(...args);
          try {
            const url = args[0] instanceof Request ? args[0].url : String(args[0]);
            console.log(`Iniciando petición a: ${url.split('?')[0]}`);
            
            const isAccountsQuery = url.includes('/accounts');
            const maxRetries = isAccountsQuery ? 5 : 3;
            const response = await retryOperation(fetchWithRetry, maxRetries);
            
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

    return createClient<Database>(supabaseUrl, supabaseAnonKey, options);
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = this.createInstance();
    }
    return this.instance;
  }
}

export const supabase = SupabaseClientSingleton.getInstance(); 