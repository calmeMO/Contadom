export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at?: string;
  closed_by?: string;
  has_opening_balances: boolean;
  has_closing_entries: boolean;
  created_at: string;
  created_by: string;
  updated_at?: string;
  updated_by?: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_id?: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  updated_at?: string;
  updated_by?: string;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  accounting_period_id: string;
  is_approved: boolean;
  is_posted: boolean;
  is_closing_entry?: boolean;
  is_opening_entry?: boolean;
  total_debit: number;
  total_credit: number;
  notes?: string;
  approved_at?: string;
  approved_by?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  updated_by?: string;
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  updated_by?: string;
  account?: Account;
}

export interface FinancialStatement {
  id: string;
  period_id: string;
  type: FinancialStatementType;
  data: Record<string, any>;
  generated_at: string;
  generated_by: string;
}

export type FinancialStatementType = 'balance_sheet' | 'income_statement' | 'cash_flow' | 'changes_in_equity'; 