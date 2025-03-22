import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Filter, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  hasActivity?: boolean;  // Indica si la cuenta tiene movimientos aunque el balance sea cero
};

// Definir un tipo para los datos financieros
interface FinancialData {
  assets: Account[];
  liabilities: Account[];
  equity: Account[];
  revenue: Account[];
  expenses: Account[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export function Reports() {
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<{ id: string; name: string; start_date: string; end_date: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [periodDetails, setPeriodDetails] = useState<{ start_date: string; end_date: string } | null>(null);
  const [financialData, setFinancialData] = useState<FinancialData>({
    assets: [],
    liabilities: [],
    equity: [],
    revenue: [],
    expenses: [],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    netIncome: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPeriods();
  }, []);

  async function fetchPeriods() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('id, name, start_date, end_date')
        .order('start_date', { ascending: false });

      if (error) throw error;

      setPeriods(data || []);
      
      // Select the most recent period by default
      if (data && data.length > 0) {
        setSelectedPeriod(data[0].id);
      } else {
        toast.warning('No se encontraron periodos contables');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching periods:', error);
      toast.error('Error al cargar los periodos contables');
      setLoading(false);
    }
  }

  const fetchPeriodDetails = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('start_date, end_date')
        .eq('id', selectedPeriod)
        .single();

      if (error) throw error;
      setPeriodDetails(data);
    } catch (error) {
      console.error('Error fetching period details:', error);
      toast.error('Error al cargar detalles del periodo');
      setPeriodDetails(null);
      setLoading(false);
    }
  }, [selectedPeriod]);

  const fetchFinancialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!periodDetails) {
        throw new Error('No hay detalles del periodo seleccionado');
      }

      console.log('Periodo seleccionado:', {
        id: selectedPeriod,
        start_date: periodDetails.start_date,
        end_date: periodDetails.end_date
      });

      // Get all active accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      if (!accounts || accounts.length === 0) {
        throw new Error('No se encontraron cuentas activas');
      }

      console.log(`Encontradas ${accounts.length} cuentas activas`);

      // Verificar si hay asientos contables en este periodo
      const { count: journalEntriesCount, error: journalCountError } = await supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .gte('date', periodDetails.start_date)
        .lte('date', periodDetails.end_date);

      if (journalCountError) throw journalCountError;
      
      console.log(`Encontrados ${journalEntriesCount || 0} asientos en el periodo seleccionado`);
      
      if (journalEntriesCount === 0) {
        toast.info('No se encontraron asientos contables en el periodo seleccionado');
      }

      // Initialize data structure
      const data: FinancialData = {
        assets: [],
        liabilities: [],
        equity: [],
        revenue: [],
        expenses: [],
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        netIncome: 0,
      };

      let totalMovements = 0;

      // Process each account
      for (const account of accounts) {
        // Get all entries for this account in the selected period
        const { data: movements, error: movementsError } = await supabase
          .from('journal_entry_items')
          .select(`
            id,
            debit,
            credit,
            journal_entry:journal_entries(id, date, entry_number)
          `)
          .eq('account_id', account.id)
          .gte('journal_entry.date', periodDetails.start_date)
          .lte('journal_entry.date', periodDetails.end_date);

        if (movementsError) {
          console.error(`Error al obtener movimientos para cuenta ${account.code}:`, movementsError);
          throw movementsError;
        }

        if (!movements || movements.length === 0) continue;

        totalMovements += movements.length;
        console.log(`Cuenta ${account.code} (${account.name}): ${movements.length} movimientos`);

        const totalDebit = movements.reduce((sum, m) => sum + (m.debit || 0), 0);
        const totalCredit = movements.reduce((sum, m) => sum + (m.credit || 0), 0);
        
        // Calculate balance based on account type
        let balance = 0;
        if (account.type === 'activo' || account.type === 'gasto' || account.type === 'costo') {
          balance = totalDebit - totalCredit;
        } else {
          balance = totalCredit - totalDebit;
        }

        console.log(`Cuenta ${account.code} (${account.name}) - Tipo: ${account.type}`);
        console.log(`  - Total débito: ${totalDebit}, Total crédito: ${totalCredit}, Balance: ${balance}`);

        // Incluimos la cuenta si:
        // 1. Tiene balance distinto de cero, O
        // 2. Tiene movimientos (aunque el balance sea cero)
        if (Math.abs(balance) > 0.001 || movements.length > 0) {
          // Aunque el balance sea cero, necesitamos tener la referencia para incluirla en los reportes
          const accountData = {
            ...account,
            balance: Math.abs(balance),
            hasActivity: movements.length > 0
          };

          // Add to appropriate category
          switch (account.type) {
            case 'activo':
              data.assets.push(accountData);
              data.totalAssets += balance;
              break;
            case 'pasivo':
              data.liabilities.push(accountData);
              data.totalLiabilities += balance;
              break;
            case 'patrimonio':
              data.equity.push(accountData);
              data.totalEquity += balance;
              break;
            case 'ingreso':
              data.revenue.push(accountData);
              data.totalRevenue += balance;
              break;
            case 'gasto':
            case 'costo':
              data.expenses.push(accountData);
              data.totalExpenses += balance;
              break;
          }
        }
      }
      
      console.log(`Total de movimientos procesados: ${totalMovements}`);
      
      if (totalMovements === 0) {
        toast.warning('No se encontraron movimientos para las cuentas en este periodo');
      }
      
      // Calculate net income
      data.netIncome = data.totalRevenue - data.totalExpenses;
      
      // Sort accounts by code
      data.assets.sort((a, b) => a.code.localeCompare(b.code));
      data.liabilities.sort((a, b) => a.code.localeCompare(b.code));
      data.equity.sort((a, b) => a.code.localeCompare(b.code));
      data.revenue.sort((a, b) => a.code.localeCompare(b.code));
      data.expenses.sort((a, b) => a.code.localeCompare(b.code));

      setFinancialData(data);
    } catch (error) {
      console.error('Error fetching financial data:', error);
      setError((error as Error).message || 'Error al cargar los datos financieros');
      toast.error((error as Error).message || 'Error al cargar los datos financieros');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, periodDetails]);

  useEffect(() => {
    if (selectedPeriod) {
      fetchPeriodDetails();
    }
  }, [selectedPeriod, fetchPeriodDetails]);

  useEffect(() => {
    if (selectedPeriod) {
      fetchFinancialData();
    }
  }, [selectedPeriod, fetchFinancialData]);

  function formatCurrency(amount: number) {
    return amount.toLocaleString('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    });
  }

  function exportBalanceSheet() {
    try {
      const selectedPeriodName = periods.find(p => p.id === selectedPeriod)?.name || '';
      
      const excelData = [
        ['BALANCE GENERAL'],
        [`Periodo: ${selectedPeriodName}`],
        [`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`],
        [''],
        ['ACTIVOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...financialData.assets.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Activos', financialData.totalAssets],
        [''],
        ['PASIVOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...financialData.liabilities.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Pasivos', financialData.totalLiabilities],
        [''],
        ['CAPITAL'],
        ['Código', 'Cuenta', 'Monto'],
        ...financialData.equity.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Utilidad del Periodo', financialData.netIncome],
        ['', 'Total Capital', financialData.totalEquity + financialData.netIncome],
        [''],
        ['', 'Total Pasivo y Capital', financialData.totalLiabilities + financialData.totalEquity + financialData.netIncome],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Aplicar estilos a las celdas (títulos en negrita)
      if (!ws['!cols']) ws['!cols'] = [];
      ws['!cols'] = [
        { wch: 15 }, // Código
        { wch: 40 }, // Cuenta
        { wch: 20 }, // Monto
      ];

      // Aplicar formato de moneda a la columna de montos (columna C desde la fila 6)
      for (let i = 6; i < excelData.length; i++) {
        const cell = XLSX.utils.encode_cell({ r: i, c: 2 }); // columna C (índice 2)
        if (ws[cell] && typeof ws[cell].v === 'number') {
          ws[cell].z = '"$"#,##0.00';
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Balance General');
      XLSX.writeFile(wb, `balance_general_${format(new Date(), 'yyyyMMdd')}.xlsx`);
      toast.success('Balance General exportado correctamente');
    } catch (error) {
      console.error('Error exporting balance sheet:', error);
      toast.error('Error al exportar el Balance General');
    }
  }

  function exportIncomeStatement() {
    try {
      const selectedPeriodName = periods.find(p => p.id === selectedPeriod)?.name || '';
      
      const excelData = [
        ['ESTADO DE RESULTADOS'],
        [`Periodo: ${selectedPeriodName}`],
        [`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`],
        [''],
        ['INGRESOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...financialData.revenue.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Ingresos', financialData.totalRevenue],
        [''],
        ['GASTOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...financialData.expenses.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Gastos', financialData.totalExpenses],
        [''],
        ['', 'UTILIDAD NETA', financialData.netIncome],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Aplicar estilos a las celdas (títulos en negrita)
      if (!ws['!cols']) ws['!cols'] = [];
      ws['!cols'] = [
        { wch: 15 }, // Código
        { wch: 40 }, // Cuenta
        { wch: 20 }, // Monto
      ];

      // Aplicar formato de moneda a la columna de montos (columna C desde la fila 6)
      for (let i = 6; i < excelData.length; i++) {
        const cell = XLSX.utils.encode_cell({ r: i, c: 2 }); // columna C (índice 2)
        if (ws[cell] && typeof ws[cell].v === 'number') {
          ws[cell].z = '"$"#,##0.00';
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Estado de Resultados');
      XLSX.writeFile(wb, `estado_resultados_${format(new Date(), 'yyyyMMdd')}.xlsx`);
      toast.success('Estado de Resultados exportado correctamente');
    } catch (error) {
      console.error('Error exporting income statement:', error);
      toast.error('Error al exportar el Estado de Resultados');
    }
  }

  // Función para renderizar un estado normal o un mensaje de error/carga según corresponda
  function renderContent() {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <Loader className="h-8 w-8 text-blue-500 animate-spin" />
          <span className="ml-2 text-gray-500">Cargando datos financieros...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Error al cargar los datos
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {error}
          </p>
        </div>
      );
    }

    if (!selectedPeriod) {
      return (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Seleccione un periodo
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Elija un periodo contable para ver los estados financieros.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* Balance Sheet Preview */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Balance General</h3>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Assets */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Activos</h4>
              <div className="space-y-2">
                {financialData.assets.length > 0 ? (
                  financialData.assets.map(account => (
                    <div key={account.id} className="flex justify-between">
                      <span className="text-sm text-gray-600">
                        {account.name}
                        {account.balance === 0 && account.hasActivity && 
                          <span className="ml-1 text-xs text-blue-500">(Con actividad)</span>
                        }
                      </span>
                      <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No hay activos registrados en este periodo</div>
                )}
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total Activos</span>
                  <span>{formatCurrency(financialData.totalAssets)}</span>
                </div>
              </div>
            </div>

            {/* Liabilities */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Pasivos</h4>
              <div className="space-y-2">
                {financialData.liabilities.length > 0 ? (
                  financialData.liabilities.map(account => (
                    <div key={account.id} className="flex justify-between">
                      <span className="text-sm text-gray-600">
                        {account.name}
                        {account.balance === 0 && account.hasActivity && 
                          <span className="ml-1 text-xs text-blue-500">(Con actividad)</span>
                        }
                      </span>
                      <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No hay pasivos registrados en este periodo</div>
                )}
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total Pasivos</span>
                  <span>{formatCurrency(financialData.totalLiabilities)}</span>
                </div>
              </div>
            </div>

            {/* Equity */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Capital</h4>
              <div className="space-y-2">
                {financialData.equity.length > 0 ? (
                  financialData.equity.map(account => (
                    <div key={account.id} className="flex justify-between">
                      <span className="text-sm text-gray-600">
                        {account.name}
                        {account.balance === 0 && account.hasActivity && 
                          <span className="ml-1 text-xs text-blue-500">(Con actividad)</span>
                        }
                      </span>
                      <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No hay cuentas de capital registradas en este periodo</div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Utilidad del Periodo</span>
                  <span className="font-medium">{formatCurrency(financialData.netIncome)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total Capital</span>
                  <span>{formatCurrency(financialData.totalEquity + financialData.netIncome)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between font-medium text-lg">
              <span>Total Pasivo y Capital</span>
              <span>{formatCurrency(financialData.totalLiabilities + financialData.totalEquity + financialData.netIncome)}</span>
            </div>
          </div>
        </div>

        {/* Income Statement Preview */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Estado de Resultados</h3>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Revenue */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Ingresos</h4>
              <div className="space-y-2">
                {financialData.revenue.length > 0 ? (
                  financialData.revenue.map(account => (
                    <div key={account.id} className="flex justify-between">
                      <span className="text-sm text-gray-600">
                        {account.name}
                        {account.balance === 0 && account.hasActivity && 
                          <span className="ml-1 text-xs text-blue-500">(Con actividad)</span>
                        }
                      </span>
                      <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No hay ingresos registrados en este periodo</div>
                )}
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total Ingresos</span>
                  <span>{formatCurrency(financialData.totalRevenue)}</span>
                </div>
              </div>
            </div>

            {/* Expenses */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Gastos</h4>
              <div className="space-y-2">
                {financialData.expenses.length > 0 ? (
                  financialData.expenses.map(account => (
                    <div key={account.id} className="flex justify-between">
                      <span className="text-sm text-gray-600">
                        {account.name}
                        {account.balance === 0 && account.hasActivity && 
                          <span className="ml-1 text-xs text-blue-500">(Con actividad)</span>
                        }
                      </span>
                      <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No hay gastos registrados en este periodo</div>
                )}
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total Gastos</span>
                  <span>{formatCurrency(financialData.totalExpenses)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Income */}
          <div className="mt-4 border-t pt-4">
            <div className="flex justify-between font-medium text-lg">
              <span>Utilidad Neta</span>
              <span className={financialData.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(financialData.netIncome)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Estados Financieros</h1>
      </div>

      {/* Filters */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Selección de Periodo
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="period" className="block text-sm font-medium text-gray-700">
                Periodo Contable
              </label>
              <select
                id="period"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                disabled={loading}
              >
                <option value="">Seleccione un periodo</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
              {selectedPeriod && periodDetails && (
                <p className="mt-1 text-xs text-gray-500">
                  Desde {format(new Date(periodDetails.start_date), 'dd/MM/yyyy')} hasta {format(new Date(periodDetails.end_date), 'dd/MM/yyyy')}
                </p>
              )}
            </div>
            <div className="flex items-end">
              <button
                onClick={() => fetchFinancialData()}
                disabled={loading || !selectedPeriod}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  'Actualizar Datos'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Statements */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Balance Sheet */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FileText className="h-6 w-6 text-gray-400" />
                <div className="ml-5">
                  <h3 className="text-lg font-medium text-gray-900">Balance General</h3>
                  <p className="text-sm text-gray-500">
                    Total Activos: {formatCurrency(financialData.totalAssets)}
                  </p>
                </div>
              </div>
              <button
                onClick={exportBalanceSheet}
                disabled={loading || !selectedPeriod || Object.keys(financialData.assets).length === 0}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </button>
            </div>
          </div>
        </div>

        {/* Income Statement */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FileText className="h-6 w-6 text-gray-400" />
                <div className="ml-5">
                  <h3 className="text-lg font-medium text-gray-900">Estado de Resultados</h3>
                  <p className="text-sm text-gray-500">
                    Utilidad Neta: {formatCurrency(financialData.netIncome)}
                  </p>
                </div>
              </div>
              <button
                onClick={exportIncomeStatement}
                disabled={loading || !selectedPeriod || (Object.keys(financialData.revenue).length === 0 && Object.keys(financialData.expenses).length === 0)}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}