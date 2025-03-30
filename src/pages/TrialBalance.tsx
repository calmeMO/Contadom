import React, { useState, useEffect, useCallback } from 'react';
import { 
  Filter, 
  Search, 
  Calendar, 
  Download, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Loader, 
  Printer,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileDown,
  ChevronLeft,
  RotateCcw
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format, startOfMonth, endOfMonth, addMonths, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { fetchTrialBalanceData, prepareTrialBalanceExport, TrialBalanceAccount, TrialBalanceTotals } from '../services/trialBalanceService';
import { AccountingPeriod, fetchMonthlyPeriods, getCurrentPeriod } from '../services/accountingPeriodService';
import { formatCurrency } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';

export function TrialBalance() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [accounts, setAccounts] = useState<TrialBalanceAccount[]>([]);
  const [totals, setTotals] = useState<TrialBalanceTotals | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'costo']);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredAccounts, setFilteredAccounts] = useState<TrialBalanceAccount[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<{[key: string]: boolean}>({});
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod | null>(null);
  const [isBalanced, setIsBalanced] = useState(true);

  const { user } = useAuth();

  // Obtener períodos contables
  const fetchPeriods = useCallback(async () => {
    try {
      const currentPeriod = await getCurrentPeriod();
      
      if (currentPeriod && currentPeriod.parent_id) {
        const monthlyPeriods = await fetchMonthlyPeriods(currentPeriod.parent_id);
        setPeriods(monthlyPeriods);
        
        // Seleccionar el período activo por defecto
        if (currentPeriod) {
          setSelectedPeriod(currentPeriod);
          setDateRange({
            startDate: currentPeriod.start_date,
            endDate: currentPeriod.end_date
          });
        }
      }
    } catch (error) {
      console.error('Error al cargar períodos:', error);
      toast.error('Error al cargar los períodos contables');
    }
  }, []);

  // Cargar datos de la balanza
  const loadTrialBalanceData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTrialBalanceData(
        dateRange.startDate, 
        dateRange.endDate,
        selectedTypes
      );
      
      setAccounts(data.accounts);
      setTotals(data.totals);
      setIsBalanced(data.isBalanced);
      
      // Inicializar los estados expandidos
      const expanded: {[key: string]: boolean} = {};
      data.accounts.forEach(account => {
        if (account.parent_id === null) {
          expanded[account.id] = true; // Expandir cuentas principales por defecto
        }
      });
      setExpandedAccounts(expanded);
      
      // Aplicar filtros iniciales
      applyFilters(data.accounts, searchTerm);
    } catch (error) {
      console.error('Error al cargar la balanza de comprobación:', error);
      toast.error('Error al cargar la balanza de comprobación');
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate, selectedTypes, searchTerm]);

  // Cargar datos al iniciar o cambiar filtros
  useEffect(() => {
    loadTrialBalanceData();
  }, [loadTrialBalanceData]);

  // Cargar períodos al iniciar
  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  // Filtrar cuentas según término de búsqueda
  const applyFilters = (accountsToFilter: TrialBalanceAccount[], search: string) => {
    if (!search.trim()) {
      setFilteredAccounts(accountsToFilter);
      return;
    }
    
    const searchLower = search.toLowerCase();
    const filtered = accountsToFilter.filter(account => 
      account.code.toLowerCase().includes(searchLower) || 
      account.name.toLowerCase().includes(searchLower)
    );
    
    setFilteredAccounts(filtered);
    
    // Expandir automáticamente las cuentas que coinciden con la búsqueda
    const newExpanded = {...expandedAccounts};
    filtered.forEach(account => {
      if (account.parent_id) {
        newExpanded[account.parent_id] = true;
      }
    });
    setExpandedAccounts(newExpanded);
  };

  // Obtener etiqueta para tipo de cuenta
  const getAccountTypeLabel = (type: string): string => {
    const types: {[key: string]: string} = {
      'activo': 'Activo',
      'pasivo': 'Pasivo',
      'patrimonio': 'Patrimonio',
      'ingreso': 'Ingreso',
      'gasto': 'Gasto',
      'costo': 'Costo'
    };
    return types[type] || type;
  };

  // Cambiar período seleccionado
  const handleChangePeriod = (period: AccountingPeriod) => {
    setSelectedPeriod(period);
    setDateRange({
      startDate: period.start_date,
      endDate: period.end_date
    });
  };

  // Cambiar mes seleccionado
  const handleChangeMonth = (direction: 'prev' | 'next') => {
    const currentStartDate = parse(dateRange.startDate, 'yyyy-MM-dd', new Date());
    const newDate = direction === 'prev'
      ? new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() - 1, 1)
      : new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() + 1, 1);
    
    setDateRange({
      startDate: format(startOfMonth(newDate), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(newDate), 'yyyy-MM-dd')
    });
    
    // Buscar si existe un período para este mes
    const periodForNewDate = periods.find(period => {
      const periodStart = new Date(period.start_date);
      return periodStart.getMonth() === newDate.getMonth() && 
             periodStart.getFullYear() === newDate.getFullYear();
    });
    
    setSelectedPeriod(periodForNewDate || null);
  };

  // Expandir/colapsar cuenta
  const toggleExpand = (accountId: string) => {
    setExpandedAccounts(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  // Manejar cambios en el término de búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Enviar búsqueda
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(accounts, searchTerm);
  };

  // Resetear filtros
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedTypes(['activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'costo']);
    applyFilters(accounts, '');
  };

  // Exportar a Excel
  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      accounts.map(account => ({
        Código: account.code,
        Cuenta: account.name,
        Tipo: getAccountTypeLabel(account.type),
        'Saldo Inicial': account.opening_balance,
        Débitos: account.period_debits,
        Créditos: account.period_credits,
        'Saldo Final': account.closing_balance
      }))
    );
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Balanza de Comprobación');
    
    // Formato de nombre: Balanza_AAAA-MM-DD_a_AAAA-MM-DD
    const fileName = `Balanza_${dateRange.startDate}_a_${dateRange.endDate}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
  };

  // Imprimir balanza
  const printTrialBalance = () => {
    window.print();
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 print:py-0 print:px-0">
      <div className="sm:flex sm:items-center print:hidden">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Balanza de Comprobación</h1>
          <p className="mt-2 text-sm text-gray-700">
            Reporte de saldos iniciales, movimientos y saldos finales por cuenta contable.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
          <button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <FileDown className="-ml-1 mr-2 h-5 w-5 text-gray-500" />
            Exportar a Excel
          </button>
          <button
            type="button"
            onClick={printTrialBalance}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Printer className="-ml-1 mr-2 h-5 w-5 text-gray-500" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col space-y-4 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md bg-white px-3 py-2 shadow sm:max-w-lg">
            <div className="flex items-center text-sm text-gray-500">
              <Calendar className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" />
              <span>Período:</span>
            </div>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => handleChangeMonth('prev')}
                className="inline-flex items-center rounded border border-gray-300 bg-white p-1 text-gray-500 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="mx-2 min-w-[150px] text-center">
                <span className="font-medium text-gray-900">
                  {format(parse(dateRange.startDate, 'yyyy-MM-dd', new Date()), 'MMMM yyyy', {locale: es})}
                </span>
                {selectedPeriod && (
                  <div className="text-xs text-gray-500">
                    {selectedPeriod.is_closed ? (
                      <span className="text-red-500 font-medium">Período Cerrado</span>
                    ) : (
                      <span className="text-green-500 font-medium">Período Abierto</span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleChangeMonth('next')}
                className="inline-flex items-center rounded border border-gray-300 bg-white p-1 text-gray-500 hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex max-w-lg flex-1">
            <div className="relative flex flex-1 flex-shrink-0">
              <label htmlFor="search-field" className="sr-only">
                Buscar
              </label>
              <input
                id="search-field"
                className="block w-full rounded-md border-gray-300 py-2 pl-10 pr-3 text-sm placeholder-gray-500 focus:border-blue-500 focus:placeholder-gray-400 focus:outline-none focus:ring-blue-500"
                placeholder="Buscar por código o nombre de cuenta"
                type="search"
                name="search"
                value={searchTerm}
                onChange={handleSearchChange}
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
            </div>
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  applyFilters(accounts, '');
                }}
                className="ml-2 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              className="ml-2 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="ml-2 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Estado de la balanza */}
      {!loading && totals && (
        <div className={`mt-4 rounded-md p-4 ${isBalanced ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {isBalanced ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400" />
              )}
            </div>
            <div className="ml-3">
              <h3 className={`text-sm font-medium ${isBalanced ? 'text-green-800' : 'text-red-800'}`}>
                {isBalanced ? 'Balanza Cuadrada' : 'Balanza Descuadrada'}
              </h3>
              <div className={`mt-2 text-sm ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                <div className="flex space-x-8">
                  <div>
                    <span className="font-medium">Débitos Totales:</span> {formatCurrency(totals.totalDebits)}
                  </div>
                  <div>
                    <span className="font-medium">Créditos Totales:</span> {formatCurrency(totals.totalCredits)}
                  </div>
                  {!isBalanced && (
                    <div>
                      <span className="font-medium">Diferencia:</span> {formatCurrency(Math.abs(totals.difference))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de la balanza */}
      <div className="mt-6 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg print:shadow-none print:ring-0">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50 print:bg-white">
                    <tr>
                      <th scope="col" className="whitespace-nowrap py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-gray-900 sm:pl-6">
                        Código
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-left text-xs font-semibold text-gray-900">
                        Nombre de Cuenta
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-center text-xs font-semibold text-gray-900">
                        Tipo
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-right text-xs font-semibold text-gray-900">
                        Saldo Inicial Débito
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-right text-xs font-semibold text-gray-900">
                        Saldo Inicial Crédito
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-right text-xs font-semibold text-gray-900">
                        Movimientos Débito
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-right text-xs font-semibold text-gray-900">
                        Movimientos Crédito
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-right text-xs font-semibold text-gray-900">
                        Saldo Final Débito
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-3.5 text-right text-xs font-semibold text-gray-900">
                        Saldo Final Crédito
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {(searchTerm ? filteredAccounts : accounts).map((account, index) => {
                      // Determinación del formato según tipo de cuenta
                      const isDebitAccount = ['activo', 'gasto', 'costo'].includes(account.type);
                      
                      // Valores formateados
                      const initialDebit = isDebitAccount && account.opening_balance > 0 ? account.opening_balance : 
                                          !isDebitAccount && account.opening_balance < 0 ? Math.abs(account.opening_balance) : 0;
                                          
                      const initialCredit = isDebitAccount && account.opening_balance < 0 ? Math.abs(account.opening_balance) : 
                                            !isDebitAccount && account.opening_balance > 0 ? account.opening_balance : 0;
                                          
                      const finalDebit = isDebitAccount && account.closing_balance > 0 ? account.closing_balance : 
                                        !isDebitAccount && account.closing_balance < 0 ? Math.abs(account.closing_balance) : 0;
                                        
                      const finalCredit = isDebitAccount && account.closing_balance < 0 ? Math.abs(account.closing_balance) : 
                                          !isDebitAccount && account.closing_balance > 0 ? account.closing_balance : 0;
                      
                      // Determinar si es cuenta padre basado en su nivel y si tiene hijos
                      const isParentAccount = account.has_children || account.parent_id === null;
                      
                      return (
                        <tr 
                          key={account.id}
                          className={`${
                            isParentAccount ? 'bg-gray-50' : 'bg-white'
                          } hover:bg-gray-100`}
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-sm">
                            <div className="flex items-center">
                              {account.has_children && (
                                <button
                                  onClick={() => toggleExpand(account.id)}
                                  className="mr-2 focus:outline-none"
                                >
                                  {expandedAccounts[account.id] ? (
                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-gray-500" />
                                  )}
                                </button>
                              )}
                              <div style={{ paddingLeft: `${((account.level || 1) - 1) * 16}px` }}>
                                <span className={`${isParentAccount ? 'font-bold text-blue-800' : 'text-gray-900'}`}>
                                  {account.code}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-sm">
                            <div className="flex items-center">
                              <div style={{ paddingLeft: `${((account.level || 1) - 1) * 16}px` }}>
                                <div className="flex items-center">
                                  {isParentAccount && (
                                    <div className="mr-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                      Cuenta Padre
                                    </div>
                                  )}
                                  <span className={`${isParentAccount ? 'font-bold text-blue-800' : 'text-gray-900'}`}>
                                    {account.name}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-sm text-gray-500 text-center">
                            {getAccountTypeLabel(account.type)}
                          </td>
                          <td className={`whitespace-nowrap px-2 py-2 text-sm text-right ${initialDebit < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatCurrency(initialDebit)}
                          </td>
                          <td className={`whitespace-nowrap px-2 py-2 text-sm text-right ${initialCredit < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatCurrency(initialCredit)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-sm text-blue-600 text-right">
                            {formatCurrency(account.period_debits)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-sm text-green-600 text-right">
                            {formatCurrency(account.period_credits)}
                          </td>
                          <td className={`whitespace-nowrap px-2 py-2 text-sm font-medium text-right ${finalDebit < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatCurrency(finalDebit)}
                          </td>
                          <td className={`whitespace-nowrap px-2 py-2 text-sm font-medium text-right ${finalCredit < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatCurrency(finalCredit)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {totals && (
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan={3} className="whitespace-nowrap py-3 pl-4 pr-3 text-sm font-semibold text-gray-900 sm:pl-6">
                          TOTALES
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-sm font-semibold text-right">
                          {/* No se muestra total de saldos iniciales ya que no tiene sentido sumar cuentas de distinta naturaleza */}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-sm font-semibold text-blue-700 text-right">
                          {formatCurrency(totals.totalDebits)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-sm font-semibold text-green-700 text-right">
                          {formatCurrency(totals.totalCredits)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-sm font-semibold text-right">
                          {/* No se muestra total de saldos finales ya que no tiene sentido sumar cuentas de distinta naturaleza */}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 