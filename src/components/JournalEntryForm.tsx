import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { format, parseISO, isValid } from 'date-fns';
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
  validateDateInPeriod, 
  validateBalance, 
  createJournalEntry, 
  updateJournalEntry,
  JournalEntryForm as JournalFormData,
  JournalEntryItem,
  AdjustmentType
} from '../services/journalService';
import { getAvailablePeriodsForEntry } from '../services/accountingPeriodService';
import Decimal from 'decimal.js';

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
          fullName: `${acc.code} - ${acc.name}`
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
  const [balanceDifference, setBalanceDifference] = useState<number>(0);
  const [isBalanced, setIsBalanced] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [monthlyPeriods, setMonthlyPeriods] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  
  // Ahora useMemo puede llamar a buildAccountHierarchy porque ya está definida
  const hierarchicalAccounts = useMemo(() => buildAccountHierarchy(flatAccounts), [flatAccounts]);

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
    if (isEditMode && entry && entryItems) {
      // Cargar datos de un asiento existente (regular o ajuste)
      setFormData({
        date: entry.date || format(new Date(), 'yyyy-MM-dd'),
        description: entry.description || '',
        monthly_period_id: entry.monthly_period_id || '',
        accounting_period_id: entry.accounting_period_id || '',
        notes: entry.notes || '',
        reference_number: entry.reference_number || '',
        reference_date: entry.reference_date || undefined,
        is_adjustment: entry.is_adjustment ?? isAdjustmentMode,
        adjustment_type: entry.adjustment_type || null,
        adjusted_entry_id: entry.adjusted_entry_id || null,
      });
      
      // Formatear líneas existentes
      const formattedItems = entryItems.map((item): JournalEntryItem => ({
          id: item.id,
          journal_entry_id: item.journal_entry_id,
          account_id: item.account_id,
          description: item.description,
          is_debit: typeof item.is_debit === 'boolean' ? item.is_debit : (parseFloat(item.debit || '0') > 0),
          amount: typeof item.amount === 'number' ? item.amount : (parseFloat(item.debit || '0') > 0 ? parseFloat(item.debit || '0') : parseFloat(item.credit || '0')),
          debit: parseFloat(item.debit || '0'),
          credit: parseFloat(item.credit || '0'),
          temp_id: item.id || uuidv4()
      }));
      setItems(formattedItems);
      setDataLoaded(true);

    } else if (mode === 'create' || mode === 'create-adjustment') {
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
    }

  }, [mode, entry, entryItems, isAdjustmentMode]);

  // Calcular totales y balance cada vez que cambian los items
  useEffect(() => {
    let debit = new Decimal(0);
    let credit = new Decimal(0);
    
    items.forEach(item => {
      const amount = new Decimal(item.amount || 0);
      if (item.is_debit) {
        debit = debit.plus(amount);
      } else {
        credit = credit.plus(amount);
      }
    });
    
    const debitNum = debit.toDecimalPlaces(2).toNumber();
    const creditNum = credit.toDecimalPlaces(2).toNumber();
    const diff = debit.minus(credit).abs().toDecimalPlaces(2).toNumber();
    
    setTotalDebit(debitNum);
    setTotalCredit(creditNum);
    setBalanceDifference(diff);
    setIsBalanced(diff < 0.01); 
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

  // Función para obtener un color de fondo según la categoría
  const getCategoryColor = (type: string): string => {
    const colors: Record<string, string> = {
      'activo': '#0ea5e9',      // azul
      'pasivo': '#ef4444',      // rojo
      'patrimonio': '#22c55e',  // verde
      'ingreso': '#8b5cf6',     // morado
      'costo': '#f97316',       // naranja
      'gasto': '#ec4899',       // rosa
      'cuenta_orden': '#64748b' // gris
    };
    return colors[type] || '#64748b';
  };

  // Agregar una función auxiliar para obtener etiquetas de tipo de cuenta en español
  const getAccountTypeLabel = (type: string): string => {
    const types: Record<string, string> = {
      'activo': 'Activo',
      'pasivo': 'Pasivo', 
      'patrimonio': 'Patrimonio',
      'ingreso': 'Ingreso',
      'costo': 'Costo',
      'gasto': 'Gasto',
      'cuenta_orden': 'Cuenta de Orden'
    };
    return types[type] || type;
  };

  // Manejar cambios en los campos del formulario
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
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
          }
        }
        return newData;
      });
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

  // Validar el formulario
  const validateForm = async (): Promise<boolean> => {
    // Validar fecha
    if (!formData.date || !isValid(parseISO(formData.date))) {
      toast.error('La fecha del asiento no es válida.');
      return false;
    }
    
    // Validar período mensual
    if (!formData.monthly_period_id) {
      toast.error('Debe seleccionar un período contable mensual.');
      return false;
    }
    
    // Validar fecha dentro del período
    const dateValidation = await validateDateInPeriod(formData.date, formData.monthly_period_id);
    if (!dateValidation.valid) {
      toast.error(dateValidation.message);
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
    
    for (const item of items) {
      if (!item.account_id) {
        toast.error('Todas las líneas deben tener una cuenta seleccionada.');
        return false;
      }
      if (item.amount === undefined || item.amount === null || isNaN(item.amount) || item.amount <= 0) {
          const accountName = hierarchicalAccounts.flatMap(a => [a, ...(a.children || [])]).find(a => a.id === item.account_id)?.name || 'Desconocida';
        toast.error(`El monto para la cuenta "${accountName}" debe ser un número positivo.`);
        return false;
      }
      // Validar que no se usen cuentas padre (ya se hace en el select, pero doble check)
      const accountOption = findAccountRecursive(hierarchicalAccounts, item.account_id);
      if (accountOption && accountOption.isParent) {
          toast.error(`La cuenta "${accountOption.fullName}" es una cuenta padre y no puede usarse en asientos.`);
          return false;
      }
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
    
    return true;
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
          // Si cambia la cuenta, actualizar descripción por defecto?
          // if (field === 'account_id') { ... }
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
      toast.error(`Error al guardar: ${error.message || 'Ocurrió un error inesperado'}`);
      onFinish(null);
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
          const { data, error } = await supabase
            .from('journal_entries')
            .select('id, entry_number, description, date')
            .eq('is_adjustment', false) // Solo mostrar asientos regulares, no otros ajustes
            .order('date', { ascending: false });
          
          if (error) throw error;
          setEntries(data || []);
        } catch (error) {
          console.error("Error al cargar asientos disponibles:", error);
          // No mostrar toast para evitar saturación de errores
          setEntries([]);
        }
      };
      
      fetchAvailableEntries();
    }
  }, [isAdjustmentMode]);

  // Si los datos aún no están listos (especialmente en edición), mostrar carga
  if (!dataLoaded && (mode === 'edit' || mode === 'view' || mode === 'edit-adjustment')) {
    return <div className="p-6 text-center">Cargando datos del asiento...</div>;
  }
  
  // En modo creación, podemos mostrar el formulario aunque no estén cargados todos los datos
  if (mode === 'create' || mode === 'create-adjustment') {
    // Asegurarse de que dataLoaded se establezca a true si está en modo creación
    if (!dataLoaded) {
      setDataLoaded(true);
    }
  }

  // Título del formulario dinámico
  const formTitle = isViewMode 
    ? 'Ver Asiento Contable' 
    : isEditMode
      ? (isAdjustmentMode ? 'Editar Ajuste Contable' : 'Editar Asiento Contable')
      : (isAdjustmentMode ? 'Nuevo Ajuste Contable' : 'Nuevo Asiento Contable');

  // Añadir función para obtener descripción del tipo de ajuste
  const getAdjustmentTypeDescription = (type: AdjustmentType): string => {
    switch (type) {
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
  const applyAdjustmentTemplate = (type: AdjustmentType) => {
    // Solo aplicar si tenemos 2 o menos líneas (asumiendo que son las líneas iniciales vacías)
    if (items.length > 2) {
      return; // No aplicar plantilla si ya hay líneas personalizadas
    }
    
    // Buscar cuentas relevantes para el tipo de ajuste
    let relevantAccounts: {debit?: string[], credit?: string[]} = { debit: [], credit: [] };
    
    switch(type) {
      case 'depreciation':
        // Buscar cuentas de depreciación y activos fijos
        relevantAccounts.debit = ['depreciation', 'gasto', 'depreciación'];
        relevantAccounts.credit = ['depreciation', 'acumulada', 'depreciación'];
        break;
      case 'amortization':
        relevantAccounts.debit = ['amortization', 'amortización', 'gasto'];
        relevantAccounts.credit = ['amortization', 'amortización', 'acumulada'];
        break;
      case 'accrual':
        relevantAccounts.debit = ['gasto', 'expense'];
        relevantAccounts.credit = ['accrued', 'por pagar', 'provisión'];
        break;
      case 'inventory':
        relevantAccounts.debit = ['inventory', 'inventario', 'costo'];
        relevantAccounts.credit = ['inventory', 'inventario', 'mercancía'];
        break;
      // Otros casos...
    }
    
    // Buscar cuentas que coincidan con las palabras clave
    const matchAccounts = (keywords: string[], isDebit: boolean) => {
      // Obtener todas las cuentas en formato plano (para búsqueda más fácil)
      const allAccounts = flatAccounts.filter(acc => !acc.isParent);
      
      // Buscar coincidencias en nombre o código
      for (const keyword of keywords) {
        const matchingAccounts = allAccounts.filter(acc => 
          acc.name.toLowerCase().includes(keyword.toLowerCase()) || 
          acc.code.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (matchingAccounts.length > 0) {
          // Encontramos coincidencias, usar la primera
          const newItems = [...items];
          // Actualizar el item correspondiente (débito o crédito)
          const itemIndex = newItems.findIndex(item => item.is_debit === isDebit);
          if (itemIndex >= 0) {
            newItems[itemIndex] = {
              ...newItems[itemIndex],
              account_id: matchingAccounts[0].id,
              description: `${getAdjustmentDescription(type)} - ${matchingAccounts[0].name}`
            };
            setItems(newItems);
          }
          return true;
        }
      }
      return false;
    };
    
    // Aplicar búsqueda para débito y crédito
    if (relevantAccounts.debit && relevantAccounts.debit.length > 0) {
      matchAccounts(relevantAccounts.debit, true);
    }
    if (relevantAccounts.credit && relevantAccounts.credit.length > 0) {
      matchAccounts(relevantAccounts.credit, false);
    }
  };

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
                    value={formData.date}
                    onChange={handleChange}
                    disabled={isViewMode}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  />
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
                    Fecha de referencia
                  </label>
                  <input
                    type="date"
                    name="reference_date"
                    value={formData.reference_date}
                    onChange={handleChange}
                    disabled={isViewMode}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
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
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => handleItemChange(item.temp_id || '', 'description', e.target.value)}
                          disabled={isViewMode}
                          className="block w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Descripción"
                        />
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                      {!isViewMode && (
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(item.temp_id || '')}
                            className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-50"
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
    </div>
  );
}