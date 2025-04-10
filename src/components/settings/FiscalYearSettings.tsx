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
  ChevronUp,
  LifeBuoy
} from 'lucide-react';
import { 
  MonthlyPeriod,
  PeriodForm,
  createFiscalYear,
  fetchFiscalYears,
  closeFiscalYear,
  toggleFiscalYearActive,
  closeMonthlyPeriod,
  toggleMonthlyPeriodActive,
  initializeMonthlyPeriodsForFiscalYear
} from '../../services/accountingPeriodService';
import Modal from '../ui/Modal';
import Decimal from 'decimal.js';
import { FiscalYearType } from '../../types/database';
import { formatSafeDate } from '../../utils/formatters';

// Función para formatear fechas en formato español textual (1 de enero de 2023)
const formatDateSpanish = (dateString: string): string => {
  if (!dateString) return '';
  
  // Crear la fecha y ajustar la zona horaria
  // Parseamos la fecha asegurándonos que se interpreta como UTC
  const dateParts = dateString.split('T')[0].split('-');
  if (dateParts.length !== 3) return '';
  
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]) - 1; // Meses en JS son 0-11
  const day = parseInt(dateParts[2]);
  
  const date = new Date(year, month, day);
  
  // Array de nombres de meses en español
  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  
  // Formato: "1 de enero de 2023"
  return `${date.getDate()} de ${monthNames[date.getMonth()]} de ${date.getFullYear()}`;
};

// Agregar interfaz para extender MonthlyPeriod con fiscal_year
interface EnhancedMonthlyPeriod extends Omit<MonthlyPeriod, 'fiscal_year'> {
  fiscal_year?: {
    name: string;
    is_closed: boolean;
    is_active: boolean;
  };
  fiscal_year_id: string;
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

  // Modal para soporte
  const [showSupportModal, setShowSupportModal] = useState(false);
  
  // Estadísticas de períodos
  const [periodStats, setPeriodStats] = useState<Record<string, { count: number, balance: Decimal }>>({});
  
  const [companyFiscalYearType, setCompanyFiscalYearType] = useState<FiscalYearType | null>(null);
  
  useEffect(() => {
    getCurrentUser().then(() => {
      fetchData();
      fetchCompanySettings();
    });
  }, []);

  // Asegurar que el scroll esté siempre disponible
  useEffect(() => {
    // Forzar el scroll a estar disponible siempre
    document.body.style.overflowY = 'scroll';
    
    return () => {
      // Restaurar el comportamiento por defecto cuando el componente se desmonte
      document.body.style.overflowY = '';
    };
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
      
      // Obtener períodos mensuales para todos los años (pero sin desplegar automáticamente)
      const { data: allMonthlyPeriods, error: monthlyError } = await supabase
        .from('monthly_accounting_periods')
        .select('*, fiscal_year:fiscal_year_id(name, is_closed, is_active)')
        .order('start_date', { ascending: false });
        
      if (monthlyError) throw monthlyError;
      
      // No expandir automáticamente ningún año fiscal cuando se carga la página
      // Solo mantener los que ya estaban expandidos (si los hay)
      
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

  // Función para restaurar el scroll en caso de que esté bloqueado
  const ensureScrollIsEnabled = () => {
    // Forzar un reflow para asegurar que los cambios se aplican correctamente
    setTimeout(() => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('overflow');
    }, 50);
  };

  const toggleYearExpansion = (yearId: string) => {
    // Guardar la posición actual del scroll antes de expandir
    const scrollPosition = window.scrollY;
    
    setExpandedYears(prev => 
      prev.includes(yearId) 
        ? prev.filter(id => id !== yearId) 
        : [...prev, yearId]
    );
    
    // Restaurar la posición del scroll después de que el DOM se actualice
    setTimeout(() => {
      window.scrollTo({
        top: scrollPosition,
        behavior: 'instant'
      });
      
      // Asegurar que el scroll esté habilitado
      ensureScrollIsEnabled();
    }, 10);
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
      
      // Obtener los datos del año fiscal para trabajar con las fechas
      const { data: fiscalYear, error: yearError } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('id', fiscalYearId)
        .single();
        
      if (yearError || !fiscalYear) {
        throw new Error('No se pudo obtener la información del año fiscal');
      }
      
      // Imprimir información de depuración
      console.log('Inicializando períodos mensuales para:', {
        id: fiscalYearId,
        nombre: fiscalYear.name,
        inicio: fiscalYear.start_date,
        fin: fiscalYear.end_date,
        tipo: fiscalYear.fiscal_year_type
      });
      
      // Llamar al servicio para inicializar períodos mensuales
      const { success, error, data: createdPeriods } = await initializeMonthlyPeriodsForFiscalYear(fiscalYearId, user.id);
      
      if (!success) {
        throw new Error(error);
      }
      
      // Registrar los períodos creados para depuración
      if (createdPeriods && createdPeriods.length > 0) {
        console.log(`Se crearon ${createdPeriods.length} períodos mensuales`);
        console.log('Primer período:', {
          nombre: createdPeriods[0].name,
          inicio: createdPeriods[0].start_date,
          fin: createdPeriods[0].end_date
        });
        console.log('Último período:', {
          nombre: createdPeriods[createdPeriods.length - 1].name,
          inicio: createdPeriods[createdPeriods.length - 1].start_date,
          fin: createdPeriods[createdPeriods.length - 1].end_date
        });
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
  const handleClosePeriod = async (period: EnhancedMonthlyPeriod) => {
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
  const handleTogglePeriodActive = async (period: EnhancedMonthlyPeriod, activate: boolean) => {
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

  const handleCreateFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Si cambia el tipo de año fiscal, actualizar automáticamente las fechas y el nombre
    if (name === 'fiscal_year_type') {
      const currentYear = new Date().getFullYear();
      let startDate, endDate, periodName = '';
      
      // Crear fechas sin dependencia de zona horaria
      const createLocalDate = (year: number, month: number, day: number) => {
        // Formatea la fecha en formato ISO pero con fecha local, sin componente de hora
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      };
      
      switch (value) {
        case 'calendar':
          // Año calendario: 1 de enero al 31 de diciembre
          startDate = createLocalDate(currentYear, 0, 1);
          endDate = createLocalDate(currentYear, 11, 31);
          periodName = `Año Calendario ${currentYear}`;
          break;
        case 'fiscal_mar':
          // Año fiscal abril-marzo: 1 de abril al 31 de marzo del siguiente año
          startDate = createLocalDate(currentYear, 3, 1);
          endDate = createLocalDate(currentYear + 1, 2, 31);
          periodName = `Año Fiscal Abr ${currentYear} - Mar ${currentYear + 1}`;
          break;
        case 'fiscal_jun':
          // Año fiscal julio-junio: 1 de julio al 30 de junio del siguiente año
          startDate = createLocalDate(currentYear, 6, 1);
          endDate = createLocalDate(currentYear + 1, 5, 30);
          periodName = `Año Fiscal Jul ${currentYear} - Jun ${currentYear + 1}`;
          break;
        case 'fiscal_sep':
          // Año fiscal octubre-septiembre: 1 de octubre al 30 de septiembre del siguiente año
          startDate = createLocalDate(currentYear, 9, 1);
          endDate = createLocalDate(currentYear + 1, 8, 30);
          periodName = `Año Fiscal Oct ${currentYear} - Sep ${currentYear + 1}`;
          break;
        default:
          // Valor por defecto: año calendario
          startDate = createLocalDate(currentYear, 0, 1);
          endDate = createLocalDate(currentYear, 11, 31);
          periodName = `Año Calendario ${currentYear}`;
      }
      
      console.log('Fechas generadas:', {
        tipo: value,
        nombre: periodName,
        inicio: startDate,
        fin: endDate
      });
      
      setFormData({
        ...formData,
        [name]: value as FiscalYearType,
        name: periodName,
        start_date: startDate,
        end_date: endDate
      });
    } else {
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
      
      console.log('Formulario a enviar:', {
        nombre: formData.name,
        inicio: formData.start_date,
        fin: formData.end_date,
        tipo: effectiveFiscalYearType
      });
      
      // Verificar si ya existe un año fiscal con estas fechas o con fechas solapadas
      const { data: existingYears, error: checkError } = await supabase
        .from('accounting_periods')
        .select('id, name, start_date, end_date, is_month')
        .eq('is_month', false)
        .or(`start_date.lte.${formData.end_date},end_date.gte.${formData.start_date}`);
      
      if (checkError) {
        throw checkError;
      }
      
      // Verificar si hay solapamiento de fechas
      if (existingYears && existingYears.length > 0) {
        const overlappingYear = existingYears.find(year => {
          if (year.is_month) return false; // Ignorar períodos mensuales
          
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
          setLoading(false);
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
        // Cerrar el modal antes de realizar operaciones adicionales
        handleCloseCreateModal();
        
        // Pequeño retraso para asegurar que el DOM se actualiza y se restaura el scroll
        setTimeout(async () => {
          // Llamar al servicio para inicializar períodos mensuales
          await handleInitializeMonthlyPeriods(data.id);
          
          // Refrescar los datos (sin expandir automáticamente el nuevo año fiscal)
          await fetchData();
          
          // Asegurar que el scroll está disponible
          ensureScrollIsEnabled();
          
          toast.success('Año fiscal creado exitosamente');
        }, 100);
      }
    } catch (error) {
      console.error('Error al crear año fiscal:', error);
      toast.error('Error al crear el año fiscal');
      
      // Asegurar que el scroll se restaura incluso en caso de error
      ensureScrollIsEnabled();
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
        // Si hay un error, asumimos que el tipo fiscal no está configurado
        setCompanyFiscalYearType(null);
        return;
      }

      if (data && data.fiscal_year_type) {
        setCompanyFiscalYearType(data.fiscal_year_type as FiscalYearType);
      } else {
        setCompanyFiscalYearType(null);
      }
    } catch (error) {
      console.error('Error al obtener tipo de año fiscal de la empresa:', error);
      setCompanyFiscalYearType(null);
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
        const nextStartYear = lastEndDate.getFullYear() + (fiscalYearType === 'calendar' ? 1 : 0);
        
        // Determinar el inicio y fin basado en el tipo de año fiscal
        switch (fiscalYearType) {
          case 'calendar': // Enero a Diciembre
            startDate = new Date(nextStartYear, 0, 1); // 1 de Enero
            endDate = new Date(nextStartYear, 11, 31); // 31 de Diciembre
            break;
            
          case 'fiscal_mar': // Abril a Marzo
            startDate = new Date(nextStartYear, 3, 1); // 1 de Abril
            endDate = new Date(nextStartYear + 1, 2, 31); // 31 de Marzo del año siguiente
            break;
            
          case 'fiscal_jun': // Julio a Junio
            startDate = new Date(nextStartYear, 6, 1); // 1 de Julio
            endDate = new Date(nextStartYear + 1, 5, 30); // 30 de Junio del año siguiente
            break;
            
          case 'fiscal_sep': // Octubre a Septiembre
            startDate = new Date(nextStartYear, 9, 1); // 1 de Octubre
            endDate = new Date(nextStartYear + 1, 8, 30); // 30 de Septiembre del año siguiente
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
        yearName = `Año Calendario ${startYear}`;
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
      <div className="w-full">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Período
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fechas
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Asientos
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {periods.map(period => (
              <tr key={period.id} className={`${
                period.is_active 
                  ? 'bg-green-50' 
                  : ''
              } ${
                period.is_closed 
                  ? 'bg-gray-100' 
                  : ''
              } hover:bg-gray-50 transition-colors`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{period.name}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {formatDateSpanish(period.start_date)} - {formatDateSpanish(period.end_date)}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {period.id && periodStats[period.id] 
                      ? `${periodStats[period.id].count}` 
                      : '0'}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {period.is_closed ? (
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-200 text-gray-800">
                      Cerrado
                    </span>
                  ) : (
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      period.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {period.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    {!period.is_closed && !fiscalYear?.is_closed && (
                      <>
                        {!fiscalYear?.is_active ? (
                          <span className="text-xs text-gray-500 italic">Año inactivo</span>
                        ) : (
                          <>
                            {period.is_active ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePeriodActive(period, false);
                                }}
                                disabled={processingPeriodId === period.id}
                                className="text-yellow-600 hover:text-yellow-900 ml-2 px-2 py-1 text-xs rounded hover:bg-yellow-50 transition-colors"
                              >
                                Desactivar
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePeriodActive(period, true);
                                }}
                                disabled={processingPeriodId === period.id}
                                className="text-green-600 hover:text-green-900 ml-2 px-2 py-1 text-xs rounded hover:bg-green-50 transition-colors"
                              >
                                Activar
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClosePeriod(period);
                              }}
                              disabled={processingPeriodId === period.id}
                              className="text-red-600 hover:text-red-900 ml-2 px-2 py-1 text-xs rounded hover:bg-red-50 transition-colors"
                            >
                              Cerrar
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Controlar la apertura del modal de creación
  const handleOpenCreateModal = () => {
    initializeFormData();
    setShowCreateModal(true);
  };

  // Controlar el cierre del modal de creación
  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    ensureScrollIsEnabled();
  };

  // Controlar la apertura del modal de soporte
  const handleOpenSupportModal = () => {
    setShowSupportModal(true);
  };

  // Controlar el cierre del modal de soporte
  const handleCloseSupportModal = () => {
    setShowSupportModal(false);
    ensureScrollIsEnabled();
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
    <div className="space-y-6 pb-20 min-h-[100vh]">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Años Fiscales y Períodos</h2>
        <div className="flex space-x-2">
          <button
            onClick={handleOpenSupportModal}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <LifeBuoy className="mr-1 h-4 w-4" />
            Soporte
          </button>
          <button
            onClick={handleOpenCreateModal}
            disabled={!companyFiscalYearType}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuevo Año Fiscal
          </button>
        </div>
      </div>

      {/* Mensaje informativo cuando no hay tipo de año fiscal configurado */}
      {!companyFiscalYearType && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                No se puede crear un año fiscal hasta que se defina el tipo de año fiscal en la configuración de la empresa.
                Por favor, configure el tipo de año fiscal en la sección de Configuración de la Empresa.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mensaje informativo sobre períodos cerrados */}
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Los años fiscales y períodos mensuales que han sido cerrados no pueden reabrirse por motivos 
              de integridad contable. Para situaciones excepcionales, contacte con el equipo de soporte.
            </p>
          </div>
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
              onClick={handleOpenCreateModal}
              disabled={!companyFiscalYearType}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Plus className="mr-2 h-4 w-4" />
              Crear Año Fiscal
            </button>
            {!companyFiscalYearType && (
              <p className="text-xs text-yellow-600 mt-2">
                Primero debe configurar el tipo de año fiscal en la configuración de la empresa.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Año Fiscal
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Fechas
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Estado
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {fiscalYears.map(year => (
                    <React.Fragment key={year.id}>
                      <tr className={`${
                        year.is_closed 
                          ? 'bg-gray-50' 
                          : year.is_active 
                            ? 'bg-green-50' 
                            : ''
                      }`}>
                        <td 
                          className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 cursor-pointer"
                          onClick={() => toggleYearExpansion(year.id)}
                        >
                          <div className="flex items-center">
                            {expandedYears.includes(year.id) ? (
                              <ChevronDown className="h-5 w-5 text-gray-500 mr-2" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-500 mr-2" />
                            )}
                            <span>{year.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDateSpanish(year.start_date)} - {formatDateSpanish(year.end_date)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {year.is_closed ? (
                            <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800">
                              Cerrado
                            </span>
                          ) : (
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              year.is_active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {year.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">
                          <div className="flex justify-end space-x-1">
                            {!year.is_closed ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Evitar expandir/colapsar
                                    handleToggleYearActive(year, !year.is_active);
                                  }}
                                  disabled={processingYearId === year.id}
                                  className={`px-2 py-1 text-xs font-medium rounded ${
                                    year.is_active 
                                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                                  } disabled:opacity-50`}
                                >
                                  {year.is_active ? 'Desactivar' : 'Activar'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Evitar expandir/colapsar
                                    handleCloseYear(year);
                                  }}
                                  disabled={processingYearId === year.id}
                                  className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50"
                                >
                                  Cerrar
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenSupportModal();
                                }}
                                className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 hover:bg-blue-200"
                              >
                                Contactar Soporte
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      
                      {expandedYears.includes(year.id) && (
                        <tr>
                          <td colSpan={4} className="p-0">
                            <div className="border-t border-gray-200 px-4 py-4 bg-gray-50">
                              {!year.has_monthly_periods && !loading ? (
                                <div className="text-center py-4">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInitializeMonthlyPeriods(year.id);
                                    }}
                                    disabled={processingYearId === year.id || year.is_closed}
                                    className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    Inicializar Períodos Mensuales
                                  </button>
                                </div>
                              ) : (
                                renderMonthlyPeriods(year.id)
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal para crear año fiscal */}
      <Modal
        title="Crear Nuevo Año Fiscal"
        onClose={handleCloseCreateModal}
        isOpen={showCreateModal}
      >
        <form onSubmit={handleSubmitCreateForm} className="space-y-4">
          {/* Tipo de año fiscal */}
          <div className="mb-4">
            <label htmlFor="fiscal_year_type" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de año fiscal
            </label>
            <select
              id="fiscal_year_type"
              name="fiscal_year_type"
              value={formData.fiscal_year_type}
              onChange={handleCreateFormChange}
              disabled={!!companyFiscalYearType}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="calendar">Año Calendario (Ene - Dic)</option>
              <option value="fiscal_mar">Año Fiscal (Abr - Mar)</option>
              <option value="fiscal_jun">Año Fiscal (Jul - Jun)</option>
              <option value="fiscal_sep">Año Fiscal (Oct - Sep)</option>
            </select>
            {companyFiscalYearType && (
              <p className="text-sm text-gray-500 mt-1">
                El tipo de año fiscal está configurado según la configuración de la empresa.
              </p>
            )}
          </div>

          {/* Nombre del año fiscal */}
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del período fiscal <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              id="name"
              value={formData.name}
              onChange={handleCreateFormChange}
              required
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
            <p className="text-sm text-gray-500 mt-1">
              El nombre se genera automáticamente según el tipo de año fiscal, pero puede modificarlo si lo desea.
            </p>
          </div>

          {/* Campos ocultos para las fechas que se generan automáticamente */}
          <input
            type="hidden"
            name="start_date"
            id="start_date"
            value={formData.start_date}
          />
          <input
            type="hidden"
            name="end_date"
            id="end_date"
            value={formData.end_date}
          />

          {/* Nota o descripción opcional */}
          <div className="mb-4">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notas o descripción (opcional)
            </label>
            <textarea
              name="notes"
              id="notes"
              rows={3}
              value={formData.notes || ''}
              onChange={handleCreateFormChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>

          {/* Acciones del formulario */}
          <div className="flex justify-end mt-6 space-x-3">
            <button
              type="button"
              onClick={handleCloseCreateModal}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear año fiscal'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal para contactar a soporte */}
      <Modal
        title="Contactar a Soporte"
        onClose={handleCloseSupportModal}
        isOpen={showSupportModal}
      >
        <div className="space-y-4 p-2">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <LifeBuoy className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Información importante</h3>
                <p className="text-sm text-blue-700 mt-2">
                  Por motivos de integridad contable y cumplimiento con las normativas fiscales, 
                  los años fiscales y períodos mensuales que han sido cerrados no pueden reabrirse 
                  desde la interfaz del sistema.
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  Para situaciones excepcionales donde sea estrictamente necesario realizar modificaciones 
                  en períodos cerrados, por favor contacte directamente con nuestro equipo de soporte:
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 border border-gray-200 rounded-md">
            <h4 className="text-base font-medium text-gray-800 mb-2">Canales de soporte</h4>
            <ul className="space-y-3">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">•</span>
                <span className="text-sm text-gray-600">
                  <strong>Email:</strong> soporte@contadom.com
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">•</span>
                <span className="text-sm text-gray-600">
                  <strong>Teléfono:</strong> +1 (809) 555-1234
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">•</span>
                <span className="text-sm text-gray-600">
                  <strong>Horario:</strong> Lunes a Viernes, 8:00 AM - 6:00 PM
                </span>
              </li>
            </ul>
          </div>
          
          <div className="mt-6 text-sm text-gray-500">
            <p>
              Recuerde que cualquier modificación en períodos cerrados debe estar debidamente justificada 
              y documentada de acuerdo con las normativas contables aplicables.
            </p>
          </div>
          
          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={handleCloseSupportModal}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Entendido
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
} 