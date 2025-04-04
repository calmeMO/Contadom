import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { 
  ArrowRight, 
  Check, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader,
  Plus,
  CreditCard,
  Building,
  TrendingUp,
  BookOpen
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  ReopeningData, 
  generateOpeningEntries, 
  verifyReadyForReopening,
  getPeriodsForReopening,
  getTargetPeriodsForReopening,
  getOpeningEntry,
  updateDatabaseSchema
} from '../services/reopeningService';
import { formatCurrency } from '../utils/formatters';

export function PeriodReopening() {
  const [loading, setLoading] = useState(true);
  const [sourcePeriods, setSourcePeriods] = useState<any[]>([]);
  const [targetPeriods, setTargetPeriods] = useState<any[]>([]);
  const [selectedSourcePeriod, setSelectedSourcePeriod] = useState<string>('');
  const [selectedTargetPeriod, setSelectedTargetPeriod] = useState<string>('');
  const [reopeningStatus, setReopeningStatus] = useState<{ ready: boolean; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [openingEntry, setOpeningEntry] = useState<any | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [sourceData, setSourceData] = useState<any | null>(null);
  const [targetData, setTargetData] = useState<any | null>(null);
  
  const { user } = useAuth();
  
  useEffect(() => {
    fetchInitialData();
  }, []);
  
  useEffect(() => {
    if (selectedSourcePeriod && selectedTargetPeriod) {
      checkReopeningStatus(selectedSourcePeriod, selectedTargetPeriod);
      fetchSourcePeriodData(selectedSourcePeriod);
      fetchTargetPeriodData(selectedTargetPeriod);
    }
  }, [selectedSourcePeriod, selectedTargetPeriod]);
  
  async function fetchInitialData() {
    try {
      setLoading(true);
      
      // Asegurarse de que existen las columnas necesarias en la base de datos
      await updateDatabaseSchema();
      
      // Cargar períodos cerrados (fuente)
      const sourcePeriodsList = await getPeriodsForReopening();
      setSourcePeriods(sourcePeriodsList);
      
      // Cargar períodos abiertos (destino)
      const targetPeriodsList = await getTargetPeriodsForReopening();
      setTargetPeriods(targetPeriodsList);
      
      // Establecer períodos seleccionados por defecto si existen
      if (sourcePeriodsList.length > 0) {
        setSelectedSourcePeriod(sourcePeriodsList[0].id);
      }
      
      if (targetPeriodsList.length > 0) {
        setSelectedTargetPeriod(targetPeriodsList[0].id);
      }
      
    } catch (error) {
      console.error('Error al cargar datos iniciales:', error);
      toast.error('Error al cargar los datos. Por favor, recargue la página.');
    } finally {
      setLoading(false);
    }
  }
  
  async function checkReopeningStatus(sourcePeriodId: string, targetPeriodId: string) {
    try {
      const status = await verifyReadyForReopening(sourcePeriodId, targetPeriodId);
      setReopeningStatus(status);
      
      // Si el período destino ya tiene asiento de apertura, obtenerlo
      if (status.ready) {
        const entry = await getOpeningEntry(targetPeriodId);
        setOpeningEntry(entry);
      }
    } catch (error) {
      console.error('Error al verificar estado de reapertura:', error);
      setReopeningStatus({
        ready: false,
        message: 'Error al verificar el estado de reapertura'
      });
    }
  }
  
  async function fetchSourcePeriodData(periodId: string) {
    try {
      // Cargar detalles del período fuente
      const { data: period, error: periodError } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('id', periodId)
        .single();
      
      if (periodError) throw periodError;
      setSourceData(period);
      
      // Cargar resumen financiero
      const { data: financialData, error: financialError } = await supabase
        .from('financial_statements')
        .select('type, data')
        .eq('accounting_period_id', periodId);
      
      if (financialError) throw financialError;
      
      if (financialData && financialData.length > 0) {
        // Adjuntar datos financieros al período
        setSourceData({
          ...period,
          financialData: financialData.reduce((acc: Record<string, any>, item) => {
            acc[item.type] = item.data;
            return acc;
          }, {})
        });
      }
    } catch (error) {
      console.error('Error al cargar datos del período fuente:', error);
      toast.error('Error al cargar los datos del período fuente.');
    }
  }
  
  async function fetchTargetPeriodData(periodId: string) {
    try {
      // Cargar detalles del período destino
      const { data: period, error: periodError } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('id', periodId)
        .single();
      
      if (periodError) throw periodError;
      setTargetData(period);
      
      // Verificar si ya tiene asiento de apertura
      const entry = await getOpeningEntry(periodId);
      setOpeningEntry(entry);
    } catch (error) {
      console.error('Error al cargar datos del período destino:', error);
      toast.error('Error al cargar los datos del período destino.');
    }
  }
  
  async function handleGenerateOpeningEntry() {
    if (!user || !selectedSourcePeriod || !selectedTargetPeriod || !targetData) return;
    
    if (!confirm(`¿Está seguro de generar el asiento de apertura para el período "${targetData.name}" con los saldos de "${sourceData?.name}"?`)) {
      return;
    }
    
    try {
      setProcessing(true);
      
      const reopeningData: ReopeningData = {
        previousPeriodId: selectedSourcePeriod,
        newPeriodId: selectedTargetPeriod,
        userId: user.id,
        date: targetData.start_date,
        notes: `Asiento de apertura generado automáticamente desde el período ${sourceData?.name}`
      };
      
      const result = await generateOpeningEntries(reopeningData);
      
      if (result.success) {
        toast.success(result.message);
        
        // Actualizar datos
        await fetchInitialData();
        await fetchTargetPeriodData(selectedTargetPeriod);
        
        // Mostrar resumen de la reapertura
        setTimeout(() => {
          toast.info(`Resumen: Activos $${formatCurrency(result.totalAssets || 0)}, Pasivos $${formatCurrency(result.totalLiabilities || 0)}, Patrimonio $${formatCurrency(result.totalEquity || 0)}`);
        }, 1000);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Error al generar asiento de apertura:', error);
      toast.error('Error al generar el asiento de apertura.');
    } finally {
      setProcessing(false);
    }
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
          <h1 className="text-2xl font-semibold text-gray-900">Reapertura de Período Contable</h1>
          <p className="mt-2 text-sm text-gray-700">
            Genere asientos de apertura para un nuevo período contable a partir de los saldos finales de un período cerrado.
          </p>
        </div>
      </div>
      
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Selección de períodos */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Selección de Períodos</h3>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Selección de período fuente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Período Fuente (Cerrado)
                </label>
                {sourcePeriods.length === 0 ? (
                  <div className="p-2 bg-yellow-50 text-yellow-700 text-sm border border-yellow-200 rounded-md">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    No hay períodos cerrados disponibles
                  </div>
                ) : (
                  <select
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={selectedSourcePeriod}
                    onChange={(e) => setSelectedSourcePeriod(e.target.value)}
                  >
                    {sourcePeriods.map(period => (
                      <option key={period.id} value={period.id}>
                        {period.name} ({new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              <div className="flex justify-center">
                <ArrowRight className="h-6 w-6 text-gray-400" />
              </div>
              
              {/* Selección de período destino */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Período Destino (Abierto)
                </label>
                {targetPeriods.length === 0 ? (
                  <div className="p-2 bg-yellow-50 text-yellow-700 text-sm border border-yellow-200 rounded-md">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    No hay períodos abiertos disponibles
                  </div>
                ) : (
                  <select
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={selectedTargetPeriod}
                    onChange={(e) => setSelectedTargetPeriod(e.target.value)}
                  >
                    {targetPeriods.map(period => (
                      <option key={period.id} value={period.id}>
                        {period.name} ({new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              {/* Estado de la reapertura */}
              {reopeningStatus && (
                <div className={`mt-4 p-4 rounded-md ${
                  reopeningStatus.ready ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
                }`}>
                  <div className="flex">
                    <div className="flex-shrink-0">
                      {reopeningStatus.ready ? (
                        <Check className="h-5 w-5 text-green-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-400" />
                      )}
                    </div>
                    <div className="ml-3">
                      <h3 className={`text-sm font-medium ${reopeningStatus.ready ? 'text-green-800' : 'text-yellow-800'}`}>
                        {reopeningStatus.ready ? 'Listo para reapertura' : 'No está listo para reapertura'}
                      </h3>
                      <div className="mt-2 text-sm text-gray-700">
                        <p>{reopeningStatus.message}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Botón de acción */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGenerateOpeningEntry}
                  disabled={processing || !reopeningStatus?.ready || !!openingEntry}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-75"
                >
                  {processing ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-2" />
                      Procesando...
                    </>
                  ) : openingEntry ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Asiento de Apertura Ya Generado
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Generar Asiento de Apertura
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Panel de información y detalles */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Información de Períodos
              </h3>
            </div>
            
            <div className="divide-y divide-gray-200">
              {/* Información del período fuente */}
              {sourceData && (
                <div className="p-4">
                  <h4 className="text-md font-medium text-gray-900 mb-3">
                    Período Fuente: {sourceData.name}
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Fechas:</span>
                      <span className="ml-2 text-gray-900">
                        {new Date(sourceData.start_date).toLocaleDateString()} - {new Date(sourceData.end_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Estado:</span>
                      <span className="ml-2 text-green-600">Cerrado el {new Date(sourceData.closed_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  {/* Información financiera resumida */}
                  {sourceData.financialData && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h5 className="text-sm font-medium text-gray-900 mb-3">Saldos Finales</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 p-3 rounded-md">
                          <h6 className="text-xs font-medium text-blue-900 flex items-center">
                            <CreditCard className="h-3 w-3 mr-1" />
                            Activos
                          </h6>
                          <p className="mt-1 text-lg font-semibold text-blue-600">
                            ${formatCurrency(sourceData.financialData.balance_sheet?.totalAssets || 0)}
                          </p>
                        </div>
                        <div className="bg-red-50 p-3 rounded-md">
                          <h6 className="text-xs font-medium text-red-900 flex items-center">
                            <Building className="h-3 w-3 mr-1" />
                            Pasivos
                          </h6>
                          <p className="mt-1 text-lg font-semibold text-red-600">
                            ${formatCurrency(sourceData.financialData.balance_sheet?.totalLiabilities || 0)}
                          </p>
                        </div>
                        <div className="bg-green-50 p-3 rounded-md">
                          <h6 className="text-xs font-medium text-green-900 flex items-center">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Patrimonio
                          </h6>
                          <p className="mt-1 text-lg font-semibold text-green-600">
                            ${formatCurrency(sourceData.financialData.balance_sheet?.totalEquity || 0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Información del período destino */}
              {targetData && (
                <div className="p-4">
                  <h4 className="text-md font-medium text-gray-900 mb-3">
                    Período Destino: {targetData.name}
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Fechas:</span>
                      <span className="ml-2 text-gray-900">
                        {new Date(targetData.start_date).toLocaleDateString()} - {new Date(targetData.end_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Estado:</span>
                      <span className="ml-2 text-blue-600">Abierto</span>
                    </div>
                  </div>
                  
                  {/* Asiento de apertura si existe */}
                  {openingEntry && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-medium text-gray-900 flex items-center">
                          <BookOpen className="h-4 w-4 mr-1" />
                          Asiento de Apertura
                        </h5>
                        <button 
                          type="button" 
                          onClick={() => setShowDetails(!showDetails)}
                          className="text-sm text-blue-600 flex items-center"
                        >
                          {showDetails ? (
                            <>
                              <ChevronUp className="h-4 w-4 mr-1" />
                              Ocultar Detalles
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Ver Detalles
                            </>
                          )}
                        </button>
                      </div>
                      
                      <div className="mt-3 flex justify-between text-sm">
                        <div className="text-gray-500">Fecha: {new Date(openingEntry.date).toLocaleDateString()}</div>
                        <div className="text-gray-500">Total: ${formatCurrency(openingEntry.total_debit)}</div>
                      </div>
                      
                      {showDetails && (
                        <div className="mt-4 bg-gray-50 p-4 rounded-md max-h-96 overflow-y-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Cuenta
                                </th>
                                <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Débito
                                </th>
                                <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Crédito
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {openingEntry.items.map((item: any) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                                    <div className="font-medium text-gray-900">{item.account?.code}</div>
                                    <div className="text-gray-500">{item.account?.name}</div>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-right">
                                    {parseFloat(item.debit) > 0 ? (
                                      <span className="text-blue-600 font-medium">${formatCurrency(item.debit)}</span>
                                    ) : (
                                      <span className="text-gray-400">$0.00</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-right">
                                    {parseFloat(item.credit) > 0 ? (
                                      <span className="text-green-600 font-medium">${formatCurrency(item.credit)}</span>
                                    ) : (
                                      <span className="text-gray-400">$0.00</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gray-50">
                                <th scope="row" className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                                  TOTAL
                                </th>
                                <td className="px-3 py-2 whitespace-nowrap text-xs text-right font-medium text-blue-600">
                                  ${formatCurrency(openingEntry.total_debit)}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-xs text-right font-medium text-green-600">
                                  ${formatCurrency(openingEntry.total_credit)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 