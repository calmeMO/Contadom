import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { 
  Plus, 
  FileEdit, 
  Copy, 
  Eye, 
  Check,
  Search,
  ArrowUpDown,
  XCircle,
  Info,
  Edit,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FilePlus,
  Filter,
  Gift,
  History,
  Settings,
  Shield,
  Table,
  Lock,
  AlertCircle
} from 'lucide-react';
import JournalEntryForm from '../components/JournalEntryForm';
import Modal from '../components/ui/Modal';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  fetchJournalEntries, 
  getJournalEntry, 
  approveJournalEntry, 
  cancelJournalEntry,
  JournalEntryItem,
  JournalEntry,
  AdjustmentType
} from '../services/journalService';
import { 
  fetchFiscalYears, 
  getAvailablePeriodsForEntry,
  MonthlyPeriod
} from '../services/accountingPeriodService';
import Decimal from 'decimal.js';

// Definir el tipo de modo del modal de forma más completa
type ModalMode = 'create' | 'edit' | 'view' | 'create-adjustment' | 'edit-adjustment';

// Añadir estas funciones cerca del inicio del componente
// Función para obtener etiqueta larga de tipo de ajuste
const adjustmentTypeLabel = (type: AdjustmentType | null | undefined): string => {
  if (!type) return 'Ajuste';
  
  const labels: Record<AdjustmentType, string> = {
    'depreciation': 'Depreciación',
    'amortization': 'Amortización',
    'accrual': 'Devengo',
    'deferred': 'Diferido',
    'inventory': 'Inventario',
    'correction': 'Corrección de Error',
    'provision': 'Provisión',
    'valuation': 'Valoración',
    'other': 'Otro Ajuste'
  };
  
  return labels[type] || 'Ajuste';
};

// Función para obtener etiqueta corta de tipo de ajuste (para mostrar en tabla)
const adjustmentTypeShort = (type: AdjustmentType | null | undefined): string => {
  if (!type) return 'Ajuste';
  
  // Versiones abreviadas para mostrar en espacio limitado
  const shortLabels: Record<AdjustmentType, string> = {
    'depreciation': 'Deprec.',
    'amortization': 'Amort.',
    'accrual': 'Devengo',
    'deferred': 'Diferido',
    'inventory': 'Invent.',
    'correction': 'Correc.',
    'provision': 'Provis.',
    'valuation': 'Valor.',
    'other': 'Otro'
  };
  
  return shortLabels[type] || 'Ajuste';
};

export default function Journal() {
  const location = useLocation();
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [monthlyPeriods, setMonthlyPeriods] = useState<MonthlyPeriod[]>([]);
  const [currentEntry, setCurrentEntry] = useState<JournalEntry | null>(null);
  const [currentEntryItems, setCurrentEntryItems] = useState<JournalEntryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [currentFiscalYearId, setCurrentFiscalYearId] = useState<string>('');
  const [currentMonthlyPeriodId, setCurrentMonthlyPeriodId] = useState<string>('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | 'regular' | 'adjustment'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [excludeVoided, setExcludeVoided] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [entryToCancel, setEntryToCancel] = useState<string | null>(null);

  // Procesar parámetros de URL al cargar
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusParam = params.get('status');
    const excludeVoidedParam = params.get('excludeVoided');
    
    if (statusParam) {
      setStatusFilter(statusParam);
    }
    
    if (excludeVoidedParam === 'true') {
      setExcludeVoided(true);
    }
  }, [location.search]);

  // Cargar asientos contables
  const fetchEntries = async () => {
    try {
      setLoading(true);
      const { data, error } = await fetchJournalEntries({
        monthlyPeriodId: currentMonthlyPeriodId || undefined,
        fiscalYearId: currentFiscalYearId || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        entryType: entryTypeFilter,
        searchTerm: searchTerm || undefined,
        sortField,
        sortOrder,
        excludeVoided
      });

      if (error) {
        console.error('Error al cargar asientos:', error);
        toast.error(`Error al cargar asientos: ${error.message || 'Error desconocido'}`);
        setEntries([]);
      } else {
        setEntries(data || []);
      }
    } catch (error: any) {
      console.error('Excepción al cargar asientos:', error);
      toast.error(`Error inesperado al cargar asientos: ${error.message}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Cargar cuentas contables
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .order('code');
      
      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);
      
      // Cargar períodos fiscales (incluir todos, cerrados y activos)
      const { data: fiscalYearsData, error: fiscalYearsError } = await fetchFiscalYears();
      
      if (fiscalYearsError) throw fiscalYearsError;
      setFiscalYears(fiscalYearsData || []);
      
      // Cargar períodos mensuales (incluir todos, incluso cerrados e inactivos)
      // En lugar de usar getAvailablePeriodsForEntry que solo trae los disponibles
      const { data: allPeriodsData, error: periodsError } = await supabase
        .from('monthly_accounting_periods_with_users')
        .select(`
          *,
          fiscal_year:fiscal_year_id(
            id,
            name,
            is_closed,
            is_active
          )
        `)
        .order('year', { ascending: false })
        .order('month', { ascending: true });
      
      if (periodsError) throw periodsError;
      setMonthlyPeriods(allPeriodsData || []);
      
      // Find current fiscal year (not closed and active)
      const currentFiscalYear = fiscalYearsData?.find(year => !year.is_closed && year.is_active);

      // Get current monthly period (associated with current fiscal year, not closed and active)
      const currentMonthlyPeriod = allPeriodsData
        ?.filter(p => p.fiscal_year_id === currentFiscalYear?.id && !p.is_closed && p.is_active)
        .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0];
      
      if (currentFiscalYear) {
        setCurrentFiscalYearId(currentFiscalYear.id);
        
        if (currentMonthlyPeriod) {
          setCurrentMonthlyPeriodId(currentMonthlyPeriod.id || '');
        }
      }
    } catch (error: any) {
      console.error('Error al cargar datos iniciales:', error);
      toast.error(`Error: ${error.message || 'No se pudieron cargar los datos iniciales'}`);
    } finally {
      // No llamar a fetchEntries aquí, se llama en el siguiente useEffect
    }
  };

    loadInitialData();
  }, []);

  // Actualizar cuando cambian los filtros
  useEffect(() => {
    // Solo cargar entradas cuando el componente esté montado y tengamos períodos
    // Evitamos dependencia circular con loading para que no se recargue infinitamente
    if (monthlyPeriods.length > 0) {
        fetchEntries();
    } else if (!loading) {
        // Si no hay períodos pero ya no estamos cargando, también intentamos fetchEntries
        // esto cubrirá el caso cuando no hay períodos definidos aún
        fetchEntries();
    }
  }, [currentFiscalYearId, currentMonthlyPeriodId, statusFilter, entryTypeFilter, searchTerm, sortField, sortOrder, excludeVoided]);

  // Manejar cambio de año fiscal
  const handleFiscalYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFiscalYearId = e.target.value;
    setCurrentFiscalYearId(newFiscalYearId);
    
    // Al cambiar el año fiscal, resetear el período mensual
    setCurrentMonthlyPeriodId('');
    
    // Si se selecciona un nuevo año fiscal, intentar seleccionar el período mensual más reciente de ese año
    if (newFiscalYearId) {
      const periodsForThisYear = monthlyPeriods
        .filter(p => p.fiscal_year_id === newFiscalYearId && !p.is_closed && p.is_active)
        .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());
      
      if (periodsForThisYear.length > 0) {
        // Seleccionar el período más reciente no cerrado
        setCurrentMonthlyPeriodId(periodsForThisYear[0].id || '');
      }
    }
  };

  // Manejar cambio de período mensual
  const handleMonthlyPeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const periodId = e.target.value;
    setCurrentMonthlyPeriodId(periodId);
    
    // Si se selecciona "Todos" (valor vacío), mantener el año fiscal actual
    // Si se selecciona un período específico, asegurarse que el año fiscal corresponda
    if (periodId) {
      const selectedPeriod = monthlyPeriods.find(p => p.id === periodId);
      if (selectedPeriod && selectedPeriod.fiscal_year_id !== currentFiscalYearId) {
        // Actualizar el año fiscal para que corresponda con el período seleccionado
        setCurrentFiscalYearId(selectedPeriod.fiscal_year_id);
      }
    }
    // Cuando se selecciona "Todos", no cambiamos el año fiscal para mantener la consulta
    // filtrada por todos los períodos del año seleccionado
  };

  // Crear nuevo asiento regular
  const handleCreate = () => {
    setCurrentEntry(null);
    setCurrentEntryItems([]);
    setModalMode('create');
    setModalVisible(true);
  };

  // Crear nuevo asiento de ajuste
  const handleCreateAdjustment = () => {
    setCurrentEntry(null);
    setCurrentEntryItems([]);
    setModalMode('create-adjustment');
    setModalVisible(true);
  };

  // Ver detalles de asiento
  const handleView = async (id: string) => {
    try {
      // Iniciar loading
      setLoading(true);
      
      console.log('⏳ Iniciando acción VER asiento ID:', id);
      
      // Obtener datos del asiento con el formato original
      const { entry, items, error } = await getJournalEntry(id);
      
      // Manejar error en la obtención de datos
      if (error) {
        console.error('❌ Error al cargar detalles del asiento:', error);
        toast.error(`Error al cargar asiento: ${error.message || 'Error desconocido'}`);
        return;
      }
      
      // Verificar que existan los datos
      if (!entry) {
        console.error('❌ No se encontró el asiento solicitado');
        toast.error('No se encontró el asiento solicitado');
        return;
      }
      
      console.log('✅ Asiento cargado correctamente - ID:', id, 'Número:', entry.entry_number);
      console.log('✅ Datos de cabecera del asiento:', entry);
      console.log('✅ Líneas del asiento (cantidad):', items?.length || 0);
      
      // Cargar datos en el estado
      setCurrentEntry(entry);
      setCurrentEntryItems(items || []);
      
      // Configurar modo visualización
      setModalMode('view');
      
      // Mostrar modal
      setModalVisible(true);
      
    } catch (error: any) {
      console.error('❌ Error no controlado al cargar asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo cargar el asiento'}`);
    } finally {
      // Finalizar loading
      setLoading(false);
    }
  };

  // Verificar si un período está cerrado o inactivo
  const isPeriodClosedOrInactive = (periodId: string): boolean => {
    const period = monthlyPeriods.find(p => p.id === periodId);
    
    if (!period) return true; // Si no encontramos el período, asumimos restricción
    
    // Verificar si el período está cerrado o si no está activo
    if (period.is_closed || !period.is_active) return true;
    
    // Verificar además el estado del año fiscal asociado
    // @ts-ignore - En la consulta extendida con join sí tenemos fiscal_year
    const fiscalYear = period.fiscal_year;
    if (fiscalYear && (fiscalYear.is_closed || !fiscalYear.is_active)) return true;
    
    return false;
  };

  // Editar asiento
  const handleEdit = async (id: string) => {
    // Verificar autenticación
    if (!user?.id) {
      toast.warn('Debe iniciar sesión para editar asientos');
      return;
    }
    
    // Verificar permisos
    if (user.role !== 'admin' && user.role !== 'accountant') {
      toast.warn('No tiene permisos para editar asientos');
      return;
    }
    
    try {
      // Iniciar loading
      setLoading(true);
      
      console.log('⏳ Iniciando acción EDITAR asiento ID:', id);
      
      // Obtener datos del asiento con el formato original
      const { entry, items, error } = await getJournalEntry(id);
      
      // Manejar error en la obtención de datos
      if (error) {
        console.error('❌ Error al cargar asiento para edición:', error);
        toast.error(`Error al cargar asiento: ${error.message || 'Error desconocido'}`);
        return;
      }
      
      // Verificar que exista el asiento
      if (!entry) {
        console.error('❌ No se encontró el asiento solicitado');
        toast.error('No se encontró el asiento solicitado');
        return;
      }
      
      // Verificar que el asiento no esté aprobado
      if (entry.is_approved || entry.status === 'aprobado') {
        console.error('❌ No se puede editar un asiento aprobado');
        toast.error('No se puede editar un asiento aprobado');
        return;
      }
      
      // Verificar que el asiento no esté voided
      if (entry.status === 'voided') {
        console.error('❌ No se puede editar un asiento anulado');
        toast.error('No se puede editar un asiento anulado');
        return;
      }
      
      // Verificar que el periodo no esté cerrado o inactivo
      if (isPeriodClosedOrInactive(entry.monthly_period_id)) {
        console.error('❌ No se puede editar un asiento de un período cerrado o inactivo');
        toast.error('No se puede editar un asiento de un período cerrado o inactivo');
        return;
      }
      
      // Log para depuración - Ver si hay líneas del asiento
      console.log('✅ Asiento cargado para edición - ID:', id, 'Número:', entry.entry_number);
      console.log('✅ Datos de cabecera:', entry);
      
      if (!items || items.length === 0) {
        console.warn('⚠️ No se encontraron líneas para este asiento');
        toast.warning('No se encontraron líneas de detalle para este asiento');
      } else {
        console.log(`✅ Se encontraron ${items.length} líneas para el asiento`);
        items.forEach((item, index) => {
          console.log(`  Línea ${index + 1}:`, item);
          console.log(`    Cuenta: ${item.account_id}, Débito: ${item.debit}, Crédito: ${item.credit}`);
        });
      }
      
      // Cargar datos en el estado
      setCurrentEntry(entry);
      setCurrentEntryItems(items || []);
      
      // Configurar modo edición según tipo de asiento
      setModalMode(entry.is_adjustment ? 'edit-adjustment' : 'edit');
      
      // Mostrar modal
      setModalVisible(true);
      
    } catch (error: any) {
      console.error('❌ Error no controlado al editar asiento:', error);
      toast.error(`Error: ${error.message || 'No se pudo cargar el asiento para editar'}`);
    } finally {
      // Finalizar loading
      setLoading(false);
    }
  };

  // Aprobar asiento
  const handleApprove = async (id: string) => {
    // Verificar autenticación
    if (!user?.id) {
      toast.warn('Debe iniciar sesión para aprobar asientos');
      return;
    }
    
    // Verificar permisos (solo administradores)
    if (user.role !== 'admin') {
      toast.warn('Solo los administradores pueden aprobar asientos');
      return;
    }
    
    try {
      // Iniciar loading
      setLoading(true);
      
      console.log('⏳ Iniciando acción APROBAR asiento ID:', id);
      
      // Obtener datos del asiento para verificación con formato original
      const { entry, error: checkError } = await getJournalEntry(id);
      
      // Manejar error en la verificación
      if (checkError) {
        console.error('❌ Error al verificar asiento existente:', checkError);
        toast.error(`Error al verificar asiento: ${checkError.message || 'Error desconocido'}`);
        return;
      }
      
      // Verificar que exista el asiento
      if (!entry) {
        console.error('❌ No se encontró el asiento solicitado');
        toast.error('No se encontró el asiento solicitado');
        return;
      }
      
      // Verificar que el asiento no esté ya aprobado
      if (entry.is_approved || entry.status === 'aprobado') {
        console.error('❌ El asiento ya se encuentra aprobado');
        toast.error('El asiento ya se encuentra aprobado');
        return;
      }
      
      // Verificar que el asiento no esté voided
      if (entry.status === 'voided') {
        console.error('❌ No se puede aprobar un asiento anulado');
        toast.error('No se puede aprobar un asiento anulado');
        return;
      }
      
      // Verificar que el periodo no esté cerrado o inactivo
      if (isPeriodClosedOrInactive(entry.monthly_period_id)) {
        console.error('❌ No se puede aprobar un asiento de un período cerrado o inactivo');
        toast.error('No se puede aprobar un asiento de un período cerrado o inactivo');
        return;
      }
      
      // Solicitar confirmación
      const confirmed = window.confirm('¿Está seguro de aprobar este asiento? Una vez aprobado, no podrá editarlo ni eliminarlo.');
      if (!confirmed) return;
      
      // Ejecutar aprobación
      const { error } = await approveJournalEntry(id, user.id);
      
      // Manejar error en la aprobación
      if (error) {
        console.error('❌ Error al aprobar asiento:', error);
        toast.error(`Error al aprobar asiento: ${error.message || 'Error desconocido'}`);
        return;
      }
      
      console.log('✅ Asiento aprobado correctamente - ID:', id, 'Número:', entry.entry_number);
      
      // Notificar éxito
      toast.success('Asiento aprobado correctamente');
      
      // Actualizar lista de asientos
      fetchEntries();
      
    } catch (error: any) {
      console.error('❌ Error no controlado al aprobar asiento:', error);
      toast.error(`Error: ${error.message || 'Error al procesar la aprobación'}`);
    } finally {
      // Finalizar loading
      setLoading(false);
    }
  };

  // Anular asiento (mostrar modal)
  const handleCancel = async (id: string, entry_number: string) => {
    // Verificar autenticación
    if (!user?.id) {
      toast.warn('Debe iniciar sesión para anular asientos');
      return;
    }
    
    // Verificar permisos (solo administradores)
    if (user.role !== 'admin') {
      toast.warn('Solo los administradores pueden anular asientos');
      return;
    }
    
    try {
      console.log('⏳ Iniciando acción ANULAR asiento ID:', id, 'Número:', entry_number);
      
      // Obtener datos del asiento para verificación con formato original
      const { entry, error: checkError } = await getJournalEntry(id);
      
      // Manejar error en la verificación
      if (checkError) {
        console.error('❌ Error al verificar asiento existente:', checkError);
        toast.error(`Error al verificar asiento: ${checkError.message || 'Error desconocido'}`);
        return;
      }
      
      // Verificar que exista el asiento
      if (!entry) {
        console.error('❌ No se encontró el asiento solicitado');
        toast.error('No se encontró el asiento solicitado');
        return;
      }
      
      // Verificar que el asiento esté aprobado
      if (!entry.is_approved && entry.status !== 'aprobado') {
        console.error('❌ Solo se pueden anular asientos aprobados');
        toast.error('Solo se pueden anular asientos aprobados');
        return;
      }
      
      // Verificar que el asiento no esté voided
      if (entry.status === 'voided') {
        console.error('❌ El asiento ya se encuentra anulado');
        toast.error('El asiento ya se encuentra anulado');
        return;
      }
      
      // Verificar que el periodo no esté cerrado o inactivo
      if (isPeriodClosedOrInactive(entry.monthly_period_id)) {
        console.error('❌ No se puede anular un asiento de un período cerrado o inactivo');
        toast.error('No se puede anular un asiento de un período cerrado o inactivo');
        return;
      }
      
      console.log('✅ Preparando anulación - ID:', id, 'Número:', entry.entry_number);
      
      // Preparar el modal de anulación
      setEntryToCancel(id);
      setCancelReason('');
      setCancelModalVisible(true);
      
    } catch (error: any) {
      console.error('❌ Error no controlado al preparar anulación de asiento:', error);
      toast.error(`Error: ${error.message || 'Error al preparar la anulación'}`);
    }
  };

  // Confirmar anulación de asiento
  const handleCancelConfirm = async () => {
    // Verificar que tengamos ID de asiento y usuario
    if (!entryToCancel || !user?.id) {
      toast.warn('No se puede procesar la anulación: falta ID de asiento o usuario');
      return;
    }
    
    // Verificar que se ha ingresado un motivo
    if (!cancelReason.trim()) {
      toast.error('Debe ingresar un motivo para la anulación');
      return;
    }
    
    try {
      // Iniciar loading
      setLoading(true);
      
      console.log('⏳ Confirmando anulación de asiento ID:', entryToCancel, 'Motivo:', cancelReason);
      
      // Ejecutar anulación
      const { error } = await cancelJournalEntry(entryToCancel, user.id, cancelReason);
      
      // Manejar error en la anulación
      if (error) {
        console.error('❌ Error al anular asiento:', error);
        
        // Mostrar mensajes específicos según el tipo de error
        if (error.message?.includes('permission') || error.message?.includes('no tiene')) {
          toast.error(`Error de permisos: ${error.message}. Contacte al administrador del sistema.`);
        } else if (error.message?.includes('trigger')) {
          toast.error('Error en la base de datos. Esta operación requiere privilegios de administrador.');
        } else {
          toast.error(`Error al anular asiento: ${error.message || 'Error desconocido'}`);
        }
        return;
      }
      
      console.log('✅ Asiento anulado correctamente - ID:', entryToCancel, 'Motivo:', cancelReason);
      
      // Notificar éxito
      toast.success('Asiento anulado correctamente');
      
      // Cerrar modal y limpiar estado
      setCancelModalVisible(false);
      setEntryToCancel(null);
      setCancelReason('');
      
      // Actualizar lista de asientos
      fetchEntries();
      
    } catch (error: any) {
      console.error('❌ Excepción no controlada al anular asiento:', error);
      toast.error(`Error inesperado: ${error.message || 'Error al procesar la anulación'}`);
    } finally {
      // Finalizar loading
      setLoading(false);
    }
  };

  // Manejar el cierre del modal
  const handleModalCancel = () => {
    setModalVisible(false);
    setCurrentEntry(null);
    setCurrentEntryItems([]);
  };

  // Manejar la finalización del formulario
  const handleFormFinish = (entryId: string | null) => {
    setModalVisible(false);
    setCurrentEntry(null);
    setCurrentEntryItems([]);
    if (entryId) {
        fetchEntries();
    }
  };

  // Ordenar por campo
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Depurar información del usuario y estado de asientos
  useEffect(() => {
    if (entries.length > 0 && user) {
      console.log('Información de depuración:');
      console.log('Usuario actual:', user);
      console.log('Rol de usuario:', user.role);
      console.log('ID de usuario:', user.id);
      console.log('Número de asientos:', entries.length);
      
      // Mostrar ejemplos de asientos con diferentes estados
      const pendientes = entries.filter(e => e.status === 'pendiente');
      const aprobados = entries.filter(e => e.status === 'aprobado');
      const anulados = entries.filter(e => e.status === 'voided');
      
      console.log('Asientos pendientes:', pendientes.length);
      console.log('Asientos aprobados:', aprobados.length);
      console.log('Asientos anulados:', anulados.length);
      
      if (pendientes.length > 0) {
        console.log('Ejemplo de asiento pendiente:', pendientes[0]);
      }
      
      if (aprobados.length > 0) {
        console.log('Ejemplo de asiento aprobado:', aprobados[0]);
      }
      
      if (anulados.length > 0) {
        console.log('Ejemplo de asiento anulado:', anulados[0]);
      }
    }
  }, [entries, user]);

  // Modificar el renderizado de la tabla para incluir indicadores de períodos cerrados
  const renderEntryRow = (entry: JournalEntry) => {
    const isPeriodRestricted = isPeriodClosedOrInactive(entry.monthly_period_id);
    const period = monthlyPeriods.find(p => p.id === entry.monthly_period_id);
    
    return (
      <tr 
        key={entry.id} 
        className={`${
          entry.status === 'voided' ? 'bg-red-50 border-l-2 border-red-300' : 
          entry.is_approved ? 'bg-green-50' : 'hover:bg-gray-50'
        } ${
          isPeriodRestricted ? 'opacity-80' : ''
        }`}
      >
        <td className="px-4 py-3 whitespace-nowrap text-sm">{entry.entry_number}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm">{format(parseISO(entry.date), 'dd/MM/yyyy')}</td>
        <td className="px-4 py-3 text-sm">
            <div className="truncate max-w-xs" title={entry.description}>{entry.description}</div>
            {entry.reference_number && <div className="text-xs text-gray-500 mt-0.5" title={`Ref: ${entry.reference_number}`}>Ref: {entry.reference_number}</div>}
        </td>
        <td className="px-4 py-3 text-sm">{entry.monthly_period?.name || '-'}</td>
        <td className="px-4 py-3 text-center whitespace-nowrap text-sm">
           {entry.is_adjustment && (
               <span 
                 className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800" 
                 title={adjustmentTypeLabel(entry.adjustment_type)}
               >
                 <Info size={12} className="mr-1" /> 
                 {adjustmentTypeShort(entry.adjustment_type)}
               </span>
           )}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap text-sm font-mono">{new Decimal(entry.total_debit).toFixed(2)}</td>
        <td className="px-4 py-3 text-right whitespace-nowrap text-sm font-mono">{new Decimal(entry.total_credit).toFixed(2)}</td>
        <td className="px-4 py-3 text-center whitespace-nowrap text-sm">
          <span className={`px-2 py-1 rounded-full text-xs font-medium 
            ${entry.status === 'aprobado' ? 'bg-green-100 text-green-800' : 
              entry.status === 'voided' ? 'bg-red-100 text-red-800' : 
              'bg-yellow-100 text-yellow-800'}`}
          >
            {entry.status === 'voided' ? 'Anulado' : entry.status}
          </span>
        </td>
        {/* Añadir indicador visual de período cerrado/inactivo */}
        {isPeriodRestricted && (
          <div className="absolute top-0 right-0 m-1">
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
              <Lock className="w-3 h-3 mr-1" /> 
              {period?.is_closed ? 'Período cerrado' : 'Período inactivo'}
            </span>
          </div>
        )}
        <td className="px-4 py-3 text-right text-sm font-medium">
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => handleView(entry.id)}
              className="text-gray-600 hover:text-gray-900"
              title="Ver detalles"
              aria-label="Ver detalles"
            >
              <Eye size={18} />
            </button>
            
            {entry.status !== 'voided' && !entry.is_approved && !isPeriodRestricted && (
              <button
                onClick={() => handleEdit(entry.id)}
                className="text-blue-600 hover:text-blue-900"
                title="Editar asiento"
                aria-label="Editar asiento"
              >
                <Edit size={18} />
              </button>
            )}
            
            {entry.status !== 'voided' && !entry.is_approved && !isPeriodRestricted && user?.role === 'admin' && (
              <button
                onClick={() => handleApprove(entry.id)}
                className="text-green-600 hover:text-green-900"
                title="Aprobar asiento"
                aria-label="Aprobar asiento"
              >
                <Check size={18} />
              </button>
            )}
            
            {entry.is_approved && entry.status !== 'voided' && !isPeriodRestricted && user?.role === 'admin' && (
              <button
                onClick={() => handleCancel(entry.id, entry.entry_number || '')}
                className="text-red-600 hover:text-red-900"
                title="Anular asiento"
                aria-label="Anular asiento"
              >
                <XCircle size={18} />
              </button>
            )}
            
            {isPeriodRestricted && (
              <button
                onClick={() => toast.info('No se pueden modificar asientos en períodos cerrados o inactivos')}
                className="text-gray-400 cursor-not-allowed"
                title="Este asiento pertenece a un período cerrado o inactivo"
                aria-label="Acciones deshabilitadas"
              >
                <Lock size={18} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Diario Contable</h1>
        <div className="flex items-center space-x-2">
           <div className="flex justify-end space-x-2 mb-4">
             <button
               onClick={handleCreate}
               className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
             >
               <Plus className="h-4 w-4 mr-2" />
               Nuevo Asiento
             </button>
             <button
               onClick={handleCreateAdjustment}
               className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
             >
               <Plus className="h-4 w-4 mr-2" />
               Nuevo Ajuste
             </button>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-medium">Filtros y Búsqueda</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Año Fiscal</label>
            <select
              value={currentFiscalYearId}
              onChange={handleFiscalYearChange}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {fiscalYears.map(year => (<option key={year.id} value={year.id}>{year.name}</option>))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Período Mensual</label>
            <select
              value={currentMonthlyPeriodId}
              onChange={handleMonthlyPeriodChange}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={!currentFiscalYearId}
            >
              <option value="">Todos</option>
              {monthlyPeriods
                .filter(p => !currentFiscalYearId || p.fiscal_year_id === currentFiscalYearId)
                .map(period => (<option key={period.id} value={period.id}>{period.name}</option>))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Asiento</label>
            <select
              value={entryTypeFilter}
              onChange={(e) => setEntryTypeFilter(e.target.value as 'all' | 'regular' | 'adjustment')}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos</option>
              <option value="regular">Regulares</option>
              <option value="adjustment">Ajustes</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="aprobado">Aprobado</option>
              <option value="voided">Anulado</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nº, descripción, ref..."
                className="w-full p-2 pl-10 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
        
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {excludeVoided && (
          <div className="bg-blue-50 p-2 text-blue-700 text-sm border-b border-blue-100">
            <Info size={16} className="inline-block mr-1" /> Se están excluyendo los asientos anulados.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('entry_number')}>
                    <div className="flex items-center">Número {sortField === 'entry_number' && <ArrowUpDown size={14} className="ml-1" />}</div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('date')}>
                    <div className="flex items-center">Fecha {sortField === 'date' && <ArrowUpDown size={14} className="ml-1" />}</div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Período</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Débito</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Crédito</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && entries.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-gray-500"><div className="flex justify-center items-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div> Cargando...</div></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-gray-500">No hay asientos que coincidan con los filtros.</td></tr>
              ) : (
                entries.map((entry) => renderEntryRow(entry))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalVisible && (
        <Modal 
          isOpen={modalVisible} 
          onClose={handleModalCancel} 
          title={modalMode.includes('create') ? (modalMode === 'create-adjustment' ? 'Nuevo Ajuste' : 'Nuevo Asiento') : (modalMode.includes('edit') ? (modalMode === 'edit-adjustment' ? 'Editar Ajuste' : 'Editar Asiento') : 'Ver Asiento')}
          size="xl"
        >
          <JournalEntryForm
            mode={modalMode}
            entryId={currentEntry?.id}
            entry={currentEntry}
            entryItems={currentEntryItems}
            accounts={accounts}
            onFinish={handleFormFinish}
            onCancel={handleModalCancel}
            loading={loading}
          />
        </Modal>
      )}
      
      {cancelModalVisible && (
        <Modal 
            isOpen={cancelModalVisible} 
            onClose={() => setCancelModalVisible(false)} 
            title="Anular Asiento Contable"
            size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Por favor, ingrese el motivo de la anulación para el asiento seleccionado.</p>
            <textarea 
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Motivo de la anulación..."
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-red-500 focus:border-red-500"
            />
            <div className="flex justify-end space-x-2">
              <button 
                type="button"
                onClick={() => setCancelModalVisible(false)}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleCancelConfirm}
                disabled={!cancelReason.trim() || loading}
                className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md flex items-center text-sm font-medium shadow-sm disabled:opacity-50"
              >
                {loading ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Añadir mensaje informativo sobre períodos cerrados/inactivos */}
      <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-blue-500" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Los asientos contables de períodos cerrados o inactivos se pueden visualizar, 
              pero no se pueden editar, aprobar o anular para mantener la integridad contable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}