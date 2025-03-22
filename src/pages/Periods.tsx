import React, { useState, useEffect } from 'react';
import { Plus, Calendar, RefreshCw, FileText } from 'lucide-react';
import { format, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import type { AccountingPeriod } from '../types/database';

export function Periods() {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPeriodForm, setShowNewPeriodForm] = useState(false);
  const [showFiscalYearForm, setShowFiscalYearForm] = useState(false);
  const [fiscalYearType, setFiscalYearType] = useState('december'); // december, march, june, september
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    periodType: 'monthly', // monthly, quarterly, annual
    fiscalPurpose: '', // IR-2, IT-1, etc.
  });
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    fetchPeriods();
    getCurrentUser();
  }, []);

  async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      setCurrentUser(data.user.id);
    }
  }

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
    } finally {
      setLoading(false);
    }
  }

  // Crear un período mensual alineado correctamente
  function createAlignedMonthlyPeriod(year: number, month: number) {
    const startDate = new Date(year, month, 1);
    const endDate = endOfMonth(startDate);
    
    const monthName = format(startDate, 'MMMM', { locale: es });
    return {
      name: `${monthName} ${year}`,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      periodType: 'monthly',
      fiscalPurpose: ''
    };
  }

  // Crear un año fiscal completo (12 meses)
  async function createFiscalYear() {
    setLoading(true);
    
    try {
      const currentYear = new Date().getFullYear();
      
      let startDate, endDate, yearName;
      
      // Determinar fechas según el tipo de ejercicio fiscal elegido
      switch(fiscalYearType) {
        case 'december': // 1 de enero al 31 de diciembre
          startDate = new Date(currentYear, 0, 1); // 1 de enero
          endDate = new Date(currentYear, 11, 31); // 31 de diciembre
          yearName = `Año Fiscal ${currentYear} (Ene-Dic)`;
          break;
        case 'march': // 1 de abril del año anterior al 31 de marzo del año en curso
          startDate = new Date(currentYear - 1, 3, 1); // 1 de abril del año anterior
          endDate = new Date(currentYear, 2, 31); // 31 de marzo del año en curso
          yearName = `Año Fiscal ${currentYear-1}-${currentYear} (Abr-Mar)`;
          break;
        case 'june': // 1 de julio del año anterior al 30 de junio del año en curso
          startDate = new Date(currentYear - 1, 6, 1); // 1 de julio del año anterior
          endDate = new Date(currentYear, 5, 30); // 30 de junio del año en curso
          yearName = `Año Fiscal ${currentYear-1}-${currentYear} (Jul-Jun)`;
          break;
        case 'september': // 1 de octubre del año anterior al 30 de septiembre del año en curso
          startDate = new Date(currentYear - 1, 9, 1); // 1 de octubre del año anterior
          endDate = new Date(currentYear, 8, 30); // 30 de septiembre del año en curso
          yearName = `Año Fiscal ${currentYear-1}-${currentYear} (Oct-Sep)`;
          break;
        default:
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 11, 31);
          yearName = `Año Fiscal ${currentYear}`;
      }
      
      const periodsToCreate = [];
      
      // Crear registro para el año completo
      periodsToCreate.push({
        name: yearName,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        period_type: 'annual',
        fiscal_purpose: 'IR-2',
        created_by: currentUser
      });
      
      if (!currentUser) {
        throw new Error('No se ha podido identificar al usuario actual');
      }

      const { error } = await supabase
        .from('accounting_periods')
        .insert(periodsToCreate);

      if (error) throw error;
      
      toast.success('Año fiscal creado exitosamente');
      setShowFiscalYearForm(false);
      fetchPeriods();
    } catch (error) {
      console.error('Error creating fiscal year:', error);
      toast.error((error as Error).message || 'Error al crear el año fiscal');
    } finally {
      setLoading(false);
    }
  }

  // Función para crear todos los meses de un año
  async function createAllMonths() {
    setLoading(true);
    
    try {
      const currentYear = new Date().getFullYear();
      const periodsToCreate = [];
      
      // Crear 12 meses
      for (let month = 0; month < 12; month++) {
        const period = createAlignedMonthlyPeriod(currentYear, month);
        
        periodsToCreate.push({
          name: period.name,
          start_date: period.startDate,
          end_date: period.endDate,
          period_type: 'monthly',
          fiscal_purpose: month === 2 ? 'IT-1 Q1' : 
                         month === 5 ? 'IT-1 Q2' : 
                         month === 8 ? 'IT-1 Q3' : 
                         month === 11 ? 'IT-1 Q4' : '',
          created_by: currentUser
        });
      }
      
      if (!currentUser) {
        throw new Error('No se ha podido identificar al usuario actual');
      }

      const { error } = await supabase
        .from('accounting_periods')
        .insert(periodsToCreate);

      if (error) throw error;
      
      toast.success('Períodos mensuales creados exitosamente');
      fetchPeriods();
    } catch (error) {
      console.error('Error creating monthly periods:', error);
      toast.error((error as Error).message || 'Error al crear los períodos mensuales');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate dates
      if (new Date(formData.endDate) < new Date(formData.startDate)) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      }

      // Check for overlapping periods
      const overlapping = periods.some(period => {
        const newStart = new Date(formData.startDate);
        const newEnd = new Date(formData.endDate);
        const periodStart = new Date(period.start_date);
        const periodEnd = new Date(period.end_date);

        return (
          (newStart >= periodStart && newStart <= periodEnd) ||
          (newEnd >= periodStart && newEnd <= periodEnd) ||
          (periodStart >= newStart && periodStart <= newEnd)
        );
      });

      if (overlapping) {
        throw new Error('El periodo se superpone con otro periodo existente');
      }
      
      // Validar alineación con meses calendario para cumplir con normas DGII
      if (formData.periodType === 'monthly') {
        const startDate = new Date(formData.startDate);
        const endDate = new Date(formData.endDate);
        
        const isStartDayOne = startDate.getDate() === 1;
        const isEndLastDay = endDate.getDate() === new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
        
        if (!isStartDayOne || !isEndLastDay) {
          throw new Error('Los períodos mensuales deben iniciar el día 1 y finalizar el último día del mes para cumplir con las normas de la DGII');
        }
      }

      if (!currentUser) {
        throw new Error('No se ha podido identificar al usuario actual');
      }

      const { error } = await supabase.from('accounting_periods').insert([
        {
          name: formData.name,
          start_date: formData.startDate,
          end_date: formData.endDate,
          period_type: formData.periodType,
          fiscal_purpose: formData.fiscalPurpose,
          created_by: currentUser
        },
      ]);

      if (error) {
        console.error('Supabase request failed', error);
        throw new Error(error.message || 'Error al crear el periodo contable');
      }

      toast.success('Periodo contable creado exitosamente');
      setShowNewPeriodForm(false);
      setFormData({
        name: '',
        startDate: '',
        endDate: '',
        periodType: 'monthly',
        fiscalPurpose: ''
      });
      fetchPeriods();
    } catch (error) {
      console.error('Error creating period:', error);
      toast.error((error as Error).message || 'Error al crear el periodo contable');
    } finally {
      setLoading(false);
    }
  }

  async function handleClosePeriod(periodId: string) {
    if (!confirm('¿Está seguro de cerrar este periodo contable? Esta acción no se puede deshacer.')) {
      return;
    }

    setLoading(true);
    try {
      // Verificar si hay asientos no cuadrados en este período
      const { data: journalEntries, error: journalError } = await supabase
        .from('journal_entries')
        .select('id, is_balanced')
        .eq('accounting_period_id', periodId)
        .eq('is_balanced', false);
      
      if (journalError) throw journalError;
      
      if (journalEntries && journalEntries.length > 0) {
        throw new Error(`Hay ${journalEntries.length} asientos contables sin cuadrar en este período. Revise antes de cerrar.`);
      }
      
      const { error } = await supabase
        .from('accounting_periods')
        .update({
          is_closed: true,
          closed_at: new Date().toISOString(),
          closed_by: currentUser
        })
        .eq('id', periodId);

      if (error) throw error;

      toast.success('Periodo contable cerrado exitosamente');
      fetchPeriods();
    } catch (error) {
      console.error('Error closing period:', error);
      toast.error((error as Error).message || 'Error al cerrar el periodo contable');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Periodos Contables
        </h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowFiscalYearForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            disabled={loading}
          >
            <FileText className="h-5 w-5 mr-2" />
            Crear Año Fiscal
          </button>
          <button
            onClick={() => createAllMonths()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            disabled={loading}
          >
            <RefreshCw className="h-5 w-5 mr-2" />
            Crear Meses
          </button>
          <button
            onClick={() => setShowNewPeriodForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={loading}
          >
            <Plus className="h-5 w-5 mr-2" />
            Periodo Personalizado
          </button>
        </div>
      </div>

      {showFiscalYearForm && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Seleccionar Tipo de Ejercicio Fiscal
            </h3>
            <div className="mt-5 space-y-4">
              <p className="text-sm text-gray-500">
                Según el artículo 300 del Código Tributario Dominicano (CTD), las empresas pueden elegir entre cuatro fechas para el cierre de su ejercicio fiscal:
              </p>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Fecha de Cierre Fiscal
                </label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center">
                    <input
                      id="december"
                      name="fiscalYearType"
                      type="radio"
                      checked={fiscalYearType === 'december'}
                      onChange={() => setFiscalYearType('december')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="december" className="ml-3 block text-sm font-medium text-gray-700">
                      31 de diciembre (1 de enero al 31 de diciembre)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="march"
                      name="fiscalYearType"
                      type="radio"
                      checked={fiscalYearType === 'march'}
                      onChange={() => setFiscalYearType('march')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="march" className="ml-3 block text-sm font-medium text-gray-700">
                      31 de marzo (1 de abril del año anterior al 31 de marzo del año en curso)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="june"
                      name="fiscalYearType"
                      type="radio"
                      checked={fiscalYearType === 'june'}
                      onChange={() => setFiscalYearType('june')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="june" className="ml-3 block text-sm font-medium text-gray-700">
                      30 de junio (1 de julio del año anterior al 30 de junio del año en curso)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="september"
                      name="fiscalYearType"
                      type="radio"
                      checked={fiscalYearType === 'september'}
                      onChange={() => setFiscalYearType('september')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="september" className="ml-3 block text-sm font-medium text-gray-700">
                      30 de septiembre (1 de octubre del año anterior al 30 de septiembre del año en curso)
                    </label>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-500 italic">
                  Nota: Una vez elegida una fecha de cierre, esta no puede ser modificada sin la autorización expresa de la DGII.
                </p>
              </div>
              <div className="flex justify-end space-x-3 mt-5">
                <button
                  type="button"
                  onClick={() => setShowFiscalYearForm(false)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createFiscalYear}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Crear Año Fiscal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewPeriodForm && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Nuevo Periodo Contable
            </h3>
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Nombre del Periodo
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              
              <div>
                <label
                  htmlFor="periodType"
                  className="block text-sm font-medium text-gray-700"
                >
                  Tipo de Periodo
                </label>
                <select
                  id="periodType"
                  name="periodType"
                  value={formData.periodType}
                  onChange={(e) =>
                    setFormData({ ...formData, periodType: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="monthly">Mensual</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="annual">Anual</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>
              
              <div>
                <label
                  htmlFor="fiscalPurpose"
                  className="block text-sm font-medium text-gray-700"
                >
                  Propósito Fiscal
                </label>
                <select
                  id="fiscalPurpose"
                  name="fiscalPurpose"
                  value={formData.fiscalPurpose}
                  onChange={(e) =>
                    setFormData({ ...formData, fiscalPurpose: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Ninguno</option>
                  <option value="IR-2">Declaración IR-2</option>
                  <option value="IT-1 Q1">IT-1 Primer Trimestre</option>
                  <option value="IT-1 Q2">IT-1 Segundo Trimestre</option>
                  <option value="IT-1 Q3">IT-1 Tercer Trimestre</option>
                  <option value="IT-1 Q4">IT-1 Cuarto Trimestre</option>
                  <option value="IR-17">IR-17 Retenciones</option>
                  <option value="ISR Anticipos">ISR Anticipos</option>
                </select>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    id="startDate"
                    required
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="endDate"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Fecha de Fin
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    id="endDate"
                    required
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowNewPeriodForm(false)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Crear Periodo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : periods.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No hay periodos
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Comience creando un nuevo periodo contable.
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
                      Nombre
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Tipo
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Propósito Fiscal
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Fecha Inicio
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Fecha Fin
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
                  {periods.map((period) => (
                    <tr key={period.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {period.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {period.period_type === 'monthly' ? 'Mensual' : 
                         period.period_type === 'quarterly' ? 'Trimestral' : 
                         period.period_type === 'annual' ? 'Anual' : 'Personalizado'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {period.fiscal_purpose || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(period.start_date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(period.end_date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            period.is_closed
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {period.is_closed ? 'Cerrado' : 'Activo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {!period.is_closed && (
                          <button
                            onClick={() => handleClosePeriod(period.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Cerrar Periodo
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
    </div>
  );
}