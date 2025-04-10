-- Función para registrar historial de cierre de años fiscales
CREATE OR REPLACE FUNCTION record_fiscal_years_closing_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.is_closed = FALSE AND NEW.is_closed = TRUE THEN
        -- Registrar cierre
        INSERT INTO closing_history (
            period_id, period_type, period_name, action_type, notes, created_by
        ) VALUES (
            NEW.id, 'fiscal_year', 'Año Fiscal ' || NEW.year, 'close', 'Año fiscal cerrado', NEW.closed_by
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.is_closed = TRUE AND NEW.is_closed = FALSE THEN
        -- Registrar reapertura
        INSERT INTO closing_history (
            period_id, period_type, period_name, action_type, notes, created_by
        ) VALUES (
            NEW.id, 'fiscal_year', 'Año Fiscal ' || NEW.year, 'reopen', 'Año fiscal reabierto', NEW.reopened_by
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para fiscal_years
DROP TRIGGER IF EXISTS fiscal_years_closing_history_trigger ON fiscal_years;
CREATE TRIGGER fiscal_years_closing_history_trigger
AFTER UPDATE ON fiscal_years
FOR EACH ROW
EXECUTE FUNCTION record_fiscal_years_closing_history(); 