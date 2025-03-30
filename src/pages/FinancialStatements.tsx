import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  FileText,
  Loader,
  RefreshCw,
  Download,
  Printer,
  AlertCircle
} from 'lucide-react';
import { fetchAccountingPeriods } from '../services/accountingPeriodService';
import { 
  getFinancialStatement, 
  generateBalanceSheet, 
  generateIncomeStatement,
  formatCurrency,
  FinancialStatementData,
  BalanceSheetData,
  IncomeStatementData
} from '../services/financialStatementService';
import { useAuth } from '../contexts/AuthContext';

// Adaptador con estructura más completa del estado financiero para la UI
interface FinancialDisplay {
  company_name: string;
  period_name: string;
  date: string;
  assets?: {
    current_assets: Array<{ account_id: string; account_name: string; amount: number }>;
    non_current_assets: Array<{ account_id: string; account_name: string; amount: number }>;
    total_current_assets: number;
    total_non_current_assets: number;
    total_assets: number;
  };
  liabilities?: {
    current_liabilities: Array<{ account_id: string; account_name: string; amount: number }>;
    non_current_liabilities: Array<{ account_id: string; account_name: string; amount: number }>;
    total_current_liabilities: number;
    total_non_current_liabilities: number;
    total_liabilities: number;
  };
  equity?: {
    equity_accounts: Array<{ account_id: string; account_name: string; amount: number }>;
    total_equity: number;
  };
  revenues?: {
    revenue_accounts: Array<{ account_id: string; account_name: string; amount: number }>;
    total_revenues: number;
  };
  expenses?: {
    expense_accounts: Array<{ account_id: string; account_name: string; amount: number }>;
    total_expenses: number;
  };
  net_income?: number;
}

export function FinancialStatements() {
  const [loading, setLoading] = useState<boolean>(true);
  const [periods, setPeriods] = useState<Array<{id: string, name: string}>>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [statementType, setStatementType] = useState<'balance_sheet' | 'income_statement'>('balance_sheet');
  const [statementData, setStatementData] = useState<FinancialStatementData | null>(null);
  const [displayData, setDisplayData] = useState<FinancialDisplay | null>(null);
  const { user } = useAuth();
  
  // Inicializar datos
  useEffect(() => {
    initializeData();
  }, []);
  
  // Cargar estado financiero cuando cambia el período o tipo
  useEffect(() => {
    if (selectedPeriodId && statementType) {
      loadFinancialStatement();
    }
  }, [selectedPeriodId, statementType]);
  
  // Procesar datos para visualización cuando cambia el estado financiero
  useEffect(() => {
    if (statementData?.data) {
      processDisplayData();
    } else {
      setDisplayData(null);
    }
  }, [statementData]);
  
  // Procesar los datos del estado financiero para la visualización
  function processDisplayData() {
    if (!statementData) return;
    
    const companyName = "Contadom"; // Esto podría obtenerse de la configuración
    
    if (statementType === 'balance_sheet') {
      const balanceData = statementData.data as BalanceSheetData;
      
      // Preparar los datos del balance general para visualización
      const assets = {
        current_assets: balanceData.assets
          .filter(a => a.type === 'asset' && !a.is_parent)
          .map(a => ({
            account_id: a.id,
            account_name: a.name,
            amount: a.balance
          })),
        non_current_assets: [],
        total_current_assets: balanceData.totalAssets,
        total_non_current_assets: 0,
        total_assets: balanceData.totalAssets
      };
      
      const liabilities = {
        current_liabilities: balanceData.liabilities
          .filter(l => l.type === 'liability' && !l.is_parent)
          .map(l => ({
            account_id: l.id,
            account_name: l.name,
            amount: l.balance
          })),
        non_current_liabilities: [],
        total_current_liabilities: balanceData.totalLiabilities,
        total_non_current_liabilities: 0,
        total_liabilities: balanceData.totalLiabilities
      };
      
      const equity = {
        equity_accounts: balanceData.equity
          .filter(e => e.type === 'equity' && !e.is_parent)
          .map(e => ({
            account_id: e.id,
            account_name: e.name,
            amount: e.balance
          })),
        total_equity: balanceData.totalEquity
      };
      
      setDisplayData({
        company_name: companyName,
        period_name: balanceData.periodName,
        date: balanceData.date,
        assets,
        liabilities,
        equity,
        net_income: balanceData.netIncome
      });
    } else {
      const incomeData = statementData.data as IncomeStatementData;
      
      // Preparar los datos del estado de resultados para visualización
      const revenues = {
        revenue_accounts: incomeData.revenue
          .filter(r => r.type === 'revenue' && !r.is_parent)
          .map(r => ({
            account_id: r.id,
            account_name: r.name,
            amount: r.balance
          })),
        total_revenues: incomeData.totalRevenue
      };
      
      const expenses = {
        expense_accounts: [
          ...incomeData.costs.filter(c => c.type === 'cost' && !c.is_parent).map(c => ({
            account_id: c.id,
            account_name: c.name,
            amount: c.balance
          })),
          ...incomeData.expenses.filter(e => e.type === 'expense' && !e.is_parent).map(e => ({
            account_id: e.id,
            account_name: e.name,
            amount: e.balance
          }))
        ],
        total_expenses: incomeData.totalCosts + incomeData.totalExpenses
      };
      
      setDisplayData({
        company_name: companyName,
        period_name: incomeData.periodName,
        date: incomeData.date,
        revenues,
        expenses,
        net_income: incomeData.netIncome
      });
    }
  }
  
  async function initializeData() {
    try {
      setLoading(true);
      // Obtener períodos contables
      const periodsData = await fetchAccountingPeriods();
      setPeriods(periodsData.map((period: any) => ({
        id: period.id,
        name: period.name || `${period.year || ''} - ${period.period_number || ''}`
      })));
      
      // Seleccionar el último período por defecto
      if (periodsData.length > 0) {
        setSelectedPeriodId(periodsData[0].id);
      }
    } catch (error) {
      console.error('Error al cargar los períodos contables', error);
      toast.error('Error al cargar los períodos contables');
    } finally {
      setLoading(false);
    }
  }
  
  async function loadFinancialStatement() {
    try {
      setLoading(true);
      
      // Intentar obtener estado financiero existente
      let statement = await getFinancialStatement(selectedPeriodId, statementType);
      
      // Si no existe, generarlo
      if (!statement && user) {
        if (statementType === 'balance_sheet') {
          const balanceSheet = await generateBalanceSheet(selectedPeriodId, user.id);
          // El estado ya ha sido guardado en la base de datos por generateBalanceSheet
          // Obtener el estado financiero actualizado
          statement = await getFinancialStatement(selectedPeriodId, statementType);
        } else {
          const incomeStatement = await generateIncomeStatement(selectedPeriodId, user.id);
          // El estado ya ha sido guardado en la base de datos por generateIncomeStatement
          // Obtener el estado financiero actualizado
          statement = await getFinancialStatement(selectedPeriodId, statementType);
        }
      }
      
      setStatementData(statement);
    } catch (error) {
      console.error(`Error al cargar el ${statementType === 'balance_sheet' ? 'balance general' : 'estado de resultados'}`, error);
      toast.error(`Error al cargar el ${statementType === 'balance_sheet' ? 'balance general' : 'estado de resultados'}`);
      setStatementData(null);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleRegenerateStatement() {
    try {
      if (!user) {
        toast.error('Debe estar autenticado para regenerar estados financieros');
        return;
      }
      
      setLoading(true);
      
      if (statementType === 'balance_sheet') {
        await generateBalanceSheet(selectedPeriodId, user.id);
        toast.success('Balance general regenerado correctamente');
      } else {
        await generateIncomeStatement(selectedPeriodId, user.id);
        toast.success('Estado de resultados regenerado correctamente');
      }
      
      // Obtener el estado financiero actualizado después de regenerarlo
      const statement = await getFinancialStatement(selectedPeriodId, statementType);
      setStatementData(statement);
    } catch (error) {
      console.error(`Error al regenerar el ${statementType === 'balance_sheet' ? 'balance general' : 'estado de resultados'}`, error);
      toast.error(`Error al regenerar el ${statementType === 'balance_sheet' ? 'balance general' : 'estado de resultados'}`);
    } finally {
      setLoading(false);
    }
  }
  
  function handlePrint() {
    window.print();
  }
  
  function renderBalanceSheet() {
    if (!displayData || !displayData.assets || !displayData.liabilities || !displayData.equity) return null;
    
    const { company_name, period_name, date, assets, liabilities, equity, net_income } = displayData;
    
    return (
      <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200 print:shadow-none print:border-none">
        <div className="text-center mb-8 print:mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{company_name}</h2>
          <h3 className="text-xl font-medium text-gray-800 mt-1">Balance General</h3>
          <p className="text-gray-600 mt-1">Período: {period_name}</p>
          <p className="text-gray-600">Al {new Date(date).toLocaleDateString('es-ES')}</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-4">
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4 border-b border-gray-200 pb-2">Activos</h4>
            
            <div className="space-y-6">
              {/* Activos Corrientes */}
              <div>
                <h5 className="font-medium text-gray-800 mb-3">Activos Corrientes</h5>
                <ul className="space-y-2">
                  {assets.current_assets.map((item) => (
                    <li key={item.account_id} className="flex justify-between">
                      <span className="text-gray-700">{item.account_name}</span>
                      <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
                  <span>Total Activos Corrientes</span>
                  <span>{formatCurrency(assets.total_current_assets)}</span>
                </div>
              </div>
              
              {/* Activos No Corrientes */}
              {assets.non_current_assets.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-800 mb-3">Activos No Corrientes</h5>
                  <ul className="space-y-2">
                    {assets.non_current_assets.map((item) => (
                      <li key={item.account_id} className="flex justify-between">
                        <span className="text-gray-700">{item.account_name}</span>
                        <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
                    <span>Total Activos No Corrientes</span>
                    <span>{formatCurrency(assets.total_non_current_assets)}</span>
                  </div>
                </div>
              )}
              
              {/* Total Activos */}
              <div className="flex justify-between font-bold border-t border-gray-300 mt-4 pt-3 text-lg">
                <span>Total Activos</span>
                <span>{formatCurrency(assets.total_assets)}</span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4 border-b border-gray-200 pb-2">Pasivos y Patrimonio</h4>
            
            <div className="space-y-6">
              {/* Pasivos Corrientes */}
              <div>
                <h5 className="font-medium text-gray-800 mb-3">Pasivos Corrientes</h5>
                <ul className="space-y-2">
                  {liabilities.current_liabilities.map((item) => (
                    <li key={item.account_id} className="flex justify-between">
                      <span className="text-gray-700">{item.account_name}</span>
                      <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
                  <span>Total Pasivos Corrientes</span>
                  <span>{formatCurrency(liabilities.total_current_liabilities)}</span>
                </div>
              </div>
              
              {/* Pasivos No Corrientes */}
              {liabilities.non_current_liabilities.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-800 mb-3">Pasivos No Corrientes</h5>
                  <ul className="space-y-2">
                    {liabilities.non_current_liabilities.map((item) => (
                      <li key={item.account_id} className="flex justify-between">
                        <span className="text-gray-700">{item.account_name}</span>
                        <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
                    <span>Total Pasivos No Corrientes</span>
                    <span>{formatCurrency(liabilities.total_non_current_liabilities)}</span>
                  </div>
                </div>
              )}
              
              {/* Total Pasivos */}
              <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
                <span>Total Pasivos</span>
                <span>{formatCurrency(liabilities.total_liabilities)}</span>
              </div>
              
              {/* Patrimonio */}
              <div>
                <h5 className="font-medium text-gray-800 mb-3">Patrimonio</h5>
                <ul className="space-y-2">
                  {equity.equity_accounts.map((item) => (
                    <li key={item.account_id} className="flex justify-between">
                      <span className="text-gray-700">{item.account_name}</span>
                      <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                    </li>
                  ))}
                  {net_income !== undefined && (
                    <li className="flex justify-between">
                      <span className="text-gray-700">Resultado del Período</span>
                      <span className={`text-gray-900 font-medium ${net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(net_income)}
                      </span>
                    </li>
                  )}
                </ul>
                <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
                  <span>Total Patrimonio</span>
                  <span>{formatCurrency(equity.total_equity + (net_income || 0))}</span>
                </div>
              </div>
              
              {/* Total Pasivo y Patrimonio */}
              <div className="flex justify-between font-bold border-t border-gray-300 mt-4 pt-3 text-lg">
                <span>Total Pasivo y Patrimonio</span>
                <span>{formatCurrency(liabilities.total_liabilities + equity.total_equity + (net_income || 0))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  function renderIncomeStatement() {
    if (!displayData || !displayData.revenues || !displayData.expenses) return null;
    
    const { company_name, period_name, date, revenues, expenses, net_income } = displayData;
    
    return (
      <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200 print:shadow-none print:border-none">
        <div className="text-center mb-8 print:mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{company_name}</h2>
          <h3 className="text-xl font-medium text-gray-800 mt-1">Estado de Resultados</h3>
          <p className="text-gray-600 mt-1">Período: {period_name}</p>
          <p className="text-gray-600">Del {new Date(date).toLocaleDateString('es-ES')}</p>
        </div>
        
        <div className="max-w-2xl mx-auto">
          {/* Ingresos */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4 border-b border-gray-200 pb-2">Ingresos</h4>
            <ul className="space-y-2">
              {revenues.revenue_accounts.map((item) => (
                <li key={item.account_id} className="flex justify-between">
                  <span className="text-gray-700">{item.account_name}</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
              <span>Total Ingresos</span>
              <span>{formatCurrency(revenues.total_revenues)}</span>
            </div>
          </div>
          
          {/* Gastos */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4 border-b border-gray-200 pb-2">Gastos</h4>
            <ul className="space-y-2">
              {expenses.expense_accounts.map((item) => (
                <li key={item.account_id} className="flex justify-between">
                  <span className="text-gray-700">{item.account_name}</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between font-medium border-t border-gray-200 mt-3 pt-2">
              <span>Total Gastos</span>
              <span>{formatCurrency(expenses.total_expenses)}</span>
            </div>
          </div>
          
          {/* Resultado Neto */}
          <div className="flex justify-between font-bold border-t border-gray-300 mt-4 pt-3 text-lg">
            <span>Resultado Neto</span>
            <span className={net_income !== undefined && net_income >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatCurrency(net_income || 0)}
            </span>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8 print:px-0 print:py-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 print:hidden">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <FileText className="h-6 w-6 mr-2 text-blue-500" />
          Estados Financieros
        </h1>
        
        {/* Controles */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 mt-4 md:mt-0">
          <select
            className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            disabled={loading}
          >
            <option value="">Seleccionar período</option>
            {periods.map(period => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
          
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setStatementType('balance_sheet')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                statementType === 'balance_sheet' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Balance General
            </button>
            
            <button
              type="button"
              onClick={() => setStatementType('income_statement')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                statementType === 'income_statement' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Estado de Resultados
            </button>
          </div>
        </div>
      </div>
      
      {/* Botones de acción */}
      <div className="flex justify-end mb-4 space-x-2 print:hidden">
        <button
          type="button"
          onClick={handleRegenerateStatement}
          disabled={loading || !selectedPeriodId}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Regenerar
        </button>
        
        <button
          type="button"
          onClick={handlePrint}
          disabled={!displayData}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </button>
      </div>
      
      {/* Contenido principal */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">
            Cargando {statementType === 'balance_sheet' ? 'balance general' : 'estado de resultados'}...
          </span>
        </div>
      ) : !displayData ? (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay datos disponibles</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            No se ha generado un {statementType === 'balance_sheet' ? 'balance general' : 'estado de resultados'} para el período seleccionado.
            Selecciona un período contable con asientos aprobados o utiliza el botón "Regenerar".
          </p>
        </div>
      ) : (
        <>
          {statementType === 'balance_sheet' ? renderBalanceSheet() : renderIncomeStatement()}
        </>
      )}
    </div>
  );
} 