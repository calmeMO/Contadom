import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { 
  Calendar, 
  Wallet, 
  BookOpen, 
  FileText,
  TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AccountingPeriodWidget } from '../components/ui/AccountingPeriodWidget';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    journalEntries: 0,
    accountsCount: 0,
    pendingApprovals: 0,
    openPeriods: 0
  });
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    getCurrentUser();
    fetchDashboardData();
  }, []);

  async function getCurrentUser() {
    try {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  }

  async function fetchDashboardData() {
    try {
      setLoading(true);
      
      // Contar asientos contables
      const { count: journalCount, error: journalError } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true });
        
      if (journalError) throw journalError;
      
      // Contar cuentas contables
      const { count: accountsCount, error: accountsError } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true });
        
      if (accountsError) throw accountsError;
      
      // Contar asientos pendientes de aprobación
      const { count: pendingCount, error: pendingError } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('is_approved', false)
        .neq('status', 'voided');
        
      if (pendingError) throw pendingError;
      
      // Contar períodos mensuales abiertos y activos
      const { count: periodsCount, error: periodsError } = await supabase
        .from('monthly_accounting_periods')
        .select('*', { count: 'exact', head: true })
        .eq('is_closed', false)
        .eq('is_active', true);
        
      if (periodsError) throw periodsError;
      
      setStats({
        journalEntries: journalCount || 0,
        accountsCount: accountsCount || 0,
        pendingApprovals: pendingCount || 0,
        openPeriods: periodsCount || 0
      });
      
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      toast.error(`Error: ${error.message || 'No se pudieron cargar los datos del dashboard'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Vista general de su sistema contable
        </p>
      </div>
      
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white shadow-sm rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <FileText className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Asientos Contables</p>
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? '...' : stats.journalEntries}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white shadow-sm rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Cuentas Contables</p>
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? '...' : stats.accountsCount}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white shadow-sm rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
              <Calendar className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Períodos Abiertos</p>
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? '...' : stats.openPeriods}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white shadow-sm rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-red-100 text-red-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pendientes de Aprobación</p>
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? '...' : stats.pendingApprovals}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget de período contable */}
        <div className="lg:col-span-1">
          <AccountingPeriodWidget />
        </div>
        
        {/* Enlaces rápidos */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow-sm rounded-lg p-6 h-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Acciones Rápidas</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link 
                to="/journal"
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center"
              >
                <FileText className="h-5 w-5 text-blue-500 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-900">Libro Diario</h4>
                  <p className="text-sm text-gray-500">Administre sus asientos contables</p>
                </div>
              </Link>
              
              <Link 
                to="/accounts"
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center"
              >
                <BookOpen className="h-5 w-5 text-green-500 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-900">Cuentas Contables</h4>
                  <p className="text-sm text-gray-500">Administre su catálogo de cuentas</p>
                </div>
              </Link>
              
              <Link 
                to="/trial-balance"
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center"
              >
                <TrendingUp className="h-5 w-5 text-purple-500 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-900">Balance de Comprobación</h4>
                  <p className="text-sm text-gray-500">Verifique el balance de sus cuentas</p>
                </div>
              </Link>
              
              <Link 
                to="/financial-statements"
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center"
              >
                <Wallet className="h-5 w-5 text-amber-500 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-900">Estados Financieros</h4>
                  <p className="text-sm text-gray-500">Vea sus informes financieros</p>
                </div>
              </Link>
            </div>
            
            {stats.pendingApprovals > 0 && (
              <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      Tienes {stats.pendingApprovals} asientos pendientes de aprobación. 
                      <Link to="/journal?status=pendiente&excludeVoided=true" className="font-medium text-yellow-700 underline ml-1">Ver asientos</Link>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 