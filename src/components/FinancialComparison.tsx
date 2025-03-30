import React, { useState, useEffect } from 'react';
import { compareFinancialPeriods } from '../services/financialAnalysisService';
import { 
  ArrowRightLeft, 
  Loader, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ArrowUp,
  ArrowDown,
  Filter
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface FinancialComparisonProps {
  availablePeriods: Array<{ id: string; name: string }>;
}

export function FinancialComparison({ availablePeriods }: FinancialComparisonProps) {
  const [loading, setLoading] = useState(false);
  const [sourcePeriodId, setSourcePeriodId] = useState<string>('');
  const [targetPeriodId, setTargetPeriodId] = useState<string>('');
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'improved' | 'worsened' | 'stable'>('all');
  
  useEffect(() => {
    // Seleccionar los dos últimos períodos por defecto
    if (availablePeriods.length >= 2) {
      setSourcePeriodId(availablePeriods[1].id); // Penúltimo
      setTargetPeriodId(availablePeriods[0].id); // Último
    }
  }, [availablePeriods]);
  
  useEffect(() => {
    if (sourcePeriodId && targetPeriodId && sourcePeriodId !== targetPeriodId) {
      loadComparisonData();
    }
  }, [sourcePeriodId, targetPeriodId]);
  
  async function loadComparisonData() {
    try {
      setLoading(true);
      const data = await compareFinancialPeriods(sourcePeriodId, targetPeriodId);
      setComparisonData(data);
    } catch (error) {
      console.error('Error al cargar comparación:', error);
    } finally {
      setLoading(false);
    }
  }
  
  function handleSwapPeriods() {
    const temp = sourcePeriodId;
    setSourcePeriodId(targetPeriodId);
    setTargetPeriodId(temp);
  }
  
  function getTrendIcon(trend: string) {
    switch (trend) {
      case 'up':
        return <ArrowUp className="h-5 w-5 text-green-500" />;
      case 'down':
        return <ArrowDown className="h-5 w-5 text-red-500" />;
      case 'stable':
        return <Minus className="h-5 w-5 text-gray-500" />;
      default:
        return <Minus className="h-5 w-5 text-gray-400" />;
    }
  }
  
  function formatChangeValue(value: number, percentChange: number, isPercent: boolean = false) {
    const prefix = value > 0 ? '+' : '';
    const formattedValue = isPercent ? `${prefix}${value.toFixed(2)}%` : `${prefix}${value.toFixed(2)}`;
    const formattedPercent = `(${prefix}${percentChange.toFixed(2)}%)`;
    
    return (
      <span className={value > 0 ? 'text-green-600' : (value < 0 ? 'text-red-600' : 'text-gray-500')}>
        {formattedValue} <span className="text-gray-400 text-xs">{formattedPercent}</span>
      </span>
    );
  }
  
  // Filtrar comparaciones según el filtro activo
  const filteredComparisons = comparisonData?.comparisons.filter((comparison: any) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'improved') return comparison.trend === 'up';
    if (activeFilter === 'worsened') return comparison.trend === 'down';
    if (activeFilter === 'stable') return comparison.trend === 'stable';
    return true;
  }) || [];
  
  return (
    <div className="bg-white shadow-sm rounded-lg p-4 border border-gray-200 mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 flex items-center">
          <ArrowRightLeft className="h-5 w-5 text-blue-500 mr-2" />
          Comparación de Períodos
        </h2>
      </div>
      
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
        {/* Selector de Período Fuente */}
        <div className="sm:w-2/5">
          <label htmlFor="source-period" className="block text-sm font-medium text-gray-700 mb-1">
            Período Base
          </label>
          <select
            id="source-period"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={sourcePeriodId}
            onChange={(e) => setSourcePeriodId(e.target.value)}
            disabled={loading}
          >
            <option value="">Seleccionar período</option>
            {availablePeriods.map(period => (
              <option key={period.id} value={period.id} disabled={period.id === targetPeriodId}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        
        {/* Botón de intercambio */}
        <div className="flex justify-center sm:w-1/5">
          <button
            type="button"
            onClick={handleSwapPeriods}
            disabled={loading || !sourcePeriodId || !targetPeriodId}
            className="inline-flex items-center p-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <ArrowRightLeft className="h-5 w-5" />
          </button>
        </div>
        
        {/* Selector de Período Objetivo */}
        <div className="sm:w-2/5">
          <label htmlFor="target-period" className="block text-sm font-medium text-gray-700 mb-1">
            Período Comparado
          </label>
          <select
            id="target-period"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={targetPeriodId}
            onChange={(e) => setTargetPeriodId(e.target.value)}
            disabled={loading}
          >
            <option value="">Seleccionar período</option>
            {availablePeriods.map(period => (
              <option key={period.id} value={period.id} disabled={period.id === sourcePeriodId}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Filtros de comparación */}
      {comparisonData && (
        <div className="mt-6 flex items-center space-x-1 border-b border-gray-200 pb-1">
          <Filter className="h-4 w-4 text-gray-400 mr-1" />
          <button
            className={`px-3 py-1 text-sm rounded-md ${activeFilter === 'all' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveFilter('all')}
          >
            Todos
          </button>
          <button
            className={`px-3 py-1 text-sm rounded-md ${activeFilter === 'improved' ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveFilter('improved')}
          >
            Mejoras
          </button>
          <button
            className={`px-3 py-1 text-sm rounded-md ${activeFilter === 'worsened' ? 'bg-red-100 text-red-800' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveFilter('worsened')}
          >
            Deterioros
          </button>
          <button
            className={`px-3 py-1 text-sm rounded-md ${activeFilter === 'stable' ? 'bg-gray-100 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setActiveFilter('stable')}
          >
            Estables
          </button>
        </div>
      )}
      
      {/* Tabla de comparación */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">Cargando comparación...</span>
        </div>
      ) : !comparisonData ? (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay datos para comparar</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Selecciona dos períodos diferentes para visualizar la comparación de ratios financieros.
          </p>
        </div>
      ) : filteredComparisons.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No hay ratios que cumplan con el filtro seleccionado</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ratio
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {comparisonData.period1?.periodName || 'Período Base'}
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {comparisonData.period2?.periodName || 'Período Comparado'}
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cambio
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tendencia
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredComparisons.map((comparison: any) => {
                const isPercentageRatio = comparison.id.includes('margin') || comparison.id === 'roa' || comparison.id === 'roe';
                
                return (
                  <tr key={comparison.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {comparison.name}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                      {isPercentageRatio ? `${comparison.value1}%` : comparison.value1.toFixed(2)}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-center text-gray-900 font-medium">
                      {isPercentageRatio ? `${comparison.value2}%` : comparison.value2.toFixed(2)}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-center">
                      {formatChangeValue(comparison.difference, comparison.percentChange, isPercentageRatio)}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-center">
                      {getTrendIcon(comparison.trend)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 