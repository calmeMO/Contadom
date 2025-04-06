import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase';
import { 
  Calendar, 
  Check, 
  ChevronDown, 
  ChevronRight, 
  Lock, 
  Unlock, 
  Plus,
  XCircle,
  AlertCircle,
  CalendarIcon,
  Eye,
  EyeOff,
  RefreshCw,
  ChevronUp
} from 'lucide-react';
import { 
  MonthlyPeriod,
  PeriodForm,
  createFiscalYear,
  fetchFiscalYears,
  closeFiscalYear,
  reopenFiscalYear,
  toggleFiscalYearActive,
  closeMonthlyPeriod,
  toggleMonthlyPeriodActive,
  initializeMonthlyPeriodsForFiscalYear
} from '../../services/accountingPeriodService';
import Modal from '../ui/Modal';
import Decimal from 'decimal.js';
import { FiscalYearType } from '../../types/database';

// Función para formatear fechas en formato español textual (1 de enero de 2023)
const formatDateSpanish = (dateString: string): string => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const day = date.getDate();
  const year = date.getFullYear();
  
  // Array de nombres de meses en español
  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  
  const month = monthNames[date.getMonth()];
  
  // Formato: "1 de enero de 2023"
  return `${day} de ${month} de ${year}`;
};

// Agregar interfaz para extender MonthlyPeriod con fiscal_year
interface EnhancedMonthlyPeriod extends MonthlyPeriod {
  fiscal_year?: {
    name: string;
    is_closed: boolean;
    is_active: boolean;
  };
}

// Definir nuestra interfaz local para FiscalYear
interface LocalFiscalYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  is_active: boolean;
  fiscal_year_type: FiscalYearType;
  monthly_periods?: MonthlyPeriod[]; // Lista de períodos mensuales
  has_monthly_periods?: boolean; // Indicador de si ya tiene períodos
  monthly_periods_count?: number;
}

export function FiscalYearSettings() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fiscalYears, setFiscalYears] = useState<LocalFiscalYear[]>([]);
  const [expandedYears, setExpandedYears] = useState<string[]>([]);
  const [processingYearId, setProcessingYearId] = useState<string | null>(null);
  const [processingPeriodId, setProcessingPeriodId] = useState<string | null>(null);
  const [allMonthlyPeriods, setAllMonthlyPeriods] = useState<EnhancedMonthlyPeriod[]>([]);
  
  // Modal para crear nuevo año fiscal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<PeriodForm>({
    name: '',
    start_date: '',
    end_date: '',
    notes: '',
    fiscal_year_type: 'calendar'
  });

  // Modal para reapertura de año fiscal
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [selectedYearForReopen, setSelectedYearForReopen] = useState<LocalFiscalYear | null>(null);

  // Estadísticas de períodos
  const [periodStats, setPeriodStats] = useState<Record<string, { count: number, balance: Decimal }>>({});
  
  const [companyFiscalYearType, setCompanyFiscalYearType] = useState<FiscalYearType | null>(null);
  
  useEffect(() => {
    getCurrentUser().then(() => {
      fetchData();
      fetchCompanySettings();
    });
  }, []);

  async function getCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      setUser(user?.user);
      
      // Obtener años fiscales con información de períodos mensuales
      const { data: fiscalYearsData, error } = await supabase
        .from('accounting_periods')
        .select(`
          *,
          monthly_periods:monthly_accounting_periods(count)
        `)
        .order('start_date', { ascending: false });
        
      if (error) throw error;
      
      // Procesar los datos para determinar si tienen períodos inicializados
      const processedData = fiscalYearsData.map(year => ({
        ...year,
        has_monthly_periods: year.monthly_periods && year.monthly_periods[0]?.count > 0,
        monthly_periods_count: year.monthly_periods ? year.monthly_periods[0]?.count : 0
      }));
      
      setFiscalYears(processedData);
      
      // Expandir automáticamente solo el año fiscal que tiene el período del mes actual
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1; // 1-12
      
      // Obtener períodos mensuales para todos los años
      const { data: allMonthlyPeriods, error: monthlyError } = await supabase
        .from('monthly_accounting_periods')
        .select('*, fiscal_year:fiscal_year_id(name, is_closed, is_active)')
        .order('start_date', { ascending: false });
        
      if (monthlyError) throw monthlyError;
      
      // Encontrar el período actual y su año fiscal
      const currentPeriod = allMonthlyPeriods?.find(period => {
        return period.year === currentYear && period.month === currentMonth;
      });
      
      if (currentPeriod) {
        // Expandir el año fiscal que contiene el período actual
        setExpandedYears([currentPeriod.fiscal_year_id]);
      } else if (processedData.length > 0) {
        // Si no hay un período actual, expandir el año fiscal más reciente
        setExpandedYears([processedData[0].id]);
      }
      
      // Cargar estadísticas para los períodos
      await loadPeriodStats(processedData);
      
      // Obtener todos los períodos mensuales (para la vista plana)
      setAllMonthlyPeriods(allMonthlyPeriods || []);
      
    } catch (error) {
      console.error('Error al cargar años fiscales:', error);
      toast.error('Error al cargar los años fiscales');
    } finally {
      setLoading(false);
    }
  }

  // Función para cargar estadísticas de períodos (número de asientos contables)
  async function loadPeriodStats(years: LocalFiscalYear[]) {
    try {
      // Obtener todos los períodos mensuales
      const { data: allPeriods, error: periodsError } = await supabase
        .from('monthly_accounting_periods')
        .select('id')
        .order('start_date', { ascending: false });
        
      if (periodsError) throw periodsError;
      
      const stats: Record<string, { count: number, balance: Decimal }> = {};
      
      // Inicializar todos los períodos con cero asientos
      if (allPeriods && allPeriods.length > 0) {
        allPeriods.forEach(period => {
          stats[period.id] = { count: 0, balance: new Decimal(0) };
        });
        
        // Obtener los datos de conteo
        const { data, error } = await supabase
          .from('journal_entries')
          .select('monthly_period_id');
          
        if (!error && data) {
          // Contar manualmente las entradas por período
          data.forEach(entry => {
            if (entry.monthly_period_id && stats[entry.monthly_period_id]) {
              stats[entry.monthly_period_id].count += 1;
            }
          });
        }
      }
      
      setPeriodStats(stats);
    } catch (error) {
      console.error('Error cargando estadísticas de períodos:', error);
      setPeriodStats({});
    }
  }

  const toggleYearExpansion = (yearId: string) => {
    setExpandedYears(prev => 
      prev.includes(yearId) 
        ? prev.filter(id => id !== yearId) 
        : [...prev, yearId]
    );
  };

  const handleCloseYear = async (year: LocalFiscalYear) => {
    if (!user?.id) {
      toast.error('Debes iniciar sesión para realizar esta acción');
      return;
    }
    
    try {
      setProcessingYearId(year.id);
      
      // Confirmar con el usuario
      if (!window.confirm(`¿Estás seguro de cerrar el año fiscal ${year.name} y todos sus períodos mensuales? Esta acción cerrará permanentemente todos los períodos mensuales que no estén cerrados.`)) {
        return;
      }
      
      // Cerrar año fiscal
      const { success, error } = await closeFiscalYear(year.id, user.id);
      
      if (!success) {
        throw new Error(error || 'Error al cerrar el año fiscal');
      }
      
      toast.success(`Año fiscal ${year.name} cerrado correctamente junto con sus períodos mensuales`);
      
      // Refrescar datos
      fetchData();
      
    } catch (error: any) {
      console.error('Error al cerrar año fiscal:', error);
      toast.error(`Error: ${error.message || 'No se pudo cerrar el año fiscal'}`);
    } finally {
      setProcessingYearId(null);
    }
  };

  const handleToggleYearActive = async (year: LocalFiscalYear, activate: boolean) => {
    if (!user?.id) {
      toast.error('Debes iniciar sesión para realizar esta acción');
      return;
    }
    
    try {
      setProcessingYearId(year.id);
      
      // Confirmar con el usuario
      if (!window.confirm(`¿Estás seguro de ${activate ? 'activar' : 'desactivar'} el año fiscal ${year.name} y ${activate ? 'el período del mes actual' : 'todos sus períodos mensuales'}?`)) {
        return;
      }
      
      // Activar/desactivar año fiscal
      const { success, error } = await toggleFiscalYearActive(year.id, activate, user.id);
      
      if (!success) {
        throw new Error(error || `Error al ${activate ? 'activar' : 'desactivar'} el año fiscal`);
      }
      
      toast.success(`Año fiscal ${year.name} ${activate ? 'activado' : 'desactivado'} correctamente junto con ${activate ? 'el período del mes actual' : 'sus períodos mensuales'}`);
      
      // Refrescar datos
      await fetchData();
      
      // Si se activó, verificar que solo se expande el período actual
      if (activate) {
        // Sólo asegurarse de que este año fiscal esté expandido
        if (!expandedYears.includes(year.id)) {
          setExpandedYears([...expandedYears, year.id]);
        }
      }
      
    } catch (error: any) {
      console.error(`Error al ${activate ? 'activar' : 'desactivar'} año fiscal:`, error);
      toast.error(`Error: ${error.message || `No se pudo ${activate ? 'activar' : 'desactivar'} el año fiscal`}`);
    } finally {
      setProcessingYearId(null);
    }
  };

  // Función para inicializar períodos mensuales de un año fiscal
  const handleInitializeMonthlyPeriods = async (fiscalYearId: string) => {
    if (!user?.id) {
      toast.error('Debes iniciar sesión para realizar esta acción');
      return;
    }

    try {
      setLoading(true);
      
      // Llamar al servicio para inicializar períodos mensuales
      const { success, error } = await initializeMonthlyPeriodsForFiscalYear(fiscalYearId, user.id);
      
      if (!success) {
        throw new Error(error);
      }
      
      // Refrescar datos para mostrar los nuevos períodos
      await fetchData();
      
      toast.success('Períodos mensuales inicializados correctamente');
    } catch (error) {
      console.error('Error al inicializar períodos mensuales:', error);
      toast.error('Error al inicializar los períodos mensuales');
    } finally {
      setLoading(false);
    }
  };

  // Función para cerrar un período mensual individual
  const handleClosePeriod = async (period: MonthlyPeriod) => {
    if (!user?.id || !period.id) {
      toast.error('Debes iniciar sesión para realizar esta acción');
      return;
    }
    
    try {
      setProcessingPeriodId(period.id);
      
      // Confirmar con el usuario
      if (!window.confirm(`¿Estás seguro de cerrar el período mensual ${period.name}? Esta acción impedirá registrar nuevos asientos contables en este período.`)) {
        return;
      }
      
      // Cerrar período mensual
      const { success, error } = await closeMonthlyPeriod(period.id, user.id);
      
      if (!success) {
        throw new Error(error || 'Error al cerrar el período mensual');
      }
      
      toast.success(`Período ${period.name} cerrado correctamente`);
      
      // Refrescar datos
      fetchData();
      
    } catch (error: any) {
      console.error('Error al cerrar período mensual:', error);
      toast.error(`Error: ${error.message || 'No se pudo cerrar el período mensual'}`);
    } finally {
      setProcessingPeriodId(null);
    }
  };

  // Función para activar/desactivar un período mensual individual
  const handleTogglePeriodActive = async (period: MonthlyPeriod, activate: boolean) => {
    if (!user?.id || !period.id) {
      toast.error('Debes iniciar sesión para realizar esta acción');
      return;
    }
    
    try {
      setProcessingPeriodId(period.id);
      
      // Verificar si el año fiscal está activo cuando intentamos activar un período
      if (activate) {
        // Buscar el año fiscal correspondiente al período
        const fiscalYear = fiscalYears.find(year => year.id === period.fiscal_year_id);
        
        if (!fiscalYear || !fiscalYear.is_active) {
          toast.error('No se puede activar un período mensual cuando su año fiscal está inactivo. Activa primero el año fiscal.');
          setProcessingPeriodId(null);
          return;
        }
      }
      
      // Confirmar con el usuario
      if (!window.confirm(`¿Estás seguro de ${activate ? 'activar' : 'desactivar'} el período mensual ${period.name}?`)) {
        setProcessingPeriodId(null);
        return;
      }
      
      // Activar/desactivar período mensual
      const { success, error } = await toggleMonthlyPeriodActive(period.id, activate, user.id);
      
      if (!success) {
        throw new Error(error || `Error al ${activate ? 'activar' : 'desactivar'} el período mensual`);
      }
      
      toast.success(`Período ${period.name} ${activate ? 'activado' : 'desactivado'} correctamente`);
      
      // Refrescar datos
      fetchData();
      
    } catch (error: any) {
      console.error(`Error al ${activate ? 'activar' : 'desactivar'} período mensual:`, error);
      toast.error(`Error: ${error.message || `No se pudo ${activate ? 'activar' : 'desactivar'} el período mensual`}`);
    } finally {
      setProcessingPeriodId(null);
    }
  };

  const handleReopenYearClick = (year: LocalFiscalYear) => {
    if (year.id) {
      setSelectedYearId(year.id);
      setReopenReason('');
      setShowReopenModal(true);
    }
  };
  
  const handleReopenYear = async () => {
    if (!user?.id || !selectedYearForReopen || !selectedYearForReopen.id || !reopenReason.trim()) {
      toast.error('Debes iniciar sesión y proporcionar un motivo para reabrir el año fiscal');
      return;
    }
    
    try {
      setProcessingYearId(selectedYearForReopen.id);
      
      // Reabrir año fiscal
      const { success, error } = await reopenFiscalYear(selectedYearForReopen.id, user.id, reopenReason);
      
      if (!success) {
        throw new Error(error || 'Error al reabrir el año fiscal');
      }
      
      toast.success('Año fiscal reabierto correctamente junto con sus períodos mensuales');
      
      // Cerrar modal y refrescar datos
      setShowReopenModal(false);
      setSelectedYearForReopen(null);
      fetchData();
      
    } catch (error: any) {
      console.error('Error al reabrir año fiscal:', error);
      toast.error(`Error: ${error.message || 'No se pudo reabrir el año fiscal'}`);
    } finally {
      setProcessingYearId(null);
    }
  };

  const handleCreateFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'fiscal_year_type') {
      // Al cambiar el tipo de año fiscal, ajustar fechas automáticamente
      const currentYear = new Date().getFullYear();
      let startDate = '';
      let endDate = '';
      let yearName = '';
      
      // Configurar fechas según el tipo de año fiscal
      switch (value) {
        case 'calendar':
          // Año calendario: 1 enero - 31 diciembre
          startDate = `${currentYear}-01-01`;
          endDate = `${currentYear}-12-31`;
          yearName = `Año Calendario ${currentYear}`;
          break;
        case 'fiscal_mar':
          // Año fiscal abril-marzo: 1 abril - 31 marzo del siguiente año
          startDate = `${currentYear}-04-01`;
          endDate = `${currentYear + 1}-03-31`;
          yearName = `Año Fiscal Abr ${currentYear} - Mar ${currentYear + 1}`;
          break;
        case 'fiscal_jun':
          // Año fiscal julio-junio: 1 julio - 30 junio del siguiente año
          startDate = `${currentYear}-07-01`;
          endDate = `${currentYear + 1}-06-30`;
          yearName = `Año Fiscal Jul ${currentYear} - Jun ${currentYear + 1}`;
          break;
        case 'fiscal_sep':
          // Año fiscal octubre-septiembre: 1 octubre - 30 septiembre del siguiente año
          startDate = `${currentYear}-10-01`;
          endDate = `${currentYear + 1}-09-30`;
          yearName = `Año Fiscal Oct ${currentYear} - Sep ${currentYear + 1}`;
          break;
      }
      
      // Actualizar formulario con fechas y tipo
      setFormData({
        ...formData,
        fiscal_year_type: value as FiscalYearType,
        start_date: startDate,
        end_date: endDate,
        name: yearName
      });
    } else {
      // Para otros campos, actualizar normalmente
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleSubmitCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.start_date || !formData.end_date) {
      toast.error('Por favor complete todos los campos requeridos');
      return;
    }
    
    try {
      setLoading(true);
      
      // Si existe un tipo de año fiscal configurado en la empresa, usar ese
      const effectiveFiscalYearType = companyFiscalYearType || formData.fiscal_year_type;
      
      // Verificar si ya existe un año fiscal con estas fechas o con fechas solapadas
      const { data: existingYears, error: checkError } = await supabase
        .from('accounting_periods')
        .select('id, name, start_date, end_date')
        .eq('is_month', false)
        .or(`start_date.lte.${formData.end_date},end_date.gte.${formData.start_date}`);
      
      if (checkError) {
        throw checkError;
      }
      
      // Verificar si hay solapamiento de fechas
      if (existingYears && existingYears.length > 0) {
        const overlappingYear = existingYears.find(year => {
          const yearStart = new Date(year.start_date);
          const yearEnd = new Date(year.end_date);
          const formStart = new Date(formData.start_date);
          const formEnd = new Date(formData.end_date);
          
          return (
            (formStart >= yearStart && formStart <= yearEnd) || // Inicio dentro del rango existente
            (formEnd >= yearStart && formEnd <= yearEnd) ||     // Fin dentro del rango existente
            (formStart <= yearStart && formEnd >= yearEnd)      // Rango existente dentro del nuevo rango
          );
        });
        
        if (overlappingYear) {
          toast.warning(`El período solicitado se solapa con "${overlappingYear.name}" (${formatDateSpanish(overlappingYear.start_date)} - ${formatDateSpanish(overlappingYear.end_date)})`);
          return;
        }
      }
      
      // Verificar que sea el período siguiente y no haya huecos
      if (fiscalYears.length > 0) {
        const sortedYears = [...fiscalYears].sort((a, b) => 
          new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
        );
        
        const lastFiscalYear = sortedYears[0];
        const lastEndDate = new Date(lastFiscalYear.end_date);
        const newStartDate = new Date(formData.start_date);
        
        // Calcular la diferencia en días
        const diffTime = Math.abs(newStartDate.getTime() - lastEndDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        // Si la diferencia es mayor a 1 día, hay un hueco
        if (diffDays > 1) {
          const confirmGap = window.confirm(
            `Hay un intervalo de ${diffDays - 1} días entre el último período fiscal y el nuevo. ` +
            `El último período termina el ${formatDateSpanish(lastFiscalYear.end_date)} y el nuevo comienza el ${formatDateSpanish(formData.start_date)}. ` +
            `¿Desea continuar de todos modos?`
          );
          
          if (!confirmGap) {
            setLoading(false);
            return;
          }
        }
        
        // Si la nueva fecha de inicio es anterior al fin del último período, es inválido
        if (newStartDate <= lastEndDate) {
          toast.error(`La fecha de inicio debe ser posterior al último período fiscal (${formatDateSpanish(lastFiscalYear.end_date)})`);
          return;
        }
      }
      
      // Insertar el año fiscal
      const { data, error } = await supabase
        .from('accounting_periods')
        .insert([
          {
            name: formData.name,
            start_date: formData.start_date,
            end_date: formData.end_date,
            period_type: 'yearly',
            is_month: false,
            is_closed: false,
            is_active: true,
            created_by: user?.id,
            notes: formData.notes || null,
            fiscal_year_type: effectiveFiscalYearType
          }
        ])
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      // Generar automáticamente los períodos mensuales
      if (data) {
        // Llamar al servicio para inicializar períodos mensuales
        await handleInitializeMonthlyPeriods(data.id);
        
        // Refrescar los datos
        fetchData();
        
        // Cerrar el modal y mostrar mensaje de éxito
        setShowCreateModal(false);
        toast.success('Año fiscal creado exitosamente');
      }
    } catch (error) {
      console.error('Error al crear año fiscal:', error);
      toast.error('Error al crear el año fiscal');
    } finally {
      setLoading(false);
    }
  };

  // Obtiene la configuración de la empresa para saber el tipo de año fiscal
  async function fetchCompanySettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('fiscal_year_type')
        .single();

      if (error) {
        console.error('Error al obtener configuración de la empresa:', error);
        return;
      }

      if (data && data.fiscal_year_type) {
        setCompanyFiscalYearType(data.fiscal_year_type as FiscalYearType);
      }
    } catch (error) {
      console.error('Error al obtener tipo de año fiscal de la empresa:', error);
    }
  }

  // Función para inicializar el formulario con valores apropiados
  const initializeFormData = (fiscalYearType: FiscalYearType = 'calendar') => {
    // Si hay un tipo de año fiscal definido en la empresa, usar ese
    const effectiveFiscalYearType = companyFiscalYearType || fiscalYearType;
    
    // Determinar el siguiente año fiscal basado en los existentes
    let nextFiscalYear = getNextFiscalYearDates(effectiveFiscalYearType);
    
    setFormData({
      name: nextFiscalYear.name,
      start_date: nextFiscalYear.startDate,
      end_date: nextFiscalYear.endDate,
      fiscal_year_type: effectiveFiscalYearType,
      notes: ''
    });
  };

  // Determina las fechas del siguiente año fiscal basado en los existentes
  const getNextFiscalYearDates = (fiscalYearType: FiscalYearType) => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    let yearName = '';
    
    // Si hay años fiscales existentes, calcular el siguiente
    if (fiscalYears.length > 0) {
      // Ordenar años fiscales por fecha de inicio, de más reciente a más antiguo
      const sortedYears = [...fiscalYears].sort((a, b) => 
        new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
      );
      
      const lastFiscalYear = sortedYears[0];
      
      // Calcular el siguiente año fiscal basado en el último
      if (lastFiscalYear) {
        const lastEndDate = new Date(lastFiscalYear.end_date);
        startDate = new Date(lastEndDate);
        startDate.setDate(startDate.getDate() + 1); // Día siguiente al último día del año fiscal anterior
        
        const startYear = startDate.getFullYear();
        
        // Determinar el inicio y fin basado en el tipo de año fiscal
        switch (fiscalYearType) {
          case 'calendar': // Enero a Diciembre
            // Ajustar al 1 de enero del año correspondiente
            startDate = new Date(startYear, 0, 1); // 1 de Enero
            endDate = new Date(startYear, 11, 31); // 31 de Diciembre
            break;
            
          case 'fiscal_mar': // Abril a Marzo
            // Ajustar al 1 de abril
            startDate = new Date(startYear, 3, 1); // 1 de Abril
            endDate = new Date(startYear + 1, 2, 31); // 31 de Marzo del año siguiente
            break;
            
          case 'fiscal_jun': // Julio a Junio
            // Ajustar al 1 de julio
            startDate = new Date(startYear, 6, 1); // 1 de Julio
            endDate = new Date(startYear + 1, 5, 30); // 30 de Junio del año siguiente
            break;
            
          case 'fiscal_sep': // Octubre a Septiembre
            // Ajustar al 1 de octubre
            startDate = new Date(startYear, 9, 1); // 1 de Octubre
            endDate = new Date(startYear + 1, 8, 30); // 30 de Septiembre del año siguiente
            break;
        }
      }
    } else {
      // Si no hay años fiscales, crear el primero según el tipo
      const currentYear = now.getFullYear();
      
      switch (fiscalYearType) {
        case 'calendar': // Enero a Diciembre
          startDate = new Date(currentYear, 0, 1); // 1 de Enero
          endDate = new Date(currentYear, 11, 31); // 31 de Diciembre
          break;
          
        case 'fiscal_mar': // Abril a Marzo
          startDate = new Date(currentYear, 3, 1); // 1 de Abril
          endDate = new Date(currentYear + 1, 2, 31); // 31 de Marzo del año siguiente
          break;
          
        case 'fiscal_jun': // Julio a Junio
          startDate = new Date(currentYear, 6, 1); // 1 de Julio
          endDate = new Date(currentYear + 1, 5, 30); // 30 de Junio del año siguiente
          break;
          
        case 'fiscal_sep': // Octubre a Septiembre
          startDate = new Date(currentYear, 9, 1); // 1 de Octubre
          endDate = new Date(currentYear + 1, 8, 30); // 30 de Septiembre del año siguiente
          break;
      }
    }
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Generar nombre para el año fiscal basado en el tipo y año
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    
    switch (fiscalYearType) {
      case 'calendar':
        yearName = `Año Fiscal ${startYear}`;
        break;
      case 'fiscal_mar':
        yearName = `Año Fiscal Abr ${startYear} - Mar ${endYear}`;
        break;
      case 'fiscal_jun':
        yearName = `Año Fiscal Jul ${startYear} - Jun ${endYear}`;
        break;
      case 'fiscal_sep':
        yearName = `Año Fiscal Oct ${startYear} - Sep ${endYear}`;
        break;
    }
    
    return {
      startDate: startDateStr,
      endDate: endDateStr,
      name: yearName
    };
  };

  // Renderizar períodos mensuales para un año fiscal
  const renderMonthlyPeriods = (fiscalYearId: string) => {
    const fiscalYear = fiscalYears.find(year => year.id === fiscalYearId);
    const periods = allMonthlyPeriods.filter(p => p.fiscal_year_id === fiscalYearId);
    
    if (periods.length === 0) {
      return (
        <div className="text-center py-4">
          <p className="text-gray-500">No hay períodos mensuales para este año fiscal.</p>
        </div>
      );
    }
    
    return (
      <div className="grid gap-2">
        {periods.map(period => (
          <div 
            key={period.id}
            className={`p-3 rounded-lg border ${
              period.is_active 
                ? 'border-green-500 bg-green-50' 
                : 'border-gray-300'
            } ${
              period.is_closed 
                ? 'opacity-70 bg-gray-100' 
                : ''
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-medium">{period.name}</h4>
                <p className="text-sm text-gray-500">
                  {formatDateSpanish(period.start_date)} - {formatDateSpanish(period.end_date)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {period.id && periodStats[period.id] 
                    ? `${periodStats[period.id].count} asientos contables` 
                    : '0 asientos contables'}
                </p>
              </div>
              <div className="flex flex-col space-y-2">
                <div className="flex space-x-2">
                  {period.is_closed ? (
                    <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">
                      Cerrado
                    </span>
                  ) : (
                    <span className={`px-2 py-1 ${period.is_active ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'} text-xs rounded-full`}>
                      {period.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  )}
                </div>
                
                {/* Mostrar botones solo cuando el período no está cerrado */}
                {!period.is_closed && (
                  <div className="flex space-x-2">
                    {!fiscalYear?.is_active ? (
                      <span className="text-xs text-gray-500 italic">El año fiscal está inactivo</span>
                    ) : (
                      <>
                        {period.is_active ? (
                          <button
                            onClick={() => handleTogglePeriodActive(period, false)}
                            disabled={processingPeriodId === period.id}
                            className="text-xs text-yellow-600 hover:text-yellow-800"
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleTogglePeriodActive(period, true)}
                            disabled={processingPeriodId === period.id}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Activar
                          </button>
                        )}
                        <button
                          onClick={() => handleClosePeriod(period)}
                          disabled={processingPeriodId === period.id}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Cerrar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading && fiscalYears.length === 0) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded max-w-md mb-6"></div>
        <div className="h-40 bg-gray-200 rounded mb-4"></div>
        <div className="h-40 bg-gray-200 rounded mb-4"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Años Fiscales y Períodos</h2>
        <div>
          <button
            onClick={() => {
              initializeFormData();
              setShowCreateModal(true);
            }}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuevo Año Fiscal
          </button>
        </div>
      </div>

      {/* Vista por años fiscales */}
      {fiscalYears.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay años fiscales configurados</h3>
            <p className="text-gray-500 mb-4">
              Crea un nuevo año fiscal para comenzar a gestionar tus períodos contables.
            </p>
            <button
              onClick={() => {
                initializeFormData();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Crear Año Fiscal
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {fiscalYears.map(year => (
            <div key={year.id} className="bg-white shadow rounded-lg overflow-hidden">
              <div 
                className={`px-4 py-3 flex justify-between items-center cursor-pointer ${
                  year.is_closed 
                    ? 'bg-gray-100' 
                    : year.is_active 
                      ? 'bg-green-50 border-l-4 border-green-500' 
                      : 'bg-gray-50'
                }`}
                onClick={() => toggleYearExpansion(year.id)}
              >
                <div className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5 text-gray-500" />
                  <div>
                    <h3 className="font-medium">{year.name}</h3>
                    <p className="text-sm text-gray-500">
                      {formatDateSpanish(year.start_date)} - {formatDateSpanish(year.end_date)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {year.is_closed ? (
                    <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">
                      Cerrado
                    </span>
                  ) : (
                    <span className={`px-2 py-1 ${year.is_active ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'} text-xs rounded-full`}>
                      {year.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  )}
                  
                  {expandedYears.includes(year.id) ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
              </div>
              
              {expandedYears.includes(year.id) && (
                <div className="p-4 shadow rounded-lg bg-white border border-gray-200">
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {!year.is_closed && (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Estás seguro de ${year.is_active ? 'desactivar' : 'activar'} el año fiscal ${year.name}?`)) {
                              handleToggleYearActive(year, !year.is_active);
                            }
                          }}
                          disabled={processingYearId === year.id}
                          className={`px-4 py-2 text-sm font-medium rounded-md text-white ${
                            year.is_active 
                              ? 'bg-yellow-500 hover:bg-yellow-700' 
                              : 'bg-green-500 hover:bg-green-700'
                          } disabled:opacity-50`}
                        >
                          {year.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                      
                      {!year.is_closed && (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Estás seguro de cerrar el año fiscal ${year.name}? Esta acción cerrará todos los períodos mensuales asociados y no podrás registrar nuevos asientos.`)) {
                              handleCloseYear(year);
                            }
                          }}
                          disabled={processingYearId === year.id}
                          className="px-4 py-2 text-sm font-medium rounded-md text-white bg-red-500 hover:bg-red-700 disabled:opacity-50"
                        >
                          Cerrar Año Fiscal
                        </button>
                      )}
                      
                      {year.is_closed && (
                        <button
                          onClick={() => {
                            setSelectedYearForReopen(year);
                            setReopenReason('');
                            setShowReopenModal(true);
                          }}
                          disabled={processingYearId === year.id}
                          className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-700 disabled:opacity-50"
                        >
                          Reabrir Año Fiscal
                        </button>
                      )}
                    </div>
                    
                    {!year.has_monthly_periods && !loading ? (
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleInitializeMonthlyPeriods(year.id)}
                          disabled={processingYearId === year.id}
                          className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-700 disabled:opacity-50"
                        >
                          Inicializar Períodos Mensuales
                        </button>
                      </div>
                    ) : (
                      renderMonthlyPeriods(year.id)
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal para crear año fiscal */}
      <Modal
        title="Crear Nuevo Año Fiscal"
        onClose={() => setShowCreateModal(false)}
        isOpen={showCreateModal}
      >
        <form onSubmit={handleSubmitCreateForm} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-md">
            <p className="text-xs text-blue-700">
              <strong>Nota:</strong> Las fechas se establecen automáticamente según el tipo de año fiscal seleccionado.
            </p>
          </div>
        
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nombre del Año Fiscal
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleCreateFormChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          
          <div>
            <label htmlFor="fiscal_year_type" className="block text-sm font-medium text-gray-700">
              Tipo de Año Fiscal
            </label>
            <select
              id="fiscal_year_type"
              name="fiscal_year_type"
              required
              value={formData.fiscal_year_type}
              onChange={handleCreateFormChange}
              disabled={!!companyFiscalYearType}
              className={`mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${!!companyFiscalYearType ? 'bg-gray-50' : ''}`}
            >
              <option value="calendar">Año Calendario (Ene-Dic)</option>
              <option value="fiscal_mar">Año Fiscal (Abr-Mar)</option>
              <option value="fiscal_jun">Año Fiscal (Jul-Jun)</option>
              <option value="fiscal_sep">Año Fiscal (Oct-Sep)</option>
            </select>
            {!!companyFiscalYearType && (
              <p className="mt-1 text-xs text-amber-600">
                El tipo de año fiscal debe coincidir con el configurado en la empresa y no puede modificarse.
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formData.fiscal_year_type === 'calendar' && 'Período: Enero a Diciembre (1 de enero - 31 de diciembre)'}
              {formData.fiscal_year_type === 'fiscal_mar' && 'Período: Abril a Marzo (1 de abril - 31 de marzo del año siguiente)'}
              {formData.fiscal_year_type === 'fiscal_jun' && 'Período: Julio a Junio (1 de julio - 30 de junio del año siguiente)'}
              {formData.fiscal_year_type === 'fiscal_sep' && 'Período: Octubre a Septiembre (1 de octubre - 30 de septiembre del año siguiente)'}
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
                Fecha de Inicio
              </label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                required
                value={formData.start_date}
                onChange={handleCreateFormChange}
                disabled={true}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-500">
                {formData.start_date && formatDateSpanish(formData.start_date)}
              </p>
            </div>
            
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">
                Fecha de Fin
              </label>
              <input
                type="date"
                id="end_date"
                name="end_date"
                required
                value={formData.end_date}
                onChange={handleCreateFormChange}
                disabled={true}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-500">
                {formData.end_date && formatDateSpanish(formData.end_date)}
              </p>
            </div>
          </div>
          
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notas (opcional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              value={formData.notes}
              onChange={handleCreateFormChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Notas adicionales"
            />
          </div>
          
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 mr-2 text-sm font-medium rounded-md text-gray-800 bg-gray-300 hover:bg-gray-400 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!formData.name || !formData.start_date || !formData.end_date || loading}
              className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-700 disabled:opacity-50"
            >
              Crear Año Fiscal
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal para reabrir año fiscal */}
      <Modal
        title="Reabrir Año Fiscal"
        onClose={() => setShowReopenModal(false)}
        isOpen={showReopenModal}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-md">
            <div className="flex">
              <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5" />
              <div className="ml-2">
                <p className="text-xs text-yellow-700">
                  Esta acción excepcional quedará registrada en el sistema.
                </p>
              </div>
            </div>
          </div>
          
          <div>
            <label htmlFor="reopen_reason" className="block text-sm font-medium text-gray-700">
              Motivo de Reapertura (requerido)
            </label>
            <textarea
              id="reopen_reason"
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Explique el motivo por el que necesita reabrir este año fiscal"
              required
            />
          </div>
          
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => {
                setShowReopenModal(false);
                setSelectedYearForReopen(null);
              }}
              className="px-4 py-2 mr-2 text-sm font-medium rounded-md text-gray-800 bg-gray-300 hover:bg-gray-400 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (selectedYearForReopen && selectedYearForReopen.id) {
                  handleReopenYear();
                }
              }}
              disabled={!reopenReason.trim() || processingYearId !== null}
              className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-700 disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
} 