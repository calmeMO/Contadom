import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Eye, Filter, Calendar } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { JournalEntryForm } from '../components/JournalEntryForm';

// Tipos de datos
type JournalEntry = {
  id: string;
  date: string;
  entry_number: string;
  description: string;
  is_balanced?: boolean;
  is_approved?: boolean;
  created_at: string;
  created_by: string;
  accounting_period_id: string;
  period?: {
    name: string;
  };
  total_debit?: number;
  total_credit?: number;
  user?: {
    email: string;
  };
};

type AccountingPeriod = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
};

export function Journal() {
  // Estados
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [filters, setFilters] = useState({
    accounting_period_id: '',
    start_date: '',
    end_date: '',
    search: '',
  });

  // Definir fetchEntries con useCallback antes de usarlo en useEffect
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      // Consulta simple sin relaciones complejas para evitar errores
      let query = supabase
        .from('journal_entries')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      // Aplicar filtros si existen
      if (filters.accounting_period_id) {
        query = query.eq('accounting_period_id', filters.accounting_period_id);
      }
      
      if (filters.start_date) {
        query = query.gte('date', filters.start_date);
      }
      
      if (filters.end_date) {
        query = query.lte('date', filters.end_date);
      }
      
      if (filters.search) {
        query = query.or(`description.ilike.%${filters.search}%,entry_number.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Para cada entrada, obtenemos la información adicional que necesitamos
      const entriesWithDetails = await Promise.all((data || []).map(async (entry) => {
        // Obtener nombre del periodo si existe accounting_period_id
        let periodData = null;
        if (entry.accounting_period_id) {
          const { data: period } = await supabase
            .from('accounting_periods')
            .select('name')
            .eq('id', entry.accounting_period_id)
            .single();
          
          periodData = period;
        }
        
        // Obtener usuario creador si existe created_by
        let userData = null;
        if (entry.created_by) {
          const { data: user } = await supabase
            .from('user_profiles')
            .select('email')
            .eq('id', entry.created_by)
            .single();
          
          userData = user;
        }
        
        return {
          ...entry,
          period: periodData || { name: 'Desconocido' },
          user: userData || { email: 'Desconocido' }
        };
      }));

      setEntries(entriesWithDetails);
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      toast.error('Error al cargar los asientos contables');
    } finally {
      setLoading(false);
    }
  }, [filters.accounting_period_id, filters.start_date, filters.end_date, filters.search]);

  // Efectos
  useEffect(() => {
    fetchPeriods();
    fetchEntries();
  }, [fetchEntries]);

  async function fetchPeriods() {
    try {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      setPeriods(data || []);
    } catch (error) {
      console.error('Error fetching periods:', error);
      toast.error('Error al cargar los periodos contables');
    }
  }

  async function fetchEntryDetails(entryId: string) {
    try {
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('id', entryId)
        .single();

      if (entryError) throw entryError;
      
      // Obtener nombre del periodo si existe accounting_period_id
      let periodData = null;
      if (entry.accounting_period_id) {
        const { data: period } = await supabase
          .from('accounting_periods')
          .select('name')
          .eq('id', entry.accounting_period_id)
          .single();
        
        periodData = period;
      }
      
      // Obtener usuario creador si existe created_by
      let userData = null;
      if (entry.created_by) {
        const { data: user } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('id', entry.created_by)
          .single();
        
        userData = user;
      }
      
      setSelectedEntry({
        ...entry,
        period: periodData,
        user: userData
      });
      setShowDetail(true);
    } catch (error) {
      console.error('Error fetching entry details:', error);
      toast.error('Error al cargar los detalles del asiento');
    }
  }

  function handleNewEntry() {
    setSelectedEntry(null);
    setShowForm(true);
  }

  function handleEditEntry(entry: JournalEntry) {
    setSelectedEntry(entry);
    setShowForm(true);
  }

  function handleViewEntry(entryId: string) {
    fetchEntryDetails(entryId);
  }

  function handleFormSuccess() {
    setShowForm(false);
    setSelectedEntry(null);
    fetchEntries();
  }

  function handleApplyFilters() {
    fetchEntries();
  }

  function handleResetFilters() {
    setFilters({
      accounting_period_id: '',
      start_date: '',
      end_date: '',
      search: '',
    });
    fetchEntries();
  }

  function getStatusLabel(entry: JournalEntry) {
    if (entry.is_balanced === false) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
          Desbalanceado
        </span>
      );
    } else if (entry.is_approved) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
          Aprobado
        </span>
      );
    } else {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Pendiente
        </span>
      );
    }
  }

  // Renderizado
  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Libro Diario</h1>
        <button
          onClick={handleNewEntry}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-5 w-5 mr-2" />
          Nuevo Asiento
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filtros
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="accounting_period_id" className="block text-sm font-medium text-gray-700">
                Periodo Contable
              </label>
              <select
                id="accounting_period_id"
                name="accounting_period_id"
                value={filters.accounting_period_id}
                onChange={(e) => setFilters({ ...filters, accounting_period_id: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">Todos los periodos</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name} {period.is_closed ? "(Cerrado)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
                Fecha Inicio
              </label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">
                Fecha Fin
              </label>
              <input
                type="date"
                id="end_date"
                name="end_date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                Buscar
              </label>
              <input
                type="text"
                id="search"
                name="search"
                placeholder="Número o descripción"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end space-x-3">
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Limpiar
            </button>
            <button
              onClick={handleApplyFilters}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Asientos */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No hay asientos contables
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Comience creando un nuevo asiento contable.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Fecha
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Número
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Descripción
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Periodo
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Estado
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(entry.date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {entry.entry_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {entry.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {entry.period?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusLabel(entry)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleViewEntry(entry.id)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {!entry.is_approved && (
                          <button
                            onClick={() => handleEditEntry(entry)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle del asiento */}
      {showDetail && selectedEntry && (
        <div className="fixed inset-0 overflow-y-auto z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                      Detalle del Asiento {selectedEntry.entry_number}
                    </h3>
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Fecha</p>
                          <p className="text-sm text-gray-900">{format(new Date(selectedEntry.date), 'dd/MM/yyyy')}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Periodo</p>
                          <p className="text-sm text-gray-900">{selectedEntry.period?.name || '-'}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-sm font-medium text-gray-500">Descripción</p>
                          <p className="text-sm text-gray-900">{selectedEntry.description}</p>
                        </div>
                      </div>
                      
                      <div className="mt-6">
                        <p className="text-sm font-medium text-gray-500">Estado</p>
                        <p className="text-sm text-gray-900 mt-1">
                          {getStatusLabel(selectedEntry)}
                        </p>
                      </div>
                      
                      <div className="mt-6">
                        <p className="text-sm font-medium text-gray-500">Creado por</p>
                        <p className="text-sm text-gray-900">
                          {selectedEntry.user?.email || '-'} el {selectedEntry.created_at ? format(new Date(selectedEntry.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowDetail(false)}
                >
                  Cerrar
                </button>
                {!selectedEntry.is_approved && (
                  <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => {
                      setShowDetail(false);
                      handleEditEntry(selectedEntry);
                    }}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulario para nuevo asiento o edición */}
      {showForm && (
        <div className="fixed inset-0 overflow-y-auto z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                      {selectedEntry ? 'Editar Asiento' : 'Nuevo Asiento'}
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        {selectedEntry ? 'Modifique la información del asiento contable.' : 'Complete la información del nuevo asiento contable.'}
                      </p>
                    </div>
                    <div className="mt-4">
                      <JournalEntryForm
                        entry={selectedEntry || undefined}
                        onSuccess={handleFormSuccess}
                        onCancel={() => setShowForm(false)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}