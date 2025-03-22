import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Journal } from './pages/Journal';
import { Ledger } from './pages/Ledger';
import { Balance } from './pages/Balance';
import { Periods } from './pages/Periods';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <Router basename="/contadom">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/*"
            element={
              <AuthGuard>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/accounts" element={<Accounts />} />
                    <Route path="/journal" element={<Journal />} />
                    <Route path="/ledger" element={<Ledger />} />
                    <Route path="/balance" element={<Balance />} />
                    <Route path="/periods" element={<Periods />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Layout>
              </AuthGuard>
            }
          />
        </Routes>
        <ToastContainer position="top-right" />
      </AuthProvider>
    </Router>
  );
}

export default App;