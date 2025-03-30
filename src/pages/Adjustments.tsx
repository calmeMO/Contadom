import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  Clock, 
  Download, 
  Upload, 
  Edit,
  Settings,
  Save,
  Loader,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  AdjustmentTemplate, 
  AdjustmentType, 
  getAdjustmentTemplates,
  createAdjustmentEntry,
  createAdjustmentTemplate,
  deleteAdjustmentTemplate,
  initSystemAdjustmentTemplates,
  generateDepreciationAdjustments
} from '../services/adjustmentService';

export function Adjustments() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<AdjustmentTemplate[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; type: string }[]>([]);
  const [periods, setPeriods] = useState<{ id: string; name: string }[]>([]);
  const [processing, setProcessing] = useState(false);
  
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    type: AdjustmentType.OTHER,
    description: '',
    debitAccountId: '',
    creditAccountId: ''
  });
  
  const { user } = useAuth();
  
  useEffect(() => {
    fetchInitialData();
  }, []);
  
  async function fetchInitialData() {
    try {
      setLoading(true);
      
      // Inicializar plantillas del sistema
      await initSystemAdjustmentTemplates();
      
      // Cargar plantillas
      if (user) {
        const fetchedTemplates = await getAdjustmentTemplates(user.id);
        setTemplates(fetchedTemplates);
      }
      
      // Cargar cuentas
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code');
      
      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);
      
      // Cargar períodos contables
      const { data: periodsData, error: periodsError } = await supabase
        .from('accounting_periods')
        .select('id, name')
        .eq('is_closed', false)
        .order('end_date', { ascending: false });
      
      if (periodsError) throw periodsError;
      setPeriods(periodsData || []);
      
      // Establecer período y fecha por defecto
      if (periodsData && periodsData.length > 0) {
        setSelectedPeriod(periodsData[0].id);
      }
      
      // Establecer fecha actual por defecto
      const today = new Date();
      setSelectedDate(today.toISOString().split('T')[0]);
      
    } catch (error) {
      console.error('Error al cargar datos iniciales:', error);
      toast.error('Error al cargar los datos. Por favor, recargue la página.');
    } finally {
      setLoading(false);
    }
  }
  
  // Función para manejar la selección de una plantilla
  function handleTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId);
    
    // Autocompletar datos basados en la plantilla seleccionada
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setDescription(template.description);
      if (template.lastAmount) {
        setAmount(template.lastAmount.toString());
      }
    }
  }
  
  // Función para crear un asiento de ajuste
  async function handleCreateAdjustment(e: React.FormEvent) {
    e.preventDefault();
    
    if (!user) {
      toast.error('Debe iniciar sesión para realizar esta acción');
      return;
    }
    
    if (!selectedPeriod || !selectedDate || !amount) {
      toast.error('Por favor, complete todos los campos obligatorios');
      return;
    }
    
    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) {
      toast.error('Debe seleccionar una plantilla válida');
      return;
    }
    
    try {
      setProcessing(true);
      
      await createAdjustmentEntry({
        accountingPeriodId: selectedPeriod,
        description: description || template.description,
        date: selectedDate,
        amount: parseFloat(amount),
        debitAccountId: template.debitAccountId,
        creditAccountId: template.creditAccountId,
        templateId: template.id,
        userId: user.id,
        notes: notes
      });
      
      toast.success('Asiento de ajuste creado exitosamente');
      
      // Limpiar formulario
      setSelectedTemplate('');
      setDescription('');
      setAmount('');
      setNotes('');
      
    } catch (error) {
      console.error('Error al crear asiento de ajuste:', error);
      toast.error('Error al crear el asiento de ajuste');
    } finally {
      setProcessing(false);
    }
  }
  
  // Función para crear una nueva plantilla
  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    
    if (!user) {
      toast.error('Debe iniciar sesión para realizar esta acción');
      return;
    }
    
    if (!newTemplate.name || !newTemplate.debitAccountId || !newTemplate.creditAccountId) {
      toast.error('Por favor, complete todos los campos obligatorios');
      return;
    }
    
    try {
      setProcessing(true);
      
      await createAdjustmentTemplate(newTemplate, user.id);
      
      toast.success('Plantilla creada exitosamente');
      
      // Actualizar lista de plantillas
      const updatedTemplates = await getAdjustmentTemplates(user.id);
      setTemplates(updatedTemplates);
      
      // Cerrar formulario
      setShowNewTemplateForm(false);
      setNewTemplate({
        name: '',
        type: AdjustmentType.OTHER,
        description: '',
        debitAccountId: '',
        creditAccountId: ''
      });
      
    } catch (error) {
      console.error('Error al crear plantilla:', error);
      toast.error('Error al crear la plantilla');
    } finally {
      setProcessing(false);
    }
  }
  
  // Función para eliminar una plantilla
  async function handleDeleteTemplate(templateId: string) {
    if (!user) {
      toast.error('Debe iniciar sesión para realizar esta acción');
      return;
    }
    
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    if (template.isSystem) {
      toast.error('No se pueden eliminar las plantillas del sistema');
      return;
    }
    
    if (!confirm(`¿Está seguro de eliminar la plantilla "${template.name}"?`)) {
      return;
    }
    
    try {
      setProcessing(true);
      
      await deleteAdjustmentTemplate(templateId, user.id);
      
      toast.success('Plantilla eliminada exitosamente');
      
      // Actualizar lista de plantillas
      const updatedTemplates = await getAdjustmentTemplates(user.id);
      setTemplates(updatedTemplates);
      
      // Si la plantilla eliminada era la seleccionada, limpiar selección
      if (selectedTemplate === templateId) {
        setSelectedTemplate('');
        setDescription('');
        setAmount('');
      }
      
    } catch (error) {
      console.error('Error al eliminar plantilla:', error);
      toast.error('Error al eliminar la plantilla');
    } finally {
      setProcessing(false);
    }
  }
  
  // Función para generar asientos de depreciación automáticamente
  async function handleGenerateDepreciationEntries() {
    if (!user) {
      toast.error('Debe iniciar sesión para realizar esta acción');
      return;
    }
    
    if (!selectedPeriod || !selectedDate) {
      toast.error('Por favor, seleccione un período y una fecha');
      return;
    }
    
    if (!confirm('¿Está seguro de generar los asientos de depreciación automáticamente?')) {
      return;
    }
    
    try {
      setProcessing(true);
      
      const journalEntryIds = await generateDepreciationAdjustments(
        selectedPeriod,
        user.id,
        selectedDate
      );
      
      if (journalEntryIds.length === 0) {
        toast.info('No se encontraron activos depreciables para este período');
      } else {
        toast.success(`Se generaron ${journalEntryIds.length} asientos de depreciación`);
      }
      
    } catch (error) {
      console.error('Error al generar asientos de depreciación:', error);
      toast.error('Error al generar los asientos de depreciación');
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
          <h1 className="text-2xl font-semibold text-gray-900">Asientos de Ajuste</h1>
          <p className="mt-2 text-sm text-gray-700">
            Cree asientos de ajuste contable utilizando plantillas predefinidas o personalice sus propias plantillas.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 flex space-x-2">
          <button
            type="button"
            onClick={() => setShowNewTemplateForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-1" />
            Nueva Plantilla
          </button>
          <button
            type="button"
            onClick={handleGenerateDepreciationEntries}
            disabled={processing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-75"
          >
            <Calculator className="h-4 w-4 mr-1" />
            Generar Depreciaciones
          </button>
        </div>
      </div>
      
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Panel de plantillas */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Plantillas de Ajuste</h3>
            </div>
            
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {templates.length === 0 ? (
                <div className="p-6 text-center">
                  <AlertCircle className="h-10 w-10 text-yellow-500 mx-auto mb-2" />
                  <p className="text-gray-500">No hay plantillas disponibles</p>
                </div>
              ) : (
                templates.map(template => (
                  <div 
                    key={template.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer ${
                      selectedTemplate === template.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <div className="flex justify-between">
                      <h4 className="text-sm font-medium text-gray-900">{template.name}</h4>
                      {!template.isSystem && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(template.id);
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                    <div className="mt-2 flex items-center text-xs text-gray-500">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        template.isSystem ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {template.isSystem ? 'Sistema' : 'Personalizada'}
                      </span>
                      <span className="mx-2">•</span>
                      <span>{getAdjustmentTypeLabel(template.type)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Formulario de asiento de ajuste */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow-sm rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Crear Asiento de Ajuste</h3>
            </div>
            
            <form onSubmit={handleCreateAdjustment}>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Período contable */}
                  <div>
                    <label htmlFor="period" className="block text-sm font-medium text-gray-700">
                      Período Contable <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="period"
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(e.target.value)}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      required
                    >
                      <option value="">Seleccione un período</option>
                      {periods.map(period => (
                        <option key={period.id} value={period.id}>{period.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Fecha */}
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                      Fecha <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      id="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      required
                    />
                  </div>
                </div>
                
                {/* Descripción */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Descripción
                  </label>
                  <input
                    type="text"
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Descripción del asiento de ajuste"
                  />
                </div>
                
                {/* Monto */}
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                    Monto <span className="text-red-500">*</span>
                  </label>
                  <div className="relative mt-1 rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">$</span>
                    </div>
                    <input
                      type="number"
                      id="amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="block w-full pl-7 pr-12 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      required
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">DOP</span>
                    </div>
                  </div>
                </div>
                
                {/* Notas */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                    Notas
                  </label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Notas adicionales sobre este asiento"
                  />
                </div>
                
                {/* Información de cuentas */}
                {selectedTemplate && (
                  <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Cuentas que se afectarán:</h4>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <div>
                          <span className="text-gray-500">Débito:</span>
                          <span className="ml-2 text-gray-900">
                            {formatAccountName(
                              accounts.find(a => a.id === templates.find(t => t.id === selectedTemplate)?.debitAccountId)
                            )}
                          </span>
                        </div>
                        {amount && (
                          <span className="font-medium">${parseFloat(amount).toFixed(2)}</span>
                        )}
                      </div>
                      
                      <div className="flex justify-between">
                        <div>
                          <span className="text-gray-500">Crédito:</span>
                          <span className="ml-2 text-gray-900">
                            {formatAccountName(
                              accounts.find(a => a.id === templates.find(t => t.id === selectedTemplate)?.creditAccountId)
                            )}
                          </span>
                        </div>
                        {amount && (
                          <span className="font-medium">${parseFloat(amount).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="px-4 py-3 bg-gray-50 text-right sm:px-6 rounded-b-lg">
                <button
                  type="submit"
                  disabled={processing || !selectedTemplate}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-75"
                >
                  {processing ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-2" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Crear Asiento de Ajuste
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      {/* Modal para crear nueva plantilla */}
      {showNewTemplateForm && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Nueva Plantilla de Ajuste</h3>
                <button
                  type="button"
                  onClick={() => setShowNewTemplateForm(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Cerrar</span>
                  &times;
                </button>
              </div>
              
              <form onSubmit={handleCreateTemplate}>
                <div className="p-6 space-y-4">
                  {/* Nombre de plantilla */}
                  <div>
                    <label htmlFor="template-name" className="block text-sm font-medium text-gray-700">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="template-name"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Nombre de la plantilla"
                      required
                    />
                  </div>
                  
                  {/* Tipo de ajuste */}
                  <div>
                    <label htmlFor="template-type" className="block text-sm font-medium text-gray-700">
                      Tipo <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="template-type"
                      value={newTemplate.type}
                      onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value as AdjustmentType})}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      required
                    >
                      <option value={AdjustmentType.DEPRECIATION}>Depreciación</option>
                      <option value={AdjustmentType.AMORTIZATION}>Amortización</option>
                      <option value={AdjustmentType.PROVISION}>Provisión</option>
                      <option value={AdjustmentType.INVENTORY}>Inventario</option>
                      <option value={AdjustmentType.OTHER}>Otro</option>
                    </select>
                  </div>
                  
                  {/* Descripción */}
                  <div>
                    <label htmlFor="template-description" className="block text-sm font-medium text-gray-700">
                      Descripción
                    </label>
                    <textarea
                      id="template-description"
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
                      rows={2}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Descripción de la plantilla"
                    />
                  </div>
                  
                  {/* Cuenta débito */}
                  <div>
                    <label htmlFor="debit-account" className="block text-sm font-medium text-gray-700">
                      Cuenta Débito <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="debit-account"
                      value={newTemplate.debitAccountId}
                      onChange={(e) => setNewTemplate({...newTemplate, debitAccountId: e.target.value})}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      required
                    >
                      <option value="">Seleccione una cuenta</option>
                      <optgroup label="Activos">
                        {accounts.filter(a => a.type === 'asset').map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Gastos">
                        {accounts.filter(a => a.type === 'expense').map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Otras Cuentas">
                        {accounts.filter(a => a.type !== 'asset' && a.type !== 'expense').map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  
                  {/* Cuenta crédito */}
                  <div>
                    <label htmlFor="credit-account" className="block text-sm font-medium text-gray-700">
                      Cuenta Crédito <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="credit-account"
                      value={newTemplate.creditAccountId}
                      onChange={(e) => setNewTemplate({...newTemplate, creditAccountId: e.target.value})}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      required
                    >
                      <option value="">Seleccione una cuenta</option>
                      <optgroup label="Pasivos">
                        {accounts.filter(a => a.type === 'liability').map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Activos Contra">
                        {accounts.filter(a => a.type === 'contra_asset').map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Otras Cuentas">
                        {accounts.filter(a => a.type !== 'liability' && a.type !== 'contra_asset').map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
                
                <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
                  <button
                    type="button"
                    onClick={() => setShowNewTemplateForm(false)}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={processing}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-75"
                  >
                    {processing ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin mr-2" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar Plantilla'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Función auxiliar para obtener el label del tipo de ajuste
function getAdjustmentTypeLabel(type: AdjustmentType): string {
  switch (type) {
    case AdjustmentType.DEPRECIATION:
      return 'Depreciación';
    case AdjustmentType.AMORTIZATION:
      return 'Amortización';
    case AdjustmentType.PROVISION:
      return 'Provisión';
    case AdjustmentType.INVENTORY:
      return 'Inventario';
    case AdjustmentType.OTHER:
      return 'Otro';
    default:
      return type;
  }
}

// Función auxiliar para formatear el nombre de una cuenta
function formatAccountName(account: any): string {
  if (!account) return 'Cuenta no encontrada';
  return `${account.code} - ${account.name}`;
}

/**
 * Obtiene información de depreciación para activos
 */
export async function getDepreciationData(): Promise<any[]> {
  try {
    // Primero verificamos si los activos tienen la propiedad is_depreciable
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select(`
        id, code, name
      `)
      .eq('type', 'asset')
      .eq('is_active', true);
    
    if (error) throw error;
    
    // Como no existe la propiedad is_depreciable, consideraremos todos los activos
    // Buscamos ajustes relacionados con depreciación
    const { data: adjustments, error: adjError } = await supabase
      .from('account_adjustments')
      .select(`
        id, account_id, amount, description, created_at
      `)
      .eq('type', 'depreciation');
    
    if (adjError) throw adjError;
    
    // Combinamos la información
    const assetsWithData = accounts?.map(account => {
      const accountAdjustments = adjustments?.filter(adj => adj.account_id === account.id) || [];
      return {
        ...account,
        depreciation_data: accountAdjustments
      };
    }).filter(account => account.depreciation_data.length > 0);
    
    return assetsWithData || [];
  } catch (error) {
    console.error('Error al obtener datos de depreciación:', error);
    throw error;
  }
} 