import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';

// Interfaces para análisis financiero
export interface FinancialRatio {
  id: string;
  name: string;
  category: RatioCategory;
  formula: string;
  description: string;
  interpretation: string;
  optimal_range?: string;
  value: number;
  status: 'good' | 'warning' | 'bad' | 'neutral';
  higherIsBetter?: boolean;
}

export enum RatioCategory {
  LIQUIDITY = 'liquidity',
  SOLVENCY = 'solvency',
  PROFITABILITY = 'profitability',
  ACTIVITY = 'activity',
  COVERAGE = 'coverage'
}

export type RatioCategoryMap = {
  [key in RatioCategory]: {
    [key: string]: FinancialRatio;
  };
};

export interface FinancialAnalysisResult {
  ratios: FinancialRatio[];
  ratiosByCategory: RatioCategoryMap;
  periodId: string;
  periodName: string;
  createdAt: string;
}

export interface TrendData {
  labels: string[];
  periods: string[];
  datasets: {
    label: string;
    data: number[];
    color: string;
  }[];
}

// Interfaz para comparación de períodos
export interface ComparisonResult {
  period1: {
    id: string;
    periodName: string;
  };
  period2: {
    id: string;
    periodName: string;
  };
  comparisons: Array<{
    id: string;
    name: string;
    value1: number;
    value2: number;
    difference: number;
    percentChange: number;
    trend: 'up' | 'down' | 'stable';
    isPositive: boolean;
  }>;
}

// Interfaces para datos de la base de datos
interface SavedAnalysis {
  id: string;
  ratios: FinancialRatio[];
  created_at: string;
  accounting_period: {
    id: string;
    name: string;
  };
}

/**
 * Calcula los ratios financieros para un período específico
 * @param periodId ID del período contable
 * @returns Resultado del análisis financiero
 */
export async function calculateFinancialRatios(periodId: string): Promise<FinancialAnalysisResult | null> {
  try {
    // 1. Obtener información del período
    const { data: period, error: periodError } = await supabase
      .from('accounting_periods')
      .select('id, name')
      .eq('id', periodId)
      .single();
    
    if (periodError) throw periodError;
    
    // 2. Obtener estados financieros del período
    const { data: financialStatements, error: fsError } = await supabase
      .from('financial_statements')
      .select('type, data')
      .eq('accounting_period_id', periodId);
    
    if (fsError) throw fsError;
    
    if (!financialStatements || financialStatements.length === 0) {
      toast.warning('No hay estados financieros disponibles para este período');
      return null;
    }
    
    // Organizar datos de estados financieros
    const financialData: Record<string, any> = {};
    financialStatements.forEach(fs => {
      financialData[fs.type] = fs.data;
    });
    
    // 3. Extraer datos del balance y estado de resultados
    const balanceSheet = financialData.balance_sheet || {};
    const incomeStatement = financialData.income_statement || {};
    
    // 4. Calcular ratios
    const ratios: FinancialRatio[] = [];
    
    // ---- RATIOS DE LIQUIDEZ ----
    
    // Ratio corriente (Activo Corriente / Pasivo Corriente)
    const currentAssets = balanceSheet.currentAssets || 0;
    const currentLiabilities = balanceSheet.currentLiabilities || 0;
    
    const currentRatio = currentLiabilities > 0 
      ? parseFloat((currentAssets / currentLiabilities).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'current_ratio',
      name: 'Ratio de Liquidez Corriente',
      category: RatioCategory.LIQUIDITY,
      formula: 'Activo Corriente / Pasivo Corriente',
      description: 'Mide la capacidad de la empresa para pagar sus obligaciones a corto plazo.',
      interpretation: 'Un ratio mayor a 1 indica que la empresa puede cubrir sus deudas a corto plazo.',
      optimal_range: '1.5 - 2.0',
      value: currentRatio,
      status: currentRatio >= 1.5 ? 'good' : (currentRatio >= 1 ? 'warning' : 'bad')
    });
    
    // Prueba ácida ((Activo Corriente - Inventarios) / Pasivo Corriente)
    const inventory = balanceSheet.inventory || 0;
    const quickRatio = currentLiabilities > 0
      ? parseFloat(((currentAssets - inventory) / currentLiabilities).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'quick_ratio',
      name: 'Prueba Ácida',
      category: RatioCategory.LIQUIDITY,
      formula: '(Activo Corriente - Inventarios) / Pasivo Corriente',
      description: 'Mide la capacidad de la empresa para pagar sus obligaciones a corto plazo sin depender de la venta de inventarios.',
      interpretation: 'Un ratio mayor a 1 indica buena liquidez sin depender de los inventarios.',
      optimal_range: '1.0 - 1.5',
      value: quickRatio,
      status: quickRatio >= 1 ? 'good' : (quickRatio >= 0.8 ? 'warning' : 'bad')
    });
    
    // Ratio de efectivo (Efectivo / Pasivo Corriente)
    const cash = balanceSheet.cash || 0;
    const cashRatio = currentLiabilities > 0
      ? parseFloat((cash / currentLiabilities).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'cash_ratio',
      name: 'Ratio de Efectivo',
      category: RatioCategory.LIQUIDITY,
      formula: 'Efectivo / Pasivo Corriente',
      description: 'Mide la capacidad de la empresa para cubrir sus pasivos a corto plazo solo con efectivo.',
      interpretation: 'Indica la capacidad inmediata para pagar deudas sin esperar cobros ni ventas.',
      optimal_range: '0.2 - 0.5',
      value: cashRatio,
      status: cashRatio >= 0.2 ? 'good' : (cashRatio >= 0.1 ? 'warning' : 'bad')
    });
    
    // ---- RATIOS DE SOLVENCIA ----
    
    // Ratio de endeudamiento (Pasivo Total / Activo Total)
    const totalAssets = balanceSheet.totalAssets || 0;
    const totalLiabilities = balanceSheet.totalLiabilities || 0;
    
    const debtRatio = totalAssets > 0
      ? parseFloat((totalLiabilities / totalAssets).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'debt_ratio',
      name: 'Ratio de Endeudamiento',
      category: RatioCategory.SOLVENCY,
      formula: 'Pasivo Total / Activo Total',
      description: 'Mide la proporción de activos que están financiados por deuda.',
      interpretation: 'Un ratio menor indica menor dependencia de financiamiento externo.',
      optimal_range: '0.4 - 0.6',
      value: debtRatio,
      status: debtRatio <= 0.6 ? 'good' : (debtRatio <= 0.8 ? 'warning' : 'bad')
    });
    
    // Ratio deuda/patrimonio (Pasivo Total / Patrimonio)
    const totalEquity = balanceSheet.totalEquity || 0;
    
    const debtToEquityRatio = totalEquity > 0
      ? parseFloat((totalLiabilities / totalEquity).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'debt_to_equity',
      name: 'Ratio Deuda/Patrimonio',
      category: RatioCategory.SOLVENCY,
      formula: 'Pasivo Total / Patrimonio',
      description: 'Compara la financiación proporcionada por los acreedores con la proporcionada por los accionistas.',
      interpretation: 'Un ratio menor indica menor riesgo financiero.',
      optimal_range: '0.5 - 1.5',
      value: debtToEquityRatio,
      status: debtToEquityRatio <= 1.5 ? 'good' : (debtToEquityRatio <= 2 ? 'warning' : 'bad')
    });
    
    // ---- RATIOS DE RENTABILIDAD ----
    
    // Margen de beneficio neto (Beneficio Neto / Ingresos)
    const netIncome = incomeStatement.netIncome || 0;
    const totalRevenue = incomeStatement.totalIncome || 0;
    
    const netProfitMargin = totalRevenue > 0
      ? parseFloat(((netIncome / totalRevenue) * 100).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'net_profit_margin',
      name: 'Margen de Beneficio Neto',
      category: RatioCategory.PROFITABILITY,
      formula: '(Beneficio Neto / Ingresos) * 100',
      description: 'Mide el porcentaje de cada unidad monetaria de ingresos que queda después de todos los gastos.',
      interpretation: 'Un margen mayor indica mayor rentabilidad por ventas.',
      optimal_range: 'Depende del sector',
      value: netProfitMargin,
      status: netProfitMargin >= 10 ? 'good' : (netProfitMargin >= 5 ? 'warning' : (netProfitMargin >= 0 ? 'neutral' : 'bad'))
    });
    
    // ROA - Retorno sobre activos (Beneficio Neto / Activo Total)
    const roa = totalAssets > 0
      ? parseFloat(((netIncome / totalAssets) * 100).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'roa',
      name: 'Retorno sobre Activos (ROA)',
      category: RatioCategory.PROFITABILITY,
      formula: '(Beneficio Neto / Activo Total) * 100',
      description: 'Mide la eficiencia con la que una empresa utiliza sus activos para generar beneficios.',
      interpretation: 'Un ROA mayor indica mejor uso de los activos.',
      optimal_range: 'Depende del sector',
      value: roa,
      status: roa >= 5 ? 'good' : (roa >= 2 ? 'warning' : (roa >= 0 ? 'neutral' : 'bad'))
    });
    
    // ROE - Retorno sobre patrimonio (Beneficio Neto / Patrimonio)
    const roe = totalEquity > 0
      ? parseFloat(((netIncome / totalEquity) * 100).toFixed(2))
      : 0;
    
    ratios.push({
      id: 'roe',
      name: 'Retorno sobre Patrimonio (ROE)',
      category: RatioCategory.PROFITABILITY,
      formula: '(Beneficio Neto / Patrimonio) * 100',
      description: 'Mide la rentabilidad obtenida por la inversión de los accionistas.',
      interpretation: 'Un ROE mayor indica mejor rendimiento para los inversores.',
      optimal_range: '15% - 20%',
      value: roe,
      status: roe >= 15 ? 'good' : (roe >= 10 ? 'warning' : (roe >= 0 ? 'neutral' : 'bad'))
    });
    
    // Organizar ratios por categoría
    const ratiosByCategory = ratios.reduce((acc, ratio) => {
      if (!acc[ratio.category]) {
        acc[ratio.category] = {};
      }
      acc[ratio.category][ratio.id] = ratio;
      return acc;
    }, {} as RatioCategoryMap);

    return {
      ratios,
      ratiosByCategory,
      periodId: period.id,
      periodName: period.name,
      createdAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error al calcular ratios financieros:', error);
    toast.error('Error al calcular ratios financieros');
    return null;
  }
}

/**
 * Guarda el resultado del análisis financiero en la base de datos
 * @param analysisResult Resultado del análisis financiero
 * @returns ID del análisis guardado
 */
export async function saveFinancialAnalysis(
  analysisResult: FinancialAnalysisResult, 
  userId: string
): Promise<string | null> {
  try {
    // Verificar si ya existe un análisis para este período
    const { data: existingAnalysis, error: checkError } = await supabase
      .from('financial_analysis')
      .select('id')
      .eq('accounting_period_id', analysisResult.periodId)
      .limit(1);
    
    if (checkError) throw checkError;
    
    let analysisId: string;
    
    if (existingAnalysis && existingAnalysis.length > 0) {
      // Actualizar análisis existente
      const { data: updated, error: updateError } = await supabase
        .from('financial_analysis')
        .update({
          ratios: analysisResult.ratios,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingAnalysis[0].id)
        .select('id')
        .single();
      
      if (updateError) throw updateError;
      analysisId = updated.id;
      
      toast.success('Análisis financiero actualizado correctamente');
    } else {
      // Crear nuevo análisis
      const { data: inserted, error: insertError } = await supabase
        .from('financial_analysis')
        .insert({
          accounting_period_id: analysisResult.periodId,
          ratios: analysisResult.ratios,
          created_by: userId,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();
      
      if (insertError) throw insertError;
      analysisId = inserted.id;
      
      toast.success('Análisis financiero guardado correctamente');
    }
    
    return analysisId;
  } catch (error) {
    console.error('Error al guardar análisis financiero:', error);
    toast.error('Error al guardar el análisis financiero');
    return null;
  }
}

/**
 * Obtiene el análisis financiero de un período específico
 * @param periodId ID del período contable
 * @returns Análisis financiero
 */
export async function getFinancialAnalysis(periodId: string): Promise<FinancialAnalysisResult | null> {
  try {
    // Verificar si existe un análisis guardado
    const { data: savedAnalysis, error: savedError } = await supabase
      .from('financial_analysis')
      .select(`
        id,
        ratios,
        created_at,
        accounting_period:accounting_period_id(id, name)
      `)
      .eq('accounting_period_id', periodId)
      .limit(1)
      .single() as { data: SavedAnalysis | null; error: any };
    
    if (savedError) {
      // Si no hay resultados, calcular un nuevo análisis
      if (savedError.code === 'PGRST116') {
        return calculateFinancialRatios(periodId);
      }
      throw savedError;
    }
    
    if (!savedAnalysis) {
      return null;
    }
    
    // Organizar ratios por categoría
    const ratiosByCategory = savedAnalysis.ratios.reduce((acc: RatioCategoryMap, ratio: FinancialRatio) => {
      if (!acc[ratio.category]) {
        acc[ratio.category] = {};
      }
      acc[ratio.category][ratio.id] = ratio;
      return acc;
    }, {} as RatioCategoryMap);
    
    // Transformar datos al formato esperado
    return {
      ratios: savedAnalysis.ratios,
      ratiosByCategory,
      periodId: savedAnalysis.accounting_period.id,
      periodName: savedAnalysis.accounting_period.name,
      createdAt: savedAnalysis.created_at
    };
  } catch (error) {
    console.error('Error al obtener análisis financiero:', error);
    return null;
  }
}

/**
 * Obtiene datos de tendencia para un conjunto de períodos
 * @param periodIds IDs de los períodos a comparar
 * @param metricIds IDs de las métricas a incluir en la tendencia
 * @returns Datos de tendencia
 */
export async function getFinancialTrends(
  periodIds: string[],
  metricIds: string[]
): Promise<TrendData | null> {
  try {
    if (!periodIds.length) {
      toast.warning('Seleccione al menos un período para ver tendencias');
      return null;
    }
    
    // 1. Obtener períodos ordenados por fecha
    const { data: periods, error: periodsError } = await supabase
      .from('accounting_periods')
      .select('id, name, start_date, end_date')
      .in('id', periodIds)
      .order('start_date', { ascending: true });
    
    if (periodsError) throw periodsError;
    
    if (!periods || periods.length === 0) {
      toast.warning('No se encontraron los períodos seleccionados');
      return null;
    }
    
    // 2. Obtener análisis financiero para cada período
    const periodNames: string[] = [];
    const datasetsMap: Record<string, { label: string; data: number[]; color: string }> = {};
    
    // Colores para los diferentes tipos de métricas
    const colorMap: Record<string, string> = {
      current_ratio: '#3498db',
      quick_ratio: '#2980b9',
      cash_ratio: '#1abc9c',
      debt_ratio: '#e74c3c',
      debt_to_equity: '#c0392b',
      net_profit_margin: '#2ecc71',
      roa: '#27ae60',
      roe: '#f1c40f'
    };
    
    // Inicializar datasets vacíos para las métricas solicitadas
    for (const metricId of metricIds) {
      datasetsMap[metricId] = {
        label: metricId, // Se reemplazará con el nombre real
        data: [],
        color: colorMap[metricId] || '#7f8c8d' // Color por defecto si no está en el mapa
      };
    }
    
    // Obtener datos para cada período
    for (const period of periods) {
      const analysis = await getFinancialAnalysis(period.id);
      
      // Añadir nombre del período
      periodNames.push(period.name);
      
      if (analysis) {
        // Para cada métrica solicitada, buscar su valor y agregarlo al dataset
        for (const metricId of metricIds) {
          const ratio = analysis.ratios.find(r => r.id === metricId);
          
          if (ratio) {
            // Si es la primera vez que vemos esta métrica, actualizar su nombre
            if (datasetsMap[metricId].label === metricId) {
              datasetsMap[metricId].label = ratio.name;
            }
            
            // Añadir el valor al array de datos
            datasetsMap[metricId].data.push(ratio.value);
          } else {
            // Si no encontramos la métrica, usar null para mantener la alineación
            datasetsMap[metricId].data.push(0);
          }
        }
      } else {
        // Si no hay análisis para este período, añadir valores nulos para todas las métricas
        for (const metricId of metricIds) {
          datasetsMap[metricId].data.push(0);
        }
      }
    }
    
    // Convertir el mapa a un array para el resultado final
    const datasets = Object.values(datasetsMap);
    
    return {
      labels: periodNames,
      periods: periodNames,
      datasets
    };
    
  } catch (error) {
    console.error('Error al obtener tendencias financieras:', error);
    toast.error('Error al generar tendencias financieras');
    return null;
  }
}

/**
 * Compara los ratios financieros entre dos períodos contables
 * @param periodId1 ID del primer período (base)
 * @param periodId2 ID del segundo período (comparación)
 * @returns Resultados de la comparación
 */
export async function compareFinancialPeriods(periodId1: string, periodId2: string): Promise<ComparisonResult> {
  try {
    // Obtener información de los períodos
    const { data: period1Data, error: period1Error } = await supabase
      .from('accounting_periods')
      .select('id, name, year, period_number')
      .eq('id', periodId1)
      .single();
    
    if (period1Error) throw period1Error;
    
    const { data: period2Data, error: period2Error } = await supabase
      .from('accounting_periods')
      .select('id, name, year, period_number')
      .eq('id', periodId2)
      .single();
    
    if (period2Error) throw period2Error;
    
    // Obtener análisis financiero para el primer período
    let analysis1 = await getFinancialAnalysis(periodId1);
    if (!analysis1) {
      // Si no existe, calcularlo primero
      await calculateFinancialRatios(periodId1);
      const analysis = await getFinancialAnalysis(periodId1);
      if (!analysis) {
        throw new Error(`No se pudo generar el análisis para el período ${period1Data.name || period1Data.id}`);
      }
      analysis1 = analysis;
    }
    
    // Obtener análisis financiero para el segundo período
    let analysis2 = await getFinancialAnalysis(periodId2);
    if (!analysis2) {
      // Si no existe, calcularlo primero
      await calculateFinancialRatios(periodId2);
      const analysis = await getFinancialAnalysis(periodId2);
      if (!analysis) {
        throw new Error(`No se pudo generar el análisis para el período ${period2Data.name || period2Data.id}`);
      }
      analysis2 = analysis;
    }
    
    // Formatear nombres de períodos
    const period1Name = period1Data.name || `${period1Data.year} - ${period1Data.period_number}`;
    const period2Name = period2Data.name || `${period2Data.year} - ${period2Data.period_number}`;
    
    // Construir array de comparaciones
    const comparisons: any[] = [];
    
    // Recorrer categorías y ratios para hacer comparaciones
    Object.keys(analysis1.ratiosByCategory).forEach(categoryKey => {
      const category1 = analysis1!.ratiosByCategory[categoryKey as keyof RatioCategoryMap];
      const category2 = analysis2!.ratiosByCategory[categoryKey as keyof RatioCategoryMap];
      
      Object.keys(category1).forEach(ratioKey => {
        const ratio1 = category1[ratioKey];
        const ratio2 = category2[ratioKey];
        
        if (ratio1 && ratio2) {
          // Calcular diferencia y cambio porcentual
          const value1 = ratio1.value;
          const value2 = ratio2.value;
          const difference = value2 - value1;
          
          // Evitar división por cero
          let percentChange = 0;
          if (value1 !== 0) {
            percentChange = (difference / Math.abs(value1)) * 100;
          }
          
          // Determinar tendencia
          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (Math.abs(percentChange) < 1) {
            trend = 'stable';
          } else {
            // Para algunos ratios como deuda, un descenso es positivo
            const isPositive = ratio1.higherIsBetter 
              ? difference > 0 
              : difference < 0;
            
            trend = isPositive ? 'up' : 'down';
          }
          
          comparisons.push({
            id: ratioKey,
            name: ratio1.name,
            value1,
            value2,
            difference,
            percentChange,
            trend,
            isPositive: ratio1.higherIsBetter ? difference > 0 : difference < 0
          });
        }
      });
    });
    
    return {
      period1: {
        id: periodId1,
        periodName: period1Name
      },
      period2: {
        id: periodId2,
        periodName: period2Name
      },
      comparisons
    };
  } catch (error) {
    console.error('Error al comparar períodos', error);
    toast.error('Error al comparar períodos financieros');
    throw error;
  }
}

/**
 * Actualiza el esquema de la base de datos para incluir la tabla de análisis financiero
 */
export async function updateDatabaseSchema(): Promise<void> {
  try {
    // Verificar si la tabla financial_analysis existe
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'financial_analysis');
    
    if (error) {
      console.error('Error al verificar schema:', error);
      return;
    }
    
    // Si la tabla no existe, crearla
    if (!data || data.length === 0) {
      await supabase.rpc('run_sql', { 
        sql: `
          CREATE TABLE IF NOT EXISTS financial_analysis (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            accounting_period_id UUID REFERENCES accounting_periods(id),
            ratios JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by UUID REFERENCES auth.users(id),
            updated_at TIMESTAMPTZ,
            updated_by UUID REFERENCES auth.users(id)
          );
          
          CREATE INDEX IF NOT EXISTS idx_financial_analysis_period ON financial_analysis(accounting_period_id);
        `
      });
      
      console.log('Schema actualizado: tabla financial_analysis creada');
    }
  } catch (error) {
    console.error('Error al actualizar schema:', error);
  }
} 