import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AuthState, User } from '../types/auth';

// Crear el contexto en un archivo separado
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

// Componente proveedor
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    // Check active sessions and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthState({
          user: {
            id: session.user.id,
            email: session.user.email!,
            role: 'user', // Default role, should be fetched from user_profiles table
            created_at: session.user.created_at,
          },
          loading: false,
        });
      } else {
        setAuthState({ user: null, loading: false });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setAuthState({
            user: {
              id: session.user.id,
              email: session.user.email!,
              role: 'user',
              created_at: session.user.created_at,
            },
            loading: false,
          });
        } else {
          setAuthState({ user: null, loading: false });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ ...authState, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook para usar el contexto en un archivo separado
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};