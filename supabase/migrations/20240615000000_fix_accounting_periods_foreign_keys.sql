BEGIN;

-- Eliminar restricciones existentes si existen
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'accounting_periods_closed_by_fkey') THEN
        ALTER TABLE accounting_periods DROP CONSTRAINT accounting_periods_closed_by_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'accounting_periods_created_by_fkey') THEN
        ALTER TABLE accounting_periods DROP CONSTRAINT accounting_periods_created_by_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'accounting_periods_reopened_by_fkey') THEN
        ALTER TABLE accounting_periods DROP CONSTRAINT accounting_periods_reopened_by_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'accounting_periods_reclosed_by_fkey') THEN
        ALTER TABLE accounting_periods DROP CONSTRAINT accounting_periods_reclosed_by_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_closed_by') THEN
        ALTER TABLE accounting_periods DROP CONSTRAINT fk_closed_by;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reopened_by') THEN
        ALTER TABLE accounting_periods DROP CONSTRAINT fk_reopened_by;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_created_by') THEN
        ALTER TABLE accounting_periods DROP CONSTRAINT fk_created_by;
    END IF;
END $$;

-- Limpiar referencias inválidas
UPDATE accounting_periods 
SET created_by = NULL 
WHERE created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = accounting_periods.created_by
);

UPDATE accounting_periods 
SET closed_by = NULL 
WHERE closed_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = accounting_periods.closed_by
);

UPDATE accounting_periods 
SET reopened_by = NULL 
WHERE reopened_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = accounting_periods.reopened_by
);

UPDATE accounting_periods 
SET reclosed_by = NULL 
WHERE reclosed_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = accounting_periods.reclosed_by
);

-- Agregar nuevas restricciones de clave foránea
ALTER TABLE accounting_periods
    ADD CONSTRAINT accounting_periods_closed_by_fkey
    FOREIGN KEY (closed_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

ALTER TABLE accounting_periods
    ADD CONSTRAINT accounting_periods_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

ALTER TABLE accounting_periods
    ADD CONSTRAINT accounting_periods_reopened_by_fkey
    FOREIGN KEY (reopened_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

ALTER TABLE accounting_periods
    ADD CONSTRAINT accounting_periods_reclosed_by_fkey
    FOREIGN KEY (reclosed_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- Asegurar que existen los permisos necesarios
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT SELECT ON auth.users TO anon, authenticated;

-- Actualizar o recrear la vista para incluir todos los campos relacionados
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

GRANT SELECT ON public.accounting_periods_with_users TO authenticated;

COMMIT; 