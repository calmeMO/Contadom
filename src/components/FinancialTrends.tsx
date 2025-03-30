import React, { useState, useEffect } from 'react';
import { TrendData, getFinancialTrends } from '../services/financialAnalysisService';
import { BarChart2, Loader, AlertCircle, Info, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface FinancialTrendsProps {
  availablePeriods: Array<{ id: string; name: string }>;
}

const DEFAULT_METRICS = ['current_ratio', 'debt_ratio', 'net_profit_margin', 'roe'];

export function FinancialTrends({ availablePeriods }: FinancialTrendsProps) {
  const [loading, setLoading] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(DEFAULT_METRICS);
  const [showPeriodsDropdown, setShowPeriodsDropdown] = useState(false);
  const [showMetricsDropdown, setShowMetricsDropdown] = useState(false);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  
  const metricOptions = [
    { id: 'current_ratio', name: 'Ratio de Liquidez Corriente', category: 'Liquidez' },
    { id: 'quick_ratio', name: 'Prueba Ácida', category: 'Liquidez' },
    { id: 'cash_ratio', name: 'Ratio de Efectivo', category: 'Liquidez' },
    { id: 'debt_ratio', name: 'Ratio de Endeudamiento', category: 'Solvencia' },
    { id: 'debt_to_equity', name: 'Ratio Deuda/Patrimonio', category: 'Solvencia' },
    { id: 'net_profit_margin', name: 'Margen de Beneficio Neto', category: 'Rentabilidad' },
    { id: 'roa', name: 'Retorno sobre Activos (ROA)', category: 'Rentabilidad' },
    { id: 'roe', name: 'Retorno sobre Patrimonio (ROE)', category: 'Rentabilidad' }
  ];
  
  // Al iniciar, seleccionar los últimos 4 períodos por defecto
  useEffect(() => {
    if (availablePeriods.length > 0) {
      const defaultPeriods = availablePeriods.slice(0, Math.min(4, availablePeriods.length)).map(p => p.id);
      setSelectedPeriods(defaultPeriods);
    }
  }, [availablePeriods]);
  
  // Cargar datos cuando cambian las selecciones
  useEffect(() => {
    if (selectedPeriods.length > 0 && selectedMetrics.length > 0) {
      loadTrendData();
    }
  }, [selectedPeriods, selectedMetrics]);
  
  async function loadTrendData() {
    try {
      setLoading(true);
      const data = await getFinancialTrends(selectedPeriods, selectedMetrics);
      setTrendData(data);
    } catch (error) {
      console.error('Error al cargar tendencias:', error);
    } finally {
      setLoading(false);
    }
  }
  
  function togglePeriodSelection(periodId: string) {
    setSelectedPeriods(prev => 
      prev.includes(periodId)
        ? prev.filter(id => id !== periodId)
        : [...prev, periodId]
    );
  }
  
  function toggleMetricSelection(metricId: string) {
    setSelectedMetrics(prev => 
      prev.includes(metricId)
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    );
  }
  
  // Renderizar la visualización de tendencias
  function renderTrendChart() {
    if (!trendData || !trendData.periods.length || !trendData.datasets.length) return null;
    
    const maxValue = Math.max(...trendData.datasets.flatMap(d => d.data)) * 1.1;
    
    return (
      <div className="mt-6 bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-medium text-gray-900">Tendencia de Ratios Financieros</h3>
          <div className="text-xs text-gray-500">
            <Info className="h-4 w-4 inline mr-1" />
            Mostrando {trendData.datasets.length} métricas en {trendData.periods.length} períodos
          </div>
        </div>
        
        <div className="relative h-80">
          {/* Eje Y */}
          <div className="absolute left-12 top-0 bottom-0 border-r border-gray-200 flex flex-col justify-between">
            <div className="text-xs text-gray-500 transform -translate-y-2 -translate-x-1">{maxValue.toFixed(1)}</div>
            <div className="text-xs text-gray-500 transform translate-y-2 -translate-x-1">0</div>
          </div>
          
          {/* Área del gráfico */}
          <div className="absolute left-14 right-0 top-0 bottom-8 flex items-end">
            {trendData.periods.map((period, periodIndex) => (
              <div 
                key={period} 
                className="flex-1 flex flex-col justify-end items-center relative h-full"
              >
                {/* Línea vertical punteada */}
                <div className="absolute top-0 bottom-0 border-l border-gray-100 w-0"></div>
                
                {/* Barras de datos */}
                <div className="relative w-full flex justify-center">
                  {trendData.datasets.map((dataset, datasetIndex) => {
                    const value = dataset.data[periodIndex] || 0;
                    const height = (value / maxValue) * 100;
                    const leftOffset = (datasetIndex - (trendData.datasets.length - 1) / 2) * 10;
                    
                    return (
                      <div 
                        key={dataset.label}
                        className="absolute bottom-0 w-6 mx-1 rounded-t"
                        style={{ 
                          height: `${height}%`, 
                          backgroundColor: dataset.color,
                          left: `calc(50% + ${leftOffset}px - 12px)`,
                          transition: 'height 0.5s ease'
                        }}
                        title={`${dataset.label}: ${value}`}
                      ></div>
                    );
                  })}
                </div>
                
                {/* Etiquetas del eje X */}
                <div className="text-xs text-gray-500 mt-2 whitespace-nowrap overflow-hidden text-ellipsis" style={{maxWidth: '70px'}}>
                  {period}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Leyenda */}
        <div className="mt-6 flex flex-wrap gap-4">
          {trendData.datasets.map(dataset => (
            <div key={dataset.label} className="flex items-center">
              <div className="h-3 w-3 mr-1" style={{ backgroundColor: dataset.color }}></div>
              <span className="text-xs text-gray-700">{dataset.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white shadow-sm rounded-lg p-4 border border-gray-200 mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 flex items-center">
          <BarChart2 className="h-5 w-5 text-blue-500 mr-2" />
          Tendencias Financieras
        </h2>
      </div>
      
      <div className="mt-4 flex flex-col sm:flex-row sm:items-start space-y-4 sm:space-y-0 sm:space-x-4">
        {/* Selector de Períodos */}
        <div className="sm:w-1/2 relative">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={() => setShowPeriodsDropdown(!showPeriodsDropdown)}
          >
            <span>{selectedPeriods.length} períodos seleccionados</span>
            {showPeriodsDropdown ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>
          
          {showPeriodsDropdown && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm">
              {availablePeriods.map(period => (
                <div
                  key={period.id}
                  className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => togglePeriodSelection(period.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedPeriods.includes(period.id)}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="ml-3 block truncate">{period.name}</span>
                  {selectedPeriods.includes(period.id) && (
                    <Check className="h-4 w-4 text-blue-500 ml-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Selector de Métricas */}
        <div className="sm:w-1/2 relative">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={() => setShowMetricsDropdown(!showMetricsDropdown)}
          >
            <span>{selectedMetrics.length} métricas seleccionadas</span>
            {showMetricsDropdown ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>
          
          {showMetricsDropdown && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm">
              {metricOptions.map(metric => (
                <div
                  key={metric.id}
                  className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => toggleMetricSelection(metric.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric.id)}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <div className="ml-3">
                    <span className="block text-sm">{metric.name}</span>
                    <span className="block text-xs text-gray-500">{metric.category}</span>
                  </div>
                  {selectedMetrics.includes(metric.id) && (
                    <Check className="h-4 w-4 text-blue-500 ml-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Visualización de tendencias */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">Cargando tendencias...</span>
        </div>
      ) : !trendData ? (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay datos disponibles</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Selecciona al menos un período y una métrica para visualizar tendencias.
          </p>
        </div>
      ) : (
        renderTrendChart()
      )}
    </div>
  );
} 