import { supabase } from '../lib/supabase';

// Definición interna de AccountingPeriod
interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  // otros campos pueden estar presentes pero estos son los esenciales
}

// Interfaces para la reapertura de períodos
export interface ReopeningData {
  previousPeriodId: string;
  newPeriodId: string;
  userId: string;
  date: string;
  notes?: string;
}

export interface ReopeningResult {
  success: boolean;
  message: string;
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  openingEntryId?: string;
}

export interface OpeningEntry {
  id: string;
  date: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  items: OpeningEntryLine[];
}

export interface OpeningEntryLine {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
}

/**
 * Verifica si se puede realizar la reapertura de un período
 * Comprueba que el período anterior esté cerrado y que el nuevo período exista y esté vacío
 */
export const verifyReadyForReopening = async (
  previousPeriodId: string,
  newPeriodId: string
): Promise<{ ready: boolean; message: string }> => {
  const { data, error } = await supabase
    .rpc('verify_ready_for_reopening', {
      p_previous_period_id: previousPeriodId,
      p_new_period_id: newPeriodId
    });

  if (error) {
    throw new Error(`Error al verificar la reapertura: ${error.message}`);
  }

  return data[0] || { ready: false, message: 'Error al verificar la reapertura' };
};

/**
 * Genera y guarda el asiento de apertura para el nuevo período
 * @param dataOrPreviousPeriodId Puede ser un objeto ReopeningData o el ID del período anterior
 * @param newPeriodId ID del período nuevo (opcional si se pasa ReopeningData)
 * @param userId ID del usuario (opcional si se pasa ReopeningData)
 * @param date Fecha del asiento (opcional si se pasa ReopeningData)
 * @param notes Notas adicionales (opcional)
 */
export const generateOpeningEntries = async (
  dataOrPreviousPeriodId: ReopeningData | string,
  newPeriodId?: string,
  userId?: string,
  date?: Date | string,
  notes?: string
): Promise<ReopeningResult> => {
  let p_previous_period_id: string;
  let p_new_period_id: string;
  let p_user_id: string;
  let p_date: string;
  let p_notes: string | undefined;

  if (typeof dataOrPreviousPeriodId === 'object') {
    // Si se recibe un objeto ReopeningData
    const data = dataOrPreviousPeriodId;
    p_previous_period_id = data.previousPeriodId;
    p_new_period_id = data.newPeriodId;
    p_user_id = data.userId;
    p_date = data.date;
    p_notes = data.notes;
  } else {
    // Si se reciben argumentos separados
    p_previous_period_id = dataOrPreviousPeriodId;
    p_new_period_id = newPeriodId as string;
    p_user_id = userId as string;
    
    // Manejar la fecha según su tipo
    if (typeof date === 'string') {
      p_date = date;
    } else if (date instanceof Date) {
      p_date = date.toISOString().split('T')[0];
    } else {
      throw new Error('La fecha debe ser una cadena o un objeto Date');
    }
    
    p_notes = notes;
  }

  const { data, error } = await supabase
    .rpc('generate_opening_entries', {
      p_previous_period_id,
      p_new_period_id,
      p_user_id,
      p_date,
      p_notes
    });

  if (error) {
    throw new Error(`Error al generar asientos de apertura: ${error.message}`);
  }

  const result = data[0];
  return {
    success: result.success,
    message: result.message,
    totalAssets: result.total_assets || 0,
    totalLiabilities: result.total_liabilities || 0,
    totalEquity: result.total_equity || 0,
    openingEntryId: result.opening_entry_id
  };
};

/**
 * Obtiene los períodos disponibles para reapertura (períodos cerrados)
 */
export const getPeriodsForReopening = async (): Promise<AccountingPeriod[]> => {
  const { data: periods, error } = await supabase
    .from('accounting_periods')
    .select('*')
    .eq('is_closed', true)
    .order('end_date', { ascending: false });

  if (error) {
    throw new Error(`Error al obtener períodos para reapertura: ${error.message}`);
  }

  return periods;
};

/**
 * Obtiene los períodos disponibles para ser destino de reapertura (no cerrados)
 */
export const getTargetPeriodsForReopening = async (previousPeriodId?: string): Promise<AccountingPeriod[]> => {
  // Si no se proporciona previousPeriodId, simplemente devolver todos los períodos no cerrados
  if (!previousPeriodId) {
    const { data: periods, error } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('is_closed', false)
      .order('start_date', { ascending: true });

    if (error) {
      throw new Error(`Error al obtener períodos objetivo para reapertura: ${error.message}`);
    }

    return periods || [];
  }

  // Si se proporciona previousPeriodId, continuar con la lógica existente
  const { data: previousPeriod } = await supabase
    .from('accounting_periods')
    .select('end_date')
    .eq('id', previousPeriodId)
    .single();

  if (!previousPeriod) {
    throw new Error('No se encontró el período anterior');
  }

  const { data: periods, error } = await supabase
    .from('accounting_periods')
    .select('*')
    .eq('is_closed', false)
    .gt('start_date', previousPeriod.end_date)
    .order('start_date', { ascending: true });

  if (error) {
    throw new Error(`Error al obtener períodos objetivo para reapertura: ${error.message}`);
  }

  return periods || [];
};

/**
 * Obtiene el asiento de apertura de un período específico
 */
export const getOpeningEntry = async (periodId: string): Promise<OpeningEntry | null> => {
  const { data, error } = await supabase
    .rpc('get_opening_entry', {
      p_period_id: periodId
    });

  if (error) {
    throw new Error(`Error al obtener el asiento de apertura: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const entry = data[0];
  return {
    id: entry.id,
    date: entry.date,
    description: entry.description,
    totalDebit: entry.total_debit,
    totalCredit: entry.total_credit,
    items: entry.items
  };
};

/**
 * Actualiza el esquema de la base de datos para incluir las columnas necesarias
 */
export async function updateDatabaseSchema(): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_closing_schema');
    
    if (error) {
      console.error('Error al actualizar schema:', error);
      throw error;
    }
    
    console.log('Schema actualizado correctamente');
  } catch (error) {
    console.error('Error al actualizar schema:', error);
    throw error;
  }
} 