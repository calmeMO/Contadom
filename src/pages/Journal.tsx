import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { 
  Plus, 
  FileEdit, 
  Trash2, 
  Copy, 
  Eye, 
  Check,
  Search,
  ArrowUpDown,
  XCircle,
  Info
} from 'lucide-react';
import JournalEntryForm from '../components/JournalEntryForm';
import Modal from '../components/ui/Modal';
import { 
  fetchJournalEntries, 
  getJournalEntry, 
  approveJournalEntry, 
  deleteJournalEntry,
  cancelJournalEntry,
  JournalEntryItem,
  JournalEntry,
  AdjustmentType
} from '../services/journalService';
import { 
  fetchFiscalYears, 
  getAvailablePeriodsForEntry,
  MonthlyPeriod
} from '../services/accountingPeriodService';
import Decimal from 'decimal.js';

// Definir el tipo de modo del modal de forma más completa
type ModalMode = 'create' | 'edit' | 'view' | 'create-adjustment' | 'edit-adjustment';

// Añadir estas funciones cerca del inicio del componente
// Función para obtener etiqueta larga de tipo de ajuste
const adjustmentTypeLabel = (type: AdjustmentType | null | undefined): string => {
  if (!type) return 'Ajuste';
  
  const labels: Record<AdjustmentType, string> = {
    'depreciation': 'Depreciación',
    'amortization': 'Amortización',
    'accrual': 'Devengo',
    'deferred': 'Diferido',
    'inventory': 'Inventario',
    'correction': 'Corrección de Error',
    'provision': 'Provisión',
    'valuation': 'Valoración',
    'other': 'Otro Ajuste'
  };
  
  return labels[type] || 'Ajuste';
};

// Función para obtener etiqueta corta de tipo de ajuste (para mostrar en tabla)
const adjustmentTypeShort = (type: AdjustmentType | null | undefined): string => {
  if (!type) return 'Ajuste';
  
  // Versiones abreviadas para mostrar en espacio limitado
  const shortLabels: Record<AdjustmentType, string> = {
    'depreciation': 'Deprec.',
    'amortization': 'Amort.',
    'accrual': 'Devengo',
    'deferred': 'Diferido',
    'inventory': 'Invent.',
    'correction': 'Correc.',
    'provision': 'Provis.',
    'valuation': 'Valor.',
    'other': 'Otro'
  };
  
  return shortLabels[type] || 'Ajuste';
};

export default function Journal() {
  const [user, setUser] = useState<any>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [monthlyPeriods, setMonthlyPeriods] = useState<MonthlyPeriod[]>([]);
  const [currentEntry, setCurrentEntry] = useState<JournalEntry | null>(null);
  const [currentEntryItems, setCurrentEntryItems] = useState<JournalEntryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [currentFiscalYearId, setCurrentFiscalYearId] = useState<string>('');
  const [currentMonthlyPeriodId, setCurrentMonthlyPeriodId] = useState<string>('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | 'regular' | 'adjustment'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [entryToCancel, setEntryToCancel] = useState<string | null>(null);

  // Obtener el usuario actual
  useEffect(() => {
    const getUserData = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUserData();
  }, []);
  
  // Cargar asientos contables
  const fetchEntries = async () => {
    try {
      setLoading(true);
      const { data, error } = await fetchJournalEntries({
        monthlyPeriodId: currentMonthlyPeriodId || undefined,
        fiscalYearId: currentFiscalYearId || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        entryType: entryTypeFilter,
        searchTerm: searchTerm || undefined,
        sortField,
        sortOrder
      });

      if (error) {
        console.error('Error al cargar asientos:', error);
        toast.error(`Error al cargar asientos: ${error.message || 'Error desconocido'}`);
        setEntries([]);
      } else {
        setEntries(data || []);
      }
    } catch (error: any) {
      console.error('Excepción al cargar asientos:', error);
      toast.error(`Error inesperado al cargar asientos: ${error.message}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Cargar cuentas contables
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .order('code');
      
      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);
      
      // Cargar períodos fiscales
      const { data: fiscalYearsData, error: fiscalYearsError } = await fetchFiscalYears();
      
      if (fiscalYearsError) throw fiscalYearsError;
      setFiscalYears(fiscalYearsData || []);
      
      // Cargar períodos mensuales disponibles
      const { data: periodsData, error: periodsError } = await getAvailablePeriodsForEntry();
      
      if (periodsError) throw periodsError;
      setMonthlyPeriods(periodsData || []);
      
      // Find current fiscal year (not closed and active)
      const currentFiscalYear = fiscalYearsData?.find(year => !year.is_closed && year.is_active);

      // Get current monthly period (associated with current fiscal year, not closed and active)
      const currentMonthlyPeriod = periodsData
        ?.filter(p => p.fiscal_year_id === currentFiscalYear?.id && !p.is_closed && p.is_active)
        .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0];
      
      if (currentFiscalYear) {
        setCurrentFiscalYearId(currentFiscalYear.id);
        
        if (currentMonthlyPeriod) {
          setCurrentMonthlyPeriodId(currentMonthlyPeriod.id || '');
        }
      }
    } catch (error: any) {
      console.error('Error al cargar datos iniciales:', error);
      toast.error(`Error: ${error.message || 'No se pudieron cargar los datos iniciales'}`);
    } finally {
      // No llamar a fetchEntries aquí, se llama en el siguiente useEffect
    }
  };

    loadInitialData();
  }, []);

  // Actualizar cuando cambian los filtros
  useEffect(() => {
    // Solo cargar entradas cuando el componente esté montado y tengamos períodos
    // Evitamos dependencia circular con loading para que no se recargue infinitamente
    if (monthlyPeriods.length > 0) {
        fetchEntries();
    } else if (!loading) {
        // Si no hay períodos pero ya no estamos cargando, también intentamos fetchEntries
        // esto cubrirá el caso cuando no hay períodos definidos aún
        fetchEntries();
    }
  }, [currentFiscalYearId, currentMonthlyPeriodId, statusFilter, entryTypeFilter, searchTerm, sortField, sortOrder]);

  // Crear nuevo asiento regular
  const handleCreate = () => {
    setCurrentEntry(null);
    setCurrentEntryItems([]);
    setModalMode('create');
    setModalVisible(true);
  };

  // Crear nuevo asiento de ajuste
  const handleCreateAdjustment = () => {
    setCurrentEntry(null);
    setCurrentEntryItems([]);
    setModalMode('create-adjustment');
    setModalVisible(true);
  };

  // Editar asiento
  const handleEdit = async (id: string) => {
    try {
      setLoading(true);
      const { entry, items, error } = await getJournalEntry(id);
      
      if (error) throw error;
      
      if (entry && items) {
        setCurrentEntry(entry);
        setCurrentEntryItems(items);
        setModalMode(entry.is_adjustment ? 'edit-adjustment' : 'edit');
        setModalVisible(true);
      }
    } catch (error: any) {
      console.error('Error al cargar asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo cargar el asiento'}`);
    } finally {
      setLoading(false);
    }
  };

  // Ver detalles de asiento
  const handleView = async (id: string) => {
    try {
      setLoading(true);
      const { entry, items, error } = await getJournalEntry(id);
      
      if (error) throw error;
      
      if (entry && items) {
        setCurrentEntry(entry);
        setCurrentEntryItems(items);
        setModalMode('view');
        setModalVisible(true);
      }
    } catch (error: any) {
      console.error('Error al cargar asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo cargar el asiento'}`);
    } finally {
      setLoading(false);
    }
  };

  // Aprobar asiento
  const handleApprove = async (id: string) => {
    if (!user?.id) {
        toast.warn('Debe iniciar sesión para aprobar asientos.');
        return;
    }
    try {
      const confirmed = window.confirm('¿Está seguro de aprobar este asiento contable?');
      if (!confirmed) return;
      
      setLoading(true);
      const { error } = await approveJournalEntry(id, user.id);
      
      if (error) throw error;
      
      toast.success('Asiento aprobado correctamente');
      fetchEntries();
    } catch (error: any) {
      console.error('Error al aprobar asiento:', error);
      toast.error(`Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  // Eliminar asiento
  const handleDelete = async (id: string) => {
    try {
      const confirmed = window.confirm('¿Está seguro de eliminar este asiento contable? Esta acción no se puede deshacer.');
      if (!confirmed) return;
      
      setLoading(true);
      const { error } = await deleteJournalEntry(id);
      
      if (error) throw error;
      
      toast.success('Asiento contable eliminado correctamente');
      fetchEntries();
    } catch (error: any) {
      console.error('Error al eliminar asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo eliminar el asiento'}`);
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal para anular asiento
  const handleCancel = (id: string) => {
    setEntryToCancel(id);
    setCancelReason('');
    setCancelModalVisible(true);
  };

  // Confirmar anulación de asiento
  const handleCancelConfirm = async () => {
    if (!entryToCancel || !user?.id) {
        toast.warn('No se puede anular el asiento sin ID o usuario.');
        return;
    }
    if (!cancelReason.trim()) {
      toast.error('Debe ingresar un motivo para la anulación.');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await cancelJournalEntry(entryToCancel, user.id, cancelReason);
      if (error) throw error;
      
      toast.success('Asiento anulado correctamente');
      setCancelModalVisible(false);
      fetchEntries();
    } catch (error: any) {
      console.error('Error al anular asiento:', error);
      toast.error(`Error al anular: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
      setEntryToCancel(null);
      setCancelReason('');
    }
  };

  // Duplicar asiento
  const handleDuplicate = async (id: string) => {
    try {
      setLoading(true);
      const { entry, items, error } = await getJournalEntry(id);
      if (error) throw error;
      
      if (entry && items) {
        // Crear copia sin ID, número y con fecha actual
        // Usar Partial<JournalEntry> para el objeto temporal
        const newEntryData: Partial<JournalEntry> = {
          // Copiar campos relevantes, omitir IDs y estados
          date: format(new Date(), 'yyyy-MM-dd'),
          description: `Copia de: ${entry.description}`,
          accounting_period_id: entry.accounting_period_id,
          monthly_period_id: currentMonthlyPeriodId || entry.monthly_period_id,
          notes: entry.notes,
          reference_number: entry.reference_number,
          reference_date: entry.reference_date,
          // Importante: Definir explícitamente los campos que deben ser null o false
          is_adjustment: false, 
          adjustment_type: null,
          adjusted_entry_id: null,
          status: 'pendiente', 
          is_approved: false,
          is_posted: false,
          // No incluir campos de auditoría como created_by, created_at, etc.
        };
        
        // Crear copia de las líneas sin IDs
        const newItemsData = items.map((item: JournalEntryItem) => ({
          // Copiar campos relevantes de la línea
          account_id: item.account_id,
          description: item.description,
          debit: item.debit,
          credit: item.credit,
          is_debit: item.is_debit,
          amount: item.amount,
          // Generar nuevo temp_id
          temp_id: uuidv4() 
        }));
        
        // Pasar el objeto parcial al estado, el formulario lo completará
        setCurrentEntry(newEntryData as JournalEntry); // Asumir que el form lo manejará
        setCurrentEntryItems(newItemsData);
        // Abrir en modo creación normal
        setModalMode('create'); 
        setModalVisible(true);
      } else {
          toast.error('No se encontraron datos para duplicar el asiento.');
      }
    } catch (error: any) {
      console.error('Error al duplicar asiento:', error);
      toast.error(`Error al duplicar: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  // Manejar el cierre del modal
  const handleModalCancel = () => {
    setModalVisible(false);
    setCurrentEntry(null);
    setCurrentEntryItems([]);
  };

  // Manejar la finalización del formulario
  const handleFormFinish = (entryId: string | null) => {
    setModalVisible(false);
    setCurrentEntry(null);
    setCurrentEntryItems([]);
    if (entryId) {
        fetchEntries();
    }
  };

  // Manejar cambio de período fiscal
  const handleFiscalYearChange = (id: string) => {
    setCurrentFiscalYearId(id);
  };

  // Manejar cambio de período mensual
  const handleMonthlyPeriodChange = (id: string) => {
    setCurrentMonthlyPeriodId(id);
  };

  // Ordenar por campo
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Diario Contable</h1>
        <div className="flex items-center space-x-2">
           <button
            onClick={handleCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md flex items-center text-sm font-medium shadow-sm"
          >
            <Plus size={18} className="mr-1" />
            Nuevo Asiento
          </button>
          <button
            onClick={handleCreateAdjustment}
            className="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-md flex items-center text-sm font-medium shadow-sm"
          >
            <FileEdit size={18} className="mr-1" />
            Nuevo Ajuste
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-medium">Filtros y Búsqueda</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Año Fiscal</label>
            <select
              value={currentFiscalYearId}
              onChange={(e) => handleFiscalYearChange(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {fiscalYears.map(year => (<option key={year.id} value={year.id}>{year.name}</option>))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Período Mensual</label>
            <select
              value={currentMonthlyPeriodId}
              onChange={(e) => handleMonthlyPeriodChange(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={!currentFiscalYearId}
            >
              <option value="">Todos</option>
              {monthlyPeriods
                .filter(p => !currentFiscalYearId || p.fiscal_year_id === currentFiscalYearId)
                .map(period => (<option key={period.id} value={period.id}>{period.name}</option>))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Asiento</label>
            <select
              value={entryTypeFilter}
              onChange={(e) => setEntryTypeFilter(e.target.value as 'all' | 'regular' | 'adjustment')}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos</option>
              <option value="regular">Regulares</option>
              <option value="adjustment">Ajustes</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="aprobado">Aprobado</option>
              <option value="voided">Anulado</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nº, descripción, ref..."
                className="w-full p-2 pl-10 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
        
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('entry_number')}>
                    <div className="flex items-center">Número {sortField === 'entry_number' && <ArrowUpDown size={14} className="ml-1" />}</div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('date')}>
                    <div className="flex items-center">Fecha {sortField === 'date' && <ArrowUpDown size={14} className="ml-1" />}</div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Período</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Débito</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Crédito</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && entries.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-gray-500"><div className="flex justify-center items-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div> Cargando...</div></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-gray-500">No hay asientos que coincidan con los filtros.</td></tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className={`hover:bg-gray-50 ${entry.is_adjustment ? 'bg-purple-50' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">{entry.entry_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">{format(parseISO(entry.date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 text-sm">
                        <div className="truncate max-w-xs" title={entry.description}>{entry.description}</div>
                        {entry.reference_number && <div className="text-xs text-gray-500 mt-0.5" title={`Ref: ${entry.reference_number}`}>Ref: {entry.reference_number}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm">{entry.monthly_period?.name || '-'}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-sm">
                       {entry.is_adjustment && (
                           <span 
                             className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800" 
                             title={adjustmentTypeLabel(entry.adjustment_type)}
                           >
                             <Info size={12} className="mr-1" /> 
                             {adjustmentTypeShort(entry.adjustment_type)}
                           </span>
                       )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm font-mono">{new Decimal(entry.total_debit).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm font-mono">{new Decimal(entry.total_credit).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium 
                        ${entry.status === 'aprobado' ? 'bg-green-100 text-green-800' : 
                          entry.status === 'voided' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'}`}
                      >{entry.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-sm">
                      <div className="flex justify-center items-center space-x-1">
                        <button onClick={() => handleView(entry.id)} className="p-1 text-gray-500 hover:text-gray-700" title="Ver Detalles"><Eye size={16} /></button>
                        {(entry.status === 'pendiente') && (
                            <button onClick={() => handleEdit(entry.id)} className="p-1 text-blue-600 hover:text-blue-800" title="Editar"><FileEdit size={16} /></button>
                        )}
                        {(entry.status === 'pendiente') && (
                            <button onClick={() => handleApprove(entry.id)} className="p-1 text-green-600 hover:text-green-800" title="Aprobar"><Check size={16} /></button>
                        )}
                        {(entry.status === 'pendiente') && (
                            <button onClick={() => handleDelete(entry.id)} className="p-1 text-red-600 hover:text-red-800" title="Eliminar"><Trash2 size={16} /></button>
                        )}
                         {(entry.status === 'aprobado') && (
                             <button onClick={() => handleCancel(entry.id)} className="p-1 text-orange-600 hover:text-orange-800" title="Anular"><XCircle size={16} /></button>
                         )}
                        <button onClick={() => handleDuplicate(entry.id)} className="p-1 text-purple-600 hover:text-purple-800" title="Duplicar"><Copy size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalVisible && (
        <Modal 
          isOpen={modalVisible} 
          onClose={handleModalCancel} 
          title={modalMode.includes('create') ? (modalMode === 'create-adjustment' ? 'Nuevo Ajuste' : 'Nuevo Asiento') : (modalMode.includes('edit') ? (modalMode === 'edit-adjustment' ? 'Editar Ajuste' : 'Editar Asiento') : 'Ver Asiento')}
          size="xl"
        >
          <JournalEntryForm
            mode={modalMode}
            entryId={currentEntry?.id}
            entry={currentEntry}
            entryItems={currentEntryItems}
            accounts={accounts}
            onFinish={handleFormFinish}
            onCancel={handleModalCancel}
            loading={loading}
          />
        </Modal>
      )}
      
      {cancelModalVisible && (
        <Modal 
            isOpen={cancelModalVisible} 
            onClose={() => setCancelModalVisible(false)} 
            title="Anular Asiento Contable"
            size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Por favor, ingrese el motivo de la anulación para el asiento seleccionado.</p>
            <textarea 
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Motivo de la anulación..."
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-red-500 focus:border-red-500"
            />
            <div className="flex justify-end space-x-2">
              <button 
                type="button"
                onClick={() => setCancelModalVisible(false)}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleCancelConfirm}
                disabled={!cancelReason.trim() || loading}
                className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md flex items-center text-sm font-medium shadow-sm disabled:opacity-50"
              >
                {loading ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}