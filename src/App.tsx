import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Login } from './pages/Login';
// import Register from './pages/Register'; // Comentado hasta que exista
import Dashboard from './pages/Dashboard'; // Importamos el Dashboard real
import Journal from './pages/Journal';
import { Accounts } from './pages/Accounts';
import Settings from './pages/Settings';
import { Balance } from './pages/Balance';
import FinancialStatements from './pages/FinancialStatements';
import GeneralLedger from './pages/GeneralLedger';
import { Layout } from './components/Layout';
import { supabase } from './lib/supabase';
import { ToastContainer, toast } from 'react-toastify';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import 'react-toastify/dist/ReactToastify.css';
import { startSessionMonitoring, stopSessionMonitoring } from './lib/sessionMonitor';

// Componente para monitoreo de sesión
function SessionMonitor() {
  const navigate = useNavigate();
  
  useEffect(() => {
    const cleanup = startSessionMonitoring(
      // Callback cuando el usuario está inactivo
      () => {
        toast.warn('Su sesión está inactiva. Por favor, mueva el ratón o presione una tecla para continuar.', {
          autoClose: false,
          closeOnClick: true
        });
      },
      // Callback cuando la sesión ha expirado
      () => {
        toast.error('Su sesión ha expirado por inactividad. Por favor, inicie sesión nuevamente.', {
          onClose: () => navigate('/login')
        });
      }
    );
    
    // Limpiar al desmontar
    return () => {
      if (cleanup) cleanup();
    };
  }, [navigate]);
  
  return null;
}

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Suscribirse a cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        console.log('Usuario ha iniciado sesión', session);
        // Iniciar monitoreo de sesión cuando el usuario inicia sesión
        startSessionMonitoring(
          // Callback cuando el usuario está inactivo
          () => {
            toast.warn('Su sesión está inactiva. Por favor, mueva el ratón o presione una tecla para continuar.', {
              autoClose: false,
              closeOnClick: true
            });
          },
          // Callback cuando la sesión ha expirado
          () => {
            toast.error('Su sesión ha expirado por inactividad. Por favor, inicie sesión nuevamente.');
            supabase.auth.signOut();
          }
        );
      }
      
      if (event === 'SIGNED_OUT') {
        console.log('Usuario ha cerrado sesión');
        // Detener monitoreo de sesión cuando el usuario cierra sesión
        stopSessionMonitoring();
      }
    });

    // Limpiar suscripción al desmontar
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <Router>
      <AuthProvider>
        <ToastContainer position="top-right" autoClose={3000} />
        <SessionMonitor />
        <Routes>
          {/* Rutas públicas */}
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/dashboard" />} />
          
          {/* Layout principal - Requiere autenticación */}
          <Route path="/" element={session ? <Layout /> : <Navigate to="/login" />}>
            <Route index element={<Navigate to="/dashboard" />} />
            
            {/* Rutas accesibles para todos los roles */}
            <Route path="dashboard" element={<Dashboard />} />
            
            {/* Rutas accesibles para todos los roles (libros contables y reportes) */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'accountant', 'user']} />}>
              <Route path="financial-statements" element={<FinancialStatements />} />
              <Route path="general-ledger" element={<GeneralLedger />} />
              <Route path="balance" element={<Balance />} />
            </Route>
            
            {/* Rutas accesibles solo para admin y accountant */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'accountant']} />}>
              <Route path="journal" element={<Journal />} />
              <Route path="accounts" element={<Accounts />} />
            </Route>
            
            {/* Rutas accesibles solo para admin */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="settings" element={<Settings />} />
              <Route path="periods" element={<Navigate to="/settings?tab=fiscal-years" />} />
            </Route>
          </Route>
          
          {/* Ruta comodín para direcciones no encontradas */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;