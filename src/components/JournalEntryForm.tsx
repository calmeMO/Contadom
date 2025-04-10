import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { 
  Plus, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Save, 
  Info
} from 'lucide-react';
import { 
  validateBalance, 
  createJournalEntry, 
  updateJournalEntry,
  JournalEntryForm as JournalFormData,
  JournalEntryItem,
  AdjustmentType
} from '../services/journalService';
import { getAvailablePeriodsForEntry, validateJournalEntryDate } from '../services/accountingPeriodService';
import Decimal from 'decimal.js';
import WarningModal from './ui/WarningModal';

// Constantes para configuración global
const DECIMAL_PRECISION = 2;
const BALANCE_TOLERANCE = 0.01;

// Lista de tipos de ajuste para el dropdown
const adjustmentTypes: { value: AdjustmentType; label: string }[] = [
  { value: 'depreciation', label: 'Depreciación' },
  { value: 'amortization', label: 'Amortización' },
  { value: 'accrual', label: 'Devengo' },
  { value: 'deferred', label: 'Diferido' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'correction', label: 'Corrección de Error' },
  { value: 'provision', label: 'Provisión' },
  { value: 'valuation', label: 'Valoración' },
  { value: 'other', label: 'Otro' },
];

// Props del componente actualizadas
interface JournalEntryFormProps {
  mode: 'create' | 'edit' | 'view' | 'create-adjustment' | 'edit-adjustment';
  entryId?: string;
  entry?: any;
  entryItems?: any[];
  accounts: any[];
  onFinish: (id: string | null) => void;
  onCancel: () => void;
  loading?: boolean;
}

// Estructura del formulario actualizada para incluir campos de ajuste
interface FormData extends JournalFormData {
  is_adjustment: boolean;
  adjustment_type: AdjustmentType | null;
  adjusted_entry_id: string | null;
}

// Primero, vamos a añadir la estructura necesaria para agrupar cuentas
interface AccountOption {
  id: string;
  code: string;
  name: string;
  fullName: string; // Para el dropdown: "código - nombre"
  isParent: boolean;
  type: string;
  nature: string;
  parentId: string | null;
  level: number;
  children?: AccountOption[];
}

// Mover las funciones auxiliares de jerarquía aquí, fuera y antes del componente
// si no dependen de props o estado, o dentro pero antes de su uso si sí dependen.
// En este caso, solo dependen de flatAccounts, que se pasa como argumento.

// Función para construir la jerarquía
const buildAccountHierarchy = (flatAccounts: any[]): AccountOption[] => {
  const accountMap = new Map<string, AccountOption>();
  const roots: AccountOption[] = [];

  flatAccounts.forEach(acc => {
      accountMap.set(acc.id, { 
          ...acc, 
          children: [], 
          level: 0, 
          fullName: `${acc.code} - ${acc.name}`,
          isParent: acc.is_parent
      });
  });

  flatAccounts.forEach(acc => {
      const account = accountMap.get(acc.id)!;
      if (acc.parent_id && accountMap.has(acc.parent_id)) {
          const parent = accountMap.get(acc.parent_id)!;
          // Asegurarse de que parent.children exista antes de hacer push
          parent.children = parent.children || []; 
          parent.children!.push(account);
          account.level = parent.level + 1; 
      } else {
          roots.push(account); 
      }
  });
  
  return sortAccounts(roots);
};

// Función para ordenar cuentas
const sortAccounts = (accounts: AccountOption[]): AccountOption[] => {
    accounts.sort((a, b) => a.code.localeCompare(b.code));
    accounts.forEach(acc => {
        if (acc.children && acc.children.length > 0) {
            sortAccounts(acc.children);
        }
    });
    return accounts;
};

// Definir la interfaz FormErrors
interface FormErrors {
  [key: string]: string | undefined;
}

// Función para validar si una fecha es hoy
const isToday = (date: Date) => {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

// Función para formatear fecha en formato español DD/MM/YYYY
const formatDateEs = (dateStr: string) => {
  try {
    if (!dateStr) return '';
    // Si ya es un objeto Date, usarlo directamente
    const date = typeof dateStr === 'object' ? dateStr : parseISO(dateStr);
    if (!isValid(date)) throw new Error('Fecha inválida');
    
    // Asegurar que no haya problema de zona horaria
    // Al crear una nueva fecha usando directamente los componentes de la fecha
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const localDate = new Date(year, month, day);
    
    return format(localDate, 'dd/MM/yyyy', { locale: es });
  } catch (error) {
    console.error('Error al formatear fecha:', error);
    return dateStr;
  }
};

// Función para obtener el primer día de un período mensual
const getFirstDayOfPeriod = (period: any): Date => {
  if (!period || !period.start_date) return new Date();
  
  // Extraer solo la parte de la fecha (YYYY-MM-DD) y crear una nueva fecha a medianoche
  const dateStr = period.start_date.split('T')[0];
  const date = new Date(dateStr);
  return date;
};

export default function JournalEntryForm({
  mode,
  entryId,
  entry,
  entryItems,
  accounts: flatAccounts,
  onFinish,
  onCancel,
  loading: externalLoading
}: JournalEntryFormProps) {
  // Determinar si estamos en modo ajuste
  const isAdjustmentMode = mode === 'create-adjustment' || mode === 'edit-adjustment';
  // Determinar si es modo vista
  const isViewMode = mode === 'view';
  // Determinar si es modo edición (regular o ajuste)
  const isEditMode = mode === 'edit' || mode === 'edit-adjustment';

  // Estados
  const [formData, setFormData] = useState<FormData>(() => ({
    date: '',
    description: '', 
    monthly_period_id: '',
    notes: '',
    reference_number: '',
    reference_date: undefined,
    is_adjustment: isAdjustmentMode,
    adjustment_type: null,
    adjusted_entry_id: null,
  }));
  
  const [items, setItems] = useState<JournalEntryItem[]>([]);
  const [totalDebit, setTotalDebit] = useState<number>(0);
  const [totalCredit, setTotalCredit] = useState<number>(0);
  const [isBalanced, setIsBalanced] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [monthlyPeriods, setMonthlyPeriods] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  
  // Añadir estado para errores del formulario
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  
  // Estado para el modal de advertencia de período anterior
  const [showPeriodWarning, setShowPeriodWarning] = useState(false);
  const [periodWarningMessage, setPeriodWarningMessage] = useState('');
  const [pendingPeriodChange, setPendingPeriodChange] = useState<string | null>(null);
  
  // Ahora useMemo puede llamar a buildAccountHierarchy porque ya está definida
  const hierarchicalAccounts = useMemo(() => {
    const result = buildAccountHierarchy(flatAccounts);
    console.log('Estructura jerárquica de cuentas:', result);
    return result;
  }, [flatAccounts]);

  // Obtener usuario actual
  useEffect(() => {
    const getUserData = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUserData();
  }, []);
  
  // Obtener períodos mensuales disponibles
  useEffect(() => {
    const fetchMonthlyPeriods = async () => {
      try {
        const { data, error } = await getAvailablePeriodsForEntry();
        
        if (error) throw error;
        const availablePeriods = data || [];
        setMonthlyPeriods(availablePeriods);
        
        // Si estamos creando (regular o ajuste) y no hay datos cargados de 'entry'
        if ((mode === 'create' || mode === 'create-adjustment') && !entry) {
          const currentDate = new Date();
          const currentMonth = currentDate.getMonth() + 1;
          const currentYear = currentDate.getFullYear();
          
          // Priorizar período activo del mes/año actual
          let defaultPeriod = availablePeriods.find(p => 
            p.month === currentMonth && p.year === currentYear && !p.is_closed && p.is_active
          );
          
          // Si no, el período activo más reciente
          if (!defaultPeriod) {
            defaultPeriod = [...availablePeriods]
              .filter(p => !p.is_closed && p.is_active)
              .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0];
          }
          
          // Si no hay activos, el más reciente (incluso si está cerrado, para mostrar algo)
          if (!defaultPeriod && availablePeriods.length > 0) {
             defaultPeriod = [...availablePeriods]
              .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0];
          }

          if (defaultPeriod) {
            setFormData(prevData => ({
              ...prevData,
              monthly_period_id: defaultPeriod.id || '',
              accounting_period_id: defaultPeriod.fiscal_year_id || ''
            }));
          }
        }
      } catch (error: any) {
        console.error('Error al cargar períodos mensuales:', error);
        toast.error('Error al cargar períodos contables: ' + error.message);
      }
    };
    
    fetchMonthlyPeriods();
  }, [mode, entry]);

  // Inicializar el formulario (lógica combinada para creación y edición)
  useEffect(() => {
    console.log('JournalEntryForm useEffect: Inicializando formulario, modo:', mode);
    console.log('Datos recibidos - Entry:', entry);
    console.log('Datos recibidos - EntryItems:', entryItems);
    
    try {
      if ((isEditMode || isViewMode) && entry && entryItems) {
        console.log(`Modo ${isEditMode ? 'edición' : 'vista'} detectado con datos disponibles`);
        
        // Guardar los datos en el estado, con validaciones para evitar errores
        const formattedDate = entry.date ? entry.date : format(new Date(), 'yyyy-MM-dd');
        const formattedRefDate = entry.reference_date || undefined;
        
        console.log('Formateando fecha del asiento:', formattedDate);
        console.log('Período mensual:', entry.monthly_period_id);
        
        // Cargar datos de un asiento existente (regular o ajuste) con validación
        setFormData({
          date: formattedDate,
          description: entry.description || '',
          monthly_period_id: entry.monthly_period_id || '',
          accounting_period_id: entry.accounting_period_id || '',
          notes: entry.notes || '',
          reference_number: entry.reference_number || '',
          reference_date: formattedRefDate,
          is_adjustment: entry.is_adjustment ?? isAdjustmentMode,
          adjustment_type: entry.adjustment_type || null,
          adjusted_entry_id: entry.adjusted_entry_id || null,
        });
        
        // Formatear líneas existentes con mejor manejo de débito/crédito
        try {
          console.log('Formateando líneas para edición o vista, cantidad:', entryItems.length);
          
          const formattedItems = entryItems.map((item): JournalEntryItem => {
            // Determinar si es línea de débito o crédito verificando el valor
            const debitValue = parseFloat(item.debit?.toString() || '0');
            const creditValue = parseFloat(item.credit?.toString() || '0');
            const isDebit = debitValue > 0;
            const amount = isDebit ? debitValue : creditValue;
            
            console.log(`Formateando línea: ID=${item.id}, Account=${item.account_id}`);
            console.log(`Valor débito: ${debitValue}, Valor crédito: ${creditValue}, Es débito: ${isDebit}, Monto: ${amount}`);
            
            return {
              id: item.id,
              journal_entry_id: item.journal_entry_id,
              account_id: item.account_id,
              description: item.description || '',
              is_debit: isDebit,
              amount: amount,
              debit: debitValue,
              credit: creditValue,
              temp_id: item.id || uuidv4(),
              // Incluir datos de la cuenta si están disponibles
              account: item.account
            };
          });
        
          console.log('Líneas formateadas:', formattedItems);
          
          // Verificar si hay líneas
          if (formattedItems.length === 0) {
            console.warn('No se encontraron líneas para este asiento');
            
            if (isViewMode) {
              toast.warning('Este asiento no tiene líneas de detalle');
            }
            
            // Crear líneas iniciales vacías, solo para modo edición
            if (!isViewMode) {
              const debitLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: true, amount: undefined };
              const creditLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: false, amount: undefined };
              setItems([debitLine, creditLine]);
            } else {
              setItems([]);
            }
          } else {
            setItems(formattedItems);
          }
        } catch (error) {
          console.error('Error al formatear líneas de asiento:', error);
          toast.error('Error al procesar las líneas del asiento');
          
          // Crear líneas iniciales vacías como fallback solo para modo edición
          if (!isViewMode) {
            const debitLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: true, amount: undefined };
            const creditLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: false, amount: undefined };
            setItems([debitLine, creditLine]);
          } else {
            setItems([]);
          }
        }
        
        setDataLoaded(true);
      } else if (mode === 'create' || mode === 'create-adjustment') {
        console.log('Modo creación detectado');
        // Inicializar para nuevo asiento (regular o ajuste)
        setFormData(prevData => ({
          ...prevData,
          date: format(new Date(), 'yyyy-MM-dd'),
          description: isAdjustmentMode ? 'Ajuste Contable' : '',
          is_adjustment: isAdjustmentMode,
        }));
        
        // Crear dos líneas iniciales vacías
        const debitLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: true, amount: undefined };
        const creditLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: false, amount: undefined };
        setItems([debitLine, creditLine]);
        setDataLoaded(true);
      } else {
        console.warn('No se cumplen condiciones para cargar datos: isEditMode:', isEditMode, 'mode:', mode);
        if (isViewMode) {
          console.warn('Modo vista sin datos completos');
        }
        
        // Asegurar que siempre hay datos mínimos cargados para evitar pantalla en blanco
        if (!dataLoaded) {
          console.log('Inicializando datos mínimos para evitar pantalla en blanco');
          setFormData(prevData => ({
            ...prevData,
            date: format(new Date(), 'yyyy-MM-dd'),
            description: isAdjustmentMode ? 'Ajuste Contable' : '',
            is_adjustment: isAdjustmentMode,
          }));
          
          const debitLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: true, amount: undefined };
          const creditLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: false, amount: undefined };
          setItems([debitLine, creditLine]);
          setDataLoaded(true);
        }
      }
    } catch (error) {
      console.error('Error en useEffect de inicialización del formulario:', error);
      toast.error('Error al inicializar el formulario. Por favor, intente nuevamente.');
      
      // Inicializar con datos mínimos para evitar pantalla en blanco
      setFormData(prevData => ({
        ...prevData,
        date: format(new Date(), 'yyyy-MM-dd'),
        description: isAdjustmentMode ? 'Ajuste Contable' : '',
        is_adjustment: isAdjustmentMode,
      }));
      
      const debitLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: true, amount: undefined };
      const creditLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: false, amount: undefined };
      setItems([debitLine, creditLine]);
      setDataLoaded(true);
    }
  }, [mode, entry, entryItems, isAdjustmentMode, isEditMode, isViewMode]);

  // Calcular totales y balance cada vez que cambian los items
  useEffect(() => {
    let debit = new Decimal(0);
    let credit = new Decimal(0);
    
    items.forEach(item => {
      // Considerar tanto el formato is_debit/amount como debit/credit directo
      if (item.debit !== undefined && !isNaN(Number(item.debit))) {
        debit = debit.plus(new Decimal(item.debit));
      } else if (item.is_debit && item.amount !== undefined && !isNaN(Number(item.amount))) {
        debit = debit.plus(new Decimal(item.amount));
      }
      
      if (item.credit !== undefined && !isNaN(Number(item.credit))) {
        credit = credit.plus(new Decimal(item.credit));
      } else if (!item.is_debit && item.amount !== undefined && !isNaN(Number(item.amount))) {
        credit = credit.plus(new Decimal(item.amount));
      }
    });
    
    const debitNum = debit.toDecimalPlaces(DECIMAL_PRECISION).toNumber();
    const creditNum = credit.toDecimalPlaces(DECIMAL_PRECISION).toNumber();
    const diff = debit.minus(credit).abs().toDecimalPlaces(DECIMAL_PRECISION).toNumber();
    
    setTotalDebit(debitNum);
    setTotalCredit(creditNum);
    setIsBalanced(diff < BALANCE_TOLERANCE); 
  }, [items]);

  // Renderiza las opciones del select jerárquicamente
  const renderAccountOptions = (accounts: AccountOption[], indentLevel = 0): React.ReactNode[] => {
    let options: React.ReactNode[] = [];
    const indent = ' '.repeat(indentLevel * 4);

    accounts.forEach(account => {
      // Mostrar todas las cuentas, pero deshabilitar las cuentas padre
      options.push(
        <option 
          key={account.id} 
          value={account.id} 
          className={account.isParent ? "text-gray-400 font-semibold" : "text-gray-900"}
          disabled={account.isParent}
        >
          {indent}{account.fullName}{account.isParent ? ' (Cuenta Padre)' : ''}
        </option>
      );
      
      // Procesar los hijos
      if (account.children && account.children.length > 0) {
        options = options.concat(renderAccountOptions(account.children, indentLevel + 1));
      }
    });
    return options;
  };

  // Función para convertir yyyy-MM-dd a dd/MM/yyyy para mostrar en inputs
  const formatInputDateEs = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (error) {
      return dateStr;
    }
  };

  // Función para convertir dd/MM/yyyy a yyyy-MM-dd para el valor interno
  const parseInputDateEs = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    } catch (error) {
      return dateStr;
    }
  };

  // Manejar cambios en los campos del formulario
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Verificación especial para fechas con formato español
    if ((name === 'date' || name === 'reference_date') && value) {
      // Si el input viene en formato dd/MM/yyyy, convertirlo a yyyy-MM-dd para procesamiento interno
      let formattedValue = value;
      if (value.includes('/')) {
        formattedValue = parseInputDateEs(value);
      }
      
      try {
        const selectedDate = parseISO(formattedValue);
        
        // Si la fecha es inválida, no la establecemos
        if (!isValid(selectedDate)) {
          toast.error('Formato de fecha inválido');
          return;
        }
        
        // Validar que no sea una fecha futura respecto a hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate > today) {
          toast.error('No se pueden seleccionar fechas futuras');
          // Establecer la fecha a hoy como fallback
          setFormData(prev => ({ ...prev, [name]: format(today, 'yyyy-MM-dd') }));
          return;
        }

        // Para fecha principal, solo verificar si está en un período futuro (mes/año)
        // NO validamos si está fuera del rango del período, esto ya se maneja en validateDateInPeriod
        if (name === 'date' && formData.monthly_period_id) {
          const period = monthlyPeriods.find(p => p.id === formData.monthly_period_id);
          if (period) {
            // Verificar solo si el período es futuro
            const validation = validateDateInPeriod(formattedValue, formData.monthly_period_id);
            
            // Solo bloquear si es un período completamente futuro
            if (!validation.valid && validation.message?.includes('período futuro')) {
              toast.error(validation.message);
              return;
            }
            
            // Si la fecha es posterior al fin del período pero válida, mostrar solo advertencia
            if (validation.valid && validation.message?.includes('posterior al fin del período')) {
              toast.warning(validation.message, { autoClose: 4000 });
              // Permitir continuar, ya que ahora esto es válido
            }
          }
        }
        
        // Si todo está bien, guardar la fecha en formato interno yyyy-MM-dd
        setFormData(prev => ({ ...prev, [name]: formattedValue }));
        return;
      } catch (error) {
        console.error(`Error al procesar fecha ${name}:`, error);
      }
    }
    
    // Verificación especial para la fecha - asegurar formato correcto y validar
    if (name === 'date' && value) {
      try {
        const selectedDate = parseISO(value);
        
        // Si la fecha es inválida, no la establecemos
        if (!isValid(selectedDate)) {
          toast.error('Formato de fecha inválido');
          return;
        }
        
        // Validar que no sea una fecha futura respecto a hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate > today) {
          toast.error('No se pueden seleccionar fechas futuras');
          // Establecer la fecha a hoy como fallback
          setFormData(prev => ({ ...prev, [name]: format(today, 'yyyy-MM-dd') }));
          return;
        }

        // Ahora verificamos si está en un período futuro, pero no bloqueamos por estar fuera del rango
        if (formData.monthly_period_id) {
          const period = monthlyPeriods.find(p => p.id === formData.monthly_period_id);
          if (period) {
            // Usar la función de validación para comprobar
            const validation = validateDateInPeriod(value, formData.monthly_period_id);
            
            // Solo bloquear si es un período completamente futuro
            if (!validation.valid && validation.message?.includes('período futuro')) {
              toast.error(validation.message);
              return;
            }
            
            // Si la fecha es posterior al fin del período pero válida, mostrar solo advertencia
            if (validation.valid && validation.message?.includes('posterior al fin del período')) {
              toast.warning(validation.message, { autoClose: 4000 });
              // Permitir continuar, ya que ahora esto es válido
            }
          }
        }
      } catch (error) {
        console.error("Error al procesar fecha:", error);
      }
    }
    
    // Para fecha de referencia, realizamos validaciones similares
    if (name === 'reference_date' && value) {
      try {
        const selectedDate = parseISO(value);
        
        // Si la fecha es inválida, no la establecemos
        if (!isValid(selectedDate)) {
          toast.error('Formato de fecha de referencia inválido');
          return;
        }
        
        // Validar que no sea una fecha futura respecto a hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate > today) {
          toast.error('No se pueden seleccionar fechas futuras para la referencia');
          setFormData(prev => ({ ...prev, [name]: format(today, 'yyyy-MM-dd') }));
          return;
        }
      } catch (error) {
        console.error("Error al procesar fecha de referencia:", error);
      }
    }
    
    // Actualizar el estado del formulario
    if (name === 'adjustment_type' && isAdjustmentMode) {
      // Actualizar descripción según el tipo de ajuste
      const adjustmentType = value as AdjustmentType | '';
      const newDescription = getAdjustmentDescription(adjustmentType || null);
      setFormData(prev => ({ 
        ...prev, 
        [name]: adjustmentType || null,
        description: newDescription || prev.description
      }));
      
      // Si cambiamos a ciertos tipos de ajuste, podemos preseleccionar cuentas típicas
      if (adjustmentType) {
        applyAdjustmentTemplate(adjustmentType as AdjustmentType);
      }
    } else {
      // Para otros campos, actualizar normalmente
      setFormData(prev => {
        const newData = { ...prev, [name]: value };
        // Si cambia el período mensual, actualizar también el anual asociado
        if (name === 'monthly_period_id') {
          const selectedPeriod = monthlyPeriods.find(p => p.id === value);
          if (selectedPeriod) {
            newData.accounting_period_id = selectedPeriod.fiscal_year_id;
            
            // Verificar si es un período anterior al actual
            const currentDate = new Date();
            const periodEndDate = new Date(selectedPeriod.end_date);
            
            if (periodEndDate < currentDate) {
              // En lugar de mostrar toast, guardamos la info para el modal
              const warningMessage = `Estás creando un asiento en un período anterior (${selectedPeriod.name}). Esto puede afectar reportes y balances ya generados.`;
              setPeriodWarningMessage(warningMessage);
              setShowPeriodWarning(true);
              setPendingPeriodChange(value as string);
              // Temporalmente no cambiamos el período hasta que el usuario confirme
              return prev;
            }
            
            // Verificar si es un período futuro (no permitido)
            const periodMonth = periodEndDate.getMonth();
            const periodYear = periodEndDate.getFullYear();
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();
            
            const isPeriodFuture = (periodYear > currentYear) || 
              (periodYear === currentYear && periodMonth > currentMonth);
            
            if (isPeriodFuture) {
              toast.error(`No se pueden registrar asientos en períodos futuros (${selectedPeriod.name}).`);
              // Esto evitará que se seleccione un período futuro
              return prev;
            }
          }
        }
        return newData;
      });
    }
    
    // Limpiar error específico
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };
  
  // Función adicional para validar ajustes contables específicamente
  const validateAdjustment = (
    formData: FormData, 
    items: JournalEntryItem[]
  ): { valid: boolean; message: string } => {
    // Solo necesitamos validar si es un ajuste
    if (!formData.is_adjustment) {
      return { valid: true, message: '' };
    }
    
    // El tipo de ajuste es obligatorio
    if (!formData.adjustment_type) {
      return { 
        valid: false, 
        message: 'Debe seleccionar un tipo de ajuste' 
      };
    }
    
    // Para ajustes de tipo corrección, el asiento a corregir es obligatorio
    if (formData.adjustment_type === 'correction' && !formData.adjusted_entry_id) {
      return { 
        valid: false, 
        message: 'Para ajustes de corrección, debe seleccionar el asiento a corregir' 
      };
    }
    
    // Validar que la descripción sea coherente con el tipo de ajuste
    if (!formData.description.toLowerCase().includes('ajuste') && 
        !formData.description.toLowerCase().includes('adjustment')) {
      console.warn('La descripción no menciona que es un ajuste, pero se dejará continuar');
    }
    
    // Verificar que hay suficientes líneas para el ajuste (mínimo 2)
    if (items.length < 2) {
      return {
        valid: false,
        message: 'Un ajuste contable debe tener al menos una línea de débito y una de crédito'
      };
    }
    
    // Todo está bien
    return { valid: true, message: '' };
  };

  // Función que valida que una fecha esté dentro del período contable seleccionado
  const validateDateInPeriod = (date: string, periodId: string): { valid: boolean; message?: string; isPreviousPeriod?: boolean } => {
    const period = monthlyPeriods.find(p => p.id === periodId);
    if (!period) {
      return { valid: false, message: 'Período no encontrado.' };
    }

    // Convertir fechas a objetos Date asegurando la zona horaria local
    const selectedDate = new Date(date + 'T12:00:00'); // Agregar mediodía para evitar problemas de zona horaria
    selectedDate.setHours(12, 0, 0, 0); // Normalizar a mediodía
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalizar a medianoche
    
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Extraer solo la fecha (sin hora) para evitar problemas de zona horaria
    const periodStartStr = period.start_date.split('T')[0];
    const periodEndStr = period.end_date.split('T')[0];
    
    const periodStartDate = new Date(periodStartStr + 'T12:00:00');
    periodStartDate.setHours(12, 0, 0, 0);
    
    const periodEndDate = new Date(periodEndStr + 'T12:00:00');
    periodEndDate.setHours(12, 0, 0, 0);
    
    const periodMonth = periodStartDate.getMonth();
    const periodYear = periodStartDate.getFullYear();

    // Formatear fechas para mensajes
    const formattedSelectedDate = formatDateEs(selectedDate.toISOString());
    const formattedPeriodStartDate = formatDateEs(periodStartDate.toISOString());
    const formattedPeriodEndDate = formatDateEs(periodEndDate.toISOString());
    
    // No permitir fechas futuras con respecto a hoy
    if (selectedDate > today) {
      return { 
        valid: false, 
        message: 'No se pueden registrar asientos con fechas futuras.' 
      };
    }

    // Determinar si el período es futuro con respecto al mes actual
    const isPeriodFuture = (periodYear > currentYear) || 
      (periodYear === currentYear && periodMonth > currentMonth);
    
    // No permitir registros en períodos futuros
    if (isPeriodFuture) {
      return {
        valid: false,
        message: `No se pueden registrar asientos en períodos futuros (${period.name}).`
      };
    }

    // IMPORTANTE: SÍ permitir fechas en períodos anteriores al actual
    // Solo mostrar advertencia si corresponde

    // Verificamos si es un período contable anterior al actual
    const isPreviousPeriod = (periodYear < currentYear) || 
      (periodYear === currentYear && periodMonth < currentMonth);

    // SÍ PERMITIMOS crear asientos en períodos anteriores (siempre que no estén cerrados)
    if (isPreviousPeriod) {
      return {
        valid: true,
        isPreviousPeriod: true,
        message: `Estás creando un asiento en el período ${period.name} (anterior al mes actual). Esto es válido, pero podría afectar reportes ya generados.`
      };
    }

    // MODIFICADO: Permitir registrar asientos con fechas anteriores al período
    // Ya no mostramos error, solo una advertencia
    if (selectedDate < periodStartDate) {
      return {
        valid: true, // Ahora es válido
        message: `La fecha seleccionada (${formattedSelectedDate}) es anterior al inicio del período ${period.name} (${formattedPeriodStartDate}). Esto es válido, pero considere usar el período correspondiente.`
      };
    }

    // Si la fecha seleccionada está fuera del rango del período actual pero es válida,
    // mostrar una advertencia pero permitir continuar
    if (selectedDate > periodEndDate) {
      return {
        valid: true, // Ahora permitimos fechas posteriores al fin del período (siempre que no sean futuras)
        message: `La fecha seleccionada (${formattedSelectedDate}) es posterior al fin del período ${period.name} (${formattedPeriodEndDate}). Considere seleccionar un período más reciente.`
      };
    }

    return { valid: true };
  };

  // Validar el formulario
  const validateForm = async (): Promise<boolean> => {
    let errors: FormErrors = {};
    
    // Validar fecha
    if (!formData.date) {
      errors.date = 'La fecha es requerida.';
    } else {
      // Verificar formato de fecha
      if (!isValid(parseISO(formData.date)) || !/^\d{4}-\d{2}-\d{2}$/.test(formData.date)) {
        errors.date = 'Formato de fecha inválido. Use YYYY-MM-DD.';
      } else if (formData.monthly_period_id) {
        try {
          // Obtener el periodo mensual seleccionado
          const selectedPeriod = monthlyPeriods.find(p => p.id === formData.monthly_period_id);
          
          if (selectedPeriod) {
            // Usar el servicio para validación completa con el formato correcto
            const periodDates = {
              start_date: selectedPeriod.start_date,
              end_date: selectedPeriod.end_date,
              name: selectedPeriod.name
            };
            
            const dateValidation = await validateJournalEntryDate(formData.date, periodDates);
            
            if (!dateValidation.valid) {
              errors.date = dateValidation.message;
            } else {
              // Si hay mensaje de advertencia pero es válido, guardarlo para mostrar
              if (dateValidation.message) {
                errors.dateWarning = dateValidation.message;
              }
              
              // La validación interna maneja el caso de período anterior
              // Ya que la interfaz ValidationResult no tiene isPreviousPeriod,
              // usamos la validación local para esta comprobación
              const localValidation = validateDateInPeriod(formData.date, formData.monthly_period_id);
              if (localValidation.isPreviousPeriod) {
                errors.isPreviousPeriod = 'true';
              }

              // Verificar si el período es futuro
              if (!localValidation.valid && localValidation.message?.includes('período futuro')) {
                errors.date = localValidation.message;
              }
            }
          }
        } catch (error) {
          console.error('Error en validación de fecha:', error);
          errors.date = 'Error al validar la fecha con el período.';
        }
      }
    }

    // Validar fecha de referencia - ahora es obligatoria
    if (!formData.reference_date) {
      errors.reference_date = 'La fecha de referencia es requerida.';
    } else if (!isValid(parseISO(formData.reference_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(formData.reference_date)) {
      errors.reference_date = 'Formato de fecha de referencia inválido. Use YYYY-MM-DD.';
    } else {
      // Verificar que no sea fecha futura
      const referenceDate = new Date(formData.reference_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (referenceDate > today) {
        errors.reference_date = 'La fecha de referencia no puede ser futura.';
      }
    }

    // Verificar que haya un periodo mensual seleccionado
    if (!formData.monthly_period_id) {
      errors.monthly_period_id = 'Debe seleccionar un período.';
    }
    
    // Validar período mensual
    if (!formData.monthly_period_id) {
      toast.error('Debe seleccionar un período contable mensual.');
      return false;
    }
    
    // Validar descripción
    if (!formData.description.trim()) {
      toast.error('La descripción del asiento es obligatoria.');
      return false;
    }
    
    // Validar líneas
    if (items.length < 2) {
      toast.error('El asiento debe tener al menos una línea de débito y una de crédito.');
      return false;
    }
    
    let hasDebit = false;
    let hasCredit = false;
    
    for (const item of items) {
      if (!item.account_id) {
        toast.error('Todas las líneas deben tener una cuenta seleccionada.');
        return false;
      }
      
      // Identificar si hay al menos una línea de débito y una de crédito
      if (item.is_debit) hasDebit = true;
      else hasCredit = true;
      
      if (item.amount === undefined || item.amount === null || isNaN(item.amount) || item.amount <= 0) {
        const accountName = findAccountRecursive(hierarchicalAccounts, item.account_id)?.fullName || 'Desconocida';
        toast.error(`El monto para la cuenta "${accountName}" debe ser un número positivo.`);
        return false;
      }
      
      // Validación robusta de cuentas padre
      const accountOption = findAccountRecursive(hierarchicalAccounts, item.account_id);
      if (!accountOption) {
        toast.error(`La cuenta seleccionada ID: ${item.account_id} no existe o no es válida.`);
        return false;
      }
      
      if (accountOption.isParent) {
        toast.error(`La cuenta "${accountOption.fullName}" es una cuenta padre y no puede usarse en asientos.`);
        return false;
      }
    }
    
    // Verificar que hay al menos una línea de débito y una de crédito
    if (!hasDebit || !hasCredit) {
      toast.error('El asiento debe tener al menos una línea de débito y una de crédito.');
      return false;
    }
    
    // Validar balance
    const balanceValidation = validateBalance(items);
    if (!balanceValidation.valid) {
      toast.error(balanceValidation.message);
      // Podríamos permitir guardar desbalanceado y marcarlo, pero por ahora lo impedimos.
      return false;
    }

    // Validaciones específicas para ajustes
    if (isAdjustmentMode) {
      const adjustmentValidation = validateAdjustment(formData, items);
      if (!adjustmentValidation.valid) {
        toast.error(adjustmentValidation.message);
        return false;
      }
    }
    
    setFormErrors(errors);
    // Solo permitir continuar si no hay errores críticos (advertencias e indicadores sí son permitidas)
    return Object.keys(errors).filter(key => !['dateWarning', 'isPreviousPeriod'].includes(key)).length === 0;
  };

  // Función recursiva para buscar cuenta en la jerarquía
  const findAccountRecursive = (accounts: AccountOption[], id: string): AccountOption | null => {
      for (const account of accounts) {
          if (account.id === id) return account;
          if (account.children) {
              const found = findAccountRecursive(account.children, id);
              if (found) return found;
          }
      }
      return null;
  };
  
  // Agregar una línea vacía
  const addEmptyLine = (): JournalEntryItem => {
      return { 
          temp_id: uuidv4(), 
          account_id: '', 
          description: '', 
          is_debit: true, // Por defecto débito, puede cambiar
          amount: undefined 
      };
  };
  
  // Agregar línea
  const handleAddLine = () => {
    setItems([...items, addEmptyLine()]);
  };
  
  // Eliminar línea
  const handleRemoveLine = (tempId: string) => {
    if (items.length <= 2 && !isViewMode) { // No permitir menos de 2 líneas en modo edición/creación
        toast.warn('Un asiento debe tener al menos dos líneas.');
        return;
    }
    setItems(items.filter(item => item.temp_id !== tempId));
  };
  
  // Actualizar una línea
  const handleItemChange = (tempId: string, field: keyof JournalEntryItem, value: any) => {
    setItems(currentItems => 
      currentItems.map(item => {
        if (item.temp_id === tempId) {
          const updatedItem = { ...item, [field]: value };
          
          // Si cambia el monto, asegurarse que no sea negativo
          if (field === 'amount') {
            // Convertir a número y validar
            let numAmount = parseFloat(value?.toString() || '0');
            // Si el valor es negativo o NaN, establecerlo a 0
            if (isNaN(numAmount) || numAmount < 0) {
              numAmount = 0;
              // Opcional: mostrar mensaje si el usuario intenta ingresar valor negativo
              if (numAmount < 0) {
                toast.warning('No se permiten valores negativos');
              }
            }
            updatedItem.amount = numAmount || undefined;
          }
          
          // Si cambia el monto o si es débito/crédito, recalcular
          if (field === 'amount' || field === 'is_debit') {
            const amount = parseFloat(updatedItem.amount?.toString() || '0');
            if (!isNaN(amount)) {
              updatedItem.debit = updatedItem.is_debit ? amount : 0;
              updatedItem.credit = updatedItem.is_debit ? 0 : amount;
            } else {
              updatedItem.debit = 0;
              updatedItem.credit = 0;
            }
          }
          
          return updatedItem;
        }
        return item;
      })
    );
  };
  
  // Guardar el asiento
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); 
    
    if (isViewMode || !user?.id || !(await validateForm())) {
      if (!user?.id) toast.error('Debes iniciar sesión.');
      return;
    }
    
    setSaving(true);
    
    try {
      const submissionData: JournalFormData = {
        ...formData,
        is_adjustment: isAdjustmentMode,
        adjustment_type: isAdjustmentMode ? formData.adjustment_type : null,
        adjusted_entry_id: isAdjustmentMode ? formData.adjusted_entry_id : null,
        notes: formData.notes || '', 
        reference_number: formData.reference_number || '', 
        reference_date: formData.reference_date || undefined,
      };

      const formattedItems = items.map(item => ({
          ...(item.id && { id: item.id }),
          journal_entry_id: entryId,
          account_id: item.account_id,
          description: item.description || '',
          debit: item.is_debit ? (item.amount || 0) : 0,
          credit: !item.is_debit ? (item.amount || 0) : 0,
      }));
      
      if (isEditMode && entryId) {
        const { error } = await updateJournalEntry(entryId, submissionData, formattedItems, user.id);
        if (error) throw error;
        toast.success('Asiento actualizado correctamente');
        onFinish(entryId);
      } else {
        const { id: newEntryId, error } = await createJournalEntry(submissionData, formattedItems, user.id);
        if (error) throw error;
        if (!newEntryId) throw new Error('No se recibió ID del nuevo asiento');
        toast.success('Asiento creado correctamente');
        onFinish(newEntryId);
      }
      
    } catch (error: any) {
      console.error('Error al guardar asiento:', error);
      const errorMessage = error.message || 'Ocurrió un error inesperado';
      toast.error(`Error al guardar: ${errorMessage}`);
      // No llamar a onFinish(null) para evitar comportamientos inesperados
      // En su lugar, mantener el formulario abierto para que el usuario pueda corregir
    } finally {
      setSaving(false);
    }
  };
  
  // Cancelar
  const handleCancel = () => {
      if (!saving) {
          onCancel();
      }
  };
  
  // Agregar una función para obtener el estilo del select según el modo
  const getSelectStyle = (isDisabled: boolean): React.CSSProperties => {
    return {
        backgroundColor: isDisabled ? '#f3f4f6' : 'white',
        borderColor: isDisabled ? '#d1d5db' : '#e5e7eb',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        // Agrega otros estilos necesarios
    };
  };
  
  // En useEffect para cargar datos, añadir cargar de entradas
  useEffect(() => {
    // Cargar entradas si estamos en modo ajuste para poder seleccionar
    if (isAdjustmentMode) {
      const fetchAvailableEntries = async () => {
        try {
          // Filtrar para excluir el asiento actual si estamos en modo edición
          // y excluir otros ajustes de corrección para evitar referencias circulares
          // Obtener solo los asientos más recientes (últimos 3 meses)
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          
          const query = supabase
            .from('journal_entries')
            .select('id, entry_number, description, date, is_adjustment, adjustment_type')
            .eq('is_adjustment', false)
            .gte('date', threeMonthsAgo.toISOString().split('T')[0]); // Filtrar por fecha reciente
          
          // Si estamos en modo edición, excluir el asiento actual
          if (isEditMode && entryId) {
            query.neq('id', entryId);
          }
          
          const { data, error } = await query
            .order('date', { ascending: false })
            .limit(50); // Limitar el número de resultados
          
          if (error) throw error;
          
          // Filtrar para solo incluir asientos regulares o ajustes que no sean de tipo corrección
          // para evitar referencias circulares
          const filteredData = data?.filter(entry => 
            !entry.is_adjustment || 
            (entry.is_adjustment && entry.adjustment_type !== 'correction')
          ) || [];
          
          setEntries(filteredData);
        } catch (error) {
          console.error("Error al cargar asientos disponibles:", error);
          // No mostrar toast para evitar saturación de errores
          setEntries([]);
        }
      };
      
      fetchAvailableEntries();
    }
  }, [isAdjustmentMode, isEditMode, entryId]);

  // En modo creación, podemos mostrar el formulario aunque no estén cargados todos los datos
  // MOVER este bloque condicional antes de la definición de las funciones para evitar
  // renderizados condicionales de los hooks
  const isLoading = !dataLoaded && (mode === 'edit' || mode === 'view' || mode === 'edit-adjustment');

  // Obtener descripción predeterminada según tipo de ajuste
  const getAdjustmentDescription = (type: AdjustmentType | null): string => {
    if (!type) return '';
    
    const descriptions: Record<AdjustmentType, string> = {
      'depreciation': 'Ajuste por depreciación de activos fijos',
      'amortization': 'Ajuste por amortización de activos intangibles',
      'accrual': 'Ajuste por devengo de gastos/ingresos',
      'deferred': 'Ajuste por gastos/ingresos diferidos',
      'inventory': 'Ajuste por valuación de inventario',
      'correction': 'Corrección de asiento contable',
      'provision': 'Ajuste por provisión de gastos/pérdidas',
      'valuation': 'Ajuste por valoración de activos/pasivos',
      'other': 'Ajuste contable'
    };
    
    return descriptions[type];
  };

  // Aplicar plantilla según tipo de ajuste (preseleccionar cuentas comunes)
  const applyAdjustmentTemplate = (_: AdjustmentType) => {
    // Ya no preseleccionar cuentas automáticamente
    return;
  };

  // Título del formulario dinámico
  const formTitle = isViewMode 
    ? 'Ver Asiento Contable' 
    : isEditMode
      ? (isAdjustmentMode ? 'Editar Ajuste Contable' : 'Editar Asiento Contable')
      : (isAdjustmentMode ? 'Nuevo Ajuste Contable' : 'Nuevo Asiento Contable');

  // Añadir función para obtener descripción del tipo de ajuste
  const getAdjustmentTypeDescription = (adjustmentType: AdjustmentType): string => {
    switch (adjustmentType) {
      case 'depreciation':
        return "Ajuste para registrar la depreciación periódica de activos fijos.";
      case 'amortization':
        return "Ajuste para distribuir el costo de activos intangibles a lo largo de su vida útil.";
      case 'accrual':
        return "Reconocimiento de ingresos o gastos cuando ocurren, independiente del flujo de efectivo.";
      case 'deferred':
        return "Ajuste para registrar gastos o ingresos pagados o cobrados por anticipado.";
      case 'inventory':
        return "Ajuste al valor de inventarios basado en conteo físico o revaluación.";
      case 'correction':
        return "Corrección de errores en asientos contables previos.";
      case 'provision':
        return "Estimación de obligaciones futuras probables (deterioro, obsolescencia, etc.).";
      case 'valuation':
        return "Actualización del valor de activos o pasivos a su valor razonable o recuperable.";
      case 'other':
        return "Otros ajustes contables que no encajan en las categorías anteriores.";
      default:
        return "";
    }
  };

  // Manejar continuación después de la advertencia de período anterior
  const handleContinueWithPeriod = () => {
    if (pendingPeriodChange) {
      // Aplicar el cambio de período que estaba pendiente
      const selectedPeriod = monthlyPeriods.find(p => p.id === pendingPeriodChange);
      if (selectedPeriod) {
        setFormData(prev => ({
          ...prev,
          monthly_period_id: pendingPeriodChange,
          accounting_period_id: selectedPeriod.fiscal_year_id
        }));
      }
      // Limpiar estado
      setPendingPeriodChange(null);
    }
    setShowPeriodWarning(false);
  };

  // Manejar cancelación de cambio de período
  const handleCancelPeriodChange = () => {
    setPendingPeriodChange(null);
    setShowPeriodWarning(false);
  };

  // Añadir estilos CSS para forzar el formato español en los datepickers
  useEffect(() => {
    // Crear un estilo que fuerza el formato español para los inputs de tipo date
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      input[type="date"]::-webkit-calendar-picker-indicator {
        color-scheme: light;
      }
      input[type="date"]::-webkit-datetime-edit-text,
      input[type="date"]::-webkit-datetime-edit-month-field,
      input[type="date"]::-webkit-datetime-edit-day-field,
      input[type="date"]::-webkit-datetime-edit-year-field {
        color: #374151;
      }
      /* Aplicar estilo español para selector de fecha */
      input[type="date"]:lang(es) {
        font-family: system-ui, -apple-system, sans-serif;
      }
    `;
    document.head.appendChild(styleEl);
    
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Si los datos aún no están listos, mostrar carga con mejor mensaje y fallback de tiempo
  useEffect(() => {
    // Si después de 5 segundos sigue en estado de carga, forzar dataLoaded
    let timeoutId: NodeJS.Timeout;
    
    if (isLoading) {
      timeoutId = setTimeout(() => {
        console.log('Tiempo de espera excedido, forzando carga de datos');
        // Inicializar con datos mínimos 
        setFormData(prevData => ({
          ...prevData,
          date: format(new Date(), 'yyyy-MM-dd'),
          description: isAdjustmentMode ? 'Ajuste Contable' : '',
          is_adjustment: isAdjustmentMode,
        }));
        
        const debitLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: true, amount: undefined };
        const creditLine = { temp_id: uuidv4(), account_id: '', description: '', is_debit: false, amount: undefined };
        setItems([debitLine, creditLine]);
        setDataLoaded(true);
      }, 5000);
    }
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoading, isAdjustmentMode]);

  // Validación preventiva de props - Añadido para evitar errores
  useEffect(() => {
    // Verificar si estamos en modo edición pero faltan datos
    if ((isEditMode || isViewMode) && !entry) {
      console.warn('⚠️ Se está intentando editar/ver un asiento pero entry es undefined/null');
      toast.warning('Datos incompletos para visualizar el asiento');
    }
    
    // Verificar integridad de líneas
    if ((isEditMode || isViewMode) && entry && (!entryItems || entryItems.length === 0)) {
      console.warn('⚠️ El asiento no tiene líneas o no se pudieron cargar');
      toast.warning('No se encontraron líneas para este asiento');
    }
    
    // Verificar estructura del entry
    if ((isEditMode || isViewMode) && entry) {
      if (!entry.id || !entry.date) {
        console.warn('⚠️ El objeto entry no tiene la estructura esperada:', entry);
        toast.warning('El formato de los datos del asiento es incorrecto');
      }
    }
  }, [entry, entryItems, isEditMode, isViewMode]);

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
        <p className="text-gray-700">Cargando datos del asiento...</p>
        <p className="text-sm text-gray-500 mt-2">Si esta pantalla persiste, por favor cierre y vuelva a intentar.</p>
      </div>
    );
  }

  // Inicializar formData en modo creación si está vacío
  if ((mode === 'create' || mode === 'create-adjustment') && !dataLoaded) {
    // Esto es seguro porque está después de todos los hooks
    setDataLoaded(true);
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Encabezado del formulario */}
        <div className="border-b border-gray-200 pb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            {isAdjustmentMode && <Info size={20} className="mr-2 text-purple-600" />} 
            {formTitle}
          </h2>
          {entry?.entry_number && (
              <span className="text-sm text-gray-500 ml-2">#{entry.entry_number}</span>
          )}
        </div>

        {/* Encabezado del asiento - Rediseñado con cards */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Primera columna: Información principal */}
          <div className="md:col-span-7 space-y-5">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Información principal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Fecha <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date || ''}
                    onChange={handleChange}
                    className={`mt-1 block w-full px-3 py-2 border ${
                      formErrors.date ? 'border-red-500' : formErrors.isPreviousPeriod ? 'border-yellow-400' : 'border-gray-300'
                    } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    max={new Date().toISOString().split('T')[0]} // No permitir fechas futuras
                    lang="es"
                    disabled={isViewMode}
                    placeholder="dd/mm/aaaa"
                  />
                  {formErrors.date && (
                    <p className="mt-1 text-sm text-red-500">{formErrors.date}</p>
                  )}
                  {formData.date && !formErrors.date && (
                    <div className="mt-1">
                      <p className="text-xs text-gray-500">
                        <strong>Fecha:</strong> {formatDateEs(formData.date)}
                      </p>
                    </div>
                  )}
                </div>
              
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Período Contable <span className="text-red-600">*</span>
                  </label>
                  <select
                    name="monthly_period_id"
                    value={formData.monthly_period_id}
                    onChange={handleChange}
                    disabled={isViewMode || mode === 'edit'}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  >
                    <option value="">Seleccionar período</option>
                    {monthlyPeriods.map(period => (
                      <option 
                        key={period.id} 
                        value={period.id}
                        className={period.id === formData.monthly_period_id ? "font-bold" : ""}
                      >
                        {period.name} - {period.fiscal_year_name} 
                        {period.id === formData.monthly_period_id ? " (Actual)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Descripción <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  disabled={isViewMode}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Descripción del asiento contable"
                  required
                />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Notas y comentarios</h3>
              <div>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  disabled={isViewMode}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  rows={3}
                  placeholder="Añada notas o comentarios adicionales sobre este asiento"
                />
              </div>
            </div>
          </div>

          {/* Segunda columna: Referencias y estado */}
          <div className="md:col-span-5 space-y-5">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Referencias</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Número de referencia
                  </label>
                  <input
                    type="text"
                    name="reference_number"
                    value={formData.reference_number}
                    onChange={handleChange}
                    disabled={isViewMode}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Ej. Factura #123, Cheque #456"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Fecha de referencia <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    name="reference_date"
                    value={formData.reference_date || ''}
                    onChange={handleChange}
                    disabled={isViewMode}
                    className={`mt-1 block w-full px-3 py-2 border ${
                      formErrors.reference_date ? 'border-red-500' : 'border-gray-300'
                    } rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                    lang="es"
                    max={new Date().toISOString().split('T')[0]} // No permitir fechas futuras
                    required
                    placeholder="dd/mm/aaaa"
                  />
                  {formErrors.reference_date && (
                    <p className="mt-1 text-sm text-red-500">{formErrors.reference_date}</p>
                  )}
                  {formData.reference_date && !formErrors.reference_date && (
                    <div className="mt-1">
                      <p className="text-xs text-gray-500">
                        <strong>Fecha de referencia:</strong> {formatDateEs(formData.reference_date)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SECCIÓN DE AJUSTES CONTABLES */}
            {(isAdjustmentMode || (formData.is_adjustment && isViewMode)) && (
              <div className="bg-blue-50 p-4 rounded-lg mt-4 border border-blue-200">
                <h3 className="text-sm font-medium text-blue-700 mb-3 flex items-center">
                  <Info size={16} className="mr-2" /> 
                  Información de Ajuste Contable
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Tipo de Ajuste <span className="text-red-600">*</span>
                    </label>
                    <select
                      name="adjustment_type"
                      value={formData.adjustment_type || ''}
                      onChange={handleChange}
                      disabled={isViewMode}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      required
                    >
                      <option value="">Seleccione un tipo de ajuste</option>
                      {adjustmentTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {formData.adjustment_type === 'correction' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Asiento a Corregir
                      </label>
                      <select
                        name="adjusted_entry_id"
                        value={formData.adjusted_entry_id || ''}
                        onChange={handleChange}
                        disabled={isViewMode}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="">Seleccione asiento a corregir</option>
                        {entries.map(e => (
                          <option key={e.id} value={e.id}>
                            {e.entry_number} - {e.description} ({e.date})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {formData.adjustment_type && (
                    <div className="bg-blue-100 p-3 rounded text-sm text-blue-800">
                      {getAdjustmentTypeDescription(formData.adjustment_type)}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Estado del asiento</h3>
              <div className="flex items-center space-x-2">
                <div className={`flex-1 p-3 rounded-md ${isBalanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className={`flex items-center ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                    {isBalanced ? (
                      <>
                        <CheckCircle size={16} className="mr-2" />
                        <span className="font-medium">Asiento balanceado</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={16} className="mr-2" />
                        <span className="font-medium">Asiento no balanceado</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <div>
                      <div className="text-gray-600">Débito:</div>
                      <div className="font-bold">{totalDebit.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Crédito:</div>
                      <div className="font-bold">{totalCredit.toFixed(2)}</div>
                    </div>
                    {!isBalanced && (
                      <div>
                        <div className="text-gray-600">Diferencia:</div>
                        <div className="font-bold text-red-600">{Math.abs(totalDebit - totalCredit).toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Líneas de detalle - Sección mejorada */}
        <div className="mt-8">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="bg-gray-50 px-4 py-3 rounded-t-lg border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-medium text-gray-700">Detalle del asiento contable</h3>
              {!isViewMode && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Plus size={16} className="mr-1" /> Agregar línea
                </button>
              )}
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cuenta
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descripción
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Monto
                    </th>
                    {!isViewMode && (
                      <th scope="col" className="relative px-4 py-3 w-10">
                        <span className="sr-only">Acciones</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((item, index) => (
                    <tr key={item.temp_id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3">
                        {isViewMode ? (
                          // En modo vista, mostrar la información de la cuenta en lugar del selector
                          <div className="text-sm">
                            {item.account?.code && item.account?.name ? (
                              <div>
                                <div className="font-semibold">{item.account.code}</div>
                                <div className="text-gray-600">{item.account.name}</div>
                              </div>
                            ) : (
                              <span className="text-gray-500">Sin cuenta asignada</span>
                            )}
                          </div>
                        ) : (
                          // En modo edición, mostrar el selector normal
                          <select
                            value={item.account_id || ''}
                            onChange={(e) => handleItemChange(item.temp_id || '', 'account_id', e.target.value)}
                            disabled={isViewMode}
                            style={getSelectStyle(isViewMode)}
                            className="block w-full shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            <option value="">Seleccionar cuenta</option>
                            <optgroup label="Cuentas Contables">
                              {renderAccountOptions(hierarchicalAccounts)}
                            </optgroup>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isViewMode ? (
                          // En modo vista, mostrar la descripción directamente
                          <div className="text-sm">{item.description || <span className="text-gray-400">Sin descripción</span>}</div>
                        ) : (
                          // En modo edición, mostrar el input normal
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => handleItemChange(item.temp_id || '', 'description', e.target.value)}
                            disabled={isViewMode}
                            className="block w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Descripción"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isViewMode ? (
                          // En modo vista, mostrar un texto indicando el tipo sin botones
                          <div className={`inline-block px-3 py-1 rounded-md text-xs font-medium ${
                            item.is_debit ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {item.is_debit ? 'Débito' : 'Crédito'}
                          </div>
                        ) : (
                          // En modo edición, mostrar los botones normales
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => handleItemChange(item.temp_id || '', 'is_debit', true)}
                              disabled={isViewMode}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md focus:outline-none ${
                                item.is_debit 
                                  ? 'bg-green-100 text-green-800 ring-1 ring-green-300' 
                                  : 'bg-gray-100 text-gray-800 hover:bg-green-50'
                              }`}
                            >
                              Débito
                            </button>
                            <button
                              type="button"
                              onClick={() => handleItemChange(item.temp_id || '', 'is_debit', false)}
                              disabled={isViewMode}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md focus:outline-none ${
                                !item.is_debit 
                                  ? 'bg-red-100 text-red-800 ring-1 ring-red-300' 
                                  : 'bg-gray-100 text-gray-800 hover:bg-red-50'
                              }`}
                            >
                              Crédito
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isViewMode ? (
                          // En modo vista, mostrar el monto formateado
                          <div className="text-sm font-mono text-right">
                            {new Decimal(item.amount || 0).toFixed(2)}
                          </div>
                        ) : (
                          // En modo edición, mostrar el input normal
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                              type="number"
                              value={item.amount || ''}
                              onChange={(e) => handleItemChange(item.temp_id || '', 'amount', parseFloat(e.target.value) || 0)}
                              disabled={isViewMode}
                              className="block w-full pl-7 pr-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              required
                            />
                          </div>
                        )}
                      </td>
                      {!isViewMode && (
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(item.temp_id || '')}
                            className="text-red-600 hover:text-red-900 focus:outline-none"
                            title="Eliminar línea"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        {/* Botones de acción */}
        <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            {isViewMode ? 'Cerrar' : 'Cancelar'}
          </button>
          
          {!isViewMode && (
            <button
              type="submit"
              disabled={!isBalanced || saving || externalLoading}
              className="px-5 py-2 border border-transparent rounded-md shadow-sm bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 flex items-center"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Save size={18} className="mr-2" />
              )}
              Guardar asiento
            </button>
          )}
        </div>
      </form>
      
      {/* Modal de advertencia para período anterior */}
      <WarningModal
        isOpen={showPeriodWarning}
        title="Advertencia: Período contable anterior"
        message={periodWarningMessage}
        onContinue={handleContinueWithPeriod}
        onCancel={handleCancelPeriodChange}
      />
    </div>
  );
}