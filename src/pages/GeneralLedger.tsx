import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Loader2, FileDown, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

// Tipos de datos
interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  parent_id: string | null;
  is_parent: boolean;
  is_active: boolean;
  level?: number;
  indentation?: string;
  children?: Account[];
}

interface HierarchicalAccount extends Account {
  children: HierarchicalAccount[];
  initial_balance: number;
  debits: number;
  credits: number;
  final_balance: number;
  level: number;
  indentation: string;
  isExpanded?: boolean;
}

interface FiscalYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface Month {
  id: string;
  month: number;
  year: number;
  name: string;
  fiscal_year_id: string;
  is_active: boolean;
}

interface LedgerEntry {
  account_id: string;
  account_code: string;
  account_name: string;
  initial_balance: number;
  debits: number;
  credits: number;
  final_balance: number;
  parent_id: string | null;
  is_parent: boolean;
  level?: number;
  indentation?: string;
  isExpanded?: boolean;
}

const GeneralLedger: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('');
  const [months, setMonths] = useState<Month[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [previousMonthId, setPreviousMonthId] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [hierarchicalData, setHierarchicalData] = useState<HierarchicalAccount[]>([]);
  const [selectedMonthName, setSelectedMonthName] = useState<string>('');
  const [allExpanded, setAllExpanded] = useState<boolean>(false);

  // Obtener años fiscales activos
  useEffect(() => {
    const getFiscalYears = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('accounting_periods')
          .select('id, name, start_date, end_date')
          .eq('is_month', false)
          .eq('is_active', true)
          .order('start_date', { ascending: false });

        if (error) {
          throw error;
        }

        setFiscalYears(data || []);
        if (data && data.length > 0) {
          setSelectedFiscalYear(data[0].id);
        }
      } catch (error: any) {
        toast.error(`Error al cargar años fiscales: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    getFiscalYears();
  }, []);

  // Obtener meses cuando se selecciona un año fiscal
  useEffect(() => {
    const getMonths = async () => {
      if (!selectedFiscalYear) return;
      
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('monthly_accounting_periods')
          .select('id, month, year, name, fiscal_year_id, is_active')
          .eq('fiscal_year_id', selectedFiscalYear)
          .order('year', { ascending: true })
          .order('month', { ascending: true });

        if (error) {
          throw error;
        }

        setMonths(data || []);
        
        // Buscar y seleccionar automáticamente el mes activo
        const activePeriod = data?.find(month => month.is_active);
        if (activePeriod) {
          setSelectedMonth(activePeriod.id);
        } else {
          setSelectedMonth('');
        }
        
        setPreviousMonthId(null);
      } catch (error: any) {
        toast.error(`Error al cargar meses: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    getMonths();
  }, [selectedFiscalYear]);

  // Encontrar el mes anterior cuando se selecciona un mes
  useEffect(() => {
    if (!selectedMonth || !months.length) {
      // Limpiar datos cuando no hay mes seleccionado
      setLedgerData([]);
      setHierarchicalData([]);
      setPreviousMonthId(null);
      setSelectedMonthName('');
      return;
    }
    
    const currentMonthIndex = months.findIndex(m => m.id === selectedMonth);
    const currentMonth = months.find(m => m.id === selectedMonth);
    
    if (currentMonth) {
      setSelectedMonthName(currentMonth.name);
    }
    
    if (currentMonthIndex > 0) {
      setPreviousMonthId(months[currentMonthIndex - 1].id);
    } else {
      setPreviousMonthId(null);
    }
    
    // Cargar datos del libro mayor para el mes seleccionado
    loadLedgerData();
  }, [selectedMonth, months]);

  // Función para detectar y cargar automáticamente el período activo
  useEffect(() => {
    const loadActivePeriod = async () => {
      if (!selectedFiscalYear && fiscalYears.length > 0) {
        try {
          // 1. Obtener el año fiscal activo
          const { data: activeYears, error: yearsError } = await supabase
            .from('accounting_periods')
            .select('id')
            .eq('is_active', true)
            .eq('is_month', false)
            .limit(1);
            
          if (yearsError) throw yearsError;
          
          if (activeYears && activeYears.length > 0) {
            setSelectedFiscalYear(activeYears[0].id);
          } else if (fiscalYears.length > 0) {
            // Si no hay año fiscal activo, usar el primero disponible
            setSelectedFiscalYear(fiscalYears[0].id);
          }
        } catch (error: any) {
          console.error('Error al cargar año fiscal activo:', error);
        }
      }
    };

    loadActivePeriod();
  }, [fiscalYears, selectedFiscalYear]);

  // Función para construir la jerarquía de cuentas
  const buildAccountHierarchy = (accounts: Account[]): HierarchicalAccount[] => {
    const accountsMap: Record<string, HierarchicalAccount> = {};
    const rootAccounts: HierarchicalAccount[] = [];

    // Primero, transformar todas las cuentas en cuentas jerárquicas con valores iniciales
    accounts.forEach(account => {
      accountsMap[account.id] = {
        ...account,
        children: [],
        initial_balance: 0,
        debits: 0,
        credits: 0,
        final_balance: 0,
        level: 0,
        indentation: '',
        isExpanded: allExpanded || expandedAccounts[account.id] || false
      };
    });

    // Después, construir la jerarquía
    accounts.forEach(account => {
      const hierarchicalAccount = accountsMap[account.id];
      
      if (account.parent_id && accountsMap[account.parent_id]) {
        // Agregar como hijo a la cuenta padre
        accountsMap[account.parent_id].children.push(hierarchicalAccount);
      } else {
        // Agregar como cuenta raíz
        rootAccounts.push(hierarchicalAccount);
      }
    });

    // Calcular niveles y indentación
    const calculateLevel = (account: HierarchicalAccount, level: number) => {
      account.level = level;
      account.indentation = '  '.repeat(level);
      
      account.children.sort((a, b) => a.code.localeCompare(b.code));
      
      account.children.forEach(child => {
        calculateLevel(child, level + 1);
      });
    };

    rootAccounts.sort((a, b) => a.code.localeCompare(b.code));
    rootAccounts.forEach(rootAccount => {
      calculateLevel(rootAccount, 0);
    });

    return rootAccounts;
  };

  // Función para aplanar la jerarquía de cuentas en una lista
  const flattenHierarchy = (hierarchy: HierarchicalAccount[]): LedgerEntry[] => {
    const result: LedgerEntry[] = [];
    
    const processAccount = (account: HierarchicalAccount) => {
      result.push({
        account_id: account.id,
        account_code: account.code,
        account_name: account.name,
        initial_balance: account.initial_balance,
        debits: account.debits,
        credits: account.credits,
        final_balance: account.final_balance,
        parent_id: account.parent_id,
        is_parent: account.is_parent,
        level: account.level,
        indentation: account.indentation,
        isExpanded: account.isExpanded
      });
      
      if (account.isExpanded) {
        account.children.forEach(child => {
          processAccount(child);
        });
      }
    };
    
    hierarchy.forEach(rootAccount => {
      processAccount(rootAccount);
    });
    
    return result;
  };

  // Función para cargar los datos del libro mayor
  const loadLedgerData = async () => {
    if (!selectedMonth) return;

    try {
      setLoading(true);
      
      // Verificar si hay asientos anulados en el período
      const { data: voidedEntries, error: voidedError } = await supabase
        .from('journal_entries')
        .select('id, entry_number, date, status')
        .eq('monthly_period_id', selectedMonth)
        .eq('status', 'voided');
        
      if (voidedError) throw voidedError;
      
      // Log para confirmar los asientos anulados
      if (voidedEntries && voidedEntries.length > 0) {
        console.log('Asientos anulados que se excluirán:', voidedEntries);
      } else {
        console.log('No hay asientos anulados en este período');
      }
      
      // 1. Obtener todas las cuentas (activas y no activas)
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type, nature, parent_id, is_parent, is_active')
        .order('code');

      if (accountsError) throw accountsError;
      
      // Incluir todas las cuentas para la jerarquía, pero solo mostrar las activas en el cálculo
      const allAccountsData: Account[] = accountsData || [];
      
      setAllAccounts(allAccountsData);
      
      // 2. Obtener la información del mes seleccionado
      const { data: monthData, error: monthError } = await supabase
        .from('monthly_accounting_periods')
        .select('start_date, end_date')
        .eq('id', selectedMonth)
        .single();
        
      if (monthError) throw monthError;
      
      // 3. Construir la jerarquía de cuentas
      const hierarchy = buildAccountHierarchy(allAccountsData);
      
      // 4. OPTIMIZACIÓN: Obtener TODOS los asientos anteriores de una sola vez
      let initialBalancesByAccount: Record<string, number> = {};
      
      if (previousMonthId) {
        // Obtener todos los asientos anteriores en una sola consulta
        const { data: allPreviousItems, error: previousItemsError } = await supabase
          .from('journal_entry_items')
          .select(`
            account_id,
            debit,
            credit,
            journal_entries!inner(date, is_approved, status)
          `)
          .lt('journal_entries.date', monthData.start_date)
          .gte('journal_entries.date', '1900-01-01')
          .eq('journal_entries.is_approved', true)
          .neq('journal_entries.status', 'voided');
          
        if (previousItemsError) throw previousItemsError;
        
        // Procesar los asientos y calcular saldos iniciales por cuenta
        if (allPreviousItems && allPreviousItems.length > 0) {
          allPreviousItems.forEach(item => {
            const accountId = item.account_id;
            if (!initialBalancesByAccount[accountId]) {
              initialBalancesByAccount[accountId] = 0;
            }
            
            initialBalancesByAccount[accountId] += (item.debit || 0) - (item.credit || 0);
          });
        }
      }
      
      // 5. OPTIMIZACIÓN: Obtener TODOS los asientos del mes actual en una sola consulta
      const { data: allCurrentItems, error: currentItemsError } = await supabase
        .from('journal_entry_items')
        .select(`
          account_id,
          debit,
          credit,
          journal_entries!inner(date, is_approved, status)
        `)
        .gte('journal_entries.date', monthData.start_date)
        .lte('journal_entries.date', monthData.end_date)
        .eq('journal_entries.is_approved', true)
        .neq('journal_entries.status', 'voided');
        
      if (currentItemsError) throw currentItemsError;
      
      // Log para depuración
      console.log('Asientos del mes actual:', allCurrentItems);
      
      // Procesar los movimientos del mes actual por cuenta
      let debitsByAccount: Record<string, number> = {};
      let creditsByAccount: Record<string, number> = {};
      
      if (allCurrentItems && allCurrentItems.length > 0) {
        allCurrentItems.forEach(item => {
          const accountId = item.account_id;
          
          if (!debitsByAccount[accountId]) {
            debitsByAccount[accountId] = 0;
          }
          if (!creditsByAccount[accountId]) {
            creditsByAccount[accountId] = 0;
          }
          
          debitsByAccount[accountId] += (item.debit || 0);
          creditsByAccount[accountId] += (item.credit || 0);
        });
      }
      
      // Log para depuración
      console.log('Débitos por cuenta:', debitsByAccount);
      console.log('Créditos por cuenta:', creditsByAccount);
      
      // 6. Asignar valores a las cuentas y calcular saldos
      const applyAccountValues = (accounts: HierarchicalAccount[]) => {
        for (const account of accounts) {
          // Solo asignar valores directos a cuentas que no son padre (cuentas de movimiento)
          if (account.is_active && !account.is_parent) {
            // Asignar saldo inicial (ajustando según la naturaleza de la cuenta)
            let initialBalance = initialBalancesByAccount[account.id] || 0;
            if (account.nature === 'credit') {
              initialBalance = -initialBalance;
            }
            account.initial_balance = initialBalance;
            
            // Asignar débitos y créditos
            account.debits = debitsByAccount[account.id] || 0;
            account.credits = creditsByAccount[account.id] || 0;
          }
          
          // Procesar recursivamente las cuentas hijas
          if (account.children.length > 0) {
            applyAccountValues(account.children);
          }
        }
      };
      
      // Aplicar valores a todas las cuentas
      applyAccountValues(hierarchy);
      
      // 7. Calcular saldos finales y propagar hacia arriba en la jerarquía
      calculateFinalBalances(hierarchy);
      
      // 8. Actualizar estado con la jerarquía
      setHierarchicalData(hierarchy);
      
      // 9. Aplanar la jerarquía para mostrarla en la UI
      const flattenedData = flattenHierarchy(hierarchy);
      setLedgerData(flattenedData);
      
    } catch (error: any) {
      toast.error(`Error al cargar datos del libro mayor: ${error.message}`);
      // Limpiar datos en caso de error
      setLedgerData([]);
      setHierarchicalData([]);
    } finally {
      setLoading(false);
    }
  };

  // Función recursiva para calcular saldos finales y propagar hacia arriba
  const calculateFinalBalances = (accounts: HierarchicalAccount[]) => {
    for (const account of accounts) {
      // Calcular saldos de las cuentas hijas primero
      if (account.children.length > 0) {
        calculateFinalBalances(account.children);
        
        // Propagar valores hacia arriba (acumular desde las cuentas hijas)
        account.initial_balance = account.children.reduce((sum, child) => sum + child.initial_balance, 0);
        account.debits = account.children.reduce((sum, child) => sum + child.debits, 0);
        account.credits = account.children.reduce((sum, child) => sum + child.credits, 0);
      }
      
      // Calcular saldo final según la naturaleza de la cuenta
      if (account.nature === 'debit') {
        // Para cuentas deudoras, el saldo final se calcula: Inicial + Débitos - Créditos
        account.final_balance = account.initial_balance + account.debits - account.credits;
      } else {
        // Para cuentas acreedoras, el saldo final se calcula: Inicial - Débitos + Créditos
        account.final_balance = account.initial_balance - account.debits + account.credits;
      }

      // Verificar si el saldo final debe mostrarse como positivo según la naturaleza de la cuenta
      if ((account.nature === 'debit' && account.final_balance < 0) || 
          (account.nature === 'credit' && account.final_balance > 0)) {
        console.log(`Cuenta ${account.code} ${account.name} tiene saldo anormal: ${account.final_balance}`);
      }
    }
  };

  // Función para alternar la expansión de una cuenta
  const toggleAccountExpansion = (accountId: string) => {
    setExpandedAccounts(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
    
    // Actualizar la vista con los cambios de expansión
    const updatedHierarchy = [...hierarchicalData];
    
    const updateExpansion = (accounts: HierarchicalAccount[]) => {
      for (const account of accounts) {
        if (account.id === accountId) {
          account.isExpanded = !account.isExpanded;
          break;
        }
        
        if (account.children.length > 0) {
          updateExpansion(account.children);
        }
      }
    };
    
    updateExpansion(updatedHierarchy);
    setHierarchicalData(updatedHierarchy);
    
    // Actualizar la vista aplanada
    const flattenedData = flattenHierarchy(updatedHierarchy);
    setLedgerData(flattenedData);
  };

  // Función para expandir o contraer todas las cuentas
  const toggleAllAccounts = () => {
    const newExpandedState = !allExpanded;
    setAllExpanded(newExpandedState);
    
    // Actualizar todas las cuentas padres
    const updateAllExpansions = (accounts: HierarchicalAccount[]) => {
      const newExpandedAccounts: Record<string, boolean> = {};
      
      const processAccount = (account: HierarchicalAccount) => {
        if (account.is_parent) {
          newExpandedAccounts[account.id] = newExpandedState;
        }
        
        account.children.forEach(processAccount);
      };
      
      accounts.forEach(processAccount);
      return newExpandedAccounts;
    };
    
    const newExpandedAccounts = updateAllExpansions(hierarchicalData);
    setExpandedAccounts(newExpandedAccounts);
    
    // Actualizar la vista con los cambios de expansión
    const updatedHierarchy = [...hierarchicalData];
    
    const updateExpansion = (accounts: HierarchicalAccount[]) => {
      for (const account of accounts) {
        if (account.is_parent) {
          account.isExpanded = newExpandedState;
        }
        
        if (account.children.length > 0) {
          updateExpansion(account.children);
        }
      }
    };
    
    updateExpansion(updatedHierarchy);
    setHierarchicalData(updatedHierarchy);
    
    // Actualizar la vista aplanada
    const flattenedData = flattenHierarchy(updatedHierarchy);
    setLedgerData(flattenedData);
  };

  // Función para formatear números como moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(amount);
  };

  // Función para exportar a Excel
  const exportToExcel = () => {
    if (!ledgerData.length || !selectedMonthName) {
      toast.error('No hay datos para exportar');
      return;
    }

    try {
      // Preparar los datos para Excel
      const excelData = ledgerData.map(entry => ({
        'Código': entry.account_code,
        'Cuenta': `${entry.indentation || ''}${entry.account_name}`,
        'Balance Inicial': entry.initial_balance,
        'Débitos': entry.debits,
        'Créditos': entry.credits,
        'Saldo Final': entry.final_balance
      }));

      // Crear libro de trabajo
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Libro Mayor');

      // Ajustar estilos y anchos de columna
      const columnWidths = [
        { wch: 15 }, // Código
        { wch: 40 }, // Cuenta
        { wch: 15 }, // Balance Inicial
        { wch: 15 }, // Débitos
        { wch: 15 }, // Créditos
        { wch: 15 }  // Saldo Final
      ];
      worksheet['!cols'] = columnWidths;

      // Generar el archivo
      const fileName = `Libro_Mayor_${selectedMonthName.replace(/\s+/g, '_')}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Archivo ${fileName} generado correctamente`);
    } catch (error: any) {
      toast.error(`Error al exportar a Excel: ${error.message}`);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Libro Mayor</h2>
            <p className="text-gray-600 mt-1">
              Visualización de asientos contables agrupados por cuenta, mostrando saldos iniciales y finales por período.
            </p>
          </div>
          <div className="flex space-x-3">
            {ledgerData.length > 0 && (
              <>
                <button 
                  onClick={toggleAllAccounts}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  title={allExpanded ? "Contraer todas las cuentas" : "Expandir todas las cuentas"}
                >
                  {allExpanded ? (
                    <>
                      <ChevronUp className="mr-2 h-5 w-5" />
                      Contraer Todo
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-5 w-5" />
                      Expandir Todo
                    </>
                  )}
                </button>
                <button 
                  onClick={exportToExcel}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  <FileDown className="mr-2 h-5 w-5" />
                  Exportar a Excel
                </button>
              </>
            )}
          </div>
        </div>
        <div className="p-6">
          {fiscalYears.length === 0 && !loading ? (
            <div className="text-center py-6 bg-yellow-50 rounded-md border border-yellow-200 mb-6">
              <p className="text-yellow-700">No hay años fiscales configurados en el sistema. Por favor, configure un año fiscal en la sección de Configuración.</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="w-full md:w-1/2">
                <label className="block text-sm font-medium mb-1">Año Fiscal</label>
                <select
                  value={selectedFiscalYear}
                  onChange={(e) => setSelectedFiscalYear(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccione un año fiscal</option>
                  {fiscalYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="w-full md:w-1/2">
                <label className="block text-sm font-medium mb-1">Período (Mes)</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  disabled={loading || !selectedFiscalYear || months.length === 0}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccione un mes</option>
                  {months.map((month) => (
                    <option key={month.id} value={month.id}>
                      {month.name} {month.is_active ? '(Activo)' : ''}
                    </option>
                  ))}
                </select>
                {selectedFiscalYear && months.length === 0 && !loading && (
                  <p className="text-sm text-red-500 mt-1">No hay periodos mensuales para este año fiscal.</p>
                )}
                {selectedMonth && months.find(m => m.id === selectedMonth)?.is_active && (
                  <div className="mt-1 flex items-center">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                      Período activo actual
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-2">Cargando datos...</span>
            </div>
          ) : (
            <>
              {ledgerData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Código</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Cuenta</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Balance Inicial</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Débitos</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Créditos</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Saldo Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerData.map((entry) => (
                        <tr 
                          key={entry.account_id} 
                          className={`
                            border-t border-gray-200 
                            ${entry.is_parent ? 'font-semibold bg-gray-50' : ''}
                            ${entry.level && entry.level > 0 ? 'text-sm' : ''}
                          `}
                        >
                          <td className="px-4 py-2 font-medium">
                            {entry.is_parent && (
                              <button 
                                onClick={() => toggleAccountExpansion(entry.account_id)}
                                className="mr-2 text-blue-500 focus:outline-none"
                              >
                                {expandedAccounts[entry.account_id] ? '−' : '+'}
                              </button>
                            )}
                            {entry.account_code}
                          </td>
                          <td className="px-4 py-2">
                            {entry.indentation}{entry.account_name}
                          </td>
                          <td className="px-4 py-2 text-right">{formatCurrency(entry.initial_balance)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(entry.debits)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(entry.credits)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(entry.final_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  {selectedMonth ? (
                    <p>No hay datos disponibles para el período seleccionado.</p>
                  ) : (
                    <p>Seleccione un año fiscal y un mes para ver los datos del libro mayor.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneralLedger; 