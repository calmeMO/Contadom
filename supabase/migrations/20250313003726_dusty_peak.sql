/*
  # Fix Journal Entry Items Schema

  1. Changes
    - Rename entry_id to journal_entry_id to match application code
    - Ensure foreign key constraint is maintained
    - Add indexes for better performance

  2. Notes
    - This aligns the database schema with the application code expectations
    - Maintains data integrity with proper constraints
*/

-- Rename column and update foreign key
ALTER TABLE journal_entry_items 
  RENAME COLUMN entry_id TO journal_entry_id;

-- Add index for the renamed column
CREATE INDEX IF NOT EXISTS idx_journal_entry_items_journal_entry 
  ON journal_entry_items(journal_entry_id);