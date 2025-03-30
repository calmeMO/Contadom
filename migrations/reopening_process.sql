-- Migración para Proceso de Reapertura de Períodos

-- Añadir columnas para asientos de apertura en journal_entries
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_opening_entry BOOLEAN DEFAULT FALSE;

-- Añadir índice para mejorar el rendimiento de consultas
CREATE INDEX IF NOT EXISTS idx_journal_entries_is_opening_entry ON journal_entries(is_opening_entry);

-- Añadir columna para indicar si un período tiene saldos iniciales
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS has_opening_balances BOOLEAN DEFAULT FALSE;

-- Crear una vista para asientos de apertura
CREATE OR REPLACE VIEW opening_entries AS
SELECT 
  je.id,
  je.accounting_period_id,
  je.date,
  je.description,
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
  je.is_opening_entry = TRUE
ORDER BY
  je.date DESC; 