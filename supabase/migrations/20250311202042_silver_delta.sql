/*
  # Initial Schema for Accounting System

  1. New Tables
    - `user_profiles`: Extended user information and roles
    - `account_categories`: Categories for chart of accounts
    - `accounts`: Chart of accounts
    - `journal_entries`: Accounting transactions
    - `journal_entry_items`: Individual lines in journal entries
    - `accounting_periods`: Fiscal periods
    - `activity_logs`: User activity tracking

  2. Security
    - Enable RLS on all tables
    - Add policies for role-based access
    - Ensure data integrity with foreign key constraints

  3. Enums and Types
    - Account types
    - Transaction types
    - User roles
*/

-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'accountant', 'user');
CREATE TYPE account_type AS ENUM ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'costo', 'cuenta_orden');
CREATE TYPE account_nature AS ENUM ('deudora', 'acreedora');
CREATE TYPE entry_type AS ENUM ('debit', 'credit');

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Account categories table
CREATE TABLE IF NOT EXISTS account_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accounts table (Chart of Accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES account_categories(id),
  parent_id UUID REFERENCES accounts(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  type account_type NOT NULL,
  nature account_nature NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accounting periods table
CREATE TABLE IF NOT EXISTS accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_period_dates CHECK (end_date >= start_date)
);

-- Journal entries table
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number SERIAL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  period_id UUID NOT NULL REFERENCES accounting_periods(id),
  is_posted BOOLEAN NOT NULL DEFAULT false,
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal entry items table
CREATE TABLE IF NOT EXISTS journal_entry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  type entry_type NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
-- User Profiles
CREATE POLICY "Users can view their own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Account Categories
CREATE POLICY "All authenticated users can view account categories"
  ON account_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins and accountants can manage account categories"
  ON account_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- Accounts
CREATE POLICY "All authenticated users can view accounts"
  ON accounts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins and accountants can manage accounts"
  ON accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- Accounting Periods
CREATE POLICY "All authenticated users can view accounting periods"
  ON accounting_periods
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins and accountants can manage accounting periods"
  ON accounting_periods
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- Journal Entries
CREATE POLICY "All authenticated users can view journal entries"
  ON journal_entries
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins and accountants can manage journal entries"
  ON journal_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- Journal Entry Items
CREATE POLICY "All authenticated users can view journal entry items"
  ON journal_entry_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins and accountants can manage journal entry items"
  ON journal_entry_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- Activity Logs
CREATE POLICY "Users can view their own activity logs"
  ON activity_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all activity logs"
  ON activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create indexes for better performance
CREATE INDEX idx_accounts_category ON accounts(category_id);
CREATE INDEX idx_accounts_parent ON accounts(parent_id);
CREATE INDEX idx_journal_entries_period ON journal_entries(period_id);
CREATE INDEX idx_journal_entry_items_entry ON journal_entry_items(entry_id);
CREATE INDEX idx_journal_entry_items_account ON journal_entry_items(account_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- Función para asignar naturaleza por defecto según el tipo de cuenta
CREATE OR REPLACE FUNCTION set_default_account_nature()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.nature IS NULL THEN
    CASE NEW.type
      WHEN 'activo' THEN
        NEW.nature := 'deudora';
      WHEN 'gasto' THEN
        NEW.nature := 'deudora';
      WHEN 'costo' THEN
        NEW.nature := 'deudora';
      WHEN 'pasivo' THEN
        NEW.nature := 'acreedora';
      WHEN 'patrimonio' THEN
        NEW.nature := 'acreedora';
      WHEN 'ingreso' THEN
        NEW.nature := 'acreedora';
      ELSE
        NEW.nature := 'deudora'; -- valor por defecto para cuenta_orden
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para asignar naturaleza por defecto
CREATE TRIGGER set_account_nature
  BEFORE INSERT OR UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION set_default_account_nature();