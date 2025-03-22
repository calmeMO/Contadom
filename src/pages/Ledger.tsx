import React, { useState, useEffect, useCallback } from 'react';
import { 
  Filter, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  FileText, 
  Download,
  Loader
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: 'deudora' | 'acreedora';
  balance?: number;
};

type LedgerEntry = {
  id: string;
  date: string;
  entry_number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type LedgerMovement = {
  accountId: string;
  account: Account;
  movements: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  expanded: boolean;
};

// Definir un tipo para el objeto journal_entry
type JournalEntryRef = {
  date: string;
  entry_number: string;
  description: string;
};

export function Ledger() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ledgerData, setLedgerData] = useState<LedgerMovement[]>([]);
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchAccounts();
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    setStartDate(format(firstDay, 'yyyy-MM-dd'));
    setEndDate(format(lastDay, 'yyyy-MM-dd'));
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      // Extraer tipos de cuenta únicos
      const types = [...new Set(accounts.map(account => account.type))];
      setAccountTypes(types);
    }
  }, [accounts]);

  const fetchLedgerData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Filtrar cuentas según el tipo seleccionado
      let filteredAccounts = [...accounts];
      if (selectedType) {
        filteredAccounts = filteredAccounts.filter(account => account.type === selectedType);
      }
      
      // Filtrar por búsqueda de texto
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredAccounts = filteredAccounts.filter(account => 
          account.code.toLowerCase().includes(term) || 
          account.name.toLowerCase().includes(term)
        );
      }
      
      // Filtrar por cuenta específica si está seleccionada
      if (selectedAccountId) {
        filteredAccounts = filteredAccounts.filter(account => account.id === selectedAccountId);
      }
      
      // Para cada cuenta, obtener sus movimientos
      const ledgerPromises = filteredAccounts.map(async (account) => {
        // Consultar movimientos para esta cuenta en el período
        const { data: movements, error } = await supabase
          .from('journal_entry_items')
          .select(`
            id,
            debit,
            credit,
            journal_entry:journal_entries(id, date, entry_number, description)
          `)
          .eq('account_id', account.id)
          .gte('journal_entry.date', startDate)
          .lte('journal_entry.date', endDate)
          .order('journal_entry(date)', { ascending: true });

        if (error) throw error;

        // Transformar los movimientos y calcular saldos
        let balance = 0;
        let totalDebit = 0;
        let totalCredit = 0;
        
        const formattedMovements = movements.map(movement => {
          const debit = movement.debit || 0;
          const credit = movement.credit || 0;
          
          // Actualizar el balance según el tipo de cuenta y su naturaleza
          if (account.type === 'activo' || account.type === 'gasto' || account.type === 'costo') {
            // Cuentas con naturaleza deudora
            balance += debit - credit;
          } else if (account.type === 'pasivo' || account.type === 'patrimonio' || account.type === 'ingreso') {
            // Cuentas con naturaleza acreedora
            balance += credit - debit;
          } else {
            // Cuentas de orden u otras, usar naturaleza específica de la cuenta
            balance += account.nature === 'deudora' ? (debit - credit) : (credit - debit);
          }
          
          totalDebit += debit;
          totalCredit += credit;
          
          return {
            id: movement.id,
            date: (movement.journal_entry as JournalEntryRef)?.date || '',
            entry_number: (movement.journal_entry as JournalEntryRef)?.entry_number || '',
            description: (movement.journal_entry as JournalEntryRef)?.description || '',
            debit,
            credit,
            balance
          };
        });

        return {
          accountId: account.id,
          account,
          movements: formattedMovements,
          totalDebit,
          totalCredit,
          finalBalance: balance,
          expanded: expanded
        };
      });

      const ledgerResults = await Promise.all(ledgerPromises);
      
      // Ordenar por código de cuenta
      ledgerResults.sort((a, b) => a.account.code.localeCompare(b.account.code));
      
      setLedgerData(ledgerResults);
    } catch (error) {
      console.error('Error fetching ledger data:', error);
      toast.error('Error al cargar los datos del libro mayor');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, startDate, endDate, selectedType, accounts, expanded, searchTerm]);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, code, name, type, nature')
        .eq('is_active', true)
        .order('code');

      if (error) throw error;
      
      if (data) {
        const accountsWithNature = data.map(account => ({
          ...account,
          nature: account.nature || 'deudora' // valor por defecto si no existe
        }));
        setAccounts(accountsWithNature);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Error al cargar las cuentas contables');
    } finally {
      setLoading(false);
    }
  }

  function getAccountTypeLabel(type: string) {
    const types: Record<string, string> = {
      activo: 'Activo',
      pasivo: 'Pasivo',
      patrimonio: 'Capital',
      ingreso: 'Ingreso',
      gasto: 'Gasto',
      costo: 'Costo',
      cuenta_orden: 'Cuenta de Orden',
      // Mantener compatibilidad con tipos antiguos
      asset: 'Activo',
      liability: 'Pasivo',
      equity: 'Capital',
      revenue: 'Ingreso',
      expense: 'Gasto',
    };
    return types[type] || type;
  }

  function formatCurrency(amount: number) {
    return amount.toLocaleString('es-DO', { 
      style: 'currency', 
      currency: 'DOP',
      minimumFractionDigits: 2
    });
  }

  function handleAccountExpand(accountId: string) {
    setLedgerData(prevData => 
      prevData.map(item => 
        item.accountId === accountId 
          ? { ...item, expanded: !item.expanded } 
          : item
      )
    );
  }

  function handleExpandAll() {
    const newExpandedState = !expanded;
    setExpanded(newExpandedState);
    setLedgerData(prevData => 
      prevData.map(item => ({ ...item, expanded: newExpandedState }))
    );
  }

  function handleSearch() {
    fetchLedgerData();
  }

  function resetFilters() {
    setSelectedAccountId('');
    setSearchTerm('');
    setSelectedType('');
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    setStartDate(format(firstDay, 'yyyy-MM-dd'));
    setEndDate(format(lastDay, 'yyyy-MM-dd'));
  }

  function exportToCSV() {
    try {
      // Crear los datos para el CSV
      const csvRows = [];
      
      // Encabezado
      csvRows.push(['Código', 'Cuenta', 'Tipo', 'Fecha', 'Número', 'Descripción', 'Débito', 'Crédito', 'Balance'].join(','));
      
      // Filas de datos
      ledgerData.forEach(account => {
        if (account.movements.length === 0) {
          csvRows.push([
            account.account.code,
            account.account.name,
            getAccountTypeLabel(account.account.type),
            '', '', '', '0.00', '0.00',
            formatCurrency(account.finalBalance).replace('RD$', '').trim()
          ].join(','));
        } else {
          account.movements.forEach((movement, index) => {
            csvRows.push([
              index === 0 ? account.account.code : '',
              index === 0 ? account.account.name : '',
              index === 0 ? getAccountTypeLabel(account.account.type) : '',
              format(new Date(movement.date), 'dd/MM/yyyy'),
              movement.entry_number,
              `"${movement.description.replace(/"/g, '""')}"`,
              movement.debit.toFixed(2),
              movement.credit.toFixed(2),
              movement.balance.toFixed(2)
            ].join(','));
          });
        }
        // Fila de totales para la cuenta
        csvRows.push([
          '', 'TOTAL', getAccountTypeLabel(account.account.type),
          '', '', '',
          account.totalDebit.toFixed(2),
          account.totalCredit.toFixed(2),
          account.finalBalance.toFixed(2)
        ].join(','));
        
        // Línea en blanco entre cuentas
        csvRows.push(['', '', '', '', '', '', '', '', ''].join(','));
      });
      
      // Crear el blob y descargarlo
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `libro_mayor_${format(new Date(), 'yyyyMMdd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Archivo CSV generado correctamente');
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      toast.error('Error al exportar a CSV');
    }
  }

  function exportToExcel() {
    try {
      // Crear los datos para el Excel
      const excelData: (string | number | null)[][] = [];
      
      ledgerData.forEach(account => {
        // Agregar encabezado de la cuenta
        excelData.push([
          'Cuenta:',
          `${account.account.code} - ${account.account.name}`,
          'Tipo:',
          getAccountTypeLabel(account.account.type),
          '',
          '',
          '',
          '',
          ''
        ]);
        
        // Agregar encabezados de columnas
        excelData.push([
          'Fecha',
          'Número',
          'Descripción',
          'Débito',
          'Crédito',
          'Balance',
          '',
          '',
          ''
        ]);
        
        if (account.movements.length === 0) {
          excelData.push([
            '-',
            '-',
            'Sin movimientos en el período',
            0,
            0,
            account.finalBalance,
            '',
            '',
            ''
          ]);
        } else {
          // Agregar movimientos
          account.movements.forEach(movement => {
            excelData.push([
              format(new Date(movement.date), 'dd/MM/yyyy'),
              movement.entry_number,
              movement.description,
              movement.debit || '',
              movement.credit || '',
              movement.balance,
              '',
              '',
              ''
            ]);
          });
        }
        
        // Agregar totales
        excelData.push([
          '',
          'TOTAL',
          '',
          account.totalDebit,
          account.totalCredit,
          account.finalBalance,
          '',
          '',
          ''
        ]);
        
        // Agregar línea en blanco
        excelData.push(['', '', '', '', '', '', '', '', '']);
      });
      
      // Crear libro de Excel
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Establecer anchos de columna
      const colWidths = [
        { wch: 12 }, // Fecha
        { wch: 15 }, // Número
        { wch: 40 }, // Descripción
        { wch: 15 }, // Débito
        { wch: 15 }, // Crédito
        { wch: 15 }, // Balance
      ];
      ws['!cols'] = colWidths;
      
      // Crear libro y agregar la hoja
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Libro Mayor');
      
      // Generar el archivo
      XLSX.writeFile(wb, `libro_mayor_${format(new Date(), 'yyyyMMdd')}.xlsx`);
      
      toast.success('Archivo Excel generado correctamente');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Error al exportar a Excel');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Libro Mayor</h1>
        <div className="flex space-x-2">
          <button
            onClick={exportToExcel}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            disabled={loading || ledgerData.length === 0}
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar Excel
          </button>
          <button
            onClick={exportToCSV}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={loading || ledgerData.length === 0}
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filtros
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="account-type" className="block text-sm font-medium text-gray-700">
                Tipo de Cuenta
              </label>
              <select
                id="account-type"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">Todos los tipos</option>
                {accountTypes.map(type => (
                  <option key={type} value={type}>
                    {getAccountTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="account" className="block text-sm font-medium text-gray-700">
                Cuenta Específica
              </label>
              <select
                id="account"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">Todas las cuentas</option>
                {accounts
                  .filter(account => !selectedType || account.type === selectedType)
                  .map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
                Fecha Inicio
              </label>
              <input
                type="date"
                id="start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              />
            </div>
            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
                Fecha Fin
              </label>
              <input
                type="date"
                id="end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              />
            </div>
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                Buscar
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="text"
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Código o nombre"
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-3 pr-10 py-2 sm:text-sm border-gray-300 rounded-md"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end space-x-3">
            <button
              onClick={resetFilters}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Limpiar Filtros
            </button>
            <button
              onClick={handleSearch}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Buscar
            </button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Movimientos por Cuenta
            </h3>
            <button
              onClick={handleExpandAll}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              {expanded ? (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Contraer todo
                </>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 mr-1" />
                  Expandir todo
                </>
              )}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader className="h-8 w-8 text-blue-500 animate-spin" />
              <span className="ml-2 text-gray-500">Cargando datos...</span>
            </div>
          ) : ledgerData.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No hay datos para mostrar
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                No se encontraron movimientos con los filtros seleccionados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {ledgerData.map((ledgerItem) => (
                <div key={ledgerItem.accountId} className="mb-6 border rounded-md overflow-hidden">
                  {/* Encabezado de la cuenta */}
                  <div 
                    className="bg-gray-50 px-4 py-3 flex justify-between items-center cursor-pointer"
                    onClick={() => handleAccountExpand(ledgerItem.accountId)}
                  >
                    <div className="flex items-center">
                      {ledgerItem.expanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-500 mr-2" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-500 mr-2" />
                      )}
                      <div>
                        <span className="font-medium">{ledgerItem.account.code} - {ledgerItem.account.name}</span>
                        <span className="ml-2 text-sm text-gray-500">
                          ({getAccountTypeLabel(ledgerItem.account.type)})
                        </span>
                      </div>
                    </div>
                    <div className="font-medium">
                      <span className="mr-4">Saldo: {formatCurrency(ledgerItem.finalBalance)}</span>
                    </div>
                  </div>
                  
                  {/* Movimientos de la cuenta */}
                  {ledgerItem.expanded && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Fecha
                            </th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Número
                            </th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Descripción
                            </th>
                            <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Débito
                            </th>
                            <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Crédito
                            </th>
                            <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Saldo
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {ledgerItem.movements.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-4 text-center text-sm text-gray-500">
                                No hay movimientos para esta cuenta en el período seleccionado.
                              </td>
                            </tr>
                          ) : (
                            ledgerItem.movements.map((movement) => (
                              <tr key={movement.id}>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                                  {format(new Date(movement.date), 'dd/MM/yyyy')}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                  {movement.entry_number}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-500 truncate max-w-xs">
                                  {movement.description}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right">
                                  {movement.debit > 0 ? formatCurrency(movement.debit) : ''}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right">
                                  {movement.credit > 0 ? formatCurrency(movement.credit) : ''}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-right">
                                  {formatCurrency(movement.balance)}
                                </td>
                              </tr>
                            ))
                          )}
                          {/* Fila de totales */}
                          <tr className="bg-gray-50 font-medium">
                            <td colSpan={3} className="px-3 py-2 text-sm text-gray-700 text-right">
                              Total:
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 text-right">
                              {formatCurrency(ledgerItem.totalDebit)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 text-right">
                              {formatCurrency(ledgerItem.totalCredit)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 text-right">
                              {formatCurrency(ledgerItem.finalBalance)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}