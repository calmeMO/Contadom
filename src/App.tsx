import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
// import Register from './pages/Register'; // Comentado hasta que exista
import Dashboard from './pages/Dashboard'; // Importamos el Dashboard real
import { Ledger } from './pages/Ledger';
import Journal from './pages/Journal';
import { Accounts } from './pages/Accounts';
import Settings from './pages/Settings';
import { Layout } from './components/Layout';
import { supabase } from './lib/supabase';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from './contexts/AuthContext';
import 'react-toastify/dist/ReactToastify.css';
import { TrialBalance } from './pages/TrialBalance';
import { FinancialStatements } from './pages/FinancialStatements';
import { Adjustments } from './pages/Adjustments';
import { ClosingProcess } from './pages/ClosingProcess';
import { PeriodReopening } from './pages/PeriodReopening';
import { FinancialAnalysis } from "./pages/FinancialAnalysis";

// Importar Balance si existe, o crear un componente temporal
const Balance = () => (
  <div>
    <h1>Balanza de Comprobación</h1>
    <p>Esta página está en construcción</p>
  </div>
);

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
    <Router basename="/contadom">
      <AuthProvider>
        <ToastContainer />
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/journal" />} />
          {/* <Route path="/register" element={!session ? <Register /> : <Navigate to="/" />} /> */}
          <Route path="/" element={session ? <Layout /> : <Navigate to="/login" />}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="journal" element={<Journal />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="periods" element={<Navigate to="/settings?tab=fiscal-years" />} />
            <Route path="settings" element={<Settings />} />
            <Route path="balance" element={<Navigate to="/trial-balance" />} />
            <Route path="trial-balance" element={<TrialBalance />} />
            <Route path="financial-statements" element={<FinancialStatements />} />
            <Route path="adjustments" element={<Adjustments />} />
            <Route path="closing-process" element={<ClosingProcess />} />
            <Route path="period-reopening" element={<PeriodReopening />} />
            <Route path="financial-analysis" element={<FinancialAnalysis />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;