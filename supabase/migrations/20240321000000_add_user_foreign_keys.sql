BEGIN;

-- Drop existing foreign key constraints if they exist
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
END $$;

-- Set invalid user references to NULL
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

-- Add new foreign key constraints
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

-- Grant permissions for PostgREST to see the relationships
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT SELECT ON auth.users TO anon, authenticated;

-- Create a view to expose user information safely
CREATE OR REPLACE VIEW public.users_view AS
SELECT id, email, raw_user_meta_data
FROM auth.users;

GRANT SELECT ON public.users_view TO anon, authenticated;

COMMIT; 