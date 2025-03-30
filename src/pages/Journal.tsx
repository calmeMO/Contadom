import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { 
  Plus, 
  FileEdit, 
  Trash2, 
  Copy, 
  Eye, 
  Check,
  Search,
  Filter,
  ArrowUpDown,
  XCircle
} from 'lucide-react';
import JournalEntryForm from '../components/JournalEntryForm';
import Modal from '../components/ui/Modal';
import { 
  fetchJournalEntries, 
  getJournalEntry, 
  approveJournalEntry, 
  deleteJournalEntry,
  cancelJournalEntry
} from '../services/journalService';
import { 
  fetchFiscalYears, 
  getAvailablePeriodsForEntry,
  MonthlyPeriod
} from '../services/accountingPeriodService';
import Decimal from 'decimal.js';

export default function Journal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [monthlyPeriods, setMonthlyPeriods] = useState<MonthlyPeriod[]>([]);
  const [currentEntry, setCurrentEntry] = useState<any>(null);
  const [currentEntryItems, setCurrentEntryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [currentFiscalYearId, setCurrentFiscalYearId] = useState<string>('');
  const [currentMonthlyPeriodId, setCurrentMonthlyPeriodId] = useState<string>('');
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
        searchTerm: searchTerm || undefined,
        sortField,
        sortOrder
      });

      if (error) throw error;
      setEntries(data || []);
    } catch (error: any) {
      console.error('Error al cargar asientos:', error);
      toast.error(`Error: ${error.message || 'No se pudieron cargar los asientos'}`);
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
      setLoading(false);
    }
  };

    loadInitialData();
  }, []);

  // Actualizar cuando cambian los filtros
  useEffect(() => {
    fetchEntries();
  }, [currentFiscalYearId, currentMonthlyPeriodId, statusFilter, searchTerm, sortField, sortOrder]);

  // Crear nuevo asiento
  const handleCreate = () => {
    setCurrentEntry(null);
    setCurrentEntryItems([]);
    setModalMode('create');
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
        setModalMode('edit');
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
    try {
      const confirmed = window.confirm('¿Está seguro de aprobar este asiento contable?');
      if (!confirmed) return;
      
      setLoading(true);
      const { error } = await approveJournalEntry(id, user?.id);
      
      if (error) throw error;
      
      toast.success('Asiento contable aprobado correctamente');
      fetchEntries();
    } catch (error: any) {
      console.error('Error al aprobar asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo aprobar el asiento'}`);
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
    if (!entryToCancel) return;
    
    if (!cancelReason.trim()) {
      toast.error('Debe proporcionar un motivo para anular el asiento');
      return;
    }
    
    try {
      setLoading(true);
      const { error } = await cancelJournalEntry(entryToCancel, user?.id, cancelReason);
      
      if (error) throw error;
      
      toast.success('Asiento contable anulado correctamente');
      fetchEntries();
      setCancelModalVisible(false);
    } catch (error: any) {
      console.error('Error al anular asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo anular el asiento'}`);
    } finally {
      setLoading(false);
    }
  };

  // Duplicar asiento
  const handleDuplicate = async (id: string) => {
    try {
      setLoading(true);
      const { entry, items, error } = await getJournalEntry(id);
      
      if (error) throw error;
      
      if (entry && items) {
        // Crear una copia del asiento con la fecha actual
        const newEntry = {
          ...entry,
          id: undefined,
          entry_number: undefined,
          date: format(new Date(), 'yyyy-MM-dd'),
          description: `Copia de: ${entry.description}`,
          status: 'pendiente',
          is_approved: false,
          is_posted: false,
          created_at: undefined,
          updated_at: undefined,
          // Utilizar el período mensual actualmente seleccionado
          monthly_period_id: currentMonthlyPeriodId || entry.monthly_period_id
        };
        
        // Crear copia de las líneas
        const newItems = items.map(item => ({
          ...item,
          id: undefined,
          journal_entry_id: undefined,
          temp_id: uuidv4()
        }));
        
        setCurrentEntry(newEntry);
        setCurrentEntryItems(newItems);
        setModalMode('create');
        setModalVisible(true);
      }
    } catch (error: any) {
      console.error('Error al duplicar asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo duplicar el asiento'}`);
    } finally {
      setLoading(false);
    }
  };

  // Manejar el cierre del modal
  const handleModalCancel = () => {
    setModalVisible(false);
  };

  // Manejar la finalización del formulario
  const handleFormFinish = (id: string) => {
    setModalVisible(false);
    fetchEntries();
  };

  // Manejar cambio de período fiscal
  const handleFiscalYearChange = (id: string) => {
    setCurrentFiscalYearId(id);
    setCurrentMonthlyPeriodId(''); // Limpiar el período mensual al cambiar el año fiscal
  };

  // Manejar cambio de período mensual
  const handleMonthlyPeriodChange = (id: string) => {
    setCurrentMonthlyPeriodId(id);
  };

  // Calcular saldo
  const calculateBalance = (debit: number, credit: number): number => {
    const debitDecimal = new Decimal(debit);
    const creditDecimal = new Decimal(credit);
    return debitDecimal.minus(creditDecimal).toNumber();
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
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Diario Contable</h1>
        <button
          onClick={handleCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md flex items-center"
        >
          <Plus size={18} className="mr-1" />
          Nuevo Asiento
        </button>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <h2 className="text-lg font-medium">Filtros</h2>
              </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Período Fiscal</label>
              <select
              value={currentFiscalYearId}
              onChange={(e) => handleFiscalYearChange(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="">Todos los períodos fiscales</option>
              {fiscalYears.map(year => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
          </div>
              
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Período Mensual</label>
              <select
              value={currentMonthlyPeriodId}
              onChange={(e) => handleMonthlyPeriodChange(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="">Todos los períodos mensuales</option>
              {monthlyPeriods.map(period => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
                </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por número, descripción o referencia"
                className="w-full p-2 pl-10 border border-gray-300 rounded-md"
              />
                </div>
              </div>
            </div>
        </div>
        
      <div className="bg-white rounded-lg shadow">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('entry_number')}
                >
                  <div className="flex items-center">
                    Número
                    {sortField === 'entry_number' && (
                      <ArrowUpDown size={14} className="ml-1" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center">
                    Fecha
                    {sortField === 'date' && (
                      <ArrowUpDown size={14} className="ml-1" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Período
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Débito
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Crédito
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                {loading && entries.length === 0 ? (
                  <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-gray-500">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                    <p className="mt-2">Cargando asientos...</p>
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-gray-500">
                    No hay asientos contables que mostrar
                    </td>
                  </tr>
                ) : (
                entries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {entry.entry_number}
                      </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {entry.date}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="truncate max-w-xs">
                        {entry.description}
                      </div>
                      {entry.reference_number && (
                        <div className="text-xs text-gray-500">
                          Ref: {entry.reference_number}
                        </div>
                      )}
                      </td>
                    <td className="px-4 py-3 text-sm">
                      {entry.accounting_period?.name || ''}
                      </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm font-medium">
                      {Number(entry.total_debit).toFixed(2)}
                      </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm font-medium">
                      {Number(entry.total_credit).toFixed(2)}
                      </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium 
                        ${entry.status === 'aprobado' ? 'bg-green-100 text-green-800' : 
                          entry.status === 'anulado' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'}`}
                      >
                        {entry.status}
                      </span>
                      </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-sm">
                        <div className="flex justify-center space-x-1">
                        {!entry.is_approved && (
                          <>
                        <button
                              onClick={() => handleEdit(entry.id)}
                              className="text-blue-600 hover:text-blue-800 mr-1"
                              title="Editar"
                            >
                              <FileEdit size={18} />
                        </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="text-red-600 hover:text-red-800 mr-1"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                          )}
                        {entry.status !== 'anulado' && (
                          <button
                            onClick={() => handleCancel(entry.id)}
                            className="text-orange-600 hover:text-orange-800 mr-1"
                            title="Anular asiento"
                          >
                            <XCircle size={18} />
                          </button>
                        )}
                            <button
                          onClick={() => handleView(entry.id)}
                          className="text-gray-600 hover:text-gray-800 mr-1"
                          title="Ver detalles"
                        >
                          <Eye size={18} />
                            </button>
                        <button
                          onClick={() => handleDuplicate(entry.id)}
                          className="text-green-600 hover:text-green-800 mr-1"
                          title="Duplicar"
                        >
                          <Copy size={18} />
                        </button>
                          {!entry.is_approved && (
                            <button
                            onClick={() => handleApprove(entry.id)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Aprobar"
                          >
                            <Check size={18} />
                          </button>
                        )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                </tbody>
              </table>
            </div>
        </div>
        
      {/* Modal de formulario para crear/editar asientos */}
      {modalVisible && (
        <Modal 
          title={
            modalMode === 'create' 
              ? 'Crear Asiento Contable' 
              : modalMode === 'edit' 
                ? 'Editar Asiento Contable' 
                : 'Detalles del Asiento Contable'
          }
          onClose={handleModalCancel}
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

      {/* Modal para anular asiento */}
      {cancelModalVisible && (
        <Modal 
          title="Anular Asiento Contable" 
          onClose={() => setCancelModalVisible(false)}
          size="md"
        >
          <div className="p-4">
            <p className="mb-4 text-gray-700">
              Por favor, indique el motivo por el cual está anulando este asiento contable:
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo de anulación"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 mb-4"
              rows={4}
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setCancelModalVisible(false)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
                <button
                onClick={handleCancelConfirm}
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm bg-red-600 text-white hover:bg-red-700 flex items-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <XCircle size={16} className="mr-2" />
                )}
                Anular Asiento
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}