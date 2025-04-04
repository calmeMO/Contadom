import React, { useState, useEffect, useCallback } from 'react';
import { 
  Filter, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  FileText, 
  Download,
  Loader,
  AlertCircle,
  Calendar,
  ArrowDown,
  Copy,
  Printer,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { 
  LedgerAccount, 
  FormattedMovement,
  fetchLedgerData,
  getAccountNature
} from '../services/ledgerService';
import { fetchAccounts } from '../services/accountService';
import { Account } from '../services/accountService';

export function Ledger() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ledgerData, setLedgerData] = useState<LedgerAccount[]>([]);
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    loadAccounts();
    // Establecer el mes actual por defecto
    const today = new Date();
    const firstDay = startOfMonth(today);
    const lastDay = endOfMonth(today);
    
    setStartDate(format(firstDay, 'yyyy-MM-dd'));
    setEndDate(format(lastDay, 'yyyy-MM-dd'));
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      // Extraer tipos de cuenta únicos
      const types = [...new Set(accounts.map(account => account.type))];
      setAccountTypes(types);
      // Por defecto, seleccionar todos los tipos
      setSelectedTypes(types);
    }
  }, [accounts]);

  // Carga inicial de cuentas
  async function loadAccounts() {
    try {
      setLoading(true);
      const accountsData = await fetchAccounts();
      setAccounts(accountsData);
    } catch (error) {
      console.error('Error cargando cuentas:', error);
      toast.error('Error al cargar las cuentas contables');
    } finally {
      setLoading(false);
    }
  }

  // Cargar datos del libro mayor
  const loadLedgerData = useCallback(async () => {
    if (!startDate || !endDate) {
      // Solo mostrar el mensaje si no estamos en la carga inicial
      if (dataLoaded) {
        toast.warn('Debe seleccionar un rango de fechas');
      }
      return;
    }

    try {
      setLoading(true);
      
      const data = await fetchLedgerData(accounts, {
        startDate,
        endDate,
        showZeroBalances,
        accountTypes: selectedTypes
      });
      
      // Si hay una cuenta específica seleccionada
      if (selectedAccountId) {
        const filteredData = data.filter(item => item.accountId === selectedAccountId);
        setLedgerData(filteredData);
      } else {
        // Filtrar por término de búsqueda si existe
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const filtered = data.filter(item => 
            item.account.code.toLowerCase().includes(term) || 
            item.account.name.toLowerCase().includes(term)
          );
          setLedgerData(filtered);
        } else {
          setLedgerData(data);
        }
      }
    } catch (error) {
      console.error('Error cargando libro mayor:', error);
      toast.error('Error al cargar los datos del libro mayor');
    } finally {
      setLoading(false);
      setDataLoaded(true);
    }
  }, [
    accounts, 
    startDate, 
    endDate, 
    selectedAccountId, 
    selectedTypes, 
    searchTerm,
    showZeroBalances,
    dataLoaded
  ]);

  useEffect(() => {
    if (accounts.length > 0) {
      loadLedgerData();
    }
  }, [loadLedgerData, accounts]);

  // Funciones auxiliares
  function getAccountTypeLabel(type: string) {
    const types: Record<string, string> = {
      activo: 'Activos',
      pasivo: 'Pasivos',
      patrimonio: 'Patrimonio',
      ingreso: 'Ingresos',
      gasto: 'Gastos',
      costo: 'Costos',
      cuenta_orden: 'Cuentas de Orden',
      // Mantener compatibilidad con tipos antiguos
      asset: 'Activos',
      liability: 'Pasivos',
      equity: 'Patrimonio',
      revenue: 'Ingresos',
      expense: 'Gastos',
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

  // Expandir/colapsar una cuenta
  function handleAccountExpand(accountId: string) {
    setLedgerData(prevData => 
      prevData.map(item => 
        item.accountId === accountId 
          ? { ...item, expanded: !item.expanded } 
          : item
      )
    );
  }

  // Expandir/colapsar todas las cuentas
  function handleExpandAll() {
    const newExpandedState = !expanded;
    setExpanded(newExpandedState);
    setLedgerData(prevData => 
      prevData.map(item => ({ ...item, expanded: newExpandedState }))
    );
  }

  // Aplicar búsqueda
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadLedgerData();
  }

  // Resetear filtros
  function resetFilters() {
    setSearchTerm('');
    setSelectedAccountId('');
    setSelectedTypes(accountTypes);
    setShowZeroBalances(false);
    
    // Recargar con filtros reseteados
    setTimeout(() => {
      loadLedgerData();
    }, 0);
  }

  // Cambiar mes
  function changeMonth(direction: 'prev' | 'next') {
    try {
      const currentStart = new Date(startDate);
      const currentEnd = new Date(endDate);
      
      const offset = direction === 'prev' ? -1 : 1;
      const newStart = startOfMonth(addMonths(currentStart, offset));
      const newEnd = endOfMonth(addMonths(currentEnd, offset));
      
      setStartDate(formatSafeDate(newStart, 'yyyy-MM-dd'));
      setEndDate(formatSafeDate(newEnd, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('Error al cambiar mes:', error);
      toast.error('Error al cambiar el período');
    }
  }

  // Exportar a PDF (usando la función de impresión del navegador)
  function printLedger() {
    window.print();
  }

  // Exportar a Excel
  async function exportToExcel() {
    try {
      setIsExporting(true);
      
      // Crear un workbook y una hoja
      const wb = XLSX.utils.book_new();
      
      // Datos para el encabezado
      const headerData = [
        [`LIBRO MAYOR - ${startDate ? formatSafeDate(startDate, "MMMM yyyy", { locale: es }).toUpperCase() : ''}`],
        [`Período: ${startDate ? formatSafeDate(startDate, "dd/MM/yyyy") : ''} - ${endDate ? formatSafeDate(endDate, "dd/MM/yyyy") : ''}`],
        [], // Fila vacía
      ];
      
      // Datos para Excel
      const excelData: any[] = [];
      
      // Agregar filas de encabezado
      headerData.forEach(row => excelData.push(row));
      
      // Encabezados de la tabla
      excelData.push([
        'Código', 
        'Cuenta', 
        'Saldo Inicial', 
        'Débitos', 
        'Créditos', 
        'Saldo Final'
      ]);
      
      // Datos de las cuentas
      ledgerData.forEach(ledgerAccount => {
        const { account, initialBalance, totalDebit, totalCredit, finalBalance } = ledgerAccount;
        const accountNature = getAccountNature(account);
        
        // Indentación para mostrar jerarquía
        const indentation = '  '.repeat(ledgerAccount.level - 1);
        
        // Agregar fila para la cuenta
        excelData.push([
          account.code,
          indentation + account.name,
          initialBalance,
          totalDebit,
          totalCredit,
          finalBalance
        ]);
        
        // Si la cuenta está expandida, agregar los movimientos
        if (ledgerAccount.expanded && ledgerAccount.movements.length > 0) {
          // Encabezados de movimientos
          excelData.push([
            'Fecha', 
            'Nº Asiento', 
            'Descripción', 
            'Débito', 
            'Crédito', 
            'Saldo'
          ]);
          
          // Movimientos
          ledgerAccount.movements.forEach(movement => {
            excelData.push([
              movement.date ? formatSafeDate(movement.date, 'dd/MM/yyyy') : '',
              movement.entry_number,
              movement.description,
              movement.debit,
              movement.credit,
              movement.balance
            ]);
          });
          
          // Agregar fila vacía después de los movimientos
          excelData.push([]);
        }
      });
      
      // Crear hoja
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Agregar hoja al workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Libro Mayor');
      
      // Generar el archivo
      XLSX.writeFile(wb, `Libro_Mayor_${startDate ? formatSafeDate(startDate, 'yyyy-MM') : formatSafeDate(new Date(), 'yyyy-MM')}.xlsx`);
      
      toast.success('Libro Mayor exportado con éxito');
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      toast.error('Error al exportar el Libro Mayor');
    } finally {
      setIsExporting(false);
    }
  }

  // Exportar a CSV
  async function exportToCSV() {
    try {
      setIsExporting(true);
      
      let csvContent = "data:text/csv;charset=utf-8,";
      
      // Encabezados
      csvContent += "Código,Cuenta,Saldo Inicial,Débitos,Créditos,Saldo Final\n";
      
      // Datos de las cuentas
      ledgerData.forEach(ledgerAccount => {
        const { account, initialBalance, totalDebit, totalCredit, finalBalance } = ledgerAccount;
        
        // Indentación para mostrar jerarquía
        const indentation = '"' + ' '.repeat(ledgerAccount.level * 2) + '"';
        
        // Agregar fila para la cuenta
        csvContent += `${account.code},${indentation}${account.name},${initialBalance},${totalDebit},${totalCredit},${finalBalance}\n`;
        
        // Si la cuenta tiene movimientos y está expandida, agregar los movimientos
        if (ledgerAccount.expanded && ledgerAccount.movements.length > 0) {
          // Encabezados de movimientos
          csvContent += "Fecha,Nº Asiento,Descripción,Débito,Crédito,Saldo\n";
          
          // Movimientos
          ledgerAccount.movements.forEach(movement => {
            const fecha = movement.date ? formatSafeDate(movement.date, 'dd/MM/yyyy') : '';
            csvContent += `${fecha},${movement.entry_number},"${movement.description}",${movement.debit},${movement.credit},${movement.balance}\n`;
          });
          
          // Línea en blanco
          csvContent += "\n";
        }
      });
      
      // Crear enlace para descargar
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Libro_Mayor_${startDate ? formatSafeDate(startDate, 'yyyy-MM') : formatSafeDate(new Date(), 'yyyy-MM')}.csv`);
      document.body.appendChild(link);
      
      // Descargar
      link.click();
      document.body.removeChild(link);
      
      toast.success('Libro Mayor exportado con éxito');
    } catch (error) {
      console.error('Error exportando a CSV:', error);
      toast.error('Error al exportar el Libro Mayor');
    } finally {
      setIsExporting(false);
    }
  }

  // Corregir la función formatSafeDate para que acepte tanto string como Date
  function formatSafeDate(date: string | Date, formatStr: string, options?: any): string {
    try {
      // Si date ya es un objeto Date, usarlo directamente
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      
      // Verificar si la fecha es válida
      if (isNaN(dateObj.getTime())) {
        return ''; // Devolver string vacío si la fecha no es válida
      }
      return format(dateObj, formatStr, options);
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return '';
    }
  }

  return (
    <div className="container px-4 mx-auto print:w-full print:max-w-none">
      <div className="flex flex-col mb-6 print:hidden">
        <h1 className="text-2xl font-bold mb-6">Libro Mayor</h1>
        
        {/* Panel de filtros */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex items-center mb-4">
            <Filter className="h-5 w-5 mr-2 text-gray-600" />
            <h2 className="text-lg font-semibold">Filtros</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Selector de fechas */}
            <div className="flex flex-col">
              <label htmlFor="date-range" className="text-sm font-medium mb-1">Período</label>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => changeMonth('prev')}
                  className="p-1 rounded-md hover:bg-gray-100"
                  title="Mes anterior"
                >
                  <ChevronDown className="h-5 w-5 transform rotate-90" />
                </button>
                
                <div className="flex flex-1 space-x-2">
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded-md p-2 text-sm w-full"
                  />
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded-md p-2 text-sm w-full"
                  />
                </div>
                
                <button 
                  onClick={() => changeMonth('next')}
                  className="p-1 rounded-md hover:bg-gray-100"
                  title="Mes siguiente"
                >
                  <ChevronDown className="h-5 w-5 transform -rotate-90" />
                </button>
              </div>
            </div>
            
            {/* Filtro por tipo */}
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-1">Tipos de cuenta</label>
              <div className="flex flex-wrap gap-2 border rounded-md p-2 max-h-24 overflow-y-auto">
                {accountTypes.map(type => (
                  <label key={type} className="inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-blue-600"
                      checked={selectedTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTypes(prev => [...prev, type]);
                        } else {
                          setSelectedTypes(prev => prev.filter(t => t !== type));
                        }
                      }}
                    />
                    <span className="ml-1 text-sm text-gray-700">{getAccountTypeLabel(type)}</span>
                  </label>
                ))}
              </div>
            </div>
            
            {/* Búsqueda */}
            <div className="flex flex-col">
              <label htmlFor="search" className="text-sm font-medium mb-1">Buscar cuenta</label>
              <form onSubmit={handleSearch} className="flex">
                <input 
                  type="text"
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Código o nombre..."
                  className="border rounded-l-md p-2 text-sm w-full"
                />
                <button 
                  type="submit"
                  className="bg-blue-600 text-white px-3 rounded-r-md hover:bg-blue-700"
                >
                  <Search className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
          
          {/* Opciones adicionales */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            {/* Checkbox saldos en cero */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="show-zero"
                checked={showZeroBalances}
                onChange={() => setShowZeroBalances(!showZeroBalances)}
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <label htmlFor="show-zero" className="ml-2 text-sm text-gray-700">
                Mostrar cuentas sin movimientos
              </label>
            </div>
            
            {/* Botones de acción */}
            <div className="flex space-x-2">
              <button
                onClick={resetFilters}
                className="flex items-center px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Resetear
              </button>
              
              <button
                onClick={loadLedgerData}
                className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? <Loader className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                Consultar
              </button>
            </div>
          </div>
        </div>
        
        {/* Botones de exportación */}
        <div className="flex justify-end mb-4 space-x-2">
          <button
            onClick={handleExpandAll}
            className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            {expanded ? 
              <><ChevronDown className="h-4 w-4 mr-1" /> Colapsar todo</> : 
              <><ChevronRight className="h-4 w-4 mr-1" /> Expandir todo</>
            }
          </button>
          
          <button
            onClick={printLedger}
            className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            disabled={isExporting}
          >
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </button>
          
          <button
            onClick={exportToExcel}
            className="flex items-center px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
            disabled={isExporting}
          >
            {isExporting ? <Loader className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Excel
          </button>
          
          <button
            onClick={exportToCSV}
            className="flex items-center px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            disabled={isExporting}
          >
            {isExporting ? <Loader className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            CSV
          </button>
        </div>
      </div>
      
      {/* Título para impresión */}
      <div className="hidden print:block mb-4">
        <h1 className="text-center text-2xl font-bold">LIBRO MAYOR</h1>
        <p className="text-center text-lg">
          {startDate && formatSafeDate(startDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
          {startDate && endDate && " - "}
          {endDate && formatSafeDate(endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
        </p>
      </div>
      
      {/* Tabla del Libro Mayor */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader className="h-8 w-8 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-500">Cargando libro mayor...</p>
        </div>
      ) : ledgerData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-lg shadow">
          <AlertCircle className="h-16 w-16 text-gray-400 mb-4" />
          <p className="text-xl text-gray-500 mb-2">No hay datos para mostrar</p>
          <p className="text-gray-400">Prueba con diferentes filtros o fechas</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-auto print:shadow-none">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cuenta
                </th>
                <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saldo Inicial
                </th>
                <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Débitos
                </th>
                <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Créditos
                </th>
                <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saldo Final
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider print:hidden">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ledgerData.map((ledgerAccount) => (
                <React.Fragment key={ledgerAccount.accountId}>
                  {/* Fila de cuenta */}
                  <tr className={`${ledgerAccount.hasChildren ? 'font-semibold' : ''} hover:bg-gray-50`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center">
                        <div style={{ width: `${(ledgerAccount.level - 1) * 20}px` }} className="flex-shrink-0"></div>
                        <button
                          onClick={() => handleAccountExpand(ledgerAccount.accountId)}
                          className={`mr-1 ${ledgerAccount.movements.length === 0 ? 'invisible' : 'visible'} print:hidden`}
                        >
                          {ledgerAccount.expanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-500" />
                          )}
                        </button>
                        <span className={ledgerAccount.account.is_parent ? 'font-bold text-blue-800' : ''}>
                          {ledgerAccount.account.code}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center">
                        <div style={{ width: `${(ledgerAccount.level - 1) * 20}px` }} className="flex-shrink-0"></div>
                        <div className="flex items-center">
                          {ledgerAccount.account.is_parent && (
                            <div className="mr-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                              Padre
                            </div>
                          )}
                          <span className={ledgerAccount.account.is_parent ? 'font-bold text-blue-800' : ''}>
                            {ledgerAccount.account.name}
                            {ledgerAccount.hasChildren && !ledgerAccount.account.is_parent && (
                              <span className="ml-2 text-xs text-gray-500">
                                (Tiene subcuentas)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                      {formatCurrency(ledgerAccount.initialBalance)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm">
                      {formatCurrency(ledgerAccount.totalDebit)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm">
                      {formatCurrency(ledgerAccount.totalCredit)}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap text-right text-sm font-medium ${
                      ledgerAccount.finalBalance < 0 ? 'text-red-600' : 'text-blue-600'
                    }`}>
                      {formatCurrency(ledgerAccount.finalBalance)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center text-sm font-medium print:hidden">
                      <button
                        onClick={() => setSelectedAccountId(ledgerAccount.accountId)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Ver solo esta cuenta"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  
                  {/* Filas de movimientos (si está expandida) */}
                  {ledgerAccount.expanded && ledgerAccount.movements.length > 0 && (
                    <>
                      {/* Encabezados de movimientos */}
                      <tr className="bg-gray-100 text-xs">
                        <td colSpan={6} className="px-3 py-1">
                          <div className="grid grid-cols-6 gap-2 pl-10">
                            <div className="font-medium">Fecha</div>
                            <div className="font-medium">Nº Asiento</div>
                            <div className="font-medium col-span-2">Descripción</div>
                            <div className="font-medium text-right">Débito</div>
                            <div className="font-medium text-right">Crédito</div>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Movimientos */}
                      {ledgerAccount.movements.map((movement) => (
                        <tr key={movement.id} className="bg-gray-50 hover:bg-gray-100">
                          <td colSpan={6} className="px-3 py-1 border-b border-gray-200">
                            <div className="grid grid-cols-6 gap-2 pl-10 text-xs">
                              <div>
                                {movement.date ? formatSafeDate(movement.date, 'dd/MM/yyyy') : ''}
                              </div>
                              <div>{movement.entry_number}</div>
                              <div className="col-span-2">{movement.description}</div>
                              <div className="text-right">
                                {movement.debit > 0 ? formatCurrency(movement.debit) : ''}
                              </div>
                              <div className="text-right">
                                {movement.credit > 0 ? formatCurrency(movement.credit) : ''}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      
                      {/* Total de movimientos */}
                      <tr className="bg-gray-100">
                        <td colSpan={6} className="px-3 py-2 border-b border-gray-300">
                          <div className="grid grid-cols-6 gap-2 pl-10 text-xs font-semibold">
                            <div className="col-span-3 text-right">Total de movimientos:</div>
                            <div className="text-right">{formatCurrency(ledgerAccount.totalDebit)}</div>
                            <div className="text-right">{formatCurrency(ledgerAccount.totalCredit)}</div>
                            <div className="text-right"></div>
                          </div>
                        </td>
                      </tr>
                    </>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Panel informativo */}
      <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200 print:hidden">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">Información</h3>
        <ul className="text-xs text-blue-700 list-disc pl-5 space-y-1">
          <li>El Libro Mayor muestra los movimientos de cada cuenta en el período seleccionado.</li>
          <li>Solo se incluyen los asientos contables que han sido aprobados.</li>
          <li>Las cuentas padre aparecen en negrita y pueden tener subcuentas.</li>
          <li>Utilice los filtros para buscar cuentas específicas o limitar los resultados.</li>
        </ul>
      </div>
    </div>
  );
}