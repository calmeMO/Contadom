import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { Calendar, AlertCircle, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';

export function AccountingPeriodWidget() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState<any>(null);
  const [monthlyPeriods, setMonthlyPeriods] = useState<any[]>([]);

  useEffect(() => {
    fetchCurrentPeriod();
  }, []);

  async function fetchCurrentPeriod() {
    try {
      setLoading(true);
      
      // 1. Obtener la fecha actual del sistema
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1; // 1-12
      
      // 2. Buscar el período que corresponde al mes y año actual
      const { data: periodForCurrentMonth, error: currentMonthError } = await supabase
        .from('monthly_accounting_periods')
        .select(`
          *,
          fiscal_year:fiscal_year_id (name, is_closed, is_active)
        `)
        .eq('is_closed', false)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .maybeSingle();
      
      if (currentMonthError) throw currentMonthError;
      
      // 3. Si existe un período para el mes actual
      if (periodForCurrentMonth) {
        // Verificar si está activo, si no, activarlo
        if (!periodForCurrentMonth.is_active) {
          const { error: updateError } = await supabase
            .from('monthly_accounting_periods')
            .update({ is_active: true })
            .eq('id', periodForCurrentMonth.id);
          
          if (updateError) throw updateError;
          periodForCurrentMonth.is_active = true;
        }
        
        setCurrentPeriod(periodForCurrentMonth);
      } else {
        // 4. Si no existe un período para el mes actual, buscar el más reciente activo
        const { data: activePeriods, error: activeError } = await supabase
          .from('monthly_accounting_periods')
          .select(`
            *,
            fiscal_year:fiscal_year_id (name, is_closed, is_active)
          `)
          .eq('is_closed', false)
          .eq('is_active', true)
          .order('end_date', { ascending: false })
          .limit(1);
          
        if (activeError) throw activeError;
        
        if (activePeriods && activePeriods.length > 0) {
          setCurrentPeriod(activePeriods[0]);
        }
      }
      
      // 5. Obtener otros períodos abiertos y activos (que no sean el actual)
      const { data: periodsData, error: periodsError } = await supabase
        .from('monthly_accounting_periods')
        .select(`
          *,
          fiscal_year:fiscal_year_id (name, is_active)
        `)
        .eq('is_closed', false)
        .eq('is_active', true)
        .not('id', 'eq', currentPeriod?.id) // No incluir el período actual
        .order('end_date', { ascending: false })
        .limit(5);
        
      if (periodsError) throw periodsError;
      setMonthlyPeriods(periodsData || []);
      
    } catch (error) {
      console.error('Error al obtener período contable:', error);
    } finally {
      setLoading(false);
    }
  }

  // Función para sincronizar los períodos con la fecha actual
  async function syncPeriodsWithCurrentDate() {
    try {
      setSyncing(true);
      
      // Obtener la fecha actual
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1; // 1-12
      
      // 1. Desactivar todos los períodos activos
      const { error: deactivateError } = await supabase
        .from('monthly_accounting_periods')
        .update({ is_active: false })
        .eq('is_active', true);
        
      if (deactivateError) throw deactivateError;
      
      // 2. Buscar el período correspondiente al mes actual
      const { data: currentMonthPeriod, error: findError } = await supabase
        .from('monthly_accounting_periods')
        .select('*')
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .eq('is_closed', false)
        .maybeSingle();
        
      if (findError) throw findError;
      
      if (currentMonthPeriod) {
        // 3. Activar el período del mes actual
        const { error: activateError } = await supabase
          .from('monthly_accounting_periods')
          .update({ is_active: true })
          .eq('id', currentMonthPeriod.id);
          
        if (activateError) throw activateError;
        
        toast.success('Períodos sincronizados correctamente');
      } else {
        toast.warning('No se encontró un período para el mes actual');
      }
      
      // 4. Recargar los datos
      await fetchCurrentPeriod();
      
    } catch (error) {
      console.error('Error al sincronizar períodos:', error);
      toast.error('Error al sincronizar períodos');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white shadow-sm rounded-lg p-6 h-full animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
      </div>
    );
  }

  if (!currentPeriod) {
    return (
      <div className="bg-white shadow-sm rounded-lg p-6 h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Períodos Contables</h3>
          <Calendar className="h-6 w-6 text-blue-500" />
        </div>
        
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                No hay períodos mensuales activos. Inicialice los períodos mensuales en la sección de configuración.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-4">
          <Link 
            to="/settings?tab=fiscal-years"
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Ir a configuración de períodos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Período Contable Actual</h3>
        <div className="flex items-center space-x-2">
          <button 
            onClick={syncPeriodsWithCurrentDate} 
            disabled={syncing}
            className="text-blue-500 hover:text-blue-700 disabled:opacity-50"
            title="Sincronizar períodos con la fecha actual"
          >
            <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <Calendar className="h-6 w-6 text-blue-500" />
        </div>
      </div>
      
      <div className="mb-4">
        <h4 className="text-xl font-semibold text-gray-800">{currentPeriod.name}</h4>
        <p className="text-sm text-gray-500">
          {currentPeriod.fiscal_year?.name}
        </p>
        <div className="mt-2 flex items-center">
          <span className="text-sm text-gray-600">
            {new Date(currentPeriod.start_date).toLocaleDateString()} - {new Date(currentPeriod.end_date).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      {monthlyPeriods.length > 0 && (
        <>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Otros períodos abiertos:</h4>
          <ul className="space-y-2">
            {monthlyPeriods.map(period => (
              <li key={period.id} className="text-sm">
                <span className="font-medium">{period.name}</span>
                <span className="text-gray-500 ml-2">
                  {new Date(period.start_date).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit'})} - 
                  {new Date(period.end_date).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit'})}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      
      <div className="mt-4 pt-4 border-t border-gray-100">
        <Link 
          to="/settings?tab=fiscal-years"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center"
        >
          Administrar períodos
          <ChevronRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
    </div>
  );
} 