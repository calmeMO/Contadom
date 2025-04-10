-- Script para añadir la columna created_by a la tabla closing_history
-- Esta columna es necesaria para identificar quién creó el registro

ALTER TABLE public.closing_history
ADD COLUMN created_by UUID DEFAULT NULL;

-- Añadir comentario para la columna
COMMENT ON COLUMN public.closing_history.created_by IS 'ID del usuario que creó el registro'; 