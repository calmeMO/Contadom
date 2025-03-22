/*
  # Reestructuración del Catálogo de Cuentas para República Dominicana

  1. Cambios
    - Actualizar el tipo ENUM account_type para seguir las normas contables dominicanas
    - Añadir nuevas categorías de cuentas estándar
    - Mantener compatibilidad con el esquema existente

  2. Notas
    - Esta migración adapta el sistema contable a las normas de República Dominicana
    - Se mantiene la integridad de los datos existentes con mapeos adecuados
*/

-- Primero creamos el nuevo tipo ENUM
CREATE TYPE account_type_rd AS ENUM (
  'activo_corriente', 
  'activo_no_corriente', 
  'pasivo_corriente', 
  'pasivo_no_corriente', 
  'patrimonio', 
  'ingreso', 
  'costo', 
  'gasto',
  'cuenta_orden'
);

-- Añadimos una columna temporal para la nueva clasificación
ALTER TABLE accounts ADD COLUMN type_rd account_type_rd;

-- Actualizamos los valores basados en la clasificación actual
UPDATE accounts SET type_rd = 
  CASE 
    WHEN type = 'asset' THEN 'activo_corriente'::account_type_rd
    WHEN type = 'liability' THEN 'pasivo_corriente'::account_type_rd
    WHEN type = 'equity' THEN 'patrimonio'::account_type_rd
    WHEN type = 'revenue' THEN 'ingreso'::account_type_rd
    WHEN type = 'expense' THEN 'gasto'::account_type_rd
  END;

-- Verificamos que todos los registros tengan un valor en type_rd
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM accounts WHERE type_rd IS NULL) THEN
    RAISE EXCEPTION 'Existen cuentas sin valor en type_rd';
  END IF;
END $$;

-- Eliminamos el tipo anterior y renombramos el nuevo
ALTER TABLE accounts DROP COLUMN type;
ALTER TABLE accounts RENAME COLUMN type_rd TO type;

-- Eliminamos el tipo enum antiguo y renombramos el nuevo
DROP TYPE account_type;
ALTER TYPE account_type_rd RENAME TO account_type;

-- Creamos categorías de cuentas estándar para República Dominicana
INSERT INTO account_categories (id, code, name, description, created_at, created_by, updated_at)
VALUES
  (gen_random_uuid(), '1', 'Activos', 'Recursos controlados por la entidad', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '11', 'Activos Corrientes', 'Activos que se espera realizar, vender o consumir en el ciclo normal de operación', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '12', 'Activos No Corrientes', 'Activos que no se clasifican como corrientes', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '2', 'Pasivos', 'Obligaciones presentes de la entidad', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '21', 'Pasivos Corrientes', 'Obligaciones a liquidar dentro del ciclo normal de operación', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '22', 'Pasivos No Corrientes', 'Obligaciones a largo plazo', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '3', 'Patrimonio', 'Participación residual en los activos de la entidad, una vez deducidos todos sus pasivos', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '4', 'Ingresos', 'Incrementos en los beneficios económicos', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '5', 'Costos', 'Costos directamente relacionados con la actividad principal', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '6', 'Gastos', 'Decrementos en los beneficios económicos', now(), (SELECT id FROM user_profiles LIMIT 1), now()),
  (gen_random_uuid(), '7', 'Cuentas de Orden', 'Cuentas de control administrativo', now(), (SELECT id FROM user_profiles LIMIT 1), now())
ON CONFLICT (code) DO NOTHING; 