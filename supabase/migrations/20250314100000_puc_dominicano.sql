/*
  # Adaptación al Plan Único de Cuentas (PUC) Dominicano
  
  1. Cambios
    - Simplificar los tipos de cuenta según PUC
    - Añadir campo de naturaleza (deudora/acreedora)
    - Mantener compatibilidad con datos existentes
*/

-- Creamos nuevo tipo ENUM para la naturaleza de la cuenta
CREATE TYPE account_nature AS ENUM ('deudora', 'acreedora');

-- Creamos nuevo tipo ENUM para simplificar los tipos de cuenta
CREATE TYPE account_type_puc AS ENUM (
  'activo',
  'pasivo',
  'patrimonio', 
  'ingreso', 
  'gasto',
  'costo',
  'cuenta_orden'
);

-- Añadimos la columna de naturaleza
ALTER TABLE accounts ADD COLUMN nature account_nature;

-- Añadimos columna temporal para el nuevo tipo
ALTER TABLE accounts ADD COLUMN type_puc account_type_puc;

-- Actualizamos los valores del tipo según la clasificación actual
UPDATE accounts SET 
  type_puc = 
    CASE 
      WHEN type = 'activo_corriente' OR type = 'activo_no_corriente' THEN 'activo'::account_type_puc
      WHEN type = 'pasivo_corriente' OR type = 'pasivo_no_corriente' THEN 'pasivo'::account_type_puc
      WHEN type = 'patrimonio' THEN 'patrimonio'::account_type_puc
      WHEN type = 'ingreso' THEN 'ingreso'::account_type_puc
      WHEN type = 'gasto' THEN 'gasto'::account_type_puc
      WHEN type = 'costo' THEN 'costo'::account_type_puc
      WHEN type = 'cuenta_orden' THEN 'cuenta_orden'::account_type_puc
      -- Para compatibilidad con tipos antiguos
      WHEN type = 'asset' THEN 'activo'::account_type_puc
      WHEN type = 'liability' THEN 'pasivo'::account_type_puc
      WHEN type = 'equity' THEN 'patrimonio'::account_type_puc
      WHEN type = 'revenue' THEN 'ingreso'::account_type_puc
      WHEN type = 'expense' THEN 'gasto'::account_type_puc
    END;

-- Actualizamos la naturaleza según el tipo de cuenta
UPDATE accounts SET 
  nature = 
    CASE 
      WHEN type_puc = 'activo' OR type_puc = 'gasto' OR type_puc = 'costo' THEN 'deudora'::account_nature
      WHEN type_puc = 'pasivo' OR type_puc = 'patrimonio' OR type_puc = 'ingreso' THEN 'acreedora'::account_nature
      WHEN type_puc = 'cuenta_orden' THEN 
        CASE 
          WHEN code LIKE '7%' THEN 'deudora'::account_nature
          WHEN code LIKE '8%' THEN 'acreedora'::account_nature
          ELSE 'deudora'::account_nature -- valor por defecto
        END
    END;

-- Verificamos que todas las cuentas tengan valores asignados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM accounts WHERE type_puc IS NULL OR nature IS NULL) THEN
    RAISE EXCEPTION 'Existen cuentas sin valores asignados para type_puc o nature';
  END IF;
END $$;

-- Eliminamos la columna vieja y renombramos la nueva
ALTER TABLE accounts DROP COLUMN type;
ALTER TABLE accounts RENAME COLUMN type_puc TO type;

-- Eliminamos el tipo enum antiguo y renombramos el nuevo
DROP TYPE account_type;
ALTER TYPE account_type_puc RENAME TO account_type;

-- Hacemos que el campo nature sea NOT NULL
ALTER TABLE accounts ALTER COLUMN nature SET NOT NULL; 