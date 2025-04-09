-- Script SQL para arreglar la tabla user_profiles
-- Asegura que existan los campos necesarios para el sistema de intentos de login
-- Para ejecutar este script:
-- 1. Conéctate a tu base de datos de Supabase
-- 2. Ejecuta este script en el SQL Editor

-- 1. Agregar columnas si no existen
DO $$
BEGIN
    -- Agregar columna account_status si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'account_status'
    ) THEN
        ALTER TABLE public.user_profiles ADD COLUMN account_status text DEFAULT 'active';
        RAISE NOTICE 'Se agregó la columna account_status';
    ELSE
        RAISE NOTICE 'La columna account_status ya existe';
    END IF;

    -- Agregar columna login_attempts si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'login_attempts'
    ) THEN
        ALTER TABLE public.user_profiles ADD COLUMN login_attempts integer DEFAULT 0;
        RAISE NOTICE 'Se agregó la columna login_attempts';
    ELSE
        RAISE NOTICE 'La columna login_attempts ya existe';
    END IF;

    -- Agregar columna locked_until si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'locked_until'
    ) THEN
        ALTER TABLE public.user_profiles ADD COLUMN locked_until timestamptz DEFAULT NULL;
        RAISE NOTICE 'Se agregó la columna locked_until';
    ELSE
        RAISE NOTICE 'La columna locked_until ya existe';
    END IF;
END $$;

-- 2. Actualizar registros que tengan NULL en las columnas obligatorias
UPDATE public.user_profiles 
SET account_status = 'active' 
WHERE account_status IS NULL;

UPDATE public.user_profiles 
SET login_attempts = 0 
WHERE login_attempts IS NULL;

-- 3. Contar registros actualizados
SELECT 
    (SELECT COUNT(*) FROM public.user_profiles) AS total_users,
    (SELECT COUNT(*) FROM public.user_profiles WHERE account_status IS NULL) AS null_account_status,
    (SELECT COUNT(*) FROM public.user_profiles WHERE login_attempts IS NULL) AS null_login_attempts,
    (SELECT COUNT(*) FROM public.user_profiles WHERE locked_until IS NOT NULL) AS locked_accounts;

-- 4. Crear o reemplazar función para verificar conexión
CREATE OR REPLACE FUNCTION public.check_db_connection()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN jsonb_build_object(
        'connected', true,
        'timestamp', now(),
        'version', current_setting('server_version')
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'connected', false,
            'error', SQLERRM
        );
END;
$$;

-- Configurar permisos para la función check_db_connection
GRANT EXECUTE ON FUNCTION public.check_db_connection() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_db_connection() TO anon;

-- 5. Mostrar información para diagnóstico
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM 
    information_schema.columns 
WHERE 
    table_name = 'user_profiles' 
ORDER BY 
    ordinal_position; 