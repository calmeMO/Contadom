import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { Calendar, AlertCircle, ChevronRight } from 'lucide-react';

export function AccountingPeriodWidget() {
  const [loading, setLoading] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState<any>(null);
  const [monthlyPeriods, setMonthlyPeriods] = useState<any[]>([]);

  useEffect(() => {
    fetchCurrentPeriod();
  }, []);

  async function fetchCurrentPeriod() {
    try {
      setLoading(true);
      
      // Obtener período mensual actual (no cerrado, activo, fecha más reciente)
      const { data, error } = await supabase
        .from('monthly_accounting_periods')
        .select(`
          *,
          fiscal_year:fiscal_year_id (name, is_closed, is_active)
        `)
        .eq('is_closed', false)
        .eq('is_active', true)
        .order('end_date', { ascending: false })
        .limit(1);
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        setCurrentPeriod(data[0]);
        
        // Obtener otros períodos abiertos y activos
        const { data: periodsData, error: periodsError } = await supabase
          .from('monthly_accounting_periods')
          .select(`
            *,
            fiscal_year:fiscal_year_id (name, is_active)
          `)
          .eq('is_closed', false)
          .eq('is_active', true)
          .neq('id', data[0].id)
          .order('end_date', { ascending: false })
          .limit(5);
          
        if (periodsError) throw periodsError;
        setMonthlyPeriods(periodsData || []);
      }
      
    } catch (error) {
      console.error('Error al obtener período contable:', error);
    } finally {
      setLoading(false);
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
        <Calendar className="h-6 w-6 text-blue-500" />
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