export interface User {
  id: string;
  email: string;
  role: 'admin' | 'accountant' | 'user';
  full_name?: string;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}