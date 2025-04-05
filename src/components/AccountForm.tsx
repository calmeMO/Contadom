import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import type { Account, AccountType, AccountNature } from '../types/database';
import { ChevronRight, HelpCircle, AlertTriangle, Check, ChevronLeft } from 'lucide-react';

interface AccountFormProps {
  account?: Account;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AccountForm({ account, onSuccess, onCancel }: AccountFormProps) {
  // Estados principales
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // Formulario por pasos: 1-Información básica, 2-Configuración avanzada
  const [parentAccounts, setParentAccounts] = useState<Account[]>([]);
  const [filteredParentAccounts, setFilteredParentAccounts] = useState<Account[]>([]);
  const [validatingStep1, setValidatingStep1] = useState(false);
  
  // Datos del formulario
  const [formData, setFormData] = useState({
    code: account?.code || '',
    name: account?.name || '',
    description: account?.description || '',
    type: account?.type || 'activo',
    nature: account?.nature || 'deudora',
    parentId: account?.parent_id || '',
    isParent: account?.is_parent || false,
    isManualCode: Boolean(account) // Solo permitir código manual en edición
  });
  
  // Estados de validación
  const [validations, setValidations] = useState({
    codeExists: false,
    codeValid: true,
    parentTypeMatch: true,
    codeChecked: false
  });

  // Cargar datos iniciales
  useEffect(() => {
    fetchParentAccounts();
  }, []);

  // Filtrar cuentas padre cuando cambia el tipo
  useEffect(() => {
    if (parentAccounts.length > 0) {
      // Filtrar cuentas que pueden ser padres (cuentas del mismo tipo y que sean cuentas de grupo)
      const filtered = parentAccounts.filter(parent => 
        parent.type === formData.type && 
        parent.is_parent === true && 
        parent.is_active === true
      );
      
      setFilteredParentAccounts(filtered);
      
      // Verificar si la cuenta padre seleccionada es del tipo correcto
      if (formData.parentId) {
        const parentMatch = filtered.some(p => p.id === formData.parentId);
        setValidations(prev => ({ ...prev, parentTypeMatch: parentMatch }));
        
        // Limpiar selección si el tipo no coincide
        if (!parentMatch) {
          setFormData(prev => ({ ...prev, parentId: '' }));
        }
      }
    }
  }, [formData.type, parentAccounts]);

  // Generar código automáticamente al crear una cuenta nueva
  useEffect(() => {
    if (!account && !formData.isManualCode) {
      generateAccountCode();
    }
  }, [formData.type, formData.parentId, formData.isManualCode]);

  // Validar el código cuando cambia manualmente
  useEffect(() => {
    if (formData.code) {
      const timer = setTimeout(() => {
        checkCodeExists(formData.code);
      }, 300);
      
      return () => clearTimeout(timer);
    } else {
      setValidations(prev => ({ 
        ...prev, 
        codeExists: false,
        codeValid: false,
        codeChecked: true
      }));
    }
  }, [formData.code]);

  // Cargar cuentas padre disponibles
  async function fetchParentAccounts() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true)
        .order('code');
      
      if (error) throw error;
      setParentAccounts(data || []);
      
      // Al cargar inicialmente, aplicar el filtro por tipo
      const filtered = (data || []).filter(parent => 
        parent.type === formData.type && 
        parent.is_parent === true
      );
      
      setFilteredParentAccounts(filtered);
      
      // Si estamos editando, verificar que la cuenta padre aún sea válida
      if (account && account.parent_id) {
        const parentMatch = filtered.some(p => p.id === account.parent_id);
        setValidations(prev => ({ ...prev, parentTypeMatch: parentMatch }));
      }
    } catch (error) {
      console.error('Error al cargar las cuentas padre:', error);
      toast.error('Error al cargar las cuentas padre');
    } finally {
      setLoading(false);
    }
  }

  // Generar código de cuenta automáticamente según reglas de negocio
  async function generateAccountCode() {
    try {
      if (formData.parentId) {
        // Caso 1: Cuenta con padre (subcuenta)
        const parentAccount = parentAccounts.find(acc => acc.id === formData.parentId);
        if (parentAccount) {
          // Buscar todas las subcuentas existentes para este padre
          const { data: existingSubaccounts, error } = await supabase
            .from('accounts')
            .select('code')
            .eq('parent_id', formData.parentId)
            .order('code', { ascending: false });
          
          if (error) throw error;
          
          const baseCode = parentAccount.code;
          // El formato debe mantener la estructura jerárquica
          let newCode = baseCode + "01"; // Código por defecto para la primera subcuenta
          
          if (existingSubaccounts && existingSubaccounts.length > 0) {
            // Encontrar el mayor sufijo numérico actual
            let maxSuffix = 0;
            
            existingSubaccounts.forEach(subaccount => {
              if (subaccount.code.startsWith(baseCode)) {
                const suffix = subaccount.code.substring(baseCode.length);
                if (suffix && !isNaN(Number(suffix))) {
                  const suffixNumber = parseInt(suffix);
                  maxSuffix = Math.max(maxSuffix, suffixNumber);
                }
              }
            });
            
            // Incrementar el sufijo y asegurar que tenga al menos 2 dígitos
            const suffixLength = Math.max(2, maxSuffix.toString().length);
            const newSuffix = (maxSuffix + 1).toString().padStart(suffixLength, '0');
            newCode = baseCode + newSuffix;
          }
          
          // Verificar si el código generado ya existe (podría ocurrir si hay inconsistencias)
          const isUnique = await verifyCodeIsUnique(newCode);
          
          if (!isUnique) {
            // Si ya existe (caso raro), añadir un sufijo aleatorio
            const randomSuffix = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            newCode = baseCode + randomSuffix;
            
            // Verificar nuevamente para estar seguros
            const isUnique2 = await verifyCodeIsUnique(newCode);
            if (!isUnique2) {
              throw new Error('No se pudo generar un código único para la cuenta');
            }
          }
          
          setFormData(prev => ({ ...prev, code: newCode }));
          setValidations(prev => ({ 
            ...prev, 
            codeExists: false,
            codeValid: true,
            codeChecked: true
          }));
        }
      } else {
        // Caso 2: Cuenta principal (sin padre)
        const typePrefixes: Record<AccountType, string> = {
          'activo': '1',
          'pasivo': '2',
          'patrimonio': '3',
          'ingreso': '4',
          'costo': '5',
          'gasto': '6',
          'cuenta_orden': '7'
        };
        
        const prefix = typePrefixes[formData.type as AccountType] || '9';
        
        // Buscar todas las cuentas principales de este tipo
        const { data: mainAccounts, error } = await supabase
          .from('accounts')
          .select('code')
          .eq('type', formData.type)
          .is('parent_id', null)
          .order('code', { ascending: false });
        
        if (error) throw error;
        
        // Por defecto usamos el prefijo seguido de "000000"
        let newCode = prefix + "000000";
        
        if (mainAccounts && mainAccounts.length > 0) {
          // Para mantener consistencia con los datos existentes, verificamos
          // si ya existe una cuenta principal con el formato estándar
          const mainAccount = mainAccounts[0];
          
          // Si ya existe al menos una cuenta principal, incrementamos el último número
          // en lugar de seguir un formato totalmente nuevo
          if (mainAccount) {
            // Si existe una cuenta como "1000000", la siguiente será "1000001"
            // Si existe una cuenta como "2000000", la siguiente será "2000001"
            const lastCode = mainAccount.code;
            // Incrementar el número apropiadamente
            if (lastCode.length >= 7) {
              const basePrefix = lastCode.substring(0, 1); // El primer carácter (1, 2, 3, etc.)
              const numericPart = parseInt(lastCode.substring(1)) || 0;
              const newNumericPart = (numericPart + 1).toString().padStart(6, '0');
              newCode = basePrefix + newNumericPart;
            }
          }
        }
        
        // Verificar si el código generado ya existe (podría ocurrir si hay inconsistencias)
        const isUnique = await verifyCodeIsUnique(newCode);
        
        if (!isUnique) {
          // Si ya existe (caso raro), generar un código con un valor más alto
          const basePrefix = newCode.substring(0, 1);
          const numericPart = parseInt(newCode.substring(1)) || 0;
          const newNumericPart = (numericPart + 10).toString().padStart(6, '0');
          newCode = basePrefix + newNumericPart;
          
          // Verificar nuevamente
          const isUnique2 = await verifyCodeIsUnique(newCode);
          if (!isUnique2) {
            throw new Error('No se pudo generar un código único para la cuenta');
          }
        }
        
        setFormData(prev => ({ ...prev, code: newCode }));
        setValidations(prev => ({ 
          ...prev, 
          codeExists: false,
          codeValid: true,
          codeChecked: true
        }));
      }
    } catch (error) {
      console.error('Error generando código de cuenta:', error);
      toast.error('Error al generar el código de cuenta: ' + (error as Error).message);
    }
  }

  // Verificar si un código es único
  async function verifyCodeIsUnique(code: string): Promise<boolean> {
    try {
      let query = supabase
        .from('accounts')
        .select('id')
        .eq('code', code);
      
      if (account?.id) {
        query = query.neq('id', account.id);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return !(data && data.length > 0); // Es único si no hay resultados
    } catch (error) {
      console.error('Error verificando unicidad del código:', error);
      return false; // En caso de error, asumimos que no es único por seguridad
    }
  }

  // Verificar si un código ya existe
  async function checkCodeExists(code: string): Promise<void> {
    if (!code) {
      setValidations(prev => ({ 
        ...prev, 
        codeExists: false,
        codeValid: false,
        codeChecked: true
      }));
      return;
    }
    
    try {
      const isUnique = await verifyCodeIsUnique(code);
      
      setValidations(prev => ({ 
        ...prev, 
        codeExists: !isUnique,
        codeValid: true,
        codeChecked: true
      }));
      
      // Si el código existe y estamos en modo automático, generar uno nuevo
      if (!isUnique && !formData.isManualCode && !account) {
        toast.info('El código generado ya está en uso. Generando uno nuevo...');
        setTimeout(() => generateAccountCode(), 300);
      }
    } catch (error) {
      console.error('Error verificando código:', error);
      setValidations(prev => ({ ...prev, codeValid: false }));
    }
  }

  // Validar campos del paso 1
  function validateStep1(): boolean {
    setValidatingStep1(true);
    
    // Verificar campos obligatorios
    if (!formData.code || !formData.name || !formData.type) {
      toast.error('Por favor complete todos los campos obligatorios');
      return false;
    }
    
    // Verificar si el código ya existe
    if (validations.codeExists) {
      toast.error('El código de cuenta ya existe. Por favor use otro código');
      return false;
    }
    
    // Verificar validez del código
    if (!validations.codeValid) {
      toast.error('El código de cuenta no es válido');
      return false;
    }
    
    return true;
  }

  // Validar campos del paso 2
  function validateStep2(): boolean {
    // Verificar que la cuenta padre sea del mismo tipo
    if (formData.parentId && !validations.parentTypeMatch) {
      toast.error('La cuenta padre debe ser del mismo tipo que la cuenta');
      return false;
    }
    
    // Verificar que no se seleccione a sí misma como cuenta padre
    if (account && formData.parentId === account.id) {
      toast.error('Una cuenta no puede ser su propia cuenta padre');
      return false;
    }
    
    return true;
  }

  // Validar todos los campos del formulario
  function validateForm(): boolean {
    // Primero validar los campos básicos (paso 1)
    if (!formData.code || !formData.name || !formData.type) {
      toast.error('Por favor complete todos los campos obligatorios');
      return false;
    }
    
    // Verificar si el código ya existe
    if (validations.codeExists) {
      toast.error('El código de cuenta ya existe. Por favor use otro código');
      return false;
    }
    
    // Verificar validez del código
    if (!validations.codeValid) {
      toast.error('El código de cuenta no es válido');
      return false;
    }
    
    // Verificar que la cuenta padre sea del mismo tipo
    if (formData.parentId && !validations.parentTypeMatch) {
      toast.error('La cuenta padre debe ser del mismo tipo que la cuenta');
      return false;
    }

    // Validaciones específicas del paso 2
    // Verificar que no se seleccione a sí misma como cuenta padre
    if (account && formData.parentId === account.id) {
      toast.error('Una cuenta no puede ser su propia cuenta padre');
      return false;
    }

    // En el caso de cuentas de grupo, verificar que no tenga transacciones asociadas
    // Nota: Esto se haría idealmente en el backend o con una consulta adicional
    
    return true;
  }

  // Guardar la cuenta
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    // Asegurarse de que estamos en el paso 2 antes de guardar
    if (step !== 2) {
      return;
    }
    
    // Validar el paso 2 específicamente
    if (!validateStep2()) {
      return;
    }
    
    // Validar el formulario completo
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Debes iniciar sesión para realizar esta acción');
      }

      const accountData = {
        code: formData.code,
        name: formData.name,
        description: formData.description,
        type: formData.type as AccountType,
        nature: formData.nature as AccountNature,
        parent_id: formData.parentId || null,
        is_parent: formData.isParent,
        created_by: user.id,
        is_active: true // Asegurar que la cuenta esté activa al crearla
      };

      if (account) {
        // Actualizar cuenta existente
        const { error } = await supabase
          .from('accounts')
          .update({
            code: formData.code,
            name: formData.name,
            description: formData.description,
            type: formData.type as AccountType,
            nature: formData.nature as AccountNature,
            parent_id: formData.parentId || null,
            is_parent: formData.isParent
          })
          .eq('id', account.id);

        if (error) throw error;
        toast.success('Cuenta actualizada exitosamente');
      } else {
        // Crear nueva cuenta
        const { error } = await supabase
          .from('accounts')
          .insert([accountData]);

        if (error) throw error;
        toast.success('Cuenta creada exitosamente');
      }

      onSuccess();
    } catch (error) {
      console.error('Error al guardar la cuenta:', error);
      toast.error((error as Error).message || 'Error al guardar la cuenta');
    } finally {
      setLoading(false);
    }
  }

  // Opciones para los selectores
  function getAccountTypeOptions(): { value: AccountType; label: string }[] {
    return [
      { value: 'activo', label: 'Activo' },
      { value: 'pasivo', label: 'Pasivo' },
      { value: 'patrimonio', label: 'Patrimonio' },
      { value: 'ingreso', label: 'Ingreso' },
      { value: 'costo', label: 'Costo' },
      { value: 'gasto', label: 'Gasto' },
      { value: 'cuenta_orden', label: 'Cuenta de Orden' }
    ];
  }

  function getAccountNatureOptions(): { value: AccountNature; label: string }[] {
    return [
      { value: 'deudora', label: 'Deudora' },
      { value: 'acreedora', label: 'Acreedora' }
    ];
  }

  // Actualizar el tipo y establecer la naturaleza automáticamente
  function handleTypeChange(type: string) {
    const newType = type as AccountType;
    // Determinar la naturaleza según el tipo de cuenta (regla de negocio fija)
    let newNature: AccountNature = 'deudora'; // Valor predeterminado
    
    // Determinar la naturaleza según el tipo de cuenta
    if (newType === 'activo' || newType === 'gasto' || newType === 'costo') {
      newNature = 'deudora';
    } else if (newType === 'pasivo' || newType === 'patrimonio' || newType === 'ingreso') {
      newNature = 'acreedora';
    }
    
    // Actualizar el formulario con el nuevo tipo y naturaleza
    setFormData({ 
      ...formData, 
      type: newType, 
      nature: newNature,
      parentId: '' // Limpiar la cuenta padre al cambiar el tipo
    });
    
    // Regenerar código automáticamente si corresponde
    if (!formData.isManualCode) {
      setTimeout(() => generateAccountCode(), 100);
    }
    
    // Actualizar cuentas padre filtradas basadas en el nuevo tipo
    const filtered = parentAccounts.filter(parent => 
      parent.type === newType && 
      parent.is_parent === true
    );
    setFilteredParentAccounts(filtered);
  }

  // Cambiar al siguiente paso
  function handleNextStep(e: React.MouseEvent) {
    // Evitar que se propague el evento y cause un envío del formulario
    e.preventDefault();
    e.stopPropagation();
    
    // Primero validar el paso actual
    const isValid = validateStep1();
    if (isValid) {
      setStep(2);
    }
  }

  // Volver al paso anterior
  function handlePrevStep(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation(); // Detener la propagación para evitar que el evento llegue al formulario
    setStep(1);
    setValidatingStep1(false);
  }

  // Validar en tiempo real si está en el paso 1
  useEffect(() => {
    if (validatingStep1) {
      validateStep1();
    }
  }, [formData.code, formData.name, validations.codeExists, validatingStep1]);

  // Renderizar el contenido según el paso actual
  function renderStepContent() {
    if (step === 1) {
      // Paso 1: Información básica
      return (
        <>
          <div className="space-y-6">
            {/* Tipo de cuenta */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-3">Tipo de cuenta</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {getAccountTypeOptions().map(option => (
                  <div 
                    key={option.value}
                    onClick={() => handleTypeChange(option.value)}
                    className={`cursor-pointer rounded-lg border p-3 text-center transition-colors ${
                      formData.type === option.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-500'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="block text-sm font-medium">{option.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Nombre y código */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-3">Identificación de la cuenta</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Caja general"
                    className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${
                      validatingStep1 && !formData.name ? 'border-red-300 ring-1 ring-red-300' : ''
                    }`}
                  />
                  {validatingStep1 && !formData.name && (
                    <p className="mt-1 text-xs text-red-600">
                      El nombre de la cuenta es obligatorio
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código <span className="text-red-500">*</span>
                    {!account && (
                      <span 
                        className="ml-2 text-xs text-blue-600 cursor-pointer hover:underline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newValue = !formData.isManualCode;
                          setFormData(prev => ({ ...prev, isManualCode: newValue }));
                          if (!newValue) {
                            // Si cambia a automático, regenerar código
                            setTimeout(() => generateAccountCode(), 100);
                          }
                        }}
                      >
                        {formData.isManualCode ? 'Usar código automático' : 'Ingresar código manualmente'}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => {
                        const newCode = e.target.value;
                        setFormData({ ...formData, code: newCode });
                        setValidations(prev => ({ ...prev, codeChecked: false }));
                      }}
                      disabled={!formData.isManualCode && !account}
                      className={`block w-full rounded-md border-gray-300 pr-10 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${
                        !formData.isManualCode && !account ? 'bg-gray-100' : ''
                      } ${
                        validations.codeExists ? 'border-red-300 ring-1 ring-red-300' : (
                          validatingStep1 && !formData.code ? 'border-red-300 ring-1 ring-red-300' : '')
                      }`}
                    />
                    {validations.codeExists && (
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      </div>
                    )}
                  </div>
                  {validations.codeExists && (
                    <p className="mt-1 text-xs text-red-600">
                      Este código ya está en uso. Por favor elige otro.
                    </p>
                  )}
                  {validatingStep1 && !formData.code && (
                    <p className="mt-1 text-xs text-red-600">
                      El código de la cuenta es obligatorio
                    </p>
                  )}
                  {!formData.isManualCode && !account && (
                    <p className="mt-1 text-xs text-gray-500">
                      El código se genera automáticamente según el tipo de cuenta y jerarquía
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Descripción */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex justify-between mb-3">
                <h3 className="font-medium text-gray-900">Descripción</h3>
                <span className="text-xs text-gray-500">Opcional</span>
              </div>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Descripción detallada de la cuenta y su propósito..."
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="mr-3 inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancelar
            </button>
            <button
              type="button" 
              onClick={handleNextStep}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></span>
                  Procesando...
                </>
              ) : (
                <>
                  Continuar <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </>
      );
    } else {
      // Paso 2: Configuración avanzada
      return (
        <>
          <div className="space-y-6">
            {/* Naturaleza contable */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center mb-3">
                <h3 className="font-medium text-gray-900">Naturaleza contable</h3>
                <div className="group relative ml-2">
                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                  <div className="hidden group-hover:block absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg z-10">
                    La naturaleza contable determina cómo se comporta el saldo de la cuenta. 
                    Se establece automáticamente según el tipo de cuenta y no puede modificarse.
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-gray-50">
                <div className="flex items-center">
                  <div className={`px-3 py-1.5 rounded-md font-medium text-sm ${
                    formData.nature === 'deudora' 
                      ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300' 
                      : 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300'
                  }`}>
                    {formData.nature === 'deudora' ? 'Deudora' : 'Acreedora'}
                  </div>
                  <span className="ml-3 text-sm text-gray-600">
                    {formData.nature === 'deudora' 
                      ? 'Las cuentas deudoras aumentan su saldo al debitar y disminuyen al acreditar.' 
                      : 'Las cuentas acreedoras aumentan su saldo al acreditar y disminuyen al debitar.'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  La naturaleza de la cuenta se determina automáticamente según el tipo seleccionado ({getAccountTypeOptions().find(o => o.value === formData.type)?.label}).
                </p>
              </div>
            </div>

            {/* Configuración jerárquica */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-3">Configuración jerárquica</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cuenta padre
                </label>
                <select
                  value={formData.parentId}
                  onChange={(e) => {
                    const newParentId = e.target.value;
                    setFormData(prev => ({ ...prev, parentId: newParentId }));
                    
                    if (!formData.isManualCode && newParentId) {
                      // Si selecciona una cuenta padre y está en modo automático, regenerar código
                      setTimeout(() => generateAccountCode(), 100);
                    }
                  }}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Sin cuenta padre (cuenta principal)</option>
                  {filteredParentAccounts
                    .filter(parentAccount => {
                      if (!account) return true;
                      return parentAccount.id !== account.id;
                    })
                    .map(parentAccount => (
                      <option key={parentAccount.id} value={parentAccount.id}>
                        {parentAccount.code} - {parentAccount.name}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Solo se muestran cuentas de grupo del tipo: {
                    getAccountTypeOptions().find(o => o.value === formData.type)?.label
                  }
                  {filteredParentAccounts.length === 0 && (
                    <span className="ml-1 text-amber-600">
                      No hay cuentas padre disponibles para este tipo. Primero debe crear una cuenta de grupo.
                    </span>
                  )}
                </p>
              </div>

              <div className="mt-4 flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="isParent"
                    type="checkbox"
                    checked={formData.isParent}
                    onChange={(e) => {
                      const isParent = e.target.checked;
                      setFormData(prev => ({ ...prev, isParent }));
                      
                      // Si marca como cuenta de grupo y tiene cuenta padre, mostrar advertencia
                      if (isParent && formData.parentId) {
                        toast.warning('Las cuentas de grupo generalmente son cuentas principales. Considere eliminar la cuenta padre.')
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="isParent" className="font-medium text-gray-700">
                    Esta es una cuenta de grupo o sumaria
                  </label>
                  <p className="text-gray-500">
                    Las cuentas de grupo solo agrupan otras cuentas y no pueden recibir movimientos directamente
                  </p>
                </div>
              </div>
            </div>

            {/* Advertencias e información */}
            {formData.isParent && (
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Importante: Cuenta de grupo
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        Las cuentas de grupo o sumarias no pueden recibir transacciones directamente en asientos contables.
                        Solo agrupan otras cuentas para organizar el catálogo contable.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handlePrevStep}
              className="mr-3 inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </button>
            <button
              type="submit"
              disabled={loading || validations.codeExists}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></span>
                  Guardando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {account ? 'Actualizar cuenta' : 'Crear cuenta'}
                </>
              )}
            </button>
          </div>
        </>
      );
    }
  }

  return (
    <div className="bg-gray-50 p-4 sm:p-6 rounded-lg">
      {/* Indicador de progreso */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-500'
            }`}>
              1
            </div>
            <div className={`ml-4 ${step >= 1 ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
              Información básica
            </div>
          </div>
          <div className="hidden sm:block w-16 h-0.5 bg-gray-200"></div>
          <div className="flex items-center">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-500'
            }`}>
              2
            </div>
            <div className={`ml-4 ${step >= 2 ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
              Configuración avanzada
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} id="accountForm">
        {renderStepContent()}
      </form>
    </div>
  );
}

export default AccountForm;