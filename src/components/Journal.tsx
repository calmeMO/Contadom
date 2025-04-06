// Función para editar un asiento existente
const handleEdit = async (entryId: string) => {
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
    
    if (!result.data) {
      console.error('❌ No se obtuvo datos del asiento');
      toast.error('No se encontró el asiento solicitado');
      setLoading(false);
      return;
    }
    
    const journalEntry = result.data;
    const entryItems = journalEntry.items || [];
    
    console.log('✅ Asiento obtenido para edición:', journalEntry);
    console.log('✅ Líneas del asiento:', entryItems);
    console.log(`Total de líneas: ${entryItems.length}`);
    
    // Transformar los datos para el formulario
    const formData: JournalEntryForm = {
      id: journalEntry.id,
      date: journalEntry.date,
      description: journalEntry.description,
      monthly_period_id: journalEntry.monthly_period_id,
      accounting_period_id: journalEntry.accounting_period_id,
      notes: journalEntry.notes || '',
      reference_number: journalEntry.reference_number || '',
      reference_date: journalEntry.reference_date || '',
      is_adjustment: !!journalEntry.adjustment_type,
      adjustment_type: journalEntry.adjustment_type || '',
      adjusted_entry_id: journalEntry.adjusted_entry_id || '',
    };
    
    // Transformar las líneas para el formulario
    const items: JournalEntryItem[] = entryItems.map((item: any) => ({
      id: item.id,
      journal_entry_id: item.journal_entry_id,
      account_id: item.account_id,
      description: item.description || '',
      debit: item.debit || 0,
      credit: item.credit || 0,
    }));
    
    console.log('✅ Datos transformados para el formulario:');
    console.log('Cabecera:', formData);
    console.log('Líneas:', items);
    
    // Establecer los valores actuales
    setCurrentEntry(formData);
    setCurrentEntryItems(items);
    
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