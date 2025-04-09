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
  
  // Nuevo estado para años fiscales
  const [fiscalYears, setFiscalYears] = useState<{id: string, name: string, is_active: boolean}[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('');
  
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
    costs: FinancialAccount[];
    totalRevenue: number;
    totalExpenses: number;
    totalCosts: number;
    netIncome: number;
  } | null>(null);

  // Cargar datos cuando se inicia
  useEffect(() => {
    fetchFiscalYears();
  }, []);
  
  // Cargar datos financieros cuando cambia el año fiscal
  useEffect(() => {
    if (selectedFiscalYear) {
      fetchActivePeriodByFiscalYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

  // Cargar datos financieros cuando se tiene el período activo
  useEffect(() => {
    if (activePeriod) {
      fetchFinancialReports(activePeriod.id);
    }
  }, [activePeriod]);

  // Función para cargar los años fiscales disponibles
  async function fetchFiscalYears() {
    try {
      setLoading(true);
      setError(null);
      
      // Obtener todos los años fiscales
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('id, name, is_active')
        .eq('is_month', false)
        .order('start_date', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setError('No se encontraron años fiscales');
        toast.warning('No se encontraron años fiscales');
        return;
      }
      
      setFiscalYears(data);
      
      // Seleccionar automáticamente el año fiscal activo
      const activeYear = data.find(year => year.is_active);
      if (activeYear) {
        setSelectedFiscalYear(activeYear.id);
      } else {
        // Si no hay año activo, seleccionar el más reciente
        setSelectedFiscalYear(data[0].id);
      }
    } catch (error) {
      console.error('Error al cargar años fiscales:', error);
      toast.error('Error al cargar los años fiscales');
      setError('No se pudieron cargar los años fiscales');
    } finally {
      setLoading(false);
    }
  }

  // Función para cargar el período activo por año fiscal
  async function fetchActivePeriodByFiscalYear(fiscalYearId: string) {
    try {
      setLoading(true);
      setError(null);
      
      // Verificar primero si el año fiscal existe
      const { data: yearData, error: yearError } = await supabase
        .from('accounting_periods')
        .select('id, name, start_date, end_date, is_active, is_closed')
        .eq('id', fiscalYearId)
        .maybeSingle();
        
      if (yearError || !yearData) {
        console.error('Error o año fiscal no encontrado:', yearError || 'No data');
        setError('El año fiscal seleccionado no existe o no está disponible');
        setActivePeriod(null);
        setLoading(false);
        return;
      }
      
      // Usamos directamente el año fiscal completo como período activo
      setActivePeriod({
        id: yearData.id,
        name: yearData.name,
        start_date: yearData.start_date,
        end_date: yearData.end_date
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar período activo:', error);
      toast.error('Error al cargar el período activo');
      setError('No se pudo cargar el período activo');
      setActivePeriod(null);
      setLoading(false);
    }
  }

  // Función para cargar el período contable activo (mantiene compatibilidad)
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
    if (!periodId) {
      console.log('No se especificó ID de período');
      return;
    }
    
    setError(null);
    setLoading(true);
    
    try {
      // Verificar primero si el período existe
      const { data: periodExists, error: periodError } = await supabase
        .from('monthly_accounting_periods')
        .select('id')
        .eq('id', periodId)
        .maybeSingle();
        
      // Si no es un período mensual, verificar si es un año fiscal
      if (!periodExists && !periodError) {
        const { data: yearExists, error: yearError } = await supabase
          .from('accounting_periods')
          .select('id')
          .eq('id', periodId)
          .maybeSingle();
          
        if (!yearExists || yearError) {
          throw new Error('El período seleccionado no existe');
        }
      }
      
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
      
      // Obtener el nombre del año fiscal seleccionado
      const selectedFiscalYearName = fiscalYears.find(y => y.id === selectedFiscalYear)?.name || '';
      
      const excelData = [
        ['BALANCE GENERAL'],
        [`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy')}`],
        [`Año fiscal: ${selectedFiscalYearName}`],
        [`Datos acumulados desde: ${format(new Date(activePeriod.start_date), 'dd/MM/yyyy')} hasta: ${format(new Date(activePeriod.end_date), 'dd/MM/yyyy')}`],
        [''],
        ['ACTIVOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...balanceSheet.assets.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Activos', balanceSheet.totalAssets],
        [''],
        ['PASIVOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...balanceSheet.liabilities.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Pasivos', balanceSheet.totalLiabilities],
        [''],
        ['CAPITAL'],
        ['Código', 'Cuenta', 'Monto'],
        ...balanceSheet.equity.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Utilidad del Período', balanceSheet.netIncome],
        ['', 'Total Capital', balanceSheet.totalEquity + balanceSheet.netIncome],
        [''],
        ['', 'TOTAL PASIVO Y CAPITAL', balanceSheet.balanceTotal],
      ];

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
      for (let i = 8; i < excelData.length; i++) {
        if (i === 9 || i === 10 || i === 13 || i === 14 || i === 15 ||
            i === 18 || i === 19 || i === 22 || i === 23 || i === 24 || i === 26) {
          continue;
        }
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
      
      // Obtener el nombre del año fiscal seleccionado
      const selectedFiscalYearName = fiscalYears.find(y => y.id === selectedFiscalYear)?.name || '';
      
      const excelData = [
        ['ESTADO DE RESULTADOS'],
        [`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy')}`],
        [`Año fiscal: ${selectedFiscalYearName}`],
        [`Datos acumulados desde: ${format(new Date(activePeriod.start_date), 'dd/MM/yyyy')} hasta: ${format(new Date(activePeriod.end_date), 'dd/MM/yyyy')}`],
        [''],
        ['INGRESOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...incomeStatement.revenue.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Ingresos', incomeStatement.totalRevenue],
        [''],
        ['COSTOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...incomeStatement.costs.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Costos', incomeStatement.totalCosts],
        [''],
        ['GASTOS'],
        ['Código', 'Cuenta', 'Monto'],
        ...incomeStatement.expenses.map(account => [
          account.code,
          account.name,
          account.balance,
        ]),
        ['', 'Total Gastos', incomeStatement.totalExpenses],
        [''],
        ['', 'UTILIDAD NETA', incomeStatement.netIncome],
      ];

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
      for (let i = 8; i < excelData.length; i++) {
        if (i === 9 || i === 10 || i === 11 || i === 14 || i === 15 || 
            i === 16 || i === 19 || i === 20 || i === 21) {
          continue;
        }
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

          {/* Costos */}
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-md font-medium text-gray-900 mb-3 border-b pb-2">Costos</h4>
            <div className="space-y-2">
              {incomeStatement.costs.length > 0 ? (
                incomeStatement.costs.map(account => (
                  <div key={account.id} className="flex justify-between">
                    <span className="text-sm text-gray-700">
                      {account.code} - {account.name}
                    </span>
                    <span className="text-sm font-medium">{formatCurrency(account.balance)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No hay costos registrados en este período</div>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total Costos</span>
                <span>{formatCurrency(incomeStatement.totalCosts)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

          {/* Utilidad Neta */}
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-md font-medium text-gray-900 mb-3 border-b pb-2">Resumen</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Total Ingresos</span>
                <span className="text-sm font-medium">{formatCurrency(incomeStatement.totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Total Costos</span>
                <span className="text-sm font-medium">{formatCurrency(incomeStatement.totalCosts)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Total Gastos</span>
                <span className="text-sm font-medium">{formatCurrency(incomeStatement.totalExpenses)}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Utilidad Neta</span>
                <span className={incomeStatement.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(incomeStatement.netIncome)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Estados Financieros</h1>
          <div className="w-64">
            <label htmlFor="fiscalYear" className="block text-sm font-medium text-gray-700 mb-1">
              Año Fiscal
            </label>
            <select
              id="fiscalYear"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={selectedFiscalYear}
              onChange={(e) => setSelectedFiscalYear(e.target.value)}
              disabled={loading}
            >
              <option value="">Seleccionar año fiscal...</option>
              {fiscalYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name} {year.is_active ? '(Activo)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activePeriod && (
          <div className="mt-2 text-sm text-gray-600">
            Datos acumulados del año fiscal: {activePeriod.name} ({format(new Date(activePeriod.start_date), 'dd/MM/yyyy')} - {format(new Date(activePeriod.end_date), 'dd/MM/yyyy')})
          </div>
        )}

        <div className="border-b border-gray-200 mt-4">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('balance')}
              className={`whitespace-nowrap py-2 px-4 border-b-2 font-medium text-sm ${
                activeTab === 'balance'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Balance General
            </button>
            <button
              onClick={() => setActiveTab('income')}
              className={`ml-8 whitespace-nowrap py-2 px-4 border-b-2 font-medium text-sm ${
                activeTab === 'income'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Estado de Resultados
            </button>
          </nav>
        </div>
      </div>

      {renderContent()}
    </div>
  );
} 