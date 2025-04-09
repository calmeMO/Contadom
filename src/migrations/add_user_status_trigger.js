/**
 * Script para ejecutar migrations SQL en Supabase
 * Este script agrega las columnas de estado de usuario y un trigger para verificar
 * el estado antes de la autenticación
 * 
 * Uso: node add_user_status_trigger.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Variables de entorno para conexión a Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Crear cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Función para ejecutar SQL directamente
async function executeSQL(sql) {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      sql_statement: sql
    });
    
    if (error) throw error;
    console.log('✅ SQL ejecutado correctamente');
    return data;
  } catch (error) {
    console.error('❌ Error al ejecutar SQL:', error);
    throw error;
  }
}

// Verificar si las columnas ya existen
async function checkColumnsExist() {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      sql_statement: `
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'user_profiles' 
          AND column_name = 'account_status'
        ) as has_account_status
      `
    });
    
    if (error) throw error;
    return data && data[0] && data[0].has_account_status;
  } catch (error) {
    console.error('Error al verificar columnas:', error);
    return false;
  }
}

// Actualizar todos los perfiles para sincronizar is_active y account_status
async function syncProfiles() {
  const sql = `
    -- Actualizar perfiles existentes
    UPDATE public.user_profiles 
    SET account_status = 
      CASE 
        WHEN is_active = true THEN 'active'
        ELSE 'inactive'
      END
    WHERE account_status IS NULL OR account_status = '';
    
    -- Sincronizar is_active con account_status
    UPDATE public.user_profiles
    SET is_active = CASE 
        WHEN account_status = 'active' THEN true
        ELSE false
      END
    WHERE is_active != (account_status = 'active');
  `;
  
  await executeSQL(sql);
  console.log('✅ Perfiles sincronizados correctamente');
}

// Agregar columnas al perfil de usuario
async function addStatusColumns() {
  const sql = `
    -- Añadir columnas para estado de la cuenta si no existen
    ALTER TABLE public.user_profiles 
      ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;
    
    -- Crear índice para optimizar consultas por estado
    CREATE INDEX IF NOT EXISTS idx_user_profiles_account_status ON public.user_profiles(account_status);
  `;
  
  await executeSQL(sql);
  console.log('✅ Columnas de estado agregadas correctamente');
}

// Crear función y trigger para verificar estado de cuenta
async function createAuthTrigger() {
  const sql = `
    -- Función que verifica el estado de la cuenta antes de permitir el inicio de sesión
    CREATE OR REPLACE FUNCTION public.check_account_status_on_auth()
    RETURNS TRIGGER AS $$
    DECLARE
      account_status text;
      is_locked boolean;
      lock_time timestamptz;
    BEGIN
      -- Obtener el estado de la cuenta del usuario que intenta autenticarse
      SELECT 
        up.account_status,
        up.locked_until IS NOT NULL AND up.locked_until > NOW() AS is_locked,
        up.locked_until
      INTO 
        account_status,
        is_locked,
        lock_time
      FROM 
        public.user_profiles up
      WHERE 
        up.id = NEW.user_id;
        
      -- Si el usuario no existe en user_profiles, permitir la autenticación
      -- (se creará el perfil automáticamente después)
      IF account_status IS NULL THEN
        RETURN NEW;
      END IF;
      
      -- Verificar si la cuenta está bloqueada por intentos fallidos
      IF is_locked THEN
        RAISE EXCEPTION 'Cuenta bloqueada temporalmente hasta %', lock_time;
      END IF;
      
      -- Verificar el estado de la cuenta
      IF account_status = 'inactive' THEN
        RAISE EXCEPTION 'Esta cuenta está inactiva. Contacte al administrador para activarla.';
      ELSIF account_status = 'suspended' THEN
        RAISE EXCEPTION 'Esta cuenta está suspendida. Contacte al administrador.';
      ELSIF account_status = 'archived' THEN
        RAISE EXCEPTION 'Esta cuenta ha sido archivada y ya no está disponible.';
      END IF;
      
      -- Todo está bien, permitir la autenticación
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- Comentario para documentación
    COMMENT ON FUNCTION public.check_account_status_on_auth() IS 
      'Verifica el estado de la cuenta del usuario antes de permitir la autenticación. Bloquea usuarios inactivos, suspendidos, archivados o con cuenta bloqueada por intentos fallidos.';
  `;
  
  await executeSQL(sql);
  console.log('✅ Función de verificación creada correctamente');
  
  // Crear el trigger por separado para manejar errores si la tabla no existe
  try {
    const triggerSql = `
      -- Crear el trigger para la tabla auth.sessions
      DROP TRIGGER IF EXISTS check_account_status_before_auth ON auth.sessions;
      CREATE TRIGGER check_account_status_before_auth
      BEFORE INSERT ON auth.sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.check_account_status_on_auth();
    `;
    
    await executeSQL(triggerSql);
    console.log('✅ Trigger creado correctamente');
  } catch (error) {
    console.warn('⚠️ No se pudo crear el trigger en auth.sessions. Puede ser necesario permisos especiales.');
    console.error(error);
  }
}

// Función para crear trigger en reintentos fallidos
async function createLoginAttemptsTrigger() {
  const sql = `
    -- Función SQL para la verificación de intentos de inicio de sesión
    CREATE OR REPLACE FUNCTION public.check_user_login_attempts()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Si se está reiniciando a 0 los intentos, también eliminar el bloqueo
      IF NEW.login_attempts = 0 THEN
        NEW.locked_until = NULL;
      END IF;
      
      -- Si se alcanza el límite de intentos (3), bloquear por 30 minutos
      IF NEW.login_attempts >= 3 AND (OLD.login_attempts IS NULL OR NEW.login_attempts > OLD.login_attempts) THEN
        NEW.locked_until = NOW() + INTERVAL '30 minutes';
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Crear el trigger para la función
    DROP TRIGGER IF EXISTS check_login_attempts_trigger ON public.user_profiles;
    CREATE TRIGGER check_login_attempts_trigger
    BEFORE UPDATE OF login_attempts ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_user_login_attempts();
  `;
  
  await executeSQL(sql);
  console.log('✅ Trigger de intentos fallidos creado correctamente');
}

// Ejecutar todas las migraciones
async function runMigrations() {
  try {
    console.log('🚀 Iniciando migraciones...');
    
    const columnsExist = await checkColumnsExist();
    if (!columnsExist) {
      await addStatusColumns();
    } else {
      console.log('ℹ️ Las columnas de estado ya existen, omitiendo este paso');
    }
    
    await syncProfiles();
    await createLoginAttemptsTrigger();
    await createAuthTrigger();
    
    console.log('✅ Migración completada exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  }
}

// Ejecutar migraciones
runMigrations(); 