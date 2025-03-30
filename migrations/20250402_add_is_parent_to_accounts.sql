-- Migración para añadir el campo is_parent a la tabla de cuentas
-- Esta columna indicará explícitamente si una cuenta es padre o de movimiento

-- Añadir columna is_parent
ALTER TABLE accounts ADD COLUMN is_parent BOOLEAN NOT NULL DEFAULT FALSE;

-- Actualizar cuentas existentes marcando como is_parent aquellas que tienen hijos
UPDATE accounts 
SET is_parent = TRUE 
WHERE id IN (
  SELECT DISTINCT parent_id 
  FROM accounts 
  WHERE parent_id IS NOT NULL
);

-- Crear un trigger para validar que las cuentas hijas sean del mismo tipo que sus padres
CREATE OR REPLACE FUNCTION check_account_parent_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    -- Verificar que la cuenta padre y la hija sean del mismo tipo
    IF NEW.type != (SELECT type FROM accounts WHERE id = NEW.parent_id) THEN
      RAISE EXCEPTION 'La cuenta hija debe ser del mismo tipo que su cuenta padre';
    END IF;

    -- Si la cuenta padre no está marcada como parent, actualizarla
    UPDATE accounts SET is_parent = TRUE WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear un trigger para verificar el tipo antes de insertar o actualizar
CREATE TRIGGER check_account_parent_type_trigger
BEFORE INSERT OR UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION check_account_parent_type();

-- Crear un trigger para verificar que las cuentas padre no se usen en transacciones
CREATE OR REPLACE FUNCTION prevent_parent_account_transactions()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT is_parent FROM accounts WHERE id = NEW.account_id) = TRUE THEN
    RAISE EXCEPTION 'No se pueden usar cuentas padre en asientos contables';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para validar antes de insertar líneas de asiento
CREATE TRIGGER prevent_parent_account_transactions_trigger
BEFORE INSERT OR UPDATE ON journal_entry_items
FOR EACH ROW
EXECUTE FUNCTION prevent_parent_account_transactions(); 