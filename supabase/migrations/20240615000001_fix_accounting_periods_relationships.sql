-- Migración para agregar comentarios a las relaciones en accounting_periods
BEGIN;

-- Agregar comentarios para PostgREST para definir las relaciones
COMMENT ON COLUMN accounting_periods.closed_by IS 'Referencias a auth.users(id)';
COMMENT ON COLUMN accounting_periods.reopened_by IS 'Referencias a auth.users(id)';
COMMENT ON COLUMN accounting_periods.reclosed_by IS 'Referencias a auth.users(id)';
COMMENT ON COLUMN accounting_periods.created_by IS 'Referencias a auth.users(id)';

-- Comentarios específicos para definir los alias de las relaciones en PostgREST
COMMENT ON CONSTRAINT accounting_periods_closed_by_fkey ON accounting_periods IS
E'@foreignAlias closed_periods\n@identifier closed_by_user';

COMMENT ON CONSTRAINT accounting_periods_reopened_by_fkey ON accounting_periods IS
E'@foreignAlias reopened_periods\n@identifier reopened_by_user';

COMMENT ON CONSTRAINT accounting_periods_reclosed_by_fkey ON accounting_periods IS
E'@foreignAlias reclosed_periods\n@identifier reclosed_by_user';

COMMENT ON CONSTRAINT accounting_periods_created_by_fkey ON accounting_periods IS
E'@foreignAlias created_periods\n@identifier created_by_user';

-- Actualizar la definición de la vista para usar los mismos nombres que las relaciones
CREATE OR REPLACE VIEW public.accounting_periods_with_users AS
SELECT 
    ap.*,
    cb.email as closed_by_email,
    rb.email as reopened_by_email,
    rcb.email as reclosed_by_email,
    crb.email as created_by_email
FROM public.accounting_periods ap
LEFT JOIN auth.users cb ON ap.closed_by = cb.id
LEFT JOIN auth.users rb ON ap.reopened_by = rb.id
LEFT JOIN auth.users rcb ON ap.reclosed_by = rcb.id
LEFT JOIN auth.users crb ON ap.created_by = crb.id;

-- Restablecer permisos
GRANT SELECT ON public.accounting_periods_with_users TO authenticated;

-- Actualizar la caché de esquema de PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT; 