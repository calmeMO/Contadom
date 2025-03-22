/*
  # Fix Journal Entry Items Schema

  1. Changes
    - Add debit and credit columns to journal_entry_items
    - Remove type and amount columns that were causing issues
    - Update constraints and indexes

  2. Notes
    - This aligns with the application code expectations
    - Maintains data integrity with check constraints
*/

-- Modify journal_entry_items table
ALTER TABLE journal_entry_items
  -- Remove old columns
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS amount,
  -- Add new columns
  ADD COLUMN debit DECIMAL(15,2) DEFAULT 0 CHECK (debit >= 0),
  ADD COLUMN credit DECIMAL(15,2) DEFAULT 0 CHECK (credit >= 0),
  -- Add constraint to ensure either debit or credit is used, not both
  ADD CONSTRAINT check_debit_credit_exclusive 
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0));

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_journal_entry_items_amounts 
  ON journal_entry_items(debit, credit);