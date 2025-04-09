-- Migración para añadir columnas de gestión de estado de usuarios
-- Para ejecutar, use el comando: psql -U postgres -d tu_base_de_datos -f add_user_status_columns.sql

-- Añadir columnas para estado de la cuenta
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

-- Comentarios para documentar las columnas
COMMENT ON COLUMN public.user_profiles.account_status IS 'Estado de la cuenta: active, inactive, suspended, archived';
COMMENT ON COLUMN public.user_profiles.login_attempts IS 'Contador de intentos fallidos de inicio de sesión';
COMMENT ON COLUMN public.user_profiles.locked_until IS 'Fecha hasta la que la cuenta está bloqueada por intentos fallidos';

-- Crear un índice para optimizar consultas por estado
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_status ON public.user_profiles(account_status);

-- Actualizar perfiles existentes
UPDATE public.user_profiles 
SET account_status = 
  CASE 
    WHEN is_active = true THEN 'active'
    ELSE 'inactive'
  END
WHERE account_status IS NULL;

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