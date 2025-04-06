import { useState, useEffect, useCallback } from 'react';
import { Download, Filter, Loader, FileText, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type BalanceItem = {
  account: Account;
  totalDebit: number;
  totalCredit: number;
  debitBalance: number;
  creditBalance: number;
};

export function Balance() {
  const [loading, setLoading] = useState(true);
  const [balanceData, setBalanceData] = useState<BalanceItem[]>([]);
  const [periods, setPeriods] = useState<{ id: string; name: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [showAdjusted, setShowAdjusted] = useState(false);
  const [totals, setTotals] = useState({
    totalDebit: 0,
    totalCredit: 0,
    totalDebitBalance: 0,
    totalCreditBalance: 0,
  });

  useEffect(() => {
    fetchPeriods();
  }, []);

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
        return;
      }

      // Get the selected period details
      const { data: periodData, error: periodError } = await supabase
        .from('accounting_periods')
        .select('start_date, end_date')
        .eq('id', selectedPeriod)
        .single();

      if (periodError) throw periodError;

      // Get all active accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      // Optimización: En lugar de hacer una consulta por cada cuenta, hacemos una sola consulta
      // para obtener todos los movimientos del período, y luego los procesamos en memoria
      let query = supabase
        .from('journal_entry_items')
        .select(`
          id,
          account_id,
          debit,
          credit,
          journal_entries!inner(id, date, is_adjustment, is_approved, status)
        `)
        .gte('journal_entries.date', periodData.start_date)
        .lte('journal_entries.date', periodData.end_date)
        .eq('journal_entries.is_approved', true)
        .neq('journal_entries.status', 'voided');

      // Para balanza normal, excluyendo ajustes
      if (!showAdjusted) {
        query = query.eq('journal_entries.is_adjustment', false);
      }
      
      const { data: allMovements, error: movementsError } = await query;

      if (movementsError) throw movementsError;

      // Procesar movimientos por cuenta en memoria
      const accountMovements: { [accountId: string]: { debit: number, credit: number } } = {};
      
      // Inicializar el objeto con todas las cuentas
      accounts.forEach(account => {
        accountMovements[account.id] = { debit: 0, credit: 0 };
      });
      
      // Sumar los movimientos por cuenta
      allMovements.forEach(movement => {
        if (accountMovements[movement.account_id]) {
          accountMovements[movement.account_id].debit += parseFloat(movement.debit || '0');
          accountMovements[movement.account_id].credit += parseFloat(movement.credit || '0');
        }
      });

      // Calcular balanza con los datos procesados
      const balanceItems: BalanceItem[] = [];
      let totalDebit = 0;
      let totalCredit = 0;
      let totalDebitBalance = 0;
      let totalCreditBalance = 0;

      for (const account of accounts) {
        const movements = accountMovements[account.id];
        const accountTotalDebit = movements.debit;
        const accountTotalCredit = movements.credit;
        
        // Solo incluir cuentas con movimientos
        if (accountTotalDebit > 0 || accountTotalCredit > 0) {
          // Calculate balance based on account type
          let debitBalance = 0;
          let creditBalance = 0;
          const difference = accountTotalDebit - accountTotalCredit;
          
          if (account.type === 'activo' || account.type === 'gasto' || account.type === 'costo') {
            // Cuentas de naturaleza deudora
            if (difference > 0) {
              debitBalance = difference;
            } else {
              creditBalance = Math.abs(difference);
            }
          } else {
            // Cuentas de naturaleza acreedora (pasivo, patrimonio, ingreso)
            if (difference < 0) {
              creditBalance = Math.abs(difference);
            } else {
              debitBalance = difference;
            }
          }

          balanceItems.push({
            account,
            totalDebit: accountTotalDebit,
            totalCredit: accountTotalCredit,
            debitBalance,
            creditBalance,
          });

          totalDebit += accountTotalDebit;
          totalCredit += accountTotalCredit;
          totalDebitBalance += debitBalance;
          totalCreditBalance += creditBalance;
        }
      }

      setBalanceData(balanceItems);
      setTotals({
        totalDebit,
        totalCredit,
        totalDebitBalance,
        totalCreditBalance,
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
  }, [selectedPeriod, showAdjusted]);

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
      
      // Prepare data for Excel
      const excelData = [
        [showAdjusted ? 'BALANZA DE COMPROBACIÓN AJUSTADA' : 'BALANZA DE COMPROBACIÓN'],
        [`Fecha: ${formattedDate}`],
        [''],
        ['Código', 'Cuenta', 'Tipo', 'Movimientos', '', 'Saldos', ''],
        ['', '', '', 'Débito', 'Crédito', 'Deudor', 'Acreedor'],
        ...balanceData.map(item => [
          item.account.code,
          item.account.name,
          getAccountTypeLabel(item.account.type),
          item.totalDebit,
          item.totalCredit,
          item.debitBalance,
          item.creditBalance,
        ]),
        [''],
        ['TOTALES', '', '', totals.totalDebit, totals.totalCredit, totals.totalDebitBalance, totals.totalCreditBalance],
      ];

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Set column widths
      ws['!cols'] = [
        { wch: 15 }, // Código
        { wch: 40 }, // Cuenta
        { wch: 15 }, // Tipo
        { wch: 15 }, // Débito
        { wch: 15 }, // Crédito
        { wch: 15 }, // Deudor
        { wch: 15 }, // Acreedor
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

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-end gap-4 mb-6">
          <div className="flex-1">
            <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
              Periodo Contable
            </label>
            <select
              id="period"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              disabled={loading}
            >
              <option value="">Seleccionar...</option>
              {periods.map((period) => (
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
        </div>

        {/* Balance Data */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader className="h-8 w-8 text-blue-500 animate-spin" />
                <span className="ml-2 text-gray-500">Cargando datos...</span>
              </div>
            ) : balanceData.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No hay datos para mostrar
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  No se encontraron movimientos en el periodo seleccionado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Código
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cuenta
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th scope="col" colSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Movimientos
                      </th>
                      <th scope="col" colSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Saldos
                      </th>
                    </tr>
                    <tr>
                      <th scope="col" className="px-6 py-3"></th>
                      <th scope="col" className="px-6 py-3"></th>
                      <th scope="col" className="px-6 py-3"></th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Débito
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Crédito
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Deudor
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acreedor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {balanceData.map((item) => (
                      <tr key={item.account.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.account.code}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.account.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {getAccountTypeLabel(item.account.type)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {formatCurrency(item.totalDebit)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {formatCurrency(item.totalCredit)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {formatCurrency(item.debitBalance)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {formatCurrency(item.creditBalance)}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={3} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        TOTALES
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(totals.totalDebit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(totals.totalCredit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(totals.totalDebitBalance)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(totals.totalCreditBalance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}