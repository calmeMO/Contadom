-- Script para añadir la columna action_type a la tabla closing_history
-- Esta columna es necesaria para identificar el tipo de acción realizada

ALTER TABLE public.closing_history
ADD COLUMN action_type VARCHAR(50) DEFAULT 'close';

-- Añadir comentario para la columna
COMMENT ON COLUMN public.closing_history.action_type IS 'Tipo de acción: close, reopen, reclose';

-- Valores posibles: close (cierre inicial), reopen (reapertura), reclose (cierre después de reapertura) 