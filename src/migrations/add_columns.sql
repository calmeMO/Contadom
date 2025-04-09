-- Script SQL para añadir columnas de estado de usuario
-- Este script puede ejecutarse directamente en la consola SQL de Supabase

-- Añadir columnas para estado de cuenta si no existen
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

-- Actualizar estado de cuenta basado en is_active para los registros existentes
UPDATE public.user_profiles 
SET account_status = 
  CASE 
    WHEN is_active = true THEN 'active' 
    ELSE 'inactive' 
  END 
WHERE account_status IS NULL;

-- Comentario para verificar que todo funcionó
SELECT 'Columnas añadidas exitosamente' as resultado; 