import { supabase } from '../lib/supabase';
import { initializeMonthlyPeriodsForFiscalYear } from '../services/accountingPeriodService';

/**
 * Script para inicializar los períodos mensuales a partir del año fiscal existente
 * 
 * Para ejecutar:
 * 1. Asegúrate de tener configuradas las variables de entorno SUPABASE_URL y SUPABASE_KEY
 * 2. Ejecuta: npx ts-node src/scripts/initializeMonthlyPeriods.ts
 */
async function main() {
  try {
    // Obtener información del usuario
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    
    if (!user) {
      console.error('Error: Usuario no autenticado');
      return;
    }
    
    // Obtener el año fiscal existente
    const { data: fiscalYears, error: fiscalYearsError } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('is_month', false)
      .order('start_date', { ascending: false });
      
    if (fiscalYearsError) throw fiscalYearsError;
    
    if (!fiscalYears || fiscalYears.length === 0) {
      console.error('Error: No se encontraron años fiscales');
      return;
    }
    
    // Usar el año fiscal más reciente
    const currentFiscalYear = fiscalYears[0];
    console.log(`Inicializando períodos mensuales para ${currentFiscalYear.name}...`);
    
    // Inicializar períodos mensuales
    const { success, error } = await initializeMonthlyPeriodsForFiscalYear(currentFiscalYear.id, user.id);
    
    if (!success) {
      console.error(`Error al inicializar períodos mensuales: ${error}`);
      return;
    }
    
    console.log('Períodos mensuales inicializados correctamente');
    
    // Verificar los períodos creados
    const { data: monthlyPeriods, error: monthlyPeriodsError } = await supabase
      .from('monthly_accounting_periods')
      .select('*')
      .eq('fiscal_year_id', currentFiscalYear.id)
      .order('start_date', { ascending: true });
      
    if (monthlyPeriodsError) throw monthlyPeriodsError;
    
    console.log(`Se crearon ${monthlyPeriods?.length || 0} períodos mensuales:`);
    monthlyPeriods?.forEach(period => {
      console.log(`- ${period.name}: ${period.start_date} a ${period.end_date}`);
    });
    
  } catch (error: any) {
    console.error('Error:', error.message || error);
  } finally {
    // Cerrar la conexión
    await supabase.auth.signOut();
  }
}

// Ejecutar el script
main(); 