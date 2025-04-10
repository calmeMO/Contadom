import { useState, useEffect, useCallback } from 'react';
import { Download, Filter, Loader, FileText, HelpCircle, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  nature?: string;
};

type BalanceItem = {
  account: Account;
  totalDebit: number;
  totalCredit: number;
  debitBalance: number;
  creditBalance: number;
  isParent?: boolean;
};

export function Balance() {
  const [loading, setLoading] = useState(true);
  const [balanceData, setBalanceData] = useState<BalanceItem[]>([]);
  const [periods, setPeriods] = useState<{ id: string; name: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [showAdjusted, setShowAdjusted] = useState(false);
  const [showParentAccounts, setShowParentAccounts] = useState(true);
  const [totals, setTotals] = useState({
    totalDebit: 0,
    totalCredit: 0,
    totalDebitBalance: 0,
    totalCreditBalance: 0,
  });
  const [isBalanced, setIsBalanced] = useState(true);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [filteredData, setFilteredData] = useState<BalanceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPeriods();
  }, []);

  // Función para redondear valores numéricos a 2 decimales
  const roundToTwo = (num: Decimal): number => {
    return num.toDecimalPlaces(2).toNumber();
  };

  const fetchBalanceData = useCallback(async () => {
    try {
      setLoading(true);

      // Verificar que selectedPeriod tenga un valor válido
      if (!selectedPeriod) {
        setBalanceData([]);
        setTotals({
          totalDebit: 0,
          totalCredit: 0,
          totalDebitBalance: 0,
          totalCreditBalance: 0,
        });
        setIsBalanced(true);
        return;
      }

      // Verificar primero si el período existe
      const { data: periodExists, error: periodCheckError } = await supabase
        .from('accounting_periods')
        .select('id')
        .eq('id', selectedPeriod)
        .maybeSingle();
        
      if (!periodExists || periodCheckError) {
        console.error('Error o período no encontrado:', periodCheckError || 'No data');
        toast.error('El período seleccionado no existe o no está disponible');
        setBalanceData([]);
        setTotals({
          totalDebit: 0,
          totalCredit: 0,
          totalDebitBalance: 0,
          totalCreditBalance: 0,
        });
        setIsBalanced(true);
        setLoading(false);
        return;
      }

      // Get the selected period details
      const { data: periodData, error: periodError } = await supabase
        .from('accounting_periods')
        .select('start_date, end_date')
        .eq('id', selectedPeriod)
        .single();

      if (periodError) {
        console.error('Error al obtener detalles del período:', periodError);
        toast.error('Error al obtener detalles del período');
        setLoading(false);
        return;
      }

      // Get all active accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type, nature, parent_id')
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      // Crear mapa de cuentas para acceso rápido
      const accountMap = accounts.reduce((map: Record<string, Account & { parent_id?: string }>, acc) => {
        map[acc.id] = acc;
        return map;
      }, {});

      // Optimización: En lugar de hacer una consulta por cada cuenta, hacemos una sola consulta
      // para obtener todos los movimientos del período, y luego los procesamos en memoria
      let query = supabase
        .from('journal_entry_items')
        .select(`
          id,
          account_id,
          debit,
          credit,
          journal_entries!inner(id, date, is_adjustment, is_approved, status, is_balanced)
        `)
        .gte('journal_entries.date', periodData.start_date)
        .lte('journal_entries.date', periodData.end_date)
        .eq('journal_entries.is_approved', true)
        .eq('journal_entries.is_balanced', true)  // Solo usar asientos balanceados
        .neq('journal_entries.status', 'voided');

      // Para balanza normal, excluyendo ajustes
      if (!showAdjusted) {
        query = query.eq('journal_entries.is_adjustment', false);
      }
      
      const { data: allMovements, error: movementsError } = await query;

      if (movementsError) throw movementsError;

      // Procesar movimientos por cuenta en memoria
      const accountMovements: { [accountId: string]: { debit: Decimal, credit: Decimal } } = {};
      
      // Inicializar el objeto con todas las cuentas
      accounts.forEach(account => {
        accountMovements[account.id] = { debit: new Decimal(0), credit: new Decimal(0) };
      });
      
      // Sumar los movimientos por cuenta usando Decimal.js para mayor precisión
      allMovements.forEach(movement => {
        if (accountMovements[movement.account_id]) {
          accountMovements[movement.account_id].debit = accountMovements[movement.account_id].debit.plus(new Decimal(movement.debit || '0'));
          accountMovements[movement.account_id].credit = accountMovements[movement.account_id].credit.plus(new Decimal(movement.credit || '0'));
        }
      });

      // Calcular totales por cuenta padre
      const parentTotals: { [parentId: string]: { debit: Decimal, credit: Decimal } } = {};
      
      // Preparar la balanza incluyendo cuentas con movimientos
      const balanceItems: BalanceItem[] = [];
      let totalDebitDecimal = new Decimal(0);
      let totalCreditDecimal = new Decimal(0);
      let totalDebitBalanceDecimal = new Decimal(0);
      let totalCreditBalanceDecimal = new Decimal(0);

      // Primero procesar las cuentas con movimientos
      for (const account of accounts) {
        const movements = accountMovements[account.id];
        const accountTotalDebit = movements.debit;
        const accountTotalCredit = movements.credit;
        
        // Acumular totales para cuentas padre
        if (account.parent_id && (accountTotalDebit.greaterThan(0) || accountTotalCredit.greaterThan(0))) {
          if (!parentTotals[account.parent_id]) {
            parentTotals[account.parent_id] = { debit: new Decimal(0), credit: new Decimal(0) };
          }
          parentTotals[account.parent_id].debit = parentTotals[account.parent_id].debit.plus(accountTotalDebit);
          parentTotals[account.parent_id].credit = parentTotals[account.parent_id].credit.plus(accountTotalCredit);
        }
        
        // Solo incluir cuentas con movimientos
        if (accountTotalDebit.greaterThan(0) || accountTotalCredit.greaterThan(0)) {
          // Calculate balance based on account nature (using nature field instead of type)
          let debitBalance = new Decimal(0);
          let creditBalance = new Decimal(0);
          const difference = accountTotalDebit.minus(accountTotalCredit);
          
          // Determinar la naturaleza de la cuenta (preferir el campo nature si está disponible)
          const accountNature = account.nature || 
            (account.type === 'activo' || account.type === 'gasto' || account.type === 'costo' ? 'deudora' : 'acreedora');
          
          if (accountNature === 'deudora') {
            // Cuentas de naturaleza deudora
            if (difference.greaterThanOrEqualTo(0)) {
              debitBalance = difference;
            } else {
              creditBalance = difference.abs();
            }
          } else {
            // Cuentas de naturaleza acreedora
            if (difference.lessThan(0)) {
              creditBalance = difference.abs();
            } else {
              debitBalance = difference;
            }
          }

          balanceItems.push({
            account,
            totalDebit: roundToTwo(accountTotalDebit),
            totalCredit: roundToTwo(accountTotalCredit),
            debitBalance: roundToTwo(debitBalance),
            creditBalance: roundToTwo(creditBalance),
            isParent: false
          });

          totalDebitDecimal = totalDebitDecimal.plus(accountTotalDebit);
          totalCreditDecimal = totalCreditDecimal.plus(accountTotalCredit);
          totalDebitBalanceDecimal = totalDebitBalanceDecimal.plus(debitBalance);
          totalCreditBalanceDecimal = totalCreditBalanceDecimal.plus(creditBalance);
        }
      }
      
      // Ahora agregar las cuentas padre con sus totales acumulados
      if (showParentAccounts) {
        for (const [parentId, totals] of Object.entries(parentTotals)) {
          const parentAccount = accountMap[parentId];
          if (parentAccount) {
            const parentTotalDebit = totals.debit;
            const parentTotalCredit = totals.credit;
            const difference = parentTotalDebit.minus(parentTotalCredit);
            
            let debitBalance = new Decimal(0);
            let creditBalance = new Decimal(0);
            
            // Determinar la naturaleza de la cuenta padre (preferir el campo nature si está disponible)
            const accountNature = parentAccount.nature || 
              (parentAccount.type === 'activo' || parentAccount.type === 'gasto' || parentAccount.type === 'costo' ? 'deudora' : 'acreedora');
            
            if (accountNature === 'deudora') {
              // Cuentas de naturaleza deudora
              if (difference.greaterThanOrEqualTo(0)) {
                debitBalance = difference;
              } else {
                creditBalance = difference.abs();
              }
            } else {
              // Cuentas de naturaleza acreedora
              if (difference.lessThan(0)) {
                creditBalance = difference.abs();
              } else {
                debitBalance = difference;
              }
            }
            
            balanceItems.push({
              account: parentAccount,
              totalDebit: roundToTwo(parentTotalDebit),
              totalCredit: roundToTwo(parentTotalCredit),
              debitBalance: roundToTwo(debitBalance),
              creditBalance: roundToTwo(creditBalance),
              isParent: true
            });
          }
        }
      }
      
      // Ordenar por código de cuenta
      balanceItems.sort((a, b) => a.account.code.localeCompare(b.account.code));

      // Verificar que la balanza esté equilibrada (principio contable fundamental)
      const diffMovements = totalDebitDecimal.minus(totalCreditDecimal).abs();
      const diffBalances = totalDebitBalanceDecimal.minus(totalCreditBalanceDecimal).abs();
      
      // Permitimos una pequeña diferencia debido a errores de redondeo (0.01)
      const isBalancedMovements = diffMovements.lessThanOrEqualTo(0.01);
      const isBalancedSaldos = diffBalances.lessThanOrEqualTo(0.01);
      
      const balanceStatus = isBalancedMovements && isBalancedSaldos;
      setIsBalanced(balanceStatus);
      
      if (!balanceStatus) {
        console.warn('La balanza no está equilibrada:', {
          diferencia_movimientos: diffMovements.toString(),
          diferencia_saldos: diffBalances.toString()
        });
      }

      setBalanceData(balanceItems);
      setTotals({
        totalDebit: roundToTwo(totalDebitDecimal),
        totalCredit: roundToTwo(totalCreditDecimal),
        totalDebitBalance: roundToTwo(totalDebitBalanceDecimal),
        totalCreditBalance: roundToTwo(totalCreditBalanceDecimal),
      });
    } catch (error: unknown) {
      console.error('Error fetching balance data:', error);
      
      // Mensaje de error genérico
      toast.error('Error al cargar los datos de la balanza');
      
      // O un mensaje más específico si podemos extraer información del error
      if (error instanceof Error) {
        toast.error(`Error: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, showAdjusted, showParentAccounts]);

  // Aplicar filtros y paginación
  useEffect(() => {
    // Filtrar datos según término de búsqueda
    const filtered = searchTerm 
      ? balanceData.filter(item => 
          item.account.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
          item.account.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : balanceData;
      
    setFilteredData(filtered);
    setCurrentPage(1); // Resetear a primera página cuando cambian los filtros
  }, [balanceData, searchTerm]);

  // Calcular datos para la página actual
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  // Cambiar de página
  const paginate = (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  useEffect(() => {
    if (selectedPeriod) {
      fetchBalanceData();
    }
  }, [fetchBalanceData, selectedPeriod]);

  async function fetchPeriods() {
    try {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('id, name')
        .order('start_date', { ascending: false });

      if (error) throw error;

      setPeriods(data || []);
      
      // Select the most recent period by default
      if (data && data.length > 0) {
        setSelectedPeriod(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching periods:', error);
      toast.error('Error al cargar los periodos contables');
    }
  }

  function formatCurrency(amount: number) {
    return amount.toLocaleString('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    });
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
      // Compatibilidad con tipos antiguos
      asset: 'Activo',
      liability: 'Pasivo',
      equity: 'Capital',
      revenue: 'Ingreso',
      expense: 'Gasto'
    };
    return types[type] || type;
  }

  function exportToExcel() {
    try {
      // Get current date for filename and report heading
      const currentDate = new Date();
      const formattedDate = format(currentDate, 'dd/MM/yyyy');
      
      // Obtener nombre del período seleccionado
      const selectedPeriodName = periods.find(p => p.id === selectedPeriod)?.name || '';
      
      // Prepare data for Excel
      const excelData = [
        [showAdjusted ? 'BALANZA DE COMPROBACIÓN AJUSTADA' : 'BALANZA DE COMPROBACIÓN'],
        [`Fecha: ${formattedDate}`],
        [`Período: ${selectedPeriodName}`],
        [`Tipo: ${showAdjusted ? 'Ajustada' : 'Regular'}`],
        [`Incluye cuentas padre: ${showParentAccounts ? 'Sí' : 'No'}`],
        [`Estado: ${isBalanced ? 'Balanceada' : 'No Balanceada - Revisar'}`],
        [''],
        ['Código', 'Cuenta', 'Tipo', 'Naturaleza', 'Movimientos', '', 'Saldos', '', 'Tipo de cuenta'],
        ['', '', '', '', 'Débito', 'Crédito', 'Deudor', 'Acreedor', ''],
        ...balanceData.map(item => [
          item.account.code,
          item.account.name,
          getAccountTypeLabel(item.account.type),
          item.account.nature ? (item.account.nature === 'deudora' ? 'Deudora' : 'Acreedora') : 
            (item.account.type === 'activo' || item.account.type === 'gasto' || item.account.type === 'costo' ? 'Deudora' : 'Acreedora'),
          item.totalDebit,
          item.totalCredit,
          item.debitBalance,
          item.creditBalance,
          item.isParent ? 'Cuenta Padre' : 'Cuenta Detalle'
        ]),
        [''],
        ['TOTALES', '', '', '', totals.totalDebit, totals.totalCredit, totals.totalDebitBalance, totals.totalCreditBalance, ''],
      ];

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Set column widths
      ws['!cols'] = [
        { wch: 15 }, // Código
        { wch: 40 }, // Cuenta
        { wch: 15 }, // Tipo
        { wch: 15 }, // Naturaleza
        { wch: 15 }, // Débito
        { wch: 15 }, // Crédito
        { wch: 15 }, // Deudor
        { wch: 15 }, // Acreedor
        { wch: 15 }, // Tipo de cuenta
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, showAdjusted ? 'Balanza Ajustada' : 'Balanza');

      // Generate file name with current date
      const fileName = `balanza_comprobacion${showAdjusted ? '_ajustada' : ''}_${format(currentDate, 'yyyyMMdd')}.xlsx`;

      // Save file
      XLSX.writeFile(wb, fileName);
      toast.success('Archivo Excel generado correctamente');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Error al exportar a Excel');
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{showAdjusted ? 'Balanza de Comprobación Ajustada' : 'Balanza de Comprobación'}</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => exportToExcel()}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            disabled={loading || balanceData.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={loading || balanceData.length === 0}
          >
            <FileText className="w-4 h-4 mr-2" />
            Imprimir
          </button>
        </div>
      </div>

      {!isBalanced && balanceData.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-md flex items-center">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
          <span className="text-yellow-800">
            La balanza no está cuadrada. La diferencia entre los totales de débito y crédito o entre los saldos deudores y acreedores excede el margen de error permitido.
          </span>
        </div>
      )}

      <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex-1">
              <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
                Período
              </label>
              <select
                id="period"
                className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                disabled={loading}
              >
                <option value="">Seleccione un período</option>
                {periods.map(period => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
            </div>
          
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                Tipo de Balanza
                <div className="relative ml-1 group">
                  <HelpCircle size={16} className="text-gray-400 cursor-help" />
                  <div className="absolute left-0 bottom-full mb-2 w-72 bg-black text-white text-xs rounded p-2 hidden group-hover:block z-10">
                    <p><strong>Regular:</strong> Muestra los saldos sin incluir asientos de ajuste.</p>
                    <p className="mt-1"><strong>Ajustada:</strong> Incluye todos los asientos, incluyendo los de ajuste.</p>
                  </div>
                </div>
              </label>
              <div className="flex gap-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="form-radio h-4 w-4 text-blue-600"
                    checked={!showAdjusted}
                    onChange={() => setShowAdjusted(false)}
                    name="balanceType"
                  />
                  <span className="ml-2">Regular</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="form-radio h-4 w-4 text-blue-600"
                    checked={showAdjusted}
                    onChange={() => setShowAdjusted(true)}
                    name="balanceType"
                  />
                  <span className="ml-2">Ajustada</span>
                </label>
              </div>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                Mostrar cuentas padre
                <div className="relative ml-1 group">
                  <HelpCircle size={16} className="text-gray-400 cursor-help" />
                  <div className="absolute left-0 bottom-full mb-2 w-72 bg-black text-white text-xs rounded p-2 hidden group-hover:block z-10">
                    <p>Cuando está activado, muestra las cuentas padre con los totales acumulados de sus subcuentas.</p>
                  </div>
                </div>
              </label>
              <div className="flex gap-4">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-blue-600"
                    checked={showParentAccounts}
                    onChange={() => setShowParentAccounts(!showParentAccounts)}
                    name="showParentAccounts"
                  />
                  <span className="ml-2">Mostrar cuentas padre</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Filtro de búsqueda */}
        <div className="mb-4 flex items-center p-4">
          <input
            type="text"
            placeholder="Buscar por código o nombre de cuenta..."
            className="p-2 border rounded w-64 mr-4"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          <select 
            className="p-2 border rounded w-32 mr-4"
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
          >
            <option value="10">10 filas</option>
            <option value="20">20 filas</option>
            <option value="50">50 filas</option>
            <option value="100">100 filas</option>
          </select>
          
          <span className="text-sm text-gray-600">
            Mostrando {filteredData.length ? indexOfFirstItem + 1 : 0} - {Math.min(indexOfLastItem, filteredData.length)} de {filteredData.length} registros
          </span>
        </div>

        {/* Balance Data */}
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <Loader className="animate-spin w-8 h-8" />
              <span className="ml-2">Cargando datos...</span>
            </div>
          ) : balanceData.length === 0 ? (
            <div className="text-center p-8 bg-white">
              <h3 className="text-lg font-medium text-gray-500">No hay datos disponibles para mostrar</h3>
              <p className="text-sm text-gray-400 mt-1">Seleccione un período para ver la balanza de comprobación</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 table-fixed">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="w-1/12 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Código
                        </th>
                        <th scope="col" className="w-3/12 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cuenta
                        </th>
                        <th scope="col" className="w-1/12 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tipo
                        </th>
                        <th scope="col" className="w-1/12 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Naturaleza
                        </th>
                        <th scope="col" colSpan={2} className="w-2/12 px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Movimientos
                        </th>
                        <th scope="col" colSpan={2} className="w-2/12 px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Saldos
                        </th>
                      </tr>
                      <tr>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-400"></th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-400"></th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-400"></th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-400"></th>
                        <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Débito
                        </th>
                        <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Crédito
                        </th>
                        <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Deudor
                        </th>
                        <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Acreedor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentItems.map((item, index) => (
                        <tr key={`${item.account.id}-${index}`} className={`${item.isParent ? 'bg-gray-50 font-semibold' : ''} hover:bg-gray-50`}>
                          <td className="px-3 py-2 text-sm text-gray-900 truncate" title={item.account.code}>
                            {item.account.code}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 truncate" title={`${item.account.name} ${item.isParent ? '(Cuenta Padre)' : ''}`}>
                            {item.account.name} {item.isParent && '(Cuenta Padre)'}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 truncate" title={getAccountTypeLabel(item.account.type)}>
                            {getAccountTypeLabel(item.account.type)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 truncate">
                            {item.account.nature ? (item.account.nature === 'deudora' ? 'Deudora' : 'Acreedora') : 
                              (item.account.type === 'activo' || item.account.type === 'gasto' || item.account.type === 'costo' ? 'Deudora' : 'Acreedora')}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(item.totalDebit)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(item.totalCredit)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(item.debitBalance)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(item.creditBalance)}
                          </td>
                        </tr>
                      ))}
                      
                      {/* Totales siempre visibles al final */}
                      <tr className={`sticky bottom-0 bg-gray-100 font-semibold ${!isBalanced ? 'text-red-600' : ''}`}>
                        <td colSpan={4} className="px-3 py-3 text-sm text-gray-900 border-t border-gray-300">
                          <span className="font-bold">TOTALES</span> {!isBalanced && '(NO CUADRADO)'}
                        </td>
                        <td className="px-3 py-3 text-sm text-right border-t border-gray-300 tabular-nums">
                          {formatCurrency(totals.totalDebit)}
                        </td>
                        <td className="px-3 py-3 text-sm text-right border-t border-gray-300 tabular-nums">
                          {formatCurrency(totals.totalCredit)}
                        </td>
                        <td className="px-3 py-3 text-sm text-right border-t border-gray-300 tabular-nums">
                          {formatCurrency(totals.totalDebitBalance)}
                        </td>
                        <td className="px-3 py-3 text-sm text-right border-t border-gray-300 tabular-nums">
                          {formatCurrency(totals.totalCreditBalance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                  <div className="mb-3 sm:mb-0 text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirstItem + 1}</span> a <span className="font-medium">{Math.min(indexOfLastItem, filteredData.length)}</span> de <span className="font-medium">{filteredData.length}</span> resultados
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button
                        onClick={() => paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        <span className="sr-only">Anterior</span>
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      
                      {/* En pantallas pequeñas solo mostrar flechas y página actual */}
                      <span className="sm:hidden inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm">
                        Página {currentPage} de {totalPages}
                      </span>
                      
                      {/* En pantallas medianas y grandes mostrar números de página */}
                      <div className="hidden sm:inline-flex">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          // Mostrar 5 páginas alrededor de la actual
                          let pageNum = currentPage;
                          if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          if (pageNum > 0 && pageNum <= totalPages) {
                            return (
                              <button
                                key={pageNum}
                                onClick={() => paginate(pageNum)}
                                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                  currentPage === pageNum
                                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          }
                          return null;
                        })}
                      </div>
                      
                      <button
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        <span className="sr-only">Siguiente</span>
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </nav>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}