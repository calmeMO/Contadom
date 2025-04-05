import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { 
  FileText, 
  Filter, 
  Loader, 
  FileDown,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { 
  fetchFinancialData, 
  generateBalanceSheet, 
  generateIncomeStatement,
  formatCurrency,
  prepareBalanceSheetExport,
  prepareIncomeStatementExport,
  FinancialAccount
} from '../services/financialStatementsService';

type TabType = 'balance' | 'income';

export default function FinancialStatements() {
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<{ id: string; name: string; start_date: string; end_date: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('balance');
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Estado para Balance General
  const [balanceSheet, setBalanceSheet] = useState<{
    assets: FinancialAccount[];
    liabilities: FinancialAccount[];
    equity: FinancialAccount[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    netIncome: number;
    balanceTotal: number;
  } | null>(null);
  
  // Estado para Estado de Resultados
  const [incomeStatement, setIncomeStatement] = useState<{
    revenue: FinancialAccount[];
    expenses: FinancialAccount[];
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  } | null>(null);

  // Cargar período activo al iniciar
  useEffect(() => {
    fetchActivePeriod();
  }, []);

  // Cargar datos financieros cuando se tiene el período activo
  useEffect(() => {
    if (activePeriod) {
      fetchFinancialReports(activePeriod.id);
    }
  }, [activePeriod]);

  // Función para cargar el período contable activo
  async function fetchActivePeriod() {
    try {
      setLoading(true);
      setError(null);
      
      // Obtener el período activo y no cerrado
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('id, name, start_date, end_date')
        .eq('is_active', true)
        .eq('is_closed', false)
        .order('end_date', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (!data || data.length === 0) {
        setError('No se encontró un período contable activo');
        toast.warning('No se encontró un período contable activo');
        return;
      }
      
      // Establecer el período activo
      setActivePeriod(data[0]);
    } catch (error) {
      console.error('Error al cargar período contable activo:', error);
      toast.error('Error al cargar el período contable activo');
      setError('No se pudo cargar el período contable activo');
    } finally {
      setLoading(false);
    }
  }

  // Función para cargar los reportes financieros
  const fetchFinancialReports = useCallback(async (periodId: string) => {
    if (!periodId) return;
    
    setError(null);
    setLoading(true);
    
    try {
      // Cargar Balance General
      const balanceSheetData = await generateBalanceSheet(periodId);
      setBalanceSheet(balanceSheetData);
      
      // Cargar Estado de Resultados
      const incomeStatementData = await generateIncomeStatement(periodId);
      setIncomeStatement(incomeStatementData);
    } catch (error: any) {
      console.error('Error al cargar reportes financieros:', error);
      toast.error('Error al cargar los reportes financieros');
      setError(error.message || 'Error al cargar los reportes financieros');
      setBalanceSheet(null);
      setIncomeStatement(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Función para exportar Balance General
  function exportBalanceSheet() {
    if (!balanceSheet || !activePeriod) return;
    
    try {
      setIsExporting(true);
      
      const excelData = prepareBalanceSheetExport(
        activePeriod.name,
        balanceSheet.assets,
        balanceSheet.liabilities,
        balanceSheet.equity,
        balanceSheet.totalAssets,
        balanceSheet.totalLiabilities,
        balanceSheet.totalEquity,
        balanceSheet.netIncome
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Aplicar estilos a las celdas
      if (!ws['!cols']) ws['!cols'] = [];
      ws['!cols'] = [
        { wch: 15 }, // Código
        { wch: 40 }, // Cuenta
        { wch: 20 }, // Monto
      ];

      // Aplicar formato de moneda a la columna de montos
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
      console.error('Error al exportar Balance General:', error);
      toast.error('Error al exportar el Balance General');
    } finally {
      setIsExporting(false);
    }
  }

  // Función para exportar Estado de Resultados
  function exportIncomeStatement() {
    if (!incomeStatement || !activePeriod) return;
    
    try {
      setIsExporting(true);
      
      const excelData = prepareIncomeStatementExport(
        activePeriod.name,
        incomeStatement.revenue,
        incomeStatement.expenses,
        incomeStatement.totalRevenue,
        incomeStatement.totalExpenses,
        incomeStatement.netIncome
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Aplicar estilos a las celdas
      if (!ws['!cols']) ws['!cols'] = [];
      ws['!cols'] = [
        { wch: 15 }, // Código
        { wch: 40 }, // Cuenta
        { wch: 20 }, // Monto
      ];

      // Aplicar formato de moneda a la columna de montos
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
      console.error('Error al exportar Estado de Resultados:', error);
      toast.error('Error al exportar el Estado de Resultados');
    } finally {
      setIsExporting(false);
    }
  }

  // Renderizar contenido según el estado de carga
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">Error al cargar los datos</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button 
            onClick={() => fetchActivePeriod()}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
          </button>
        </div>
      );
    }

    if (!activePeriod) {
      return (
        <div className="text-center py-12">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No hay período activo</h3>
          <p className="mt-1 text-sm text-gray-500">
            No se encontró un período contable activo. Active un período para visualizar los estados financieros.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {activeTab === 'balance' ? renderBalanceSheet() : renderIncomeStatement()}
      </div>
    );
  }

  // Renderizar Balance General
  function renderBalanceSheet() {
    if (!balanceSheet) return null;

    return (
      <div className="space-y-6">
        <div className="flex justify-between">
          <h3 className="text-lg font-medium text-gray-900">Balance General</h3>
          <button
            onClick={exportBalanceSheet}
            disabled={isExporting}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
          >
            <FileDown className="w-4 h-4 mr-1" /> Exportar
          </button>
        </div>

        {/* Contenido del Balance General */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Activos */}
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-md font-medium text-gray-900 mb-3 border-b pb-2">Activos</h4>
            <div className="space-y-2">
              {balanceSheet.assets.length > 0 ? (
                balanceSheet.assets.map(account => (
                  <div key={account.id} className="flex justify-between">
                    <span className="text-sm text-gray-700">
                      {account.code} - {account.name}
                    </span>
                    <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No hay activos registrados en este período</div>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total Activos</span>
                <span>{formatCurrency(balanceSheet.totalAssets)}</span>
              </div>
            </div>
          </div>

          {/* Pasivos */}
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-md font-medium text-gray-900 mb-3 border-b pb-2">Pasivos</h4>
            <div className="space-y-2">
              {balanceSheet.liabilities.length > 0 ? (
                balanceSheet.liabilities.map(account => (
                  <div key={account.id} className="flex justify-between">
                    <span className="text-sm text-gray-700">
                      {account.code} - {account.name}
                    </span>
                    <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No hay pasivos registrados en este período</div>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total Pasivos</span>
                <span>{formatCurrency(balanceSheet.totalLiabilities)}</span>
              </div>
            </div>
          </div>

          {/* Capital */}
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-md font-medium text-gray-900 mb-3 border-b pb-2">Capital</h4>
            <div className="space-y-2">
              {balanceSheet.equity.length > 0 ? (
                balanceSheet.equity.map(account => (
                  <div key={account.id} className="flex justify-between">
                    <span className="text-sm text-gray-700">
                      {account.code} - {account.name}
                    </span>
                    <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No hay cuentas de capital registradas en este período</div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Utilidad del Período</span>
                <span className="font-medium">{formatCurrency(balanceSheet.netIncome)}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total Capital</span>
                <span>{formatCurrency(balanceSheet.totalEquity + balanceSheet.netIncome)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cuadre final */}
        <div className="bg-white shadow rounded-lg p-4 mt-4">
          <div className="flex justify-between font-medium text-lg">
            <span>Total Pasivo y Capital</span>
            <span>{formatCurrency(balanceSheet.balanceTotal)}</span>
          </div>
        </div>
      </div>
    );
  }

  // Renderizar Estado de Resultados
  function renderIncomeStatement() {
    if (!incomeStatement) return null;

    return (
      <div className="space-y-6">
        <div className="flex justify-between">
          <h3 className="text-lg font-medium text-gray-900">Estado de Resultados</h3>
          <button
            onClick={exportIncomeStatement}
            disabled={isExporting}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
          >
            <FileDown className="w-4 h-4 mr-1" /> Exportar
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Ingresos */}
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-md font-medium text-gray-900 mb-3 border-b pb-2">Ingresos</h4>
            <div className="space-y-2">
              {incomeStatement.revenue.length > 0 ? (
                incomeStatement.revenue.map(account => (
                  <div key={account.id} className="flex justify-between">
                    <span className="text-sm text-gray-700">
                      {account.code} - {account.name}
                    </span>
                    <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No hay ingresos registrados en este período</div>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total Ingresos</span>
                <span>{formatCurrency(incomeStatement.totalRevenue)}</span>
              </div>
            </div>
          </div>

          {/* Gastos */}
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-md font-medium text-gray-900 mb-3 border-b pb-2">Gastos</h4>
            <div className="space-y-2">
              {incomeStatement.expenses.length > 0 ? (
                incomeStatement.expenses.map(account => (
                  <div key={account.id} className="flex justify-between">
                    <span className="text-sm text-gray-700">
                      {account.code} - {account.name}
                    </span>
                    <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No hay gastos registrados en este período</div>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total Gastos</span>
                <span>{formatCurrency(incomeStatement.totalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Utilidad Neta */}
        <div className="bg-white shadow rounded-lg p-4 mt-4">
          <div className="flex justify-between font-medium text-lg">
            <span>Utilidad Neta</span>
            <span className={incomeStatement.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatCurrency(incomeStatement.netIncome)}
            </span>
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

      {/* Información del período y tabs */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {activePeriod && (
            <div className="mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Período Activo: {activePeriod.name}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Desde {format(new Date(activePeriod.start_date), 'dd/MM/yyyy')} hasta {format(new Date(activePeriod.end_date), 'dd/MM/yyyy')}
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('balance')}
                className={`${
                  activeTab === 'balance'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                Balance General
              </button>
              <button
                onClick={() => setActiveTab('income')}
                className={`${
                  activeTab === 'income'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                Estado de Resultados
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 