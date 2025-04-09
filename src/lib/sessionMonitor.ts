import { supabase } from './supabase';

// Tiempo de inactividad en minutos antes de considerar una sesión inactiva
const INACTIVE_TIMEOUT = 2;
// Tiempo de expiración total de sesión en minutos
const SESSION_EXPIRY = 15;

let activityInterval: number | null = null;
let lastActivity: Date = new Date();
let onInactiveCallback: (() => void) | null = null;
let onExpiredCallback: (() => void) | null = null;

/**
 * Iniciar el monitoreo de actividad del usuario
 */
export function startSessionMonitoring(
  onInactive?: () => void,
  onExpired?: () => void
) {
  try {
    // Guardar callbacks
    if (onInactive) onInactiveCallback = onInactive;
    if (onExpired) onExpiredCallback = onExpired;
    
    // Registrar actividad inicial
    updateLastActivity();
    
    // Establecer listeners de eventos de actividad
    window.addEventListener('mousemove', updateLastActivity);
    window.addEventListener('mousedown', updateLastActivity);
    window.addEventListener('keypress', updateLastActivity);
    window.addEventListener('scroll', updateLastActivity);
    window.addEventListener('touchstart', updateLastActivity);
    
    // Iniciar intervalo de verificación
    if (!activityInterval) {
      activityInterval = window.setInterval(checkActivity, 60000); // cada minuto
    }
    
    // Actualizar la sesión de Supabase al iniciar
    updateSupabaseSession();
    
    return () => stopSessionMonitoring();
  } catch (error) {
    // Si hay algún error al iniciar el monitoreo, lo registramos pero no fallamos
    console.error('Error al iniciar monitoreo de sesión:', error);
    return () => {}; // Función de limpieza vacía
  }
}

/**
 * Detener el monitoreo de sesión
 */
export function stopSessionMonitoring() {
  window.removeEventListener('mousemove', updateLastActivity);
  window.removeEventListener('mousedown', updateLastActivity);
  window.removeEventListener('keypress', updateLastActivity);
  window.removeEventListener('scroll', updateLastActivity);
  window.removeEventListener('touchstart', updateLastActivity);
  
  if (activityInterval) {
    window.clearInterval(activityInterval);
    activityInterval = null;
  }
}

/**
 * Actualizar el timestamp de última actividad
 */
function updateLastActivity() {
  lastActivity = new Date();
}

/**
 * Verificar el estado de actividad actual
 */
function checkActivity() {
  const now = new Date();
  const inactiveTime = (now.getTime() - lastActivity.getTime()) / 60000; // en minutos
  
  // Si excede el tiempo de expiración total
  if (inactiveTime >= SESSION_EXPIRY) {
    if (onExpiredCallback) {
      onExpiredCallback();
    }
    // Cerrar sesión automáticamente
    supabase.auth.signOut();
    stopSessionMonitoring();
    return;
  }
  
  // Si excede el tiempo de inactividad pero no el de expiración
  if (inactiveTime >= INACTIVE_TIMEOUT) {
    if (onInactiveCallback) {
      onInactiveCallback();
    }
  } else {
    // Usuario activo, actualizar sesión en Supabase cada ~5 minutos
    updateSupabaseSession();
  }
}

/**
 * Actualizar la sesión en Supabase para mantener updated_at actualizado
 * Ahora es configurable para permitir desactivar la actualización automática
 */
async function updateSupabaseSession() {
  try {
    // Verificar si debemos renovar la sesión
    // Solo actualizamos la sesión cada 5 minutos para no hacer demasiadas llamadas
    const now = new Date();
    const lastUpdateKey = 'last_session_update';
    const lastUpdate = localStorage.getItem(lastUpdateKey);
    
    if (lastUpdate) {
      const lastUpdateTime = new Date(lastUpdate);
      const timeDiff = (now.getTime() - lastUpdateTime.getTime()) / 60000; // en minutos
      
      // Si han pasado menos de 5 minutos desde la última actualización, no hacemos nada
      if (timeDiff < 5) {
        return;
      }
    }
    
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      // La llamada a getSession ya actualiza el campo updated_at
      // en la tabla de sesiones de Supabase
      localStorage.setItem(lastUpdateKey, now.toISOString());
    }
  } catch (error) {
    console.error('Error al actualizar sesión:', error);
  }
}

/**
 * Obtener el tiempo de inactividad actual en minutos
 */
export function getCurrentInactivityTime(): number {
  const now = new Date();
  return (now.getTime() - lastActivity.getTime()) / 60000;
}

/**
 * Verificar si la sesión está actualmente inactiva
 */
export function isSessionInactive(): boolean {
  return getCurrentInactivityTime() >= INACTIVE_TIMEOUT;
}

/**
 * Verificar si la sesión ha expirado
 */
export function isSessionExpired(): boolean {
  return getCurrentInactivityTime() >= SESSION_EXPIRY;
} 