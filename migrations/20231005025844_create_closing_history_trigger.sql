-- Crear tabla para registro histórico de cierres
CREATE TABLE IF NOT EXISTS closing_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id UUID NOT NULL,
    period_type VARCHAR NOT NULL,
    period_name VARCHAR NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by UUID NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_type VARCHAR NOT NULL,
    created_by UUID
);

-- Función para registrar historial de cierre
CREATE OR REPLACE FUNCTION record_closing_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.is_closed = FALSE AND NEW.is_closed = TRUE THEN
        -- Registrar cierre
        INSERT INTO closing_history (
            period_id, period_type, period_name, action_type, notes, created_by
        ) VALUES (
            NEW.id, 'monthly', NEW.month_name || ' ' || NEW.year, 'close', 'Período cerrado', NEW.closed_by
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.is_closed = TRUE AND NEW.is_closed = FALSE THEN
        -- Registrar reapertura
        INSERT INTO closing_history (
            period_id, period_type, period_name, action_type, notes, created_by
        ) VALUES (
            NEW.id, 'monthly', NEW.month_name || ' ' || NEW.year, 'reopen', 'Período reabierto', NEW.reopened_by
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para monthly_accounting_periods
DROP TRIGGER IF EXISTS closing_history_trigger ON monthly_accounting_periods;
CREATE TRIGGER closing_history_trigger
AFTER UPDATE ON monthly_accounting_periods
FOR EACH ROW
EXECUTE FUNCTION record_closing_history(); 