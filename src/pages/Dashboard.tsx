import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  Loader,
  Calendar,
  FileText,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format, startOfMonth, endOfMonth, parseISO, formatDistance } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';

type DashboardStats = {
  monthlyRevenue: number;
  monthlyExpenses: number;
  totalAssets: number;
  totalLiabilities: number;
  pendingEntries: number;
  netWorth: number;
};

type ActivityItem = {
  id: string;
  date: string;
  entry_number: string;
  description: string;
  total_debit: number;
  created_at: string;
  is_posted: boolean;
};

type RevenueItem = {
  credit: number;
  journal_entries: {
    date: string;
    accounting_period_id: string;
  }[];
  accounts: {
    type: string;
  }[];
};

type ExpenseItem = {
  debit: number;
  journal_entries: {
    date: string;
    accounting_period_id: string;
  }[];
  accounts: {
    type: string;
  }[];
};

type JournalEntryItem = {
  account_id: string;
  debit?: number;
  credit?: number;
  journal_entries?: {
    date: string;
  }[];
};

export function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    pendingEntries: 0,
    netWorth: 0
  });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [errors, setErrors] = useState({
    revenue: false,
    expense: false,
    assets: false,
    liabilities: false,
    pending: false,
    activity: false
  });

  // Función para obtener el rango de fechas del mes actual
  function getMonthDateRange() {
    const today = new Date();
    const start = startOfMonth(today);
    const end = endOfMonth(today);
    
    console.log('Fecha actual:', today);
    console.log('Inicio del mes:', start);
    console.log('Fin del mes:', end);
    
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      monthName: format(today, 'MMMM yyyy', { locale: es })
    };
  }

  // Convertir fetchDashboardStats y fetchRecentActivity a useCallback
  const fetchDashboardStats = useCallback(async () => {
    try {
      setLoading(true);
      // Resetear errores al iniciar
      setErrors(prev => ({
        ...prev,
        revenue: false,
        expense: false,
        assets: false,
        liabilities: false,
        pending: false
      }));

      const { start, end } = getMonthDateRange();
      console.log('Período de consulta:', start, 'a', end);

      // Objeto para almacenar los resultados
      const results = {
        monthlyRevenue: 0,
        monthlyExpenses: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        pendingEntries: 0
      };

      // 1. Ingresos del mes
      try {
        console.log('Consultando ingresos del mes...');
        const { data: revenueData, error: revenueError } = await supabase
          .from('journal_entry_items')
          .select(`
            credit,
            journal_entries!inner (
              date,
              accounting_period_id
            ),
            accounts!inner (
              type
            )
          `)
          .eq('accounts.type', 'ingreso')
          .gte('journal_entries.date', start)
          .lte('journal_entries.date', end);

        if (revenueError) {
          console.error('Error de Supabase al obtener ingresos:', revenueError);
          throw revenueError;
        }

        console.log('Datos de ingresos obtenidos:', revenueData);
        
        if (revenueData && revenueData.length > 0) {
          const filteredData = (revenueData as RevenueItem[])
            .filter(item => item.credit > 0);
          console.log('Datos filtrados de ingresos:', filteredData);
          
          results.monthlyRevenue = filteredData.reduce((sum, item) => {
            const amount = item.credit || 0;
            console.log('Sumando ingreso:', amount);
            return sum + amount;
          }, 0);
          console.log('Ingresos calculados:', results.monthlyRevenue);
        } else {
          console.log('No se encontraron ingresos para el período');
        }
      } catch (error) {
        console.error('Error fetching revenue stats:', error);
        setErrors(prev => ({ ...prev, revenue: true }));
        toast.error('Error al cargar los ingresos del mes');
      }

      // 2. Gastos del mes
      try {
        console.log('Consultando gastos del mes...');
        const { data: expenseData, error: expenseError } = await supabase
          .from('journal_entry_items')
          .select(`
            debit,
            journal_entries!inner (
              date,
              accounting_period_id
            ),
            accounts!inner (
              type
            )
          `)
          .eq('accounts.type', 'gasto')
          .gte('journal_entries.date', start)
          .lte('journal_entries.date', end);

        if (expenseError) {
          console.error('Error de Supabase al obtener gastos:', expenseError);
          throw expenseError;
        }

        console.log('Datos de gastos obtenidos:', expenseData);
        
        if (expenseData && expenseData.length > 0) {
          const filteredData = (expenseData as ExpenseItem[])
            .filter(item => item.debit > 0);
          console.log('Datos filtrados de gastos:', filteredData);
          
          results.monthlyExpenses = filteredData.reduce((sum, item) => {
            const amount = item.debit || 0;
            console.log('Sumando gasto:', amount);
            return sum + amount;
          }, 0);
          console.log('Gastos calculados:', results.monthlyExpenses);
        } else {
          console.log('No se encontraron gastos para el período');
        }
      } catch (error) {
        console.error('Error fetching expense stats:', error);
        setErrors(prev => ({ ...prev, expense: true }));
        toast.error('Error al cargar los gastos del mes');
      }

      // 3. Activos
      try {
        console.log('Consultando activos...');
        const { data: assetsData, error: assetsError } = await supabase
          .from('accounts')
          .select('id, name, type')
          .eq('type', 'activo')
          .eq('is_active', true);

        if (assetsError) {
          console.error('Error de Supabase al obtener activos:', assetsError);
          throw assetsError;
        }

        console.log('Datos de activos obtenidos:', assetsData);

        // Obtener los IDs de todas las cuentas de activos
        const assetIds = assetsData.map(account => account.id);
        console.log('IDs de cuentas de activos:', assetIds);
        
        if (assetIds.length > 0) {
          const { data: assetMovements, error: movementsError } = await supabase
            .from('journal_entry_items')
            .select(`
              account_id,
              debit,
              credit,
              journal_entries!inner (
                date
              )
            `)
            .in('account_id', assetIds)
            .order('journal_entries(date)', { ascending: true });

          if (movementsError) {
            console.error('Error de Supabase al obtener movimientos de activos:', movementsError);
            throw movementsError;
          }

          console.log('Movimientos de activos obtenidos:', assetMovements);

          // Calcular el balance para cada cuenta de activo
          const assetBalances: Record<string, number> = {};
          (assetMovements as JournalEntryItem[]).forEach(movement => {
            const accountId = movement.account_id;
            if (!assetBalances[accountId]) {
              assetBalances[accountId] = 0;
            }
            const debit = movement.debit || 0;
            const credit = movement.credit || 0;
            assetBalances[accountId] += debit - credit;
            console.log(`Balance para cuenta ${accountId}:`, assetBalances[accountId]);
          });

          // Sumar solo los balances positivos para activos
          results.totalAssets = Object.values(assetBalances).reduce((sum: number, balance: number) => {
            const positiveBalance = balance > 0 ? balance : 0;
            console.log('Sumando balance positivo de activo:', positiveBalance);
            return sum + positiveBalance;
          }, 0);
          console.log('Total de activos calculado:', results.totalAssets);
        } else {
          console.log('No se encontraron cuentas de activos');
        }
      } catch (error) {
        console.error('Error fetching assets stats:', error);
        setErrors(prev => ({ ...prev, assets: true }));
        toast.error('Error al cargar los activos');
      }

      // 4. Pasivos
      try {
        console.log('Consultando pasivos...');
        const { data: liabilitiesData, error: liabilitiesError } = await supabase
          .from('accounts')
          .select('id, name, type')
          .eq('type', 'pasivo')
          .eq('is_active', true);

        if (liabilitiesError) {
          console.error('Error de Supabase al obtener pasivos:', liabilitiesError);
          throw liabilitiesError;
        }

        console.log('Datos de pasivos obtenidos:', liabilitiesData);

        // Obtener los IDs de todas las cuentas de pasivos
        const liabilityIds = liabilitiesData.map(account => account.id);
        console.log('IDs de cuentas de pasivos:', liabilityIds);
        
        if (liabilityIds.length > 0) {
          const { data: liabilityMovements, error: liabMovementsError } = await supabase
            .from('journal_entry_items')
            .select(`
              account_id,
              debit,
              credit,
              journal_entries!inner (
                date
              )
            `)
            .in('account_id', liabilityIds)
            .order('journal_entries(date)', { ascending: true });

          if (liabMovementsError) {
            console.error('Error de Supabase al obtener movimientos de pasivos:', liabMovementsError);
            throw liabMovementsError;
          }

          console.log('Movimientos de pasivos obtenidos:', liabilityMovements);

          // Calcular el balance para cada cuenta de pasivo
          const liabilityBalances: Record<string, number> = {};
          (liabilityMovements as JournalEntryItem[]).forEach(movement => {
            const accountId = movement.account_id;
            if (!liabilityBalances[accountId]) {
              liabilityBalances[accountId] = 0;
            }
            const debit = movement.debit || 0;
            const credit = movement.credit || 0;
            liabilityBalances[accountId] += credit - debit;
            console.log(`Balance para cuenta ${accountId}:`, liabilityBalances[accountId]);
          });

          // Sumar solo los balances positivos para pasivos
          results.totalLiabilities = Object.values(liabilityBalances).reduce((sum: number, balance: number) => {
            const positiveBalance = balance > 0 ? balance : 0;
            console.log('Sumando balance positivo de pasivo:', positiveBalance);
            return sum + positiveBalance;
          }, 0);
          console.log('Total de pasivos calculado:', results.totalLiabilities);
        } else {
          console.log('No se encontraron cuentas de pasivos');
        }
      } catch (error) {
        console.error('Error fetching liabilities stats:', error);
        setErrors(prev => ({ ...prev, liabilities: true }));
        toast.error('Error al cargar los pasivos');
      }

      // 5. Contar asientos pendientes
      try {
        console.log('Consultando asientos pendientes...');
        const { count, error: pendingError } = await supabase
          .from('journal_entries')
          .select('*', { count: 'exact', head: true })
          .eq('is_posted', false);

        if (pendingError) {
          console.error('Error de Supabase al obtener asientos pendientes:', pendingError);
          throw pendingError;
        }
        
        results.pendingEntries = count || 0;
        console.log('Asientos pendientes:', results.pendingEntries);
      } catch (error) {
        console.error('Error fetching pending entries:', error);
        setErrors(prev => ({ ...prev, pending: true }));
        toast.error('Error al cargar los asientos pendientes');
      }

      // Actualizar el estado con todos los resultados
      setStats({
        ...results,
        netWorth: results.totalAssets - results.totalLiabilities
      });
    } catch (error) {
      console.error('Error general en dashboard stats:', error);
      toast.error('Error al cargar estadísticas del dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentActivity = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('id, date, entry_number, description, total_debit, created_at, is_posted')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentActivity(data || []);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      toast.error('Error al cargar actividad reciente');
      setErrors(prev => ({ ...prev, activity: true }));
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();
    fetchRecentActivity();
  }, [fetchDashboardStats, fetchRecentActivity]);

  // Función para formatear moneda
  function formatCurrency(amount: number) {
    return amount.toLocaleString('es-DO', { 
      style: 'currency', 
      currency: 'DOP',
      minimumFractionDigits: 2
    });
  }

  // Función para renderizar el tiempo relativo
  function getRelativeTime(dateString: string) {
    try {
      const date = parseISO(dateString);
      return formatDistance(date, new Date(), { 
        addSuffix: true,
        locale: es 
      });
    } catch {
      return 'Fecha desconocida';
    }
  }

  const { monthName } = getMonthDateRange();

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchDashboardStats();
      await fetchRecentActivity();
      toast.success('Dashboard actualizado');
    } catch {
      toast.error('Error al actualizar el dashboard');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Bienvenido, {user?.email}
        </h1>
        {loading ? (
          <div className="flex items-center text-sm text-gray-500">
            <Loader className="h-4 w-4 mr-2 animate-spin" />
            Cargando datos...
          </div>
        ) : (
          <div className="flex items-center">
            <div className="text-sm text-gray-500 mr-4">
              <Calendar className="h-4 w-4 inline-block mr-1" /> 
              {monthName}
            </div>
            <button 
              onClick={handleRefresh} 
              className="text-xs flex items-center text-blue-500 hover:text-blue-700"
              disabled={refreshing}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando...' : 'Actualizar datos'}
            </button>
          </div>
        )}
      </div>

      {(errors.revenue || errors.expense || errors.assets || errors.liabilities || errors.pending) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">
                Error al cargar algunas estadísticas
              </h3>
              <div className="mt-1 text-sm text-red-700">
                <ul className="list-disc pl-5 space-y-1">
                  {errors.revenue && <li>No se pudieron cargar los ingresos del mes</li>}
                  {errors.expense && <li>No se pudieron cargar los gastos del mes</li>}
                  {errors.assets && <li>No se pudieron cargar los activos</li>}
                  {errors.liabilities && <li>No se pudieron cargar los pasivos</li>}
                  {errors.pending && <li>No se pudieron cargar los asientos pendientes</li>}
                </ul>
                <div className="mt-2">
                  Puedes intentar{' '}
                  <button 
                    onClick={handleRefresh} 
                    className="text-red-800 font-medium hover:underline"
                    disabled={refreshing}
                  >
                    actualizar los datos
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className={`h-6 w-6 ${loading ? 'text-gray-300 animate-pulse' : 'text-green-500'}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Ingresos del Mes
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {loading ? (
                      <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
                    ) : errors.revenue ? (
                      <div className="flex items-center">
                        <div className="text-sm text-red-500 mr-2">Error</div>
                        <button onClick={fetchDashboardStats} className="text-xs text-blue-500 hover:underline">
                          Reintentar
                        </button>
                      </div>
                    ) : (
                      formatCurrency(stats.monthlyRevenue)
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingDown className={`h-6 w-6 ${loading ? 'text-gray-300 animate-pulse' : 'text-red-500'}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Gastos del Mes
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {loading ? (
                      <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
                    ) : errors.expense ? (
                      <div className="text-sm text-red-500">Error al cargar</div>
                    ) : (
                      formatCurrency(stats.monthlyExpenses)
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className={`h-6 w-6 ${loading ? 'text-gray-300 animate-pulse' : 'text-blue-500'}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Balance General
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {loading ? (
                      <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
                    ) : errors.assets || errors.liabilities ? (
                      <div className="text-sm text-red-500">Error al cargar</div>
                    ) : (
                      formatCurrency(stats.netWorth)
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertCircle className={`h-6 w-6 ${loading ? 'text-gray-300 animate-pulse' : 'text-amber-500'}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Asientos Pendientes
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {loading ? (
                      <div className="h-6 w-12 bg-gray-200 rounded animate-pulse"></div>
                    ) : errors.pending ? (
                      <div className="text-sm text-red-500">Error al cargar</div>
                    ) : (
                      stats.pendingEntries
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Actividad Reciente
          </h3>
          <div className="mt-5">
            <div className="flow-root">
              {loading ? (
                // Skeleton loader para actividad reciente
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse"></div>
                      <div className="flex-1">
                        <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse mb-2"></div>
                        <div className="h-3 w-1/4 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : errors.activity ? (
                <div className="text-center py-6">
                  <AlertCircle className="mx-auto h-10 w-10 text-red-300" />
                  <div className="mt-2 text-sm text-red-500">
                    Error al cargar la actividad reciente
                  </div>
                  <button 
                    onClick={fetchRecentActivity} 
                    className="mt-2 px-3 py-1 text-xs text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-6">
                  <FileText className="mx-auto h-10 w-10 text-gray-300" />
                  <div className="mt-2 text-sm text-gray-500">
                    No hay actividad reciente
                  </div>
                </div>
              ) : (
                <ul className="-mb-8">
                  {recentActivity.map((activity, index) => (
                    <li key={activity.id} className="relative pb-8">
                      {index < recentActivity.length - 1 && (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        ></span>
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${activity.is_posted ? 'bg-green-500' : 'bg-blue-500'}`}>
                            <DollarSign className="h-5 w-5 text-white" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <div className="text-sm text-gray-500">
                              {activity.is_posted ? 'Asiento aprobado' : 'Nuevo asiento contable'}{' '}
                              <span className="font-medium text-gray-900">
                                {activity.entry_number}
                              </span>
                              <span className="ml-2 text-xs text-gray-400">
                                {formatCurrency(activity.total_debit)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-gray-500 line-clamp-1">
                              {activity.description}
                            </div>
                          </div>
                          <div className="text-right text-xs whitespace-nowrap text-gray-500">
                            {activity.created_at && (
                              <time dateTime={activity.created_at}>
                                {getRelativeTime(activity.created_at)}
                              </time>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Activos
            </h3>
            <div className="mt-2 flex items-baseline">
              <div className="text-2xl font-semibold text-gray-900">
                {loading ? (
                  <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(stats.totalAssets)
                )}
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              Valor total de los activos registrados en el sistema.
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Pasivos
            </h3>
            <div className="mt-2 flex items-baseline">
              <div className="text-2xl font-semibold text-gray-900">
                {loading ? (
                  <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(stats.totalLiabilities)
                )}
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              Valor total de los pasivos registrados en el sistema.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}