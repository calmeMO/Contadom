import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import Decimal from 'decimal.js';

// Tipos de ajustes contables soportados
export enum AdjustmentType {
  DEPRECIATION = 'depreciation',
  AMORTIZATION = 'amortization',
  PROVISION = 'provision',
  INVENTORY = 'inventory',
  OTHER = 'other'
}

// Estructura de una plantilla de ajuste
export interface AdjustmentTemplate {
  id: string;
  name: string;
  type: AdjustmentType;
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  isSystem: boolean;
  lastAmount?: number;
}

// Datos para crear un asiento de ajuste
export interface AdjustmentEntryData {
  accountingPeriodId: string;
  description: string;
  date: string;
  amount: number;
  debitAccountId: string;
  creditAccountId: string;
  templateId?: string;
  userId: string;
  notes?: string;
  supportDocumentUrl?: string;
}

/**
 * Obtiene todas las plantillas de ajuste disponibles
 */
export async function getAdjustmentTemplates(userId: string): Promise<AdjustmentTemplate[]> {
  try {
    // Obtener plantillas del sistema y plantillas del usuario
    const { data, error } = await supabase
      .from('adjustment_templates')
      .select('*')
      .or(`is_system.eq.true, created_by.eq.${userId}`);
    
    if (error) throw error;
    
    // Transformar a la estructura esperada
    return (data || []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.type as AdjustmentType,
      description: item.description,
      debitAccountId: item.debit_account_id,
      creditAccountId: item.credit_account_id,
      isSystem: item.is_system,
      lastAmount: item.last_amount
    }));
  } catch (error) {
    console.error('Error al obtener plantillas de ajuste:', error);
    throw error;
  }
}

/**
 * Crea una nueva plantilla de ajuste personalizada
 */
export async function createAdjustmentTemplate(
  template: Omit<AdjustmentTemplate, 'id' | 'isSystem'>, 
  userId: string
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('adjustment_templates')
      .insert({
        name: template.name,
        type: template.type,
        description: template.description,
        debit_account_id: template.debitAccountId,
        credit_account_id: template.creditAccountId,
        is_system: false,
        created_by: userId,
        last_amount: template.lastAmount || 0
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    return data.id;
  } catch (error) {
    console.error('Error al crear plantilla de ajuste:', error);
    throw error;
  }
}

/**
 * Elimina una plantilla de ajuste personalizada
 * (Solo se pueden eliminar plantillas creadas por el usuario)
 */
export async function deleteAdjustmentTemplate(templateId: string, userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('adjustment_templates')
      .delete()
      .match({ id: templateId, created_by: userId, is_system: false });
    
    if (error) throw error;
  } catch (error) {
    console.error('Error al eliminar plantilla de ajuste:', error);
    throw error;
  }
}

/**
 * Crea un asiento contable de ajuste basado en los datos proporcionados
 */
export async function createAdjustmentEntry(data: AdjustmentEntryData): Promise<string> {
  try {
    // Iniciar transacción
    const { error: transactionError } = await supabase.rpc('begin_transaction');
    if (transactionError) throw transactionError;
    
    try {
      // 1. Crear el asiento de diario
      const { data: journalEntry, error: journalError } = await supabase
        .from('journal_entries')
        .insert({
          accounting_period_id: data.accountingPeriodId,
          description: data.description,
          date: data.date,
          created_by: data.userId,
          is_adjustment: true,
          is_approved: false, // Los ajustes requieren aprobación
          notes: data.notes || null,
          support_document_url: data.supportDocumentUrl || null,
          adjustment_template_id: data.templateId || null,
          total_debit: data.amount,
          total_credit: data.amount
        })
        .select('id')
        .single();
      
      if (journalError) throw journalError;
      
      // 2. Crear los dos items del asiento (débito y crédito)
      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert([
          {
            journal_entry_id: journalEntry.id,
            account_id: data.debitAccountId,
            debit: data.amount,
            credit: 0,
            description: `Cargo por ${data.description}`
          },
          {
            journal_entry_id: journalEntry.id,
            account_id: data.creditAccountId,
            debit: 0,
            credit: data.amount,
            description: `Abono por ${data.description}`
          }
        ]);
      
      if (itemsError) throw itemsError;
      
      // 3. Actualizar el último monto usado en la plantilla si existe
      if (data.templateId) {
        const { error: updateError } = await supabase
          .from('adjustment_templates')
          .update({ last_amount: data.amount })
          .eq('id', data.templateId);
        
        if (updateError) throw updateError;
      }
      
      // Confirmar transacción
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) throw commitError;
      
      return journalEntry.id;
    } catch (error) {
      // Revertir transacción en caso de error
      await supabase.rpc('rollback_transaction');
      throw error;
    }
  } catch (error) {
    console.error('Error al crear asiento de ajuste:', error);
    throw error;
  }
}

/**
 * Obtiene información de depreciación para activos
 */
export async function getDepreciationData(): Promise<any[]> {
  try {
    // Obtener activos depreciables
    const { data, error } = await supabase
      .from('accounts')
      .select(`
        id, code, name, 
        depreciation_data:account_adjustments(
          acquisition_date, 
          acquisition_value, 
          residual_value, 
          useful_life_years, 
          depreciation_method,
          last_depreciation_date
        )
      `)
      .eq('type', 'asset')
      .eq('is_depreciable', true)
      .eq('is_active', true);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error al obtener datos de depreciación:', error);
    throw error;
  }
}

/**
 * Calcula el monto de depreciación para un activo
 */
export function calculateDepreciation(
  acquisitionValue: number,
  residualValue: number,
  usefulLifeYears: number,
  method: 'linear' | 'accelerated' = 'linear',
  periodMonths: number = 1
): number {
  try {
    const depreciableValue = acquisitionValue - residualValue;
    
    // Método lineal (línea recta)
    if (method === 'linear') {
      const annualDepreciation = depreciableValue / usefulLifeYears;
      const monthlyDepreciation = annualDepreciation / 12;
      return parseFloat((monthlyDepreciation * periodMonths).toFixed(2));
    }
    
    // Método acelerado (suma de dígitos)
    if (method === 'accelerated') {
      // Implementación simplificada del método acelerado
      const remainingYears = usefulLifeYears * 0.8; // Ajuste para simplificar
      const accelerationFactor = 2;
      const annualDepreciation = (depreciableValue / usefulLifeYears) * accelerationFactor;
      const monthlyDepreciation = annualDepreciation / 12;
      return parseFloat((monthlyDepreciation * periodMonths).toFixed(2));
    }
    
    return 0;
  } catch (error) {
    console.error('Error al calcular depreciación:', error);
    return 0;
  }
}

/**
 * Genera asientos de ajuste de depreciación para todos los activos depreciables
 */
export async function generateDepreciationAdjustments(
  accountingPeriodId: string,
  userId: string,
  date: string
): Promise<string[]> {
  try {
    // Obtener activos depreciables
    const assets = await getDepreciationData();
    if (!assets || assets.length === 0) {
      return [];
    }
    
    // Obtener la cuenta de gasto de depreciación y la cuenta acumulada de depreciación
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, type, name')
      .in('type', ['expense', 'contra_asset'])
      .ilike('name', '%deprecia%');
    
    if (accountsError) throw accountsError;
    
    const depreciationExpenseAccount = accounts?.find(a => a.type === 'expense');
    const accumulatedDepreciationAccount = accounts?.find(a => a.type === 'contra_asset');
    
    if (!depreciationExpenseAccount || !accumulatedDepreciationAccount) {
      throw new Error('No se encontraron las cuentas para registrar la depreciación');
    }
    
    // Crear asientos de ajuste para cada activo
    const journalEntryIds: string[] = [];
    
    for (const asset of assets) {
      if (asset.depreciation_data && asset.depreciation_data.length > 0) {
        const depData = asset.depreciation_data[0];
        
        // Calcular depreciación
        const amount = calculateDepreciation(
          depData.acquisition_value,
          depData.residual_value,
          depData.useful_life_years,
          depData.depreciation_method as 'linear' | 'accelerated'
        );
        
        // Crear asiento de ajuste
        if (amount > 0) {
          const journalEntryId = await createAdjustmentEntry({
            accountingPeriodId,
            description: `Depreciación de ${asset.name}`,
            date,
            amount,
            debitAccountId: depreciationExpenseAccount.id,
            creditAccountId: accumulatedDepreciationAccount.id,
            userId,
            notes: `Depreciación automática generada para ${asset.name} (${asset.code})`
          });
          
          journalEntryIds.push(journalEntryId);
          
          // Actualizar fecha de última depreciación
          await supabase
            .from('account_adjustments')
            .update({ last_depreciation_date: date })
            .eq('account_id', asset.id);
        }
      }
    }
    
    return journalEntryIds;
  } catch (error) {
    console.error('Error al generar asientos de depreciación:', error);
    throw error;
  }
}

/**
 * Inicializa las plantillas del sistema si no existen
 */
export async function initSystemAdjustmentTemplates(): Promise<void> {
  try {
    // Verificar si ya existen plantillas del sistema
    const { data: existingTemplates, error: checkError } = await supabase
      .from('adjustment_templates')
      .select('id')
      .eq('is_system', true);
    
    if (checkError) throw checkError;
    
    // Si ya existen plantillas del sistema, no crear nuevas
    if (existingTemplates && existingTemplates.length > 0) {
      return;
    }
    
    // Obtener cuentas necesarias para las plantillas
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, type, name')
      .in('type', ['expense', 'liability', 'asset', 'contra_asset', 'revenue']);
    
    if (accountsError) throw accountsError;
    
    if (!accounts || accounts.length === 0) {
      console.warn('No hay cuentas disponibles para crear plantillas de ajuste');
      return;
    }
    
    // Función para encontrar una cuenta por tipo y nombre
    const findAccount = (type: string, namePart: string) => {
      return accounts.find(a => a.type === type && a.name.toLowerCase().includes(namePart.toLowerCase()))?.id;
    };
    
    // Crear plantillas del sistema
    const templates = [
      {
        name: 'Depreciación de Activos Fijos',
        type: AdjustmentType.DEPRECIATION,
        description: 'Registra la depreciación mensual de activos fijos',
        debit_account_id: findAccount('expense', 'deprecia'),
        credit_account_id: findAccount('contra_asset', 'deprecia'),
        is_system: true
      },
      {
        name: 'Amortización de Gastos Diferidos',
        type: AdjustmentType.AMORTIZATION,
        description: 'Registra la amortización mensual de gastos pagados por anticipado',
        debit_account_id: findAccount('expense', 'amortiza'),
        credit_account_id: findAccount('asset', 'diferido'),
        is_system: true
      },
      {
        name: 'Provisión de Impuestos',
        type: AdjustmentType.PROVISION,
        description: 'Registra la provisión de impuestos a pagar',
        debit_account_id: findAccount('expense', 'impuesto'),
        credit_account_id: findAccount('liability', 'impuesto'),
        is_system: true
      },
      {
        name: 'Provisión de Prestaciones Sociales',
        type: AdjustmentType.PROVISION,
        description: 'Registra la provisión de prestaciones sociales por pagar',
        debit_account_id: findAccount('expense', 'prestaciones'),
        credit_account_id: findAccount('liability', 'prestaciones'),
        is_system: true
      },
      {
        name: 'Ajuste de Inventario',
        type: AdjustmentType.INVENTORY,
        description: 'Registra ajustes al inventario por conteo físico',
        debit_account_id: findAccount('expense', 'inventario'),
        credit_account_id: findAccount('asset', 'inventario'),
        is_system: true
      }
    ];
    
    // Filtrar plantillas con cuentas indefinidas
    const validTemplates = templates.filter(
      t => t.debit_account_id && t.credit_account_id
    );
    
    if (validTemplates.length > 0) {
      const { error: insertError } = await supabase
        .from('adjustment_templates')
        .insert(validTemplates);
      
      if (insertError) throw insertError;
    }
  } catch (error) {
    console.error('Error al inicializar plantillas de ajuste:', error);
  }
} 