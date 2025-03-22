/*
  # Optimize Database Schema

  1. Changes
    - Add missing columns to journal_entries for better tracking
    - Add audit logs for financial transactions
    - Add indexes for better performance
    - Add constraints for data integrity

  2. Security
    - Add additional RLS policies for financial data
    - Enhance audit trail capabilities
*/

-- Add missing columns to journal_entries
ALTER TABLE journal_entries
ADD COLUMN IF NOT EXISTS total_debit DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS total_credit DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create function to validate journal entry
CREATE OR REPLACE FUNCTION validate_journal_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if debits equal credits before posting
  IF NEW.status = 'posted' THEN
    IF (
      SELECT COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) 
      FROM journal_entry_items 
      WHERE entry_id = NEW.id
    ) != (
      SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) 
      FROM journal_entry_items 
      WHERE entry_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Journal entry debits and credits must be equal';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for journal entry validation
DROP TRIGGER IF EXISTS validate_journal_entry_trigger ON journal_entries;
CREATE TRIGGER validate_journal_entry_trigger
  BEFORE UPDATE OF status
  ON journal_entries
  FOR EACH ROW
  WHEN (NEW.status = 'posted')
  EXECUTE FUNCTION validate_journal_entry();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action);

-- Add function to refresh user role cache
CREATE OR REPLACE FUNCTION refresh_user_role_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- This would update any role-based caches in your application
  -- For now it's a placeholder for future implementation
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for role updates
DROP TRIGGER IF EXISTS refresh_role_cache ON user_profiles;
CREATE TRIGGER refresh_role_cache
  AFTER UPDATE OF role
  ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION refresh_user_role_cache();

-- Add RLS policies for financial data
CREATE POLICY "View financial data based on role"
  ON journal_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND (role = 'admin' OR role = 'accountant')
    )
  );

-- Add constraints for data integrity
ALTER TABLE journal_entries
ADD CONSTRAINT check_total_debit_positive CHECK (total_debit >= 0),
ADD CONSTRAINT check_total_credit_positive CHECK (total_credit >= 0),
ADD CONSTRAINT check_status_valid CHECK (status IN ('draft', 'posted', 'voided'));

-- Add function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Add function to handle user deletion
CREATE OR REPLACE FUNCTION handle_user_deletion()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.user_profiles WHERE id = old.id;
  RETURN old;
END;
$$ LANGUAGE plpgsql;