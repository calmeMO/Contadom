-- Migración para tablas de ajustes contables

-- Añadir campo is_depreciable a la tabla accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_depreciable BOOLEAN DEFAULT FALSE;

-- Añadir campo is_adjustment a la tabla journal_entries
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_adjustment BOOLEAN DEFAULT FALSE;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS adjustment_template_id UUID;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS adjustment_type TEXT;

-- Crear tabla para plantillas de ajustes
CREATE TABLE IF NOT EXISTS adjustment_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  debit_account_id UUID REFERENCES accounts(id),
  credit_account_id UUID REFERENCES accounts(id),
  is_system BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_amount NUMERIC DEFAULT 0
);

-- Añadir campos a account_adjustments para depreciación
ALTER TABLE account_adjustments ADD COLUMN IF NOT EXISTS acquisition_date DATE;
ALTER TABLE account_adjustments ADD COLUMN IF NOT EXISTS acquisition_value NUMERIC DEFAULT 0;
ALTER TABLE account_adjustments ADD COLUMN IF NOT EXISTS residual_value NUMERIC DEFAULT 0;
ALTER TABLE account_adjustments ADD COLUMN IF NOT EXISTS useful_life_years INTEGER DEFAULT 5;
ALTER TABLE account_adjustments ADD COLUMN IF NOT EXISTS depreciation_method TEXT DEFAULT 'linear';
ALTER TABLE account_adjustments ADD COLUMN IF NOT EXISTS last_depreciation_date DATE;

-- Añadir relaciones
ALTER TABLE journal_entries 
ADD CONSTRAINT fk_adjustment_template 
FOREIGN KEY (adjustment_template_id) 
REFERENCES adjustment_templates(id) 
ON DELETE SET NULL;

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_journal_entries_is_adjustment ON journal_entries(is_adjustment);
CREATE INDEX IF NOT EXISTS idx_account_adjustments_account_id ON account_adjustments(account_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_templates_type ON adjustment_templates(type);

-- Crear vista para ajustes pendientes
CREATE OR REPLACE VIEW pending_adjustments AS
SELECT 
  je.id,
  je.date,
  je.description,
  je.is_approved,
  je.is_adjustment,
  at.name as template_name,
  at.type as adjustment_type,
  je.total_debit as amount,
  ap.name as period_name
FROM 
  journal_entries je
LEFT JOIN
  adjustment_templates at ON je.adjustment_template_id = at.id
LEFT JOIN
  accounting_periods ap ON je.accounting_period_id = ap.id
WHERE
  je.is_adjustment = TRUE
AND
  je.is_approved = FALSE
ORDER BY
  je.date DESC; 