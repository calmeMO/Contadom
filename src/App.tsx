import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
// import Register from './pages/Register'; // Comentado hasta que exista
import Dashboard from './pages/Dashboard'; // Importamos el Dashboard real
import Journal from './pages/Journal';
import { Accounts } from './pages/Accounts';
import Settings from './pages/Settings';
import { Balance } from './pages/Balance';
import FinancialStatements from './pages/FinancialStatements';
import ClosingProcess from './pages/ClosingProcess';
import GeneralLedger from './pages/GeneralLedger';
import { Layout } from './components/Layout';
import { supabase } from './lib/supabase';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import 'react-toastify/dist/ReactToastify.css';

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

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <Router>
      <AuthProvider>
        <ToastContainer />
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
              <Route path="closing" element={<ClosingProcess />} />
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