import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Loader,
  BarChart3,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  ArrowRightLeft,
  LineChart
} from 'lucide-react';
import { fetchAccountingPeriods } from '../services/accountingPeriodService';
import { 
  getFinancialAnalysis, 
  calculateFinancialRatios,
  FinancialRatio,
  RatioCategory,
  FinancialAnalysisResult
} from '../services/financialAnalysisService';
import { FinancialTrends } from '../components/FinancialTrends';
import { FinancialComparison } from '../components/FinancialComparison';

// Mapeamos las categorías de inglés a español para mostrar en la UI
const RATIO_CATEGORIES: Record<string, string> = {
  'liquidity': 'Liquidez',
  'solvency': 'Solvencia',
  'profitability': 'Rentabilidad',
  'activity': 'Eficiencia y Actividad'
};

export function FinancialAnalysis() {
  const [loading, setLoading] = useState<boolean>(true);
  const [periods, setPeriods] = useState<Array<{id: string, name: string}>>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<FinancialAnalysisResult | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('liquidity');
  const [detailsMap, setDetailsMap] = useState<{[key: string]: boolean}>({});
  const [showTrends, setShowTrends] = useState<boolean>(false);
  const [showComparison, setShowComparison] = useState<boolean>(false);
  
  // Inicializar datos
  useEffect(() => {
    initializeData();
  }, []);
  
  // Cargar análisis cuando cambia el período
  useEffect(() => {
    if (selectedPeriodId) {
      loadAnalysis();
    }
  }, [selectedPeriodId]);
  
  async function initializeData() {
    try {
      setLoading(true);
      // Obtener períodos contables
      const periodsData = await fetchAccountingPeriods();
      setPeriods(periodsData.map((period: any) => ({
        id: period.id,
        name: period.name || `${period.year} - ${period.period_number}`
      })));
      
      // Seleccionar el último período por defecto
      if (periodsData.length > 0) {
        setSelectedPeriodId(periodsData[0].id);
      }
    } catch (error) {
      console.error('Error al cargar los períodos contables', error);
      toast.error('Error al cargar los períodos contables');
    } finally {
      setLoading(false);
    }
  }
  
  async function loadAnalysis() {
    try {
      setLoading(true);
      
      // Intentar obtener análisis existente
      let analysis = await getFinancialAnalysis(selectedPeriodId);
      
      // Si no existe, calcularlo
      if (!analysis) {
        analysis = await calculateFinancialRatios(selectedPeriodId);
      }
      
      setAnalysisResults(analysis);
    } catch (error) {
      console.error('Error al cargar el análisis financiero', error);
      toast.error('Error al cargar el análisis financiero');
      setAnalysisResults(null);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleRefreshAnalysis() {
    try {
      setLoading(true);
      // Recalcular ratios, ignorando cualquier análisis existente
      const analysis = await calculateFinancialRatios(selectedPeriodId);
      setAnalysisResults(analysis);
      toast.success('Análisis financiero actualizado');
    } catch (error) {
      console.error('Error al actualizar el análisis', error);
      toast.error('Error al actualizar el análisis');
    } finally {
      setLoading(false);
    }
  }
  
  function toggleDetails(ratioId: string) {
    setDetailsMap(prev => ({
      ...prev,
      [ratioId]: !prev[ratioId]
    }));
  }
  
  function getRatioStatusIcon(ratio: FinancialRatio) {
    if (!ratio.status || ratio.status === 'neutral') {
      return <Minus className="h-5 w-5 text-gray-400" />;
    } else if (ratio.status === 'good') {
      return <TrendingUp className="h-5 w-5 text-green-500" />;
    } else {
      return <TrendingDown className="h-5 w-5 text-red-500" />;
    }
  }
  
  function getRatioValueClass(ratio: FinancialRatio) {
    if (!ratio.status || ratio.status === 'neutral') {
      return 'text-gray-700';
    } else if (ratio.status === 'good') {
      return 'text-green-600 font-medium';
    } else {
      return 'text-red-600 font-medium';
    }
  }
  
  // Renderizar ratios por categoría
  function renderRatiosByCategory(categoryKey: string) {
    if (!analysisResults || !analysisResults.ratios) return null;
    
    const categoryRatios = analysisResults.ratios.filter(
      ratio => ratio.category.toLowerCase() === categoryKey
    );
    
    return (
      <div key={categoryKey} className="mb-8">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          {RATIO_CATEGORIES[categoryKey] || categoryKey}
        </h3>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100">
          {categoryRatios.map((ratio) => (
            <div key={ratio.id} className="p-4">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleDetails(ratio.id)}
              >
                <div className="flex items-center space-x-3">
                  {getRatioStatusIcon(ratio)}
                  <span className="font-medium text-gray-900">{ratio.name}</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <span className={`text-lg ${getRatioValueClass(ratio)}`}>
                    {ratio.value.toFixed(2)}
                  </span>
                  {ratio.description && (
                    detailsMap[ratio.id] ? 
                      <ChevronUp className="h-5 w-5 text-gray-400" /> : 
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
              
              {detailsMap[ratio.id] && ratio.description && (
                <div className="mt-3 text-sm text-gray-500 border-t border-gray-100 pt-3">
                  <p>{ratio.description}</p>
                  {ratio.optimal_range && (
                    <p className="mt-2">
                      <strong>Referencia:</strong> {ratio.optimal_range}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Calculator className="h-6 w-6 mr-2 text-blue-500" />
          Análisis Financiero
        </h1>
        
        {/* Controles */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 mt-4 md:mt-0">
          <select
            className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            disabled={loading}
          >
            <option value="">Seleccionar período</option>
            {periods.map(period => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
          
          <button
            type="button"
            onClick={handleRefreshAnalysis}
            disabled={loading || !selectedPeriodId}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </button>
        </div>
      </div>
      
      {/* Opciones de visualización */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            activeCategory === 'liquidity' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveCategory('liquidity')}
        >
          Liquidez
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            activeCategory === 'solvency' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveCategory('solvency')}
        >
          Solvencia
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            activeCategory === 'profitability' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveCategory('profitability')}
        >
          Rentabilidad
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            activeCategory === 'activity' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveCategory('activity')}
        >
          Eficiencia
        </button>
      </div>
      
      {/* Contenido principal */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="ml-2 text-gray-600">Cargando análisis financiero...</span>
          </div>
        ) : !analysisResults ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center text-yellow-800">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p>No hay datos de análisis financiero disponibles para el período seleccionado.</p>
          </div>
        ) : (
          <>
            <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Ratios Financieros</h2>
              {renderRatiosByCategory(activeCategory)}
            </div>
            
            <div className="flex flex-col md:flex-row gap-4">
              <button
                className={`flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium ${
                  showTrends ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setShowTrends(!showTrends)}
              >
                <LineChart className="h-4 w-4 mr-2" />
                {showTrends ? 'Ocultar Tendencias' : 'Mostrar Tendencias'}
              </button>
              
              <button
                className={`flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium ${
                  showComparison ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setShowComparison(!showComparison)}
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                {showComparison ? 'Ocultar Comparación' : 'Comparar Períodos'}
              </button>
            </div>
            
            {showTrends && (
              <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Tendencias Financieras</h2>
                <FinancialTrends availablePeriods={periods} />
              </div>
            )}
            
            {showComparison && (
              <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Comparación de Períodos</h2>
                <FinancialComparison availablePeriods={periods} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
} 