-- Script para crear la tabla closing_history en Supabase
-- Esta tabla registra el historial de cierres de períodos contables

CREATE TABLE IF NOT EXISTS public.closing_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id UUID NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    period_name VARCHAR(255) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_by UUID NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Comentarios para la tabla y columnas
COMMENT ON TABLE public.closing_history IS 'Historial de cierres de períodos contables';
COMMENT ON COLUMN public.closing_history.period_id IS 'ID del período contable cerrado';
COMMENT ON COLUMN public.closing_history.period_type IS 'Tipo de período: fiscal_year o monthly';
COMMENT ON COLUMN public.closing_history.period_name IS 'Nombre del período cerrado';
COMMENT ON COLUMN public.closing_history.closed_at IS 'Fecha y hora del cierre';
COMMENT ON COLUMN public.closing_history.closed_by IS 'ID del usuario que cerró el período';
COMMENT ON COLUMN public.closing_history.notes IS 'Notas sobre el cierre';

-- Permisos de acceso RLS
ALTER TABLE public.closing_history ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para la tabla
CREATE POLICY "closing_history_select_for_authenticated" 
ON public.closing_history 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "closing_history_insert_for_authenticated" 
ON public.closing_history 
FOR INSERT 
TO authenticated 
WITH CHECK (true); 