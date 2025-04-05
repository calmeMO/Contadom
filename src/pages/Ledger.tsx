import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Book, 
  Search, 
  Filter, 
  FileDown, 
  Calendar, 
  ArrowDownUp, 
  RefreshCw, 
  AlertCircle, 
  Printer,
  ChevronDown as ChevronDownIcon, 
  ChevronRight as ChevronRightIcon,
  MoreHorizontal,
  X,
  ListFilter
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import { 
  fetchLedgerData, 
  LedgerAccount, 
  FormattedMovement,
  getAccountNature
} from '../services/ledgerService';
import { fetchAccounts, Account } from '../services/accountService';

export function Ledger() {
  // Estados
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ledgerData, setLedgerData] = useState<LedgerAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Efectos
  useEffect(() => {
    loadAccounts();
    
    // Establecer fecha por defecto al mes actual
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
      // Seleccionar todos por defecto
      setSelectedTypes(types);
    }
  }, [accounts]);

  // Cargar los datos del libro mayor cuando cambien los filtros relevantes
  useEffect(() => {
    if (accounts.length > 0) {
      loadLedgerData();
    }
  }, [
    accounts,
    startDate,
    endDate,
    selectedAccountId,
    selectedTypes,
    searchTerm,
    showZeroBalances
  ]);

  // Funciones
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

  const loadLedgerData = useCallback(async () => {
    if (!startDate || !endDate) {
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
      
      // Filtrar por cuenta seleccionada si existe
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

  // Función para obtener la etiqueta del tipo de cuenta
  function getAccountTypeLabel(type: string): string {
    const types: Record<string, string> = {
      activo: 'Activos',
      pasivo: 'Pasivos',
      patrimonio: 'Patrimonio',
      ingreso: 'Ingresos',
      gasto: 'Gastos',
      costo: 'Costos',
      cuenta_orden: 'Cuentas de Orden',
      asset: 'Activos',
      liability: 'Pasivos',
      equity: 'Patrimonio',
      revenue: 'Ingresos',
      expense: 'Gastos',
    };
    return types[type] || type;
  }

  // Función para formatear moneda
  function formatCurrency(amount: number): string {
    return amount.toLocaleString('es-DO', { 
      style: 'currency', 
      currency: 'DOP',
      minimumFractionDigits: 2
    });
  }

  // Expandir/colapsar una cuenta específica
  function handleAccountExpand(accountId: string): void {
    setLedgerData(prevData => 
      prevData.map(item => 
        item.accountId === accountId 
          ? { ...item, expanded: !item.expanded } 
          : item
      )
    );
  }

  // Expandir/colapsar todas las cuentas
  function handleExpandAll(): void {
    const newExpandedState = !expanded;
    setExpanded(newExpandedState);
    setLedgerData(prevData => 
      prevData.map(item => ({ ...item, expanded: newExpandedState }))
    );
  }

  // Manejar la búsqueda
  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();
    loadLedgerData();
  }

  // Resetear filtros
  function resetFilters(): void {
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
  function changeMonth(direction: 'prev' | 'next'): void {
    try {
      const currentStart = new Date(startDate);
      const currentEnd = new Date(endDate);
      
      const offset = direction === 'prev' ? -1 : 1;
      const newStart = startOfMonth(new Date(currentStart.setMonth(currentStart.getMonth() + offset)));
      const newEnd = endOfMonth(new Date(currentEnd.setMonth(currentEnd.getMonth() + offset)));
      
      setStartDate(format(newStart, 'yyyy-MM-dd'));
      setEndDate(format(newEnd, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('Error al cambiar mes:', error);
      toast.error('Error al cambiar el período');
    }
  }

  // Imprimir libro mayor
  function printLedger(): void {
    window.print();
  }

  // Exportar a Excel
  async function exportToExcel(): Promise<void> {
    try {
      setIsExporting(true);
      
      // Crear un workbook y una hoja
      const wb = XLSX.utils.book_new();
      
      // Datos para el encabezado
      const headerData = [
        [`LIBRO MAYOR - ${startDate ? format(new Date(startDate), "MMMM yyyy", { locale: es }).toUpperCase() : ''}`],
        [`Período: ${startDate ? format(new Date(startDate), "dd/MM/yyyy") : ''} - ${endDate ? format(new Date(endDate), "dd/MM/yyyy") : ''}`],
        [], // Fila vacía
      ];
      
      // Datos para Excel
      const excelData: any[] = [];
      
      // Agregar filas de encabezado
      headerData.forEach(row => excelData.push(row));
      
      // Agregar cabeceras de columnas
      excelData.push([
        'Código',
        'Cuenta',
        'Saldo Inicial',
        'Débitos',
        'Créditos',
        'Saldo Final'
      ]);
      
      // Agregar datos de cuentas
      ledgerData.forEach(account => {
        // Agregar la fila de la cuenta
        excelData.push([
          account.account.code,
          account.account.name,
          account.initialBalance,
          account.totalDebit,
          account.totalCredit,
          account.finalBalance
        ]);
        
        // Si la cuenta tiene movimientos, agregar detalle
        if (account.movements.length > 0 && account.expanded) {
          // Agregar cabeceras de movimientos
          excelData.push([
            'Fecha',
            'Asiento',
            'Descripción',
            'Débito',
            'Crédito',
            'Saldo'
          ]);
          
          // Agregar movimientos
          account.movements.forEach(movement => {
            excelData.push([
              movement.date,
              movement.entry_number,
              movement.description,
              movement.debit,
              movement.credit,
              movement.balance
            ]);
          });
          
          // Agregar fila en blanco después de los movimientos
          excelData.push([]);
        }
      });
      
      // Crear hoja y agregarla al libro
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, 'Libro Mayor');
      
      // Guardar archivo
      XLSX.writeFile(wb, `LibroMayor_${format(new Date(startDate), 'yyyy-MM-dd')}_${format(new Date(endDate), 'yyyy-MM-dd')}.xlsx`);
      
      toast.success('Archivo exportado exitosamente');
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      toast.error('Error al exportar a Excel');
    } finally {
      setIsExporting(false);
    }
  }

  // Exportar a CSV
  async function exportToCSV(): Promise<void> {
    try {
      setIsExporting(true);
      
      // Preparar datos para CSV
      let csvContent = "data:text/csv;charset=utf-8,";
      
      // Agregar encabezados
      csvContent += `LIBRO MAYOR - ${startDate ? format(new Date(startDate), "MMMM yyyy", { locale: es }).toUpperCase() : ''}\n`;
      csvContent += `Período: ${startDate ? format(new Date(startDate), "dd/MM/yyyy") : ''} - ${endDate ? format(new Date(endDate), "dd/MM/yyyy") : ''}\n\n`;
      
      // Cabeceras de columnas
      csvContent += "Código,Cuenta,Saldo Inicial,Débitos,Créditos,Saldo Final\n";
      
      // Datos de cuentas
      ledgerData.forEach(account => {
        // Fila de la cuenta
        csvContent += `${account.account.code},"${account.account.name}",${account.initialBalance},${account.totalDebit},${account.totalCredit},${account.finalBalance}\n`;
        
        // Si la cuenta tiene movimientos, agregar detalle
        if (account.movements.length > 0 && account.expanded) {
          // Cabeceras de movimientos
          csvContent += "Fecha,Asiento,Descripción,Débito,Crédito,Saldo\n";
          
          // Movimientos
          account.movements.forEach(movement => {
            csvContent += `${movement.date},${movement.entry_number},"${movement.description}",${movement.debit},${movement.credit},${movement.balance}\n`;
          });
          
          // Línea en blanco
          csvContent += "\n";
        }
      });
      
      // Crear enlace y descargar
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `LibroMayor_${format(new Date(startDate), 'yyyy-MM-dd')}_${format(new Date(endDate), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Archivo CSV exportado exitosamente');
    } catch (error) {
      console.error('Error exportando a CSV:', error);
      toast.error('Error al exportar a CSV');
    } finally {
      setIsExporting(false);
    }
  }

  // Formatear fecha de manera segura
  function formatSafeDate(date: string | Date, formatStr: string, options?: any): string {
    try {
      if (!date) return '';
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return format(dateObj, formatStr, options || {});
    } catch (error) {
      console.error('Error formateando fecha:', error);
      return '';
    }
  }

  // Calcular totales
  const totals = useMemo(() => {
    if (!ledgerData.length) return { initialBalance: 0, debit: 0, credit: 0, finalBalance: 0 };
    
    return ledgerData.reduce((acc, account) => {
      return {
        initialBalance: new Decimal(acc.initialBalance).plus(account.initialBalance).toNumber(),
        debit: new Decimal(acc.debit).plus(account.totalDebit).toNumber(),
        credit: new Decimal(acc.credit).plus(account.totalCredit).toNumber(),
        finalBalance: new Decimal(acc.finalBalance).plus(account.finalBalance).toNumber(),
      };
    }, { initialBalance: 0, debit: 0, credit: 0, finalBalance: 0 });
  }, [ledgerData]);

  // Renderizar
  return (
    <div className="container mx-auto px-4 py-6 animate-fadeIn">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex items-center mb-4 sm:mb-0">
          <Book className="h-6 w-6 mr-2 text-primary" />
          <h1 className="text-2xl font-bold text-gray-800">Libro Mayor</h1>
        </div>
        
        <div className="flex flex-wrap gap-2 print:hidden">
          <button 
            className="btn-icon btn-secondary"
            onClick={() => setShowFilters(!showFilters)}
            title="Mostrar/ocultar filtros"
          >
            {showFilters ? <X size={18} /> : <Filter size={18} />}
          </button>
          
          <button 
            className="btn-icon btn-secondary" 
            onClick={resetFilters}
            title="Restablecer filtros"
          >
            <RefreshCw size={18} />
          </button>
          
          <button 
            className="btn-icon btn-secondary" 
            onClick={printLedger}
            title="Imprimir"
          >
            <Printer size={18} />
          </button>
          
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn-icon btn-secondary">
              <FileDown size={18} />
            </label>
            <ul tabIndex={0} className="dropdown-content z-10 menu p-2 shadow bg-base-100 rounded-box w-52">
              <li><button onClick={exportToExcel} disabled={isExporting}>Exportar a Excel</button></li>
              <li><button onClick={exportToCSV} disabled={isExporting}>Exportar a CSV</button></li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Controles de fecha */}
      <div className="flex flex-col sm:flex-row items-center gap-2 mb-4 print:hidden">
        <div className="flex items-center bg-base-200 p-2 rounded-lg w-full sm:w-auto">
          <button
            className="btn-icon btn-sm btn-ghost"
            onClick={() => changeMonth('prev')}
            title="Mes anterior"
          >
            <ChevronLeft width={18} height={18} className="mr-2" />
          </button>
          
          <div className="flex items-center mx-2">
            <Calendar className="mr-2 h-4 w-4 text-gray-500" />
            <span className="font-medium">
              {startDate ? formatSafeDate(startDate, "MMMM yyyy", { locale: es }) : 'Seleccione un período'}
            </span>
          </div>
          
          <button
            className="btn-icon btn-sm btn-ghost"
            onClick={() => changeMonth('next')}
            title="Mes siguiente"
          >
            <ChevronRight width={18} height={18} className="ml-2" />
          </button>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="date"
            className="input input-bordered input-sm w-full"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span>a</span>
          <input
            type="date"
            className="input input-bordered input-sm w-full"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      
      {/* Panel de filtros */}
      {showFilters && (
        <div className="mb-4 p-4 bg-base-200 rounded-lg animate-fadeIn print:hidden">
          <div className="text-sm font-medium mb-2 flex items-center">
            <ListFilter className="mr-1 w-4 h-4" />
            Filtros
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Búsqueda */}
            <div>
              <form onSubmit={handleSearch} className="flex">
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  placeholder="Buscar por código o nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button 
                  type="submit" 
                  className="btn btn-sm btn-primary ml-2"
                >
                  <Search className="w-4 h-4" />
                </button>
              </form>
            </div>
            
            {/* Filtro por tipo de cuenta */}
            <div>
              <select
                className="select select-bordered select-sm w-full"
                value={selectedTypes.length === accountTypes.length ? 'all' : selectedTypes.join(',')}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'all') {
                    setSelectedTypes(accountTypes);
                  } else {
                    setSelectedTypes(value.split(','));
                  }
                }}
              >
                <option value="all">Todos los tipos de cuenta</option>
                {accountTypes.map(type => (
                  <option key={type} value={type}>
                    {getAccountTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Filtro por cuenta */}
            <div>
              <select
                className="select select-bordered select-sm w-full"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                <option value="">Todas las cuentas</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Mostrar saldos cero */}
            <div className="md:col-span-3">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm checkbox-primary"
                  checked={showZeroBalances}
                  onChange={(e) => setShowZeroBalances(e.target.checked)}
                />
                <span className="ml-2 text-sm">Mostrar cuentas con saldo cero</span>
              </label>
            </div>
          </div>
        </div>
      )}
      
      {/* Tabla del libro mayor */}
      <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
        {loading ? (
          <div className="flex justify-center items-center p-10 bg-base-100">
            <div className="loading loading-spinner loading-lg text-primary"></div>
          </div>
        ) : ledgerData.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 bg-base-100 text-center">
            <AlertCircle className="h-10 w-10 text-gray-400 mb-2" />
            <h3 className="font-medium text-lg text-gray-700">No hay datos disponibles</h3>
            <p className="text-gray-500 mt-1">
              Ajuste los filtros o seleccione un período diferente
            </p>
          </div>
        ) : (
          <>
            <div className="p-2 bg-base-100 flex justify-between items-center border-b print:hidden">
              <button
                className="btn btn-sm btn-ghost"
                onClick={handleExpandAll}
              >
                {expanded ? 'Colapsar todo' : 'Expandir todo'}
                {expanded ? <ChevronUp width={16} height={16} className="ml-1" /> : <ChevronDown width={16} height={16} className="ml-1" />}
              </button>
              
              <div className="text-sm text-gray-500">
                {ledgerData.length} cuenta{ledgerData.length !== 1 ? 's' : ''} mostrada{ledgerData.length !== 1 ? 's' : ''}
              </div>
            </div>
            
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Cuenta</th>
                  <th className="px-4 py-3 text-right">Saldo Inicial</th>
                  <th className="px-4 py-3 text-right">Débitos</th>
                  <th className="px-4 py-3 text-right">Créditos</th>
                  <th className="px-4 py-3 text-right">Saldo Final</th>
                </tr>
              </thead>
              <tbody>
                {ledgerData.map((account) => (
                  <React.Fragment key={account.accountId}>
                    {/* Fila de la cuenta */}
                    <tr className={`bg-white border-b hover:bg-gray-50 ${account.isParent ? 'font-medium' : ''}`}>
                      <td className="px-2 py-3">
                        {account.movements.length > 0 ? (
                          <button
                            className="btn btn-ghost btn-xs btn-circle"
                            onClick={() => handleAccountExpand(account.accountId)}
                          >
                            {account.expanded ? (
                              <ChevronDownIcon width={16} height={16} />
                            ) : (
                              <ChevronRightIcon width={16} height={16} />
                            )}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {account.account.code}
                      </td>
                      <td className="px-4 py-3">
                        {account.account.name}
                        {account.isParent && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({account.childrenCount} subcuenta{account.childrenCount !== 1 ? 's' : ''})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatCurrency(account.initialBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatCurrency(account.totalDebit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatCurrency(account.totalCredit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {formatCurrency(account.finalBalance)}
                      </td>
                    </tr>
                    
                    {/* Filas de movimientos */}
                    {account.expanded && account.movements.map((movement) => (
                      <tr key={movement.id} className="bg-gray-50 text-xs border-b">
                        <td className="px-2 py-2"></td>
                        <td className="px-4 py-2 text-gray-500">
                          {formatSafeDate(movement.date, 'dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center">
                            <span className="text-gray-700 font-medium">
                              Asiento #{movement.entry_number}
                            </span>
                          </div>
                          <p className="text-gray-500 mt-1 line-clamp-2">
                            {movement.description}
                          </p>
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2 text-right font-mono">
                          {movement.debit > 0 ? formatCurrency(movement.debit) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {movement.credit > 0 ? formatCurrency(movement.credit) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium">
                          {formatCurrency(movement.balance)}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Mensaje si no hay movimientos */}
                    {account.expanded && account.movements.length === 0 && (
                      <tr className="bg-gray-50 text-xs border-b">
                        <td colSpan={7} className="px-4 py-2 text-center text-gray-500">
                          No hay movimientos en el período seleccionado
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                
                {/* Fila de totales */}
                <tr className="bg-base-200 font-medium">
                  <td className="px-2 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3">TOTALES</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatCurrency(totals.initialBalance)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatCurrency(totals.debit)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatCurrency(totals.credit)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatCurrency(totals.finalBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
      
      {/* Leyenda y notas */}
      <div className="mt-4 text-xs text-gray-500 print:hidden">
        <div className="flex items-center">
          <ChevronDownIcon width={14} height={14} className="mr-1" />
          <span>Expandir para ver los movimientos de la cuenta</span>
        </div>
        <p className="mt-1">
          Nota: Los saldos iniciales son calculados sumando todos los movimientos aprobados anteriores a la fecha de inicio.
        </p>
      </div>
    </div>
  );
}

// Componentes auxiliares para los íconos
interface IconProps {
  width?: number;
  height?: number;
  className?: string;
}

function ChevronUp({ width = 24, height = 24, className = '' }: IconProps) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      width={width}
      height={height}
      className={className}
    >
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  );
}

function ChevronLeft({ width = 24, height = 24, className = '' }: IconProps) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      width={width}
      height={height}
      className={className}
    >
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  );
}

function ChevronDown({ width = 24, height = 24, className = '' }: IconProps) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      width={width}
      height={height}
      className={className}
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );
}

function ChevronRight({ width = 24, height = 24, className = '' }: IconProps) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      width={width}
      height={height}
      className={className}
    >
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );
} 