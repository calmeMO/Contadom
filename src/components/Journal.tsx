import React from 'react';
import { toast } from 'react-toastify';
import { 
  JournalEntryForm, 
  JournalEntryItem,
  JournalEntry,
  AdjustmentType
} from '../services/journalService';
import { getJournalEntry } from '../services/journalService';

interface JournalEditProps {
  entryId: string;
  setLoading: (loading: boolean) => void;
  setCurrentEntry: (entry: any) => void;
  setCurrentEntryItems: (items: JournalEntryItem[]) => void;
  setFormMode: (mode: string) => void;
  setShowForm: (show: boolean) => void;
}

/**
 * Hook para editar un asiento contable existente
 */
export const useJournalEdit = () => {
  // Función para editar un asiento existente
  const handleEdit = async ({
    entryId,
    setLoading,
    setCurrentEntry,
    setCurrentEntryItems,
    setFormMode,
    setShowForm
  }: JournalEditProps) => {
    setLoading(true);
    try {
      console.log('⏳ Iniciando edición de asiento ID:', entryId);
      
      const result = await getJournalEntry(entryId);
      
      if (result.error) {
        console.error('❌ Error al obtener asiento para editar:', result.error);
        toast.error('Error al cargar el asiento: ' + result.error.message);
        setLoading(false);
        return;
      }
      
      if (!result.entry) {
        console.error('❌ No se obtuvo datos del asiento');
        toast.error('No se encontró el asiento solicitado');
        setLoading(false);
        return;
      }
      
      const journalEntry = result.entry;
      const entryItems = result.items || [];
      
      console.log('✅ Asiento obtenido para edición:', journalEntry);
      console.log('✅ Líneas del asiento:', entryItems);
      console.log(`Total de líneas: ${entryItems.length}`);
      
      // Transformar los datos para el formulario
      const formData: JournalEntryForm = {
        date: journalEntry.date,
        description: journalEntry.description,
        monthly_period_id: journalEntry.monthly_period_id,
        accounting_period_id: journalEntry.accounting_period_id,
        notes: journalEntry.notes || '',
        reference_number: journalEntry.reference_number || '',
        reference_date: journalEntry.reference_date || '',
        is_adjustment: !!journalEntry.adjustment_type,
        adjustment_type: journalEntry.adjustment_type || null,
        adjusted_entry_id: journalEntry.adjusted_entry_id || null,
      };
      
      // Transformar las líneas para el formulario (ya vienen formateadas desde el servicio)
      
      console.log('✅ Datos transformados para el formulario:');
      console.log('Cabecera:', formData);
      console.log('Líneas:', entryItems);
      
      // Establecer los valores actuales
      setCurrentEntry({...journalEntry, ...formData});
      setCurrentEntryItems(entryItems);
      
      // Mostrar el formulario de edición
      setFormMode('edit');
      setShowForm(true);
      
    } catch (error: any) {
      console.error('❌ Error no controlado al editar asiento:', error);
      toast.error('Error al editar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return { handleEdit };
}; 