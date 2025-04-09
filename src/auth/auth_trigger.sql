-- Trigger de autenticación para Supabase que bloquea usuarios inactivos
-- Ejecutar este script en la consola SQL de Supabase

-- 1. Crear la función que verificará el estado de la cuenta
CREATE OR REPLACE FUNCTION auth.check_account_status()
RETURNS trigger AS $$
DECLARE
  is_active boolean;
  account_status text;
  locked_until timestamptz;
BEGIN
  -- Obtener el estado de la cuenta del usuario
  SELECT
    up.is_active,
    up.account_status,
    up.locked_until
  INTO
    is_active,
    account_status,
    locked_until
  FROM
    public.user_profiles up
  WHERE
    up.id = NEW.user_id;
    
  -- Si el usuario no existe en user_profiles, permitir la autenticación
  -- (posiblemente un nuevo usuario)
  IF is_active IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Verificar si la cuenta está bloqueada temporalmente
  IF locked_until IS NOT NULL AND locked_until > now() THEN
    RAISE EXCEPTION 'Cuenta bloqueada temporalmente hasta %', locked_until;
  END IF;
  
  -- Verificar si la cuenta está inactiva por cualquier estado
  IF is_active = false OR account_status = 'inactive' OR account_status = 'suspended' OR account_status = 'archived' THEN
    RAISE EXCEPTION 'La cuenta no está activa. Por favor contacte al administrador.';
  END IF;
  
  -- Todo OK, permitir la autenticación
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Crear el trigger que se ejecuta al crear una nueva sesión
-- Esto bloqueará cualquier intento de iniciar sesión para usuarios inactivos
DROP TRIGGER IF EXISTS check_account_status_trigger ON auth.sessions;
CREATE TRIGGER check_account_status_trigger
BEFORE INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION auth.check_account_status();

-- 3. Comentario para explicar la función
COMMENT ON FUNCTION auth.check_account_status IS 'Verifica el estado de la cuenta del usuario (activo/inactivo/suspendido/archivado) antes de permitir el inicio de sesión.';

-- 4. Actualizar perfiles existentes (asegurar que is_active y account_status estén sincronizados)
UPDATE public.user_profiles
SET is_active = CASE 
    WHEN account_status = 'active' THEN true
    ELSE false
  END
WHERE is_active != (account_status = 'active');

-- 5. Añadir índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_status 
ON public.user_profiles(account_status);

CREATE INDEX IF NOT EXISTS idx_user_profiles_is_active 
ON public.user_profiles(is_active);

-- 6. Asegurar permisos correctos
GRANT USAGE ON SCHEMA auth TO postgres, service_role;
GRANT EXECUTE ON FUNCTION auth.check_account_status TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres, service_role; 