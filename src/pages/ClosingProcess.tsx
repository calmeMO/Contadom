import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { 
  Lock, 
  UnlockIcon, 
  Clock, 
  Calendar, 
  FileCheck, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader,
  BarChart,
  ArrowRightCircle,
  Banknote
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  ClosingData, 
  ClosingResult, 
  generateClosingEntries, 
  reopenAccountingPeriod, 
  verifyPeriodReadyForClosing,
  getClosingEntries,
  updateDatabaseSchema,
  ClosingEntryType
} from '../services/closingService';
import { formatCurrency } from '../utils/formatters';

export function ClosingProcess() {
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [periodData, setPeriodData] = useState<any | null>(null);
  const [closingStatus, setClosingStatus] = useState<{ ready: boolean; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [closingEntries, setClosingEntries] = useState<any[]>([]);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  
  const { user } = useAuth();
  
  useEffect(() => {
    fetchInitialData();
  }, []);
  
  useEffect(() => {
    if (selectedPeriod) {
      checkPeriodStatus(selectedPeriod);
      fetchPeriodData(selectedPeriod);
      fetchClosingEntries(selectedPeriod);
    }
  }, [selectedPeriod]);
  
  async function fetchInitialData() {
    try {
      setLoading(true);
      
      // Asegurarse de que existen las columnas necesarias en la base de datos
      await updateDatabaseSchema();
      
      // Cargar períodos contables
      const { data: periodsData, error: periodsError } = await supabase
        .from('accounting_periods')
        .select(`
          id, 
          name, 
          start_date, 
          end_date, 
          is_closed,
          closed_at,
          closed_by,
          is_reopened,
          reopened_at,
          reopened_by
        `)
        .order('end_date', { ascending: false });
      
      if (periodsError) throw periodsError;
      setPeriods(periodsData || []);
      
      // Establecer período seleccionado por defecto (el más reciente no cerrado)
      if (periodsData && periodsData.length > 0) {
        const defaultPeriod = periodsData.find(p => !p.is_closed) || periodsData[0];
        setSelectedPeriod(defaultPeriod.id);
      }
      
    } catch (error) {
      console.error('Error al cargar datos iniciales:', error);
      toast.error('Error al cargar los datos. Por favor, recargue la página.');
    } finally {
      setLoading(false);
    }
  }
  
  async function checkPeriodStatus(periodId: string) {
    try {
      const status = await verifyPeriodReadyForClosing(periodId);
      setClosingStatus(status);
    } catch (error) {
      console.error('Error al verificar estado del período:', error);
      setClosingStatus({
        ready: false,
        message: 'Error al verificar el estado del período'
      });
    }
  }
  
  async function fetchPeriodData(periodId: string) {
    try {
      // Cargar detalles del período
      const { data: period, error: periodError } = await supabase
        .from('accounting_periods')
        .select(`
          *,
          closed_by_user:closed_by(email),
          reopened_by_user:reopened_by(email)
        `)
        .eq('id', periodId)
        .single();
      
      if (periodError) throw periodError;
      setPeriodData(period);
      
      // Si está cerrado, cargar también información financiera
      if (period.is_closed) {
        const { data: financialData, error: financialError } = await supabase
          .from('financial_statements')
          .select('type, data')
          .eq('accounting_period_id', periodId);
        
        if (financialError) throw financialError;
        
        if (financialData && financialData.length > 0) {
          // Adjuntar datos financieros al período
          setPeriodData({
            ...period,
            financialData: financialData.reduce((acc: Record<string, any>, item) => {
              acc[item.type] = item.data;
              return acc;
            }, {})
          });
        }
      }
    } catch (error) {
      console.error('Error al cargar datos del período:', error);
      toast.error('Error al cargar los datos del período.');
    }
  }
  
  async function fetchClosingEntries(periodId: string) {
    try {
      const entries = await getClosingEntries(periodId);
      setClosingEntries(entries);
    } catch (error) {
      console.error('Error al cargar asientos de cierre:', error);
      setClosingEntries([]);
    }
  }
  
  async function handleClosePeriod() {
    if (!user || !selectedPeriod || !periodData) return;
    
    if (!confirm(`¿Está seguro de cerrar el período "${periodData.name}"? Esta acción no se puede deshacer fácilmente.`)) {
      return;
    }
    
    try {
      setProcessing(true);
      
      const closingData: ClosingData = {
        periodId: selectedPeriod,
        userId: user.id,
        date: periodData.end_date,
        notes: `Cierre automático del período ${periodData.name}`
      };
      
      const result = await generateClosingEntries(closingData);
      
      if (result.success) {
        toast.success(result.message);
        
        // Actualizar datos
        await fetchInitialData();
        await fetchPeriodData(selectedPeriod);
        await fetchClosingEntries(selectedPeriod);
        
        // Mostrar resumen del cierre
        setTimeout(() => {
          toast.info(`Resumen del cierre: Ingresos $${formatCurrency(result.totalIncome)}, Gastos $${formatCurrency(result.totalExpense)}, Resultado Neto $${formatCurrency(result.netResult)}`);
        }, 1000);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Error al cerrar período:', error);
      toast.error('Error al cerrar el período.');
    } finally {
      setProcessing(false);
    }
  }
  
  async function handleReopenPeriod() {
    if (!user || !selectedPeriod || !periodData || !reopenReason.trim()) return;
    
    try {
      setProcessing(true);
      
      const result = await reopenAccountingPeriod(
        selectedPeriod,
        user.id,
        reopenReason
      );
      
      if (result.success) {
        toast.success(result.message);
        setShowReopenDialog(false);
        setReopenReason('');
        
        // Actualizar datos
        await fetchInitialData();
        await fetchPeriodData(selectedPeriod);
        await fetchClosingEntries(selectedPeriod);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Error al reabrir período:', error);
      toast.error('Error al reabrir el período.');
    } finally {
      setProcessing(false);
    }
  }
  
  function toggleEntryDetails(entryId: string) {
    setExpandedEntry(expandedEntry === entryId ? null : entryId);
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Cargando datos...</span>
      </div>
    );
  }
  
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Proceso de Cierre Contable</h1>
          <p className="mt-2 text-sm text-gray-700">
            Gestione el cierre de períodos contables y visualice los asientos de cierre generados.
          </p>
        </div>
      </div>
      
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Panel de selección de período */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Períodos Contables</h3>
            </div>
            
            <div className="divide-y divide-gray-200 max-h-[400px] overflow-y-auto">
              {periods.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-500">No hay períodos disponibles</p>
                </div>
              ) : (
                periods.map(period => (
                  <div 
                    key={period.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer ${
                      selectedPeriod === period.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedPeriod(period.id)}
                  >
                    <div className="flex justify-between">
                      <h4 className="text-sm font-medium text-gray-900">{period.name}</h4>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        period.is_closed ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {period.is_closed ? (
                          <Lock className="h-3 w-3 mr-1" />
                        ) : (
                          <UnlockIcon className="h-3 w-3 mr-1" />
                        )}
                        {period.is_closed ? 'Cerrado' : 'Abierto'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}
                    </p>
                    {period.is_reopened && (
                      <p className="text-xs text-amber-600 mt-1">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        Reabierto el {new Date(period.reopened_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Panel de detalles y acciones */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow-sm rounded-lg">
            {!selectedPeriod ? (
              <div className="p-6 text-center">
                <p className="text-gray-500">Seleccione un período para ver sus detalles</p>
              </div>
            ) : !periodData ? (
              <div className="p-6 text-center">
                <Loader className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-2" />
                <p className="text-gray-500">Cargando detalles del período...</p>
              </div>
            ) : (
              <div>
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    {periodData.name}
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      periodData.is_closed ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {periodData.is_closed ? 'Cerrado' : 'Abierto'}
                    </span>
                  </h3>
                </div>
                
                <div className="px-4 py-5 sm:p-6">
                  {/* Información del período */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Fechas</h4>
                        <p className="mt-1 text-sm text-gray-900">
                          {new Date(periodData.start_date).toLocaleDateString()} - {new Date(periodData.end_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Estado</h4>
                        <p className="mt-1 text-sm text-gray-900">
                          {periodData.is_closed ? (
                            <span className="text-red-600">Cerrado el {new Date(periodData.closed_at).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-green-600">Abierto</span>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    {/* Estado de cierre */}
                    {!periodData.is_closed && closingStatus && (
                      <div className={`mt-4 p-4 rounded-md ${
                        closingStatus.ready ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
                      }`}>
                        <div className="flex">
                          <div className="flex-shrink-0">
                            {closingStatus.ready ? (
                              <FileCheck className="h-5 w-5 text-green-400" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-yellow-400" />
                            )}
                          </div>
                          <div className="ml-3">
                            <h3 className={`text-sm font-medium ${closingStatus.ready ? 'text-green-800' : 'text-yellow-800'}`}>
                              {closingStatus.ready ? 'Listo para cerrar' : 'No está listo para cerrar'}
                            </h3>
                            <div className="mt-2 text-sm text-gray-700">
                              <p>{closingStatus.message}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Información financiera resumida (si está cerrado) */}
                    {periodData.is_closed && periodData.financialData && (
                      <div className="mt-6 border-t border-gray-200 pt-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Resumen Financiero</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-blue-50 p-4 rounded-md">
                            <h4 className="text-sm font-medium text-blue-900 flex items-center">
                              <BarChart className="h-4 w-4 mr-1" />
                              Ingresos
                            </h4>
                            <p className="mt-2 text-xl font-semibold text-blue-600">
                              ${formatCurrency(periodData.financialData.income_statement?.totalIncome || 0)}
                            </p>
                          </div>
                          <div className="bg-red-50 p-4 rounded-md">
                            <h4 className="text-sm font-medium text-red-900 flex items-center">
                              <ArrowRightCircle className="h-4 w-4 mr-1" />
                              Gastos
                            </h4>
                            <p className="mt-2 text-xl font-semibold text-red-600">
                              ${formatCurrency(periodData.financialData.income_statement?.totalExpense || 0)}
                            </p>
                          </div>
                          <div className="bg-green-50 p-4 rounded-md">
                            <h4 className="text-sm font-medium text-green-900 flex items-center">
                              <Banknote className="h-4 w-4 mr-1" />
                              Resultado
                            </h4>
                            <p className="mt-2 text-xl font-semibold text-green-600">
                              ${formatCurrency(periodData.financialData.income_statement?.netIncome || 0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Acciones de cierre/reapertura */}
                  <div className="mt-8 flex justify-end">
                    {periodData.is_closed ? (
                      <button
                        type="button"
                        onClick={() => setShowReopenDialog(true)}
                        disabled={processing}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-75"
                      >
                        {processing ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin mr-2" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <UnlockIcon className="h-4 w-4 mr-2" />
                            Reabrir Período
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleClosePeriod}
                        disabled={processing || !closingStatus?.ready}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-75"
                      >
                        {processing ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin mr-2" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4 mr-2" />
                            Cerrar Período
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Asientos de cierre */}
          {selectedPeriod && closingEntries.length > 0 && (
            <div className="mt-8 bg-white shadow-sm rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Asientos de Cierre</h3>
              </div>
              
              <div className="divide-y divide-gray-200">
                {closingEntries.map(entry => (
                  <div key={entry.id} className="p-4">
                    <div 
                      className="flex justify-between items-center cursor-pointer"
                      onClick={() => toggleEntryDetails(entry.id)}
                    >
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{entry.description}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {new Date(entry.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center">
                        <span className="mr-4 text-sm text-gray-700">
                          ${formatCurrency(entry.total_debit)}
                        </span>
                        {expandedEntry === entry.id ? (
                          <ChevronUp className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                    
                    {expandedEntry === entry.id && (
                      <div className="mt-4 bg-gray-50 p-4 rounded-md">
                        <div className="divide-y divide-gray-200">
                          {entry.items.map((item: any) => (
                            <div key={item.id} className="py-3 flex justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {item.account?.code} - {item.account?.name}
                                </p>
                                <p className="text-xs text-gray-500">{item.description}</p>
                              </div>
                              <div className="flex space-x-6">
                                <div className="text-sm">
                                  <span className="text-gray-500">Débito:</span>
                                  <span className={`ml-1 ${parseFloat(item.debit) > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                                    ${formatCurrency(item.debit)}
                                  </span>
                                </div>
                                <div className="text-sm">
                                  <span className="text-gray-500">Crédito:</span>
                                  <span className={`ml-1 ${parseFloat(item.credit) > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                                    ${formatCurrency(item.credit)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
                          <div className="text-sm font-medium space-x-6">
                            <span>
                              <span className="text-gray-500">Total Débito:</span>
                              <span className="ml-1 text-blue-600">${formatCurrency(entry.total_debit)}</span>
                            </span>
                            <span>
                              <span className="text-gray-500">Total Crédito:</span>
                              <span className="ml-1 text-green-600">${formatCurrency(entry.total_credit)}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal para reapertura de período */}
      {showReopenDialog && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Reabrir Período Contable</h3>
                <button
                  type="button"
                  onClick={() => setShowReopenDialog(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Cerrar</span>
                  &times;
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-yellow-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Advertencia
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>
                          Reabrir un período contable eliminará todos los asientos de cierre generados.
                          Esta acción debe realizarse solo en casos excepcionales y podría requerir
                          una justificación para fines de auditoría.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="reopen-reason" className="block text-sm font-medium text-gray-700">
                    Motivo de reapertura <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="reopen-reason"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Indique el motivo por el cual necesita reabrir este período"
                    required
                  />
                </div>
              </div>
              
              <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
                <button
                  type="button"
                  onClick={() => setShowReopenDialog(false)}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleReopenPeriod}
                  disabled={processing || !reopenReason.trim()}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-75"
                >
                  {processing ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-2" />
                      Procesando...
                    </>
                  ) : (
                    'Reabrir Período'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 