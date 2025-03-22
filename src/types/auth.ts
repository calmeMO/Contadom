export interface User {
  id: string;
  email: string;
  role: 'admin' | 'accountant' | 'user';
  created_at: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}