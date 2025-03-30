import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { format, parseISO, isValid } from 'date-fns';
import { toast } from 'react-toastify';
import { 
  Plus, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Save
} from 'lucide-react';
import { 
  validateDateInPeriod, 
  validateBalance, 
  createJournalEntry, 
  updateJournalEntry,
  JournalEntryForm as JournalFormData
} from '../services/journalService';
import { getAvailablePeriodsForEntry } from '../services/accountingPeriodService';
import Decimal from 'decimal.js';

// Props del componente
interface JournalEntryFormProps {
  mode: 'create' | 'edit' | 'view';
  entryId?: string;
  entry?: any;
  entryItems?: any[];
  accounts: any[];
  onFinish: (id: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

// Estructura del formulario
interface JournalEntryItem {
  id?: string;
  journal_entry_id?: string;
  account_id: string;
  description?: string;
  debit?: number;
  credit?: number;
  temp_id?: string;
  is_debit?: boolean;
  amount?: number;
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
    nature: string;
  };
}

interface FormData {
    date: string;
    description: string;
  monthly_period_id: string;
  accounting_period_id?: string;
  notes: string;
  reference_number: string;
  reference_date: string | undefined;
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

export default function JournalEntryForm({
  mode,
  entryId,
  entry,
  entryItems,
  accounts,
  onFinish,
  onCancel,
  loading: externalLoading
}: JournalEntryFormProps) {
  // Estados
  const [formData, setFormData] = useState<FormData>({
    date: '',
      description: '', 
    monthly_period_id: '',
    notes: '',
    reference_number: '',
    reference_date: undefined
  });
  
  const [items, setItems] = useState<JournalEntryItem[]>([]);
  const [totalDebit, setTotalDebit] = useState<number>(0);
  const [totalCredit, setTotalCredit] = useState<number>(0);
  const [isBalanced, setIsBalanced] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [monthlyPeriods, setMonthlyPeriods] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [hierarchicalAccounts, setHierarchicalAccounts] = useState<AccountOption[]>([]);
  
  const isViewMode = mode === 'view';

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
        setMonthlyPeriods(data || []);
        
        // Si estamos creando un asiento y hay períodos disponibles
        if (mode === 'create' && data && data.length > 0) {
          // Obtener la fecha actual
          const currentDate = new Date();
          const currentMonth = currentDate.getMonth() + 1; // 1-12
          const currentYear = currentDate.getFullYear();
          
          // Buscar el período que corresponde al mes actual
          const currentPeriod = data.find(p => 
            p.month === currentMonth && 
            p.year === currentYear && 
            p.is_active
          );
          
          // Si no encontramos el período actual, usar el más reciente
          if (currentPeriod) {
            setFormData(prevData => ({
              ...prevData,
              monthly_period_id: currentPeriod.id || '',
              accounting_period_id: currentPeriod.fiscal_year_id || ''
            }));
          } else {
            // Ordenar por fecha de fin descendente para obtener el más reciente
            const sortedPeriods = [...data].sort((a, b) => 
              new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
            );
            
            if (sortedPeriods.length > 0) {
              setFormData(prevData => ({
                ...prevData,
                monthly_period_id: sortedPeriods[0].id || '',
                accounting_period_id: sortedPeriods[0].fiscal_year_id || ''
              }));
            }
          }
        }
      } catch (error: any) {
        console.error('Error al cargar períodos mensuales:', error);
        toast.error('Error al cargar períodos contables: ' + error.message);
      }
    };
    
    fetchMonthlyPeriods();
  }, [mode]);

  // Inicializar el formulario
  useEffect(() => {
    if (mode === 'create') {
      // Inicializar con valores predeterminados para un nuevo asiento
      const defaultPeriod = monthlyPeriods.find(p => !p.is_closed && p.is_active);
      
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        monthly_period_id: defaultPeriod?.id || '',
        accounting_period_id: defaultPeriod?.fiscal_year_id || '',
        notes: '',
        reference_number: '',
        reference_date: undefined
      });
      
      // Crear dos líneas obligatorias, una de débito y otra de crédito
      const debitLine = {
        temp_id: uuidv4(),
        account_id: '',
        description: '',
        is_debit: true,
        amount: undefined
      };
      
      const creditLine = {
        temp_id: uuidv4(),
        account_id: '',
        description: '',
        is_debit: false,
        amount: undefined
      };
      
      setItems([debitLine, creditLine]);
      setDataLoaded(true);
    } else if (entry && entryItems && (mode === 'edit' || mode === 'view')) {
      // Cargar datos de un asiento existente
      setFormData({
        date: entry.date || '',
        description: entry.description || '',
        monthly_period_id: entry.monthly_period_id || '',
        accounting_period_id: entry.accounting_period_id || '',
        notes: entry.notes || '',
        reference_number: entry.reference_number || '',
        reference_date: entry.reference_date || undefined
      });
      
      // Formatear líneas existentes
      const formattedItems = entryItems.map(item => ({
          id: item.id,
          account_id: item.account_id,
        description: item.description,
        is_debit: parseFloat(item.debit) > 0,
        amount: parseFloat(item.debit) > 0 ? parseFloat(item.debit) : parseFloat(item.credit),
        temp_id: uuidv4(),
          account: item.account
        }));

      setItems(formattedItems);
      setDataLoaded(true);
    }
  }, [mode, entry, entryItems, monthlyPeriods]);

  // Calcular totales y verificar balance cuando cambian los items
  useEffect(() => {
    if (!dataLoaded) return;
    
    let debitSum = new Decimal(0);
    let creditSum = new Decimal(0);
    
    items.forEach(item => {
      if (item.amount && item.amount > 0) {
        if (item.is_debit) {
          debitSum = debitSum.plus(new Decimal(item.amount));
    } else {
          creditSum = creditSum.plus(new Decimal(item.amount));
        }
      }
    });
    
    setTotalDebit(debitSum.toNumber());
    setTotalCredit(creditSum.toNumber());
    
    // Verificar si está balanceado (con margen de error de 0.01 por redondeos)
    const difference = debitSum.minus(creditSum).abs();
    setIsBalanced(difference.lessThanOrEqualTo(new Decimal(0.01)));
  }, [items, dataLoaded]);

  // Después de las definiciones de estado, añadir la función para construir la jerarquía
  useEffect(() => {
    if (accounts?.length > 0) {
      const processedAccounts = buildAccountHierarchy(accounts);
      setHierarchicalAccounts(processedAccounts);
    }
  }, [accounts]);

  // Función para convertir las cuentas planas en una estructura jerárquica
  const buildAccountHierarchy = (flatAccounts: any[]): AccountOption[] => {
    // Mapear cuentas al formato requerido
    const accountMap = new Map<string, AccountOption>();
    const rootAccounts: AccountOption[] = [];
    
    // Primer paso: convertir todas las cuentas al formato AccountOption
    flatAccounts.forEach(acc => {
      const accountOption: AccountOption = {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        fullName: `${acc.code} - ${acc.name}`,
        isParent: acc.is_parent || false,
        type: acc.type,
        nature: acc.nature,
        parentId: acc.parent_id || null,
        level: 0,
        children: []
      };
      
      accountMap.set(acc.id, accountOption);
    });
    
    // Segundo paso: construir la jerarquía
    flatAccounts.forEach(acc => {
      const accountOption = accountMap.get(acc.id);
      if (!accountOption) return;
      
      if (acc.parent_id && accountMap.has(acc.parent_id)) {
        // Si tiene padre, es una cuenta hija
        const parent = accountMap.get(acc.parent_id)!;
        parent.children = parent.children || [];
        accountOption.level = parent.level + 1;
        parent.children.push(accountOption);
      } else {
        // Si no tiene padre, es una cuenta raíz
        rootAccounts.push(accountOption);
      }
    });
    
    // Ordenar cuentas por código
    const sortAccounts = (accounts: AccountOption[]): AccountOption[] => {
      return accounts
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(account => {
          if (account.children && account.children.length > 0) {
            return { ...account, children: sortAccounts(account.children) };
          }
          return account;
        });
    };
    
    return sortAccounts(rootAccounts);
  };

  // Función recursiva para renderizar las opciones del selector de cuentas
  const renderAccountOptions = (accounts: AccountOption[], indentLevel = 0): React.ReactNode[] => {
    let options: React.ReactNode[] = [];
    
    accounts.forEach(account => {
      // Obtener la etiqueta del tipo de cuenta en español
      const accountTypeLabel = getAccountTypeLabel(account.type);
      
      // Para las cuentas padre, usar un formato destacado con la categoría
      if (account.isParent) {
        options.push(
          <option 
            key={account.id} 
            value={account.id}
            disabled={true} // No permitir seleccionar cuentas padre
            className="font-bold text-gray-600"
            style={{ 
              paddingLeft: `${indentLevel * 10}px`,
              backgroundColor: getCategoryColor(account.type),
              color: '#000'
            }}
          >
            📁 {account.code} - {account.name} [{accountTypeLabel}]
          </option>
        );
      } else {
        // Para las cuentas hijas, mantener un formato simple
        options.push(
          <option 
            key={account.id} 
            value={account.id}
            className="font-normal"
            style={{ paddingLeft: `${indentLevel * 10 + 15}px` }}
          >
            └─ {account.code} - {account.name}
          </option>
        );
      }
      
      // Si tiene hijos, incluirlos
      if (account.children && account.children.length > 0) {
        options = options.concat(renderAccountOptions(account.children, indentLevel + 1));
      }
    });
    
    return options;
  };

  // Función para obtener un color de fondo según la categoría
  const getCategoryColor = (type: string): string => {
    const colors: Record<string, string> = {
      'activo': '#e6f7ff',     // azul claro
      'pasivo': '#fff1f0',     // rojo claro
      'patrimonio': '#f6ffed', // verde claro
      'ingreso': '#f9f0ff',    // morado claro
      'costo': '#fff7e6',      // naranja claro
      'gasto': '#fff0f6',      // rosa claro
      'cuenta_orden': '#f5f5f5' // gris claro
    };
    return colors[type] || '#f5f5f5';
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
    
    // Si cambia el período mensual, actualizar el período anual
    if (name === 'monthly_period_id' && value) {
      const selectedPeriod = monthlyPeriods.find(p => p.id === value);
      if (selectedPeriod && selectedPeriod.fiscal_year_id) {
        setFormData({ 
          ...formData, 
          [name]: value,
          accounting_period_id: selectedPeriod.fiscal_year_id
        });
      } else {
        setFormData({ ...formData, [name]: value });
      }
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };
  
  // Validar el formulario
  const validateForm = async (): Promise<boolean> => {
    // Verificar campos obligatorios
    if (!formData.date || !formData.description || !formData.monthly_period_id) {
      toast.error('Por favor complete todos los campos obligatorios');
      return false;
    }
    
    // Verificar que haya al menos dos líneas
    if (items.length < 2) {
      toast.error('El asiento debe tener al menos dos líneas');
      return false;
    }
    
    // Verificar que todas las líneas tengan cuenta y monto
    for (const item of items) {
      if (!item.account_id || !item.amount) {
        toast.error('Todas las líneas deben tener cuenta y monto');
        return false;
      }
      
      // Verificar que no se seleccionen cuentas padre
      const selectedAccount = findAccountById(hierarchicalAccounts, item.account_id);
      if (selectedAccount && selectedAccount.isParent) {
        toast.error(`La cuenta "${selectedAccount.fullName}" es una cuenta de grupo y no puede usarse en transacciones.`);
        return false;
      }
    }
    
    // Verificar que el asiento esté balanceado
    if (!isBalanced) {
      toast.error('El asiento no está balanceado');
      return false;
    }
    
    // Validar fecha en el período
    try {
      const validation = await validateDateInPeriod(formData.date, formData.monthly_period_id);
      if (!validation.valid) {
        toast.error(validation.message);
        return false;
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al validar la fecha');
      return false;
    }
    
    return true;
  };
  
  // Función auxiliar para encontrar una cuenta por ID
  const findAccountById = (accounts: AccountOption[], id: string): AccountOption | null => {
    for (const account of accounts) {
      if (account.id === id) {
        return account;
      }
      if (account.children && account.children.length > 0) {
        const foundInChildren = findAccountById(account.children, id);
        if (foundInChildren) {
          return foundInChildren;
        }
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
          is_debit: true,
      amount: undefined
    };
  };
  
  // Agregar línea
  const handleAddLine = () => {
    setItems([...items, addEmptyLine()]);
  };
  
  // Eliminar línea
  const handleRemoveLine = (tempId: string) => {
    if (items.length <= 2) {
        toast.error('El asiento debe tener al menos dos líneas');
        return;
      }
    setItems(items.filter(item => item.temp_id !== tempId));
  };
  
  // Actualizar una línea
  const handleItemChange = (tempId: string, field: string, value: any) => {
    const updatedItems = items.map(item => {
      if (item.temp_id === tempId) {
        if (field === 'is_debit') {
          // Si cambia el tipo (débito/crédito), mantener el monto
          return { ...item, [field]: value };
        } else {
          return { ...item, [field]: value };
        }
      }
      return item;
    });
    setItems(updatedItems);
  };
  
  // Guardar el asiento
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Evitar propagación del evento
    
    if (isViewMode) {
      onCancel();
      return;
    }
    
    // Verificar que el usuario esté autenticado
    if (!user?.id) {
      toast.error('Debes iniciar sesión para realizar esta acción');
      return;
    }
    
    const isValid = await validateForm();
    if (!isValid) {
      return;
    }
    
    setSaving(true);
    
    try {
      // Preparar los datos del formulario para evitar problemas con fechas vacías
      const processedFormData: JournalFormData = {
        date: formData.date,
        description: formData.description,
        monthly_period_id: formData.monthly_period_id,
        accounting_period_id: formData.accounting_period_id,
        notes: formData.notes || '',
        reference_number: formData.reference_number || '',
        reference_date: formData.reference_date && formData.reference_date.trim() !== '' 
          ? formData.reference_date 
          : undefined
      };
      
      // Formatear los items para el servicio, asegurando que los valores numéricos sean correctos
      const formattedItems = items.map(item => {
        // Asegurar que los valores numéricos sean números y no undefined/null/string
        const amount = typeof item.amount === 'number' ? item.amount : 0;
        
        return {
          account_id: item.account_id,
          description: item.description || '',
          debit: item.is_debit ? amount : 0,
          credit: !item.is_debit ? amount : 0,
          // Si hay ID y journal_entry_id, mantenerlos para actualización
          ...(item.id && { id: item.id }),
          ...(item.journal_entry_id && { journal_entry_id: item.journal_entry_id })
        };
      });
      
      // Verificar si hay cuentas repetidas
      const accountIds = formattedItems.map(item => item.account_id);
      const duplicateAccounts = accountIds.filter((id, index) => 
        accountIds.indexOf(id) !== index
      );
      
      if (duplicateAccounts.length > 0) {
        // Buscar los nombres de las cuentas duplicadas
        const duplicateNames = duplicateAccounts.map(id => {
          const account = findAccountById(hierarchicalAccounts, id);
          return account ? account.fullName : id;
        });
        
        toast.error(`Hay cuentas duplicadas: ${duplicateNames.join(', ')}`);
        setSaving(false);
        return;
      }
      
      console.log('Datos a enviar:', { 
        formData: processedFormData, 
        items: formattedItems,
        user_id: user.id 
      });
      
      // Crear o actualizar el asiento
      if (mode === 'create') {
        try {
          // Usar el servicio para crear un nuevo asiento
          const entryId = await createJournalEntry(
            processedFormData,
            formattedItems, // Usar los items formateados correctamente
            user.id
          );
          
          if (entryId) {
            toast.success('Asiento contable creado correctamente');
            onFinish(entryId);
          } else {
            toast.error('No se pudo crear el asiento contable');
          }
        } catch (createError: any) {
          console.error('Error específico al crear asiento:', createError);
          toast.error(`Error al crear el asiento: ${createError.message || 'Error desconocido'}`);
        }
      } else if (mode === 'edit' && entryId) {
        try {
          // Usar el servicio para actualizar un asiento existente
          await updateJournalEntry(
            entryId,
            processedFormData,
            formattedItems, // Usar los items formateados correctamente
            user.id
          );
          
          toast.success('Asiento contable actualizado correctamente');
          onFinish(entryId);
        } catch (updateError: any) {
          console.error('Error específico al actualizar asiento:', updateError);
          toast.error(`Error al actualizar el asiento: ${updateError.message || 'Error desconocido'}`);
        }
      }
    } catch (error: any) {
      console.error('Error general al guardar asiento contable:', error);
      
      // Mensaje de error más específico según el tipo de error
      let errorMessage = 'Error desconocido';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.error && error.error.message) {
        errorMessage = error.error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast.error(`Error al guardar el asiento contable: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };
  
  // Cancelar
  const handleCancel = () => {
    onCancel();
  };
  
  // Renderizar
  return (
    <div className="bg-white shadow-lg rounded-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Encabezado del formulario */}
        <div className="border-b border-gray-200 pb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {mode === 'create' ? 'Crear nuevo asiento contable' : 
             mode === 'edit' ? 'Editar asiento contable' : 
             'Detalles del asiento contable'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isBalanced ? 
              'El asiento está correctamente balanceado' : 
              'Complete todos los campos y asegúrese que el asiento esté balanceado'}
          </p>
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
                          value={item.account_id}
                          onChange={(e) => handleItemChange(item.temp_id || '', 'account_id', e.target.value)}
                          disabled={isViewMode}
                          className="block w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          required
                        >
                          <option value="">Seleccionar cuenta</option>
                          {renderAccountOptions(hierarchicalAccounts)}
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