-- Migración para Proceso de Cierre Contable

-- Añadir columnas para asientos de cierre en journal_entries
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_closing_entry BOOLEAN DEFAULT FALSE;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS closing_entry_type TEXT;

-- Añadir índice para mejorar el rendimiento de consultas
CREATE INDEX IF NOT EXISTS idx_journal_entries_is_closing_entry ON journal_entries(is_closing_entry);

-- Asegurar que existan las columnas para el cierre de períodos en accounting_periods
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS is_reopened BOOLEAN DEFAULT FALSE;
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES auth.users(id);
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS reclosed_at TIMESTAMPTZ;
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS reclosed_by UUID REFERENCES auth.users(id);

-- Crear una vista para asientos de cierre
CREATE OR REPLACE VIEW closing_entries AS
SELECT 
  je.id,
  je.accounting_period_id,
  je.date,
  je.description,
  je.closing_entry_type,
  je.total_debit,
  je.total_credit,
  je.created_at,
  je.created_by,
  u.email as created_by_email,
  ap.name as period_name,
  ap.start_date as period_start_date,
  ap.end_date as period_end_date
FROM 
  journal_entries je
INNER JOIN
  accounting_periods ap ON je.accounting_period_id = ap.id
LEFT JOIN
  auth.users u ON je.created_by = u.id
WHERE
  je.is_closing_entry = TRUE
ORDER BY
  je.date DESC; 