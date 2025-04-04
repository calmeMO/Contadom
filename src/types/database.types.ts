export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          code: string
          name: string
          type: string
          nature: string
          is_active: boolean
          description?: string
          category_id?: string
          parent_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          type: string
          nature: string
          is_active?: boolean
          description?: string
          category_id?: string
          parent_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          type?: string
          nature?: string
          is_active?: boolean
          description?: string
          category_id?: string
          parent_id?: string
          updated_at?: string
          updated_by?: string
        }
      }
      journal_entries: {
        Row: {
          id: string
          entry_number: string
          date: string
          description: string
          accounting_period_id: string
          is_posted: boolean
          is_approved: boolean
          is_balanced: boolean
          is_closing_entry?: boolean
          is_opening_entry?: boolean
          closing_entry_type?: string
          total_debit: number
          total_credit: number
          notes?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          updated_by?: string
          approved_by?: string
          approved_at?: string
        }
        Insert: {
          id?: string
          entry_number: string
          date: string
          description: string
          accounting_period_id: string
          is_posted?: boolean
          is_approved?: boolean
          is_balanced?: boolean
          is_closing_entry?: boolean
          is_opening_entry?: boolean
          closing_entry_type?: string
          total_debit: number
          total_credit: number
          notes?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          updated_by?: string
          approved_by?: string
          approved_at?: string
        }
        Update: {
          id?: string
          entry_number?: string
          date?: string
          description?: string
          accounting_period_id?: string
          is_posted?: boolean
          is_approved?: boolean
          is_balanced?: boolean
          is_closing_entry?: boolean
          is_opening_entry?: boolean
          closing_entry_type?: string
          total_debit?: number
          total_credit?: number
          notes?: string
          updated_at?: string
          updated_by?: string
          approved_by?: string
          approved_at?: string
        }
      }
      accounting_periods: {
        Row: {
          id: string
          name: string
          year: number
          period_number: number
          start_date: string
          end_date: string
          is_closed: boolean
          is_locked: boolean
          closed_at?: string
          closed_by?: string
          reopened_at?: string
          reopened_by?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
        Insert: {
          id?: string
          name: string
          year: number
          period_number: number
          start_date: string
          end_date: string
          is_closed?: boolean
          is_locked?: boolean
          closed_at?: string
          closed_by?: string
          reopened_at?: string
          reopened_by?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          id?: string
          name?: string
          year?: number
          period_number?: number
          start_date?: string
          end_date?: string
          is_closed?: boolean
          is_locked?: boolean
          closed_at?: string
          closed_by?: string
          reopened_at?: string
          reopened_by?: string
          updated_at?: string
          updated_by?: string
        }
      }
    }
    Functions: {
      update_closing_schema: {
        Args: Record<string, never>
        Returns: void
      }
      verify_period_ready_for_closing: {
        Args: { p_period_id: string }
        Returns: { ready: boolean; message: string }[]
      }
      get_income_balances: {
        Args: { p_period_id: string }
        Returns: { id: string; code: string; name: string; balance: number }[]
      }
      get_expense_balances: {
        Args: { p_period_id: string }
        Returns: { id: string; code: string; name: string; balance: number }[]
      }
    }
  }
} 