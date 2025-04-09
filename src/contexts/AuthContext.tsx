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

  // Función para obtener perfil del usuario con su rol
  const getUserProfile = async (userId: string): Promise<{ role: 'admin' | 'accountant' | 'user'; full_name?: string }> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role, full_name')
        .eq('id', userId)
        .single();
        
      if (error) throw error;
      return { 
        role: (data?.role as 'admin' | 'accountant' | 'user') || 'user', 
        full_name: data?.full_name 
      };
    } catch (error) {
      console.error('Error al obtener perfil de usuario:', error);
      return { role: 'user' };
    }
  };

  // Función para actualizar el estado de la autenticación con datos completos
  const updateAuthState = async (session: any | null) => {
    if (session?.user) {
      // Obtener el rol del perfil del usuario
      const profile = await getUserProfile(session.user.id);
      
      setAuthState({
        user: {
          id: session.user.id,
          email: session.user.email!,
          role: profile.role,
          full_name: profile.full_name,
          created_at: session.user.created_at,
        },
        loading: false,
      });
    } else {
      setAuthState({ user: null, loading: false });
    }
  };

  useEffect(() => {
    // Check active sessions and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      updateAuthState(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        updateAuthState(session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setAuthState((prev) => ({ ...prev, loading: true }));
    try {
      // Usar nuestra función personalizada que verifica el estado de la cuenta
      // en lugar de llamar directamente a supabase.auth.signInWithPassword
      const authData = await import('../lib/auth').then(module => 
        module.signInWithEmailPassword(email, password)
      );

      if (!authData || !authData.user) {
        throw new Error('Error al iniciar sesión: no se pudo autenticar');
      }

      // El estado se actualizará automáticamente a través del listener onAuthStateChange
    } catch (error: any) {
      console.error('Error al iniciar sesión:', error.message);
      setAuthState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  const signOut = async () => {
    setAuthState((prev) => ({ ...prev, loading: true }));
    try {
      await supabase.auth.signOut();
      // El estado se actualizará automáticamente a través del listener onAuthStateChange
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      setAuthState((prev) => ({ ...prev, loading: false }));
    }
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