import { supabase } from './supabase';
import { toast } from 'react-toastify';

// Máximo número de intentos fallidos antes de bloquear la cuenta
const MAX_LOGIN_ATTEMPTS = 3;
// Tiempo de bloqueo en minutos
const LOCK_TIME_MINUTES = 30;

/**
 * Función para iniciar sesión con control de intentos fallidos
 */
export async function signInWithEmailPassword(email: string, password: string) {
  try {
    // 1. Verificar si el usuario está bloqueado
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, is_active, account_status, login_attempts, locked_until')
      .eq('email', email.toLowerCase())
      .single();
    
    if (profileError) {
      // Ignorar errores de columnas inexistentes (42703)
      if (profileError.code === '42703') {
        console.warn('Algunas columnas de estado de cuenta aún no están disponibles en la base de datos');
      } else {
        console.error('Error al verificar estado de la cuenta:', profileError);
        // Continuamos con la autenticación normal si no podemos verificar el perfil
      }
    }
    
    // Si existe el perfil, verificar estado
    if (profileData) {
      console.log('Perfil encontrado para verificación:', profileData);
      
      // Verificar is_active primero (para compatibilidad con la implementación anterior)
      if (profileData.is_active === false) {
        console.log('Cuenta inactiva detectada, bloqueando inicio de sesión');
        throw new Error('cuenta_inactiva');
      }
      
      // Verificar account_status si existe
      if (profileData.account_status) {
        // Verificar si la cuenta está suspendida, archivada o inactiva
        if (profileData.account_status === 'suspended') {
          throw new Error('cuenta_suspendida');
        } else if (profileData.account_status === 'archived') {
          throw new Error('cuenta_archivada');
        } else if (profileData.account_status === 'inactive') {
          throw new Error('cuenta_inactiva');
        }
      }
      
      // Verificar si la cuenta está bloqueada temporalmente
      if (profileData.locked_until) {
        const lockUntil = new Date(profileData.locked_until);
        const now = new Date();
        
        if (now < lockUntil) {
          // Calcular minutos restantes
          const minsRemaining = Math.ceil((lockUntil.getTime() - now.getTime()) / (1000 * 60));
          throw new Error(`cuenta_bloqueada:${minsRemaining}`);
        } else {
          // Si ya pasó el tiempo de bloqueo, reiniciar el contador
          await resetLoginAttempts(email);
        }
      }
    }
    
    // 2. Intentar iniciar sesión
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    });
    
    if (error) {
      // Si hay error de autenticación, incrementar contador de intentos
      if (error.message === 'Invalid login credentials') {
        await incrementLoginAttempts(email);
        throw new Error('credenciales_invalidas');
      }
      throw error;
    }
    
    // Si llegamos aquí, el inicio de sesión fue exitoso, reiniciar contador
    await resetLoginAttempts(email);
    return data;
  } catch (error: any) {
    console.error('Error de inicio de sesión:', error);
    throw error;
  }
}

/**
 * Incrementa el contador de intentos fallidos
 */
async function incrementLoginAttempts(email: string) {
  try {
    // 1. Obtener intentos actuales
    const { data, error } = await supabase
      .from('user_profiles')
      .select('login_attempts')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error al obtener intentos de inicio de sesión:', error);
      return;
    }
    
    // Si no existe el usuario, no hacer nada
    if (!data) return;
    
    // 2. Incrementar contador
    const newAttempts = (data.login_attempts || 0) + 1;
    
    // 3. Determinar si se debe bloquear
    let updateData: any = { 
      login_attempts: newAttempts,
      updated_at: new Date().toISOString()
    };
    
    // Si alcanzó el límite, bloquear temporalmente
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + LOCK_TIME_MINUTES);
      updateData.locked_until = lockUntil.toISOString();
    }
    
    // 4. Actualizar perfil
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('email', email);
    
    if (updateError) {
      console.error('Error al actualizar intentos de inicio de sesión:', updateError);
    }
  } catch (error) {
    console.error('Error al incrementar intentos de inicio de sesión:', error);
  }
}

/**
 * Reinicia el contador de intentos fallidos
 */
async function resetLoginAttempts(email: string) {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ 
        login_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString()
      })
      .eq('email', email);
    
    if (error) {
      console.error('Error al reiniciar intentos de inicio de sesión:', error);
    }
  } catch (error) {
    console.error('Error al reiniciar intentos de inicio de sesión:', error);
  }
}

/**
 * Verificar el estado de sesión 
 */
export async function checkSessionStatus() {
  // Actualizar timestamp de actividad cada 5 minutos
  try {
    const { data: session } = await supabase.auth.getSession();
    if (session.session) {
      // Podríamos actualizar un campo last_activity en la tabla de sesiones,
      // pero Supabase ya actualiza el campo updated_at automáticamente
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error al verificar estado de sesión:', error);
    return false;
  }
} 