-- Script para eliminar la tabla closing_history y limpiar todas sus referencias
-- Contadom - Migración para eliminar tabla closing_history

-- Desactivar triggers para evitar problemas
DO $$
BEGIN
    -- Primero, eliminar las políticas RLS
    DROP POLICY IF EXISTS closing_history_select ON public.closing_history;
    DROP POLICY IF EXISTS closing_history_insert ON public.closing_history;
    DROP POLICY IF EXISTS closing_history_update ON public.closing_history;
    DROP POLICY IF EXISTS closing_history_delete ON public.closing_history;
    
    -- Eliminar índices
    DROP INDEX IF EXISTS idx_closing_history_period_id;
    DROP INDEX IF EXISTS idx_closing_history_action_type;
    DROP INDEX IF EXISTS idx_closing_history_created_by;
    
    -- Finalmente, eliminar la tabla
    DROP TABLE IF EXISTS public.closing_history;
END;
$$;

-- Confirmar eliminación
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'closing_history') THEN
        RAISE NOTICE 'Tabla closing_history eliminada correctamente';
    ELSE
        RAISE WARNING 'La tabla closing_history aún existe, verificar permisos o restricciones pendientes';
    END IF;
END;
$$; 