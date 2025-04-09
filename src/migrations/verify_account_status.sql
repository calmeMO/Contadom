-- Migración para crear un trigger que verifique el estado de la cuenta durante la autenticación
-- Para ejecutar, use el comando: psql -U postgres -d tu_base_de_datos -f verify_account_status.sql

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

-- Crear el trigger para la tabla auth.sessions
-- Este trigger se activa cada vez que se crea una nueva sesión
DROP TRIGGER IF EXISTS check_account_status_before_auth ON auth.sessions;
CREATE TRIGGER check_account_status_before_auth
BEFORE INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.check_account_status_on_auth();

-- Comentario para documentación
COMMENT ON FUNCTION public.check_account_status_on_auth() IS 'Verifica el estado de la cuenta del usuario antes de permitir la autenticación. Bloquea usuarios inactivos, suspendidos, archivados o con cuenta bloqueada por intentos fallidos.'; 