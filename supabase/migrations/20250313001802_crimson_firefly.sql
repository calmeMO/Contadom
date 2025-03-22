/*
  # Fix Entry Number Column Type

  1. Changes
    - Change entry_number column type from SERIAL to TEXT
    - Remove SERIAL sequence since we'll use custom formatted numbers
    - Ensure existing data is preserved

  2. Notes
    - This allows alphanumeric entry numbers like "A-068648"
    - Maintains uniqueness constraint
*/

ALTER TABLE journal_entries 
  ALTER COLUMN entry_number TYPE TEXT,
  ALTER COLUMN entry_number DROP DEFAULT;

-- Add unique constraint to ensure no duplicate entry numbers
ALTER TABLE journal_entries
  ADD CONSTRAINT unique_entry_number UNIQUE (entry_number);