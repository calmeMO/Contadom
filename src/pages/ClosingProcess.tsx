import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import {
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader,
  ArrowRight,
  FileCheck,
  Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  checkPeriodReadyForClosing, 
  generateClosingEntry,
  closePeriod,
  createNextPeriod,
  generateOpeningEntry
} from '../services/closingService';

export default function ClosingProcess() {
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<any>(null);
  const [closingStatus, setClosingStatus] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [closingStep, setClosingStep] = useState<
    'check' | 'generate' | 'review' | 'close' | 'complete'
  >('check');
  const [closingEntryId, setClosingEntryId] = useState<string | null>(null);
  const [nextPeriodId, setNextPeriodId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Obtener el usuario actual
  useEffect(() => {
    const getUserData = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUserData();
  }, []);

  // Cargar período activo al iniciar
  useEffect(() => {
    fetchActivePeriod();
  }, []);

  // Verificar estado de cierre cuando se carga el período
  useEffect(() => {
    if (activePeriod) {
      checkClosingStatus();
    }
  }, [activePeriod]);

  // Función para cargar el período contable activo
  async function fetchActivePeriod() {
    try {
      setLoading(true);
      
      // Obtener el período activo y no cerrado
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('is_active', true)
        .eq('is_closed', false)
        .order('end_date', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.warning('No se encontró un período contable activo');
        return;
      }
      
      setActivePeriod(data[0]);
    } catch (error) {
      console.error('Error al cargar período contable activo:', error);
      toast.error('Error al cargar el período contable activo');
    } finally {
      setLoading(false);
    }
  }

  // Verificar si el período está listo para ser cerrado
  const checkClosingStatus = useCallback(async () => {
    if (!activePeriod) return;
    
    try {
      setLoading(true);
      const status = await checkPeriodReadyForClosing(activePeriod.id);
      setClosingStatus(status);
    } catch (error) {
      console.error('Error al verificar estado de cierre:', error);
      toast.error('Error al verificar si el período está listo para ser cerrado');
    } finally {
      setLoading(false);
    }
  }, [activePeriod]);

  // Generar asiento de cierre
  const handleGenerateClosingEntry = async () => {
    if (!activePeriod || !user) return;
    
    try {
      setProcessingAction(true);
      
      // Verificar si ya existe un asiento de cierre
      const { data: existingEntries, error: checkError } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('accounting_period_id', activePeriod.id)
        .eq('is_closing_entry', true)
        .limit(1);
        
      if (checkError) throw checkError;
      
      if (existingEntries && existingEntries.length > 0) {
        setClosingEntryId(existingEntries[0].id);
        setClosingStep('review');
        toast.info('Ya existe un asiento de cierre para este período');
        return;
      }
      
      // Generar nuevo asiento de cierre
      const closingEntry = await generateClosingEntry(activePeriod.id, user.id);
      setClosingEntryId(closingEntry.id);
      setClosingStep('review');
      toast.success('Asiento de cierre generado correctamente');
    } catch (error: any) {
      console.error('Error al generar asiento de cierre:', error);
      toast.error(`Error al generar el asiento de cierre: ${error.message || 'Error desconocido'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  // Aprobar asiento de cierre
  const handleApproveClosingEntry = async () => {
    if (!closingEntryId || !user) return;
    
    try {
      setProcessingAction(true);
      
      // Aprobar el asiento de cierre
      const { error } = await supabase
        .from('journal_entries')
        .update({
          status: 'aprobado',
          is_approved: true,
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', closingEntryId);
        
      if (error) throw error;
      
      setClosingStep('close');
      toast.success('Asiento de cierre aprobado correctamente');
    } catch (error: any) {
      console.error('Error al aprobar asiento de cierre:', error);
      toast.error(`Error al aprobar el asiento de cierre: ${error.message || 'Error desconocido'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  // Cerrar período contable
  const handleClosePeriod = async () => {
    if (!activePeriod || !user) return;
    
    try {
      setProcessingAction(true);
      
      // Cerrar el período
      await closePeriod(activePeriod.id, user.id);
      
      // Crear siguiente período
      const nextPeriod = await createNextPeriod(activePeriod.id, user.id);
      setNextPeriodId(nextPeriod.id);
      
      // Generar asiento de apertura para el nuevo período
      await generateOpeningEntry(activePeriod.id, nextPeriod.id, user.id);
      
      setClosingStep('complete');
      toast.success('Período cerrado correctamente');
    } catch (error: any) {
      console.error('Error al cerrar período:', error);
      toast.error(`Error al cerrar el período contable: ${error.message || 'Error desconocido'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  // Renderizar paso actual
  const renderCurrentStep = () => {
    switch (closingStep) {
      case 'check':
        return renderCheckStep();
      case 'generate':
        return renderGenerateStep();
      case 'review':
        return renderReviewStep();
      case 'close':
        return renderCloseStep();
      case 'complete':
        return renderCompleteStep();
      default:
        return null;
    }
  };

  // Paso 1: Verificar requisitos
  const renderCheckStep = () => {
    if (!closingStatus) return null;
    
    const isReady = closingStatus.isReady;
    
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900">Verificación de Requisitos</h3>
        
        <div className="space-y-4">
          <div className="flex items-center">
            {isReady ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500 mr-2" />
            )}
            <span className="text-sm">
              Todos los asientos deben estar balanceados
            </span>
          </div>
          
          {closingStatus.hasUnbalancedEntries && (
            <div className="ml-7 text-xs text-red-500">
              Hay {closingStatus.unbalancedEntries.length} asientos desbalanceados
            </div>
          )}
          
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 mr-2" />
            <div>
              <span className="text-sm">
                Una vez cerrado el período, no se podrán modificar los asientos de este período
              </span>
              <p className="text-xs text-gray-500 mt-1">
                El cierre es un proceso irreversible. Asegúrese de revisar todos los informes financieros antes de proceder.
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end mt-8">
          <button
            onClick={() => setClosingStep('generate')}
            disabled={!isReady || processingAction}
            className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
              isReady && !processingAction ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
            } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
          >
            Continuar <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  // Paso 2: Generar asiento de cierre
  const renderGenerateStep = () => {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900">Generar Asiento de Cierre</h3>
        
        <div className="bg-blue-50 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <FileCheck className="h-5 w-5 text-blue-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Generación del asiento de cierre
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  Se generará un asiento contable para:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Cerrar las cuentas de ingresos</li>
                  <li>Cerrar las cuentas de gastos</li>
                  <li>Transferir el resultado a la cuenta de resultados</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setClosingStep('check')}
            disabled={processingAction}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Volver
          </button>
          
          <button
            onClick={handleGenerateClosingEntry}
            disabled={processingAction}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {processingAction ? (
              <>
                <Loader className="animate-spin mr-2 h-4 w-4" />
                Generando...
              </>
            ) : (
              <>
                Generar Asiento de Cierre
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // Paso 3: Revisar y aprobar asiento
  const renderReviewStep = () => {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900">Revisar Asiento de Cierre</h3>
        
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="px-4 py-5 sm:px-6 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-900">
              Asiento de Cierre
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-gray-500">
              Revise el asiento de cierre generado antes de aprobarlo.
            </p>
          </div>
          <div className="px-4 py-5 sm:p-6">
            {closingEntryId && (
              <a 
                href={`/journal?entry=${closingEntryId}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                Ver asiento de cierre
              </a>
            )}
            <p className="mt-2 text-sm text-gray-500">
              Compruebe que las cuentas de ingresos y gastos han sido correctamente cerradas
              y que el resultado se ha trasladado a la cuenta de resultados.
            </p>
          </div>
        </div>
        
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setClosingStep('generate')}
            disabled={processingAction}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Volver
          </button>
          
          <button
            onClick={handleApproveClosingEntry}
            disabled={processingAction}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {processingAction ? (
              <>
                <Loader className="animate-spin mr-2 h-4 w-4" />
                Aprobando...
              </>
            ) : (
              <>
                Aprobar Asiento de Cierre
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // Paso 4: Cerrar período
  const renderCloseStep = () => {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900">Cerrar Período</h3>
        
        <div className="bg-yellow-50 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <Lock className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Cierre definitivo del período
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Esta acción cerrará definitivamente el período contable 
                  <strong> {activePeriod?.name}</strong> y creará un nuevo período activo.
                </p>
                <p className="mt-2">
                  <strong>¡Atención!</strong> Una vez cerrado el período:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>No se podrán modificar los asientos contables</li>
                  <li>No se podrán añadir nuevos asientos</li>
                  <li>No se podrá reabrir el período</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setClosingStep('review')}
            disabled={processingAction}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Volver
          </button>
          
          <button
            onClick={handleClosePeriod}
            disabled={processingAction}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            {processingAction ? (
              <>
                <Loader className="animate-spin mr-2 h-4 w-4" />
                Cerrando período...
              </>
            ) : (
              <>
                Cerrar Período Definitivamente
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // Paso 5: Proceso completado
  const renderCompleteStep = () => {
    return (
      <div className="text-center py-8">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h3 className="mt-2 text-xl font-medium text-gray-900">
          ¡Período cerrado correctamente!
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          El período contable ha sido cerrado y se ha creado un nuevo período activo.
        </p>
        <div className="mt-6 space-y-4">
          <a 
            href="/journal" 
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Ir al Diario
          </a>
          <br />
          <a 
            href="/financial-statements" 
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Ver Estados Financieros
          </a>
        </div>
      </div>
    );
  };

  // Renderizar pantalla de carga
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader className="h-8 w-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-500">Cargando...</span>
      </div>
    );
  }

  // Renderizar error si no hay período activo
  if (!activePeriod) {
    return (
      <div className="text-center py-12">
        <Calendar className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No hay período activo</h3>
        <p className="mt-1 text-sm text-gray-500">
          No se encontró un período contable activo. Active un período para continuar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Proceso de Cierre Contable</h1>
      </div>

      {/* Información del período */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Período a cerrar: {activePeriod.name}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Desde {format(new Date(activePeriod.start_date), 'dd/MM/yyyy')} hasta {format(new Date(activePeriod.end_date), 'dd/MM/yyyy')}
            </p>
          </div>

          {/* Indicador de paso actual */}
          <div className="border-b border-gray-200 pb-5">
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center space-x-5">
                <div className={`flex items-center ${closingStep === 'check' ? 'text-blue-600' : (closingStep === 'generate' || closingStep === 'review' || closingStep === 'close' || closingStep === 'complete') ? 'text-green-500' : 'text-gray-400'}`}>
                  <div className={`flex-shrink-0 h-5 w-5 rounded-full border-2 ${closingStep === 'check' ? 'border-blue-600' : (closingStep === 'generate' || closingStep === 'review' || closingStep === 'close' || closingStep === 'complete') ? 'border-green-500 bg-green-500' : 'border-gray-400'} flex items-center justify-center`}>
                    {(closingStep === 'generate' || closingStep === 'review' || closingStep === 'close' || closingStep === 'complete') && <CheckCircle className="h-3 w-3 text-white" />}
                  </div>
                  <span className="ml-2 text-xs font-medium">Verificación</span>
                </div>
                
                <div className={`flex items-center ${closingStep === 'generate' ? 'text-blue-600' : (closingStep === 'review' || closingStep === 'close' || closingStep === 'complete') ? 'text-green-500' : 'text-gray-400'}`}>
                  <div className={`flex-shrink-0 h-5 w-5 rounded-full border-2 ${closingStep === 'generate' ? 'border-blue-600' : (closingStep === 'review' || closingStep === 'close' || closingStep === 'complete') ? 'border-green-500 bg-green-500' : 'border-gray-400'} flex items-center justify-center`}>
                    {(closingStep === 'review' || closingStep === 'close' || closingStep === 'complete') && <CheckCircle className="h-3 w-3 text-white" />}
                  </div>
                  <span className="ml-2 text-xs font-medium">Asiento</span>
                </div>
                
                <div className={`flex items-center ${closingStep === 'review' ? 'text-blue-600' : (closingStep === 'close' || closingStep === 'complete') ? 'text-green-500' : 'text-gray-400'}`}>
                  <div className={`flex-shrink-0 h-5 w-5 rounded-full border-2 ${closingStep === 'review' ? 'border-blue-600' : (closingStep === 'close' || closingStep === 'complete') ? 'border-green-500 bg-green-500' : 'border-gray-400'} flex items-center justify-center`}>
                    {(closingStep === 'close' || closingStep === 'complete') && <CheckCircle className="h-3 w-3 text-white" />}
                  </div>
                  <span className="ml-2 text-xs font-medium">Revisión</span>
                </div>
                
                <div className={`flex items-center ${closingStep === 'close' ? 'text-blue-600' : closingStep === 'complete' ? 'text-green-500' : 'text-gray-400'}`}>
                  <div className={`flex-shrink-0 h-5 w-5 rounded-full border-2 ${closingStep === 'close' ? 'border-blue-600' : closingStep === 'complete' ? 'border-green-500 bg-green-500' : 'border-gray-400'} flex items-center justify-center`}>
                    {closingStep === 'complete' && <CheckCircle className="h-3 w-3 text-white" />}
                  </div>
                  <span className="ml-2 text-xs font-medium">Cierre</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contenido del paso actual */}
          <div className="mt-6">
            {renderCurrentStep()}
          </div>
        </div>
      </div>
    </div>
  );
} 