/*
  # Adaptación al Plan Único de Cuentas (PUC) Dominicano
  
  1. Changes
    - Create new account nature and type enums
    - Add nature column to accounts table
    - Convert existing account types to new format
    - Make nature column required
  
  2. Notes
    - Handles type conversion safely
    - Preserves existing data
    - Maintains referential integrity
*/

-- Create new ENUMs
DO $$ BEGIN
    CREATE TYPE account_nature AS ENUM ('deudora', 'acreedora');
    CREATE TYPE account_type_puc AS ENUM (
        'activo',
        'pasivo',
        'patrimonio', 
        'ingreso', 
        'gasto',
        'costo',
        'cuenta_orden'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns
ALTER TABLE accounts 
    ADD COLUMN IF NOT EXISTS nature account_nature,
    ADD COLUMN IF NOT EXISTS type_puc account_type_puc;

-- Update account types using a safer approach
DO $$ 
BEGIN
    -- Update type_puc based on existing type values
    UPDATE accounts SET type_puc = 
        CASE 
            WHEN type::text = 'activo_corriente' THEN 'activo'::account_type_puc
            WHEN type::text = 'activo_no_corriente' THEN 'activo'::account_type_puc
            WHEN type::text = 'pasivo_corriente' THEN 'pasivo'::account_type_puc
            WHEN type::text = 'pasivo_no_corriente' THEN 'pasivo'::account_type_puc
            WHEN type::text = 'patrimonio' THEN 'patrimonio'::account_type_puc
            WHEN type::text = 'ingreso' THEN 'ingreso'::account_type_puc
            WHEN type::text = 'gasto' THEN 'gasto'::account_type_puc
            WHEN type::text = 'costo' THEN 'costo'::account_type_puc
            WHEN type::text = 'cuenta_orden' THEN 'cuenta_orden'::account_type_puc
        END;

    -- Update nature based on new type_puc
    UPDATE accounts SET nature = 
        CASE 
            WHEN type_puc = 'activo' OR type_puc = 'gasto' OR type_puc = 'costo' 
                THEN 'deudora'::account_nature
            WHEN type_puc = 'pasivo' OR type_puc = 'patrimonio' OR type_puc = 'ingreso' 
                THEN 'acreedora'::account_nature
            WHEN type_puc = 'cuenta_orden' THEN 
                CASE 
                    WHEN code LIKE '7%' THEN 'deudora'::account_nature
                    WHEN code LIKE '8%' THEN 'acreedora'::account_nature
                    ELSE 'deudora'::account_nature
                END
        END;

    -- Verify all accounts have been updated correctly
    IF EXISTS (SELECT 1 FROM accounts WHERE type_puc IS NULL OR nature IS NULL) THEN
        RAISE EXCEPTION 'Error: Algunas cuentas no tienen tipo o naturaleza asignada';
    END IF;
END $$;

-- Make nature column required
ALTER TABLE accounts ALTER COLUMN nature SET NOT NULL;

-- Drop old type column and rename new one
ALTER TABLE accounts DROP COLUMN type;
ALTER TABLE accounts RENAME COLUMN type_puc TO type;

-- Drop old enum type and rename new one
DO $$ 
BEGIN
    DROP TYPE IF EXISTS account_type;
    ALTER TYPE account_type_puc RENAME TO account_type;
EXCEPTION 
    WHEN undefined_object THEN null;
END $$;