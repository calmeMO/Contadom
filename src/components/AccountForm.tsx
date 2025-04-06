import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import type { Account, AccountType, AccountNature } from '../types/database';
import { X, HelpCircle, AlertTriangle, Check } from 'lucide-react';

interface AccountFormProps {
  account?: Account;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AccountForm({ account, onSuccess, onCancel }: AccountFormProps) {
  // Estados principales
  const [loading, setLoading] = useState(false);
  const [parentAccounts, setParentAccounts] = useState<Account[]>([]);
  const [filteredParentAccounts, setFilteredParentAccounts] = useState<Account[]>([]);
  const [validatingForm, setValidatingForm] = useState(false);
  
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
      // Evitamos regenerar automáticamente si ya hay un cambio de tipo en proceso
      // Solo generamos códigos cuando el código está vacío
      if (!formData.code) {
        generateAccountCode();
      }
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

  // Generar código basado en el tipo de cuenta y nombre
  async function generateAccountCode() {
    if (loading) return;
    
    try {
      setLoading(true);
      
      // Obtener el prefijo según el tipo de cuenta
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
      
      // Base del código - siempre empieza con el prefijo del tipo
      let baseCode = prefix;
      
      // Si tiene cuenta padre, usar el código padre como base
      if (formData.parentId) {
        const parentAccount = parentAccounts.find(acc => acc.id === formData.parentId);
        if (parentAccount) {
          baseCode = parentAccount.code;
        }
      }
      
      // Obtener una representación simplificada del nombre (sin espacios, caracteres especiales)
      let namePart = '';
      if (formData.name) {
        // Convertir nombre a mayúsculas, eliminar acentos/caracteres especiales y espacios
        namePart = formData.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Z0-9]/g, "");
        
        // Tomar solo los primeros 3 caracteres del nombre o menos si es más corto
        namePart = namePart.substring(0, Math.min(3, namePart.length));
      } else {
        // Si no hay nombre, usar "XXX"
        namePart = "XXX";
      }
      
      // Generar un sufijo numérico aleatorio de 3 dígitos
      const randomSuffix = Math.floor(Math.random() * 900 + 100).toString();
      
      // Combinar las partes para formar el código
      let newCode = '';
      
      if (formData.parentId) {
        // Para subcuentas: CODIGO_PADRE + NOMBRE(3) + RANDOM(3)
        newCode = baseCode + namePart + randomSuffix;
      } else {
        // Para cuentas principales: TIPO(1) + NOMBRE(3) + RANDOM(4)
        const extendedRandom = Math.floor(Math.random() * 9000 + 1000).toString();
        newCode = baseCode + namePart + extendedRandom;
      }
      
      // Verificar si el código generado ya existe
      let isUnique = await verifyCodeIsUnique(newCode);
      let intentos = 0;
      const maxIntentos = 5;
      
      // Si no es único, seguir generando hasta encontrar uno disponible
      while (!isUnique && intentos < maxIntentos) {
        intentos++;
        // Generar un nuevo sufijo aleatorio
        const newRandomSuffix = Math.floor(Math.random() * 900 + 100).toString();
        
        if (formData.parentId) {
          newCode = baseCode + namePart + newRandomSuffix;
        } else {
          const newExtendedRandom = Math.floor(Math.random() * 9000 + 1000).toString();
          newCode = baseCode + namePart + newExtendedRandom;
        }
        
        isUnique = await verifyCodeIsUnique(newCode);
      }
      
      if (!isUnique) {
        throw new Error('No se pudo generar un código único. Intente un nombre diferente.');
      }
      
      // Actualizar el formulario con el nuevo código
      setFormData(prev => ({ ...prev, code: newCode }));
      setValidations(prev => ({
        ...prev,
        codeExists: false,
        codeValid: true,
        codeChecked: true
      }));
      
    } catch (error) {
      console.error('Error generando código de cuenta:', error);
      toast.error('Error al generar el código de cuenta: ' + (error as Error).message);
    } finally {
      setLoading(false);
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

  // Validar todos los campos del formulario
  function validateForm(): boolean {
    setValidatingForm(true);

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

  // Guardar la cuenta
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    
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
    // Evitar procesar si el tipo no ha cambiado
    if (formData.type === type) return;
    
    const newType = type as AccountType;
    // Determinar la naturaleza según el tipo de cuenta (regla de negocio fija)
    let newNature: AccountNature = 'deudora'; // Valor predeterminado
    
    // Determinar la naturaleza según el tipo de cuenta
    if (newType === 'activo' || newType === 'gasto' || newType === 'costo') {
      newNature = 'deudora';
    } else if (newType === 'pasivo' || newType === 'patrimonio' || newType === 'ingreso') {
      newNature = 'acreedora';
    }
    
    // Actualizar tipo, naturaleza y limpiar parentId
    setFormData(prev => ({
      ...prev,
      type: newType,
      nature: newNature,
      parentId: '',
      code: ''  // Limpiar el código para forzar regeneración
    }));
    
    // Actualizar cuentas padre filtradas basadas en el nuevo tipo
    const filtered = parentAccounts.filter(parent => 
      parent.type === newType && 
      parent.is_parent === true
    );
    setFilteredParentAccounts(filtered);
    
    // Generar un nuevo código basado en el tipo y nombre si hay nombre
    if (formData.name) {
      setTimeout(() => generateAccountCode(), 100);
    }
  }

  // Actualizar cuando se selecciona una cuenta padre
  function handleParentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const parentId = e.target.value;
    
    // Actualizar la cuenta padre y limpiar el código
    setFormData(prev => ({ 
      ...prev, 
      parentId,
      code: '' // Limpiar el código para forzar regeneración
    }));
    
    // Generar un nuevo código si hay nombre
    if (formData.name) {
      setTimeout(() => generateAccountCode(), 100);
    }
  }
  
  // Función para regenerar el código cuando cambia el nombre
  function handleNameChange(name: string) {
    setFormData(prev => ({ ...prev, name }));
    
    // Si no está en modo manual, generar código basado en el nuevo nombre
    if (!formData.isManualCode && name.length >= 3) {
      // Pequeño retraso para evitar demasiadas generaciones mientras se escribe
      const timer = setTimeout(() => generateAccountCode(), 500);
      return () => clearTimeout(timer);
    }
  }

  // Validar en tiempo real el formulario
  useEffect(() => {
    if (validatingForm) {
      validateForm();
    }
  }, [formData.code, formData.name, validations.codeExists, validatingForm]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center overflow-auto p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 z-10 bg-gray-100 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">
            {account ? 'Editar Cuenta' : 'Nueva Cuenta'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-8">
            {/* Sección: Información Básica */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información Básica</h3>
              
              {/* Tipo de cuenta */}
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Tipo de cuenta</h4>
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
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Identificación de la cuenta</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Ej: Caja general"
                      className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${
                        validatingForm && !formData.name ? 'border-red-300 ring-1 ring-red-300' : ''
                      }`}
                    />
                    {validatingForm && !formData.name && (
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
                            validatingForm && !formData.code ? 'border-red-300 ring-1 ring-red-300' : '')
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
                    {validatingForm && !formData.code && (
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
                  <h4 className="font-medium text-gray-900">Descripción</h4>
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

            {/* Sección: Configuración Avanzada */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Configuración Avanzada</h3>
              
              {/* Naturaleza contable */}
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-6">
                <div className="flex items-center mb-3">
                  <h4 className="font-medium text-gray-900">Naturaleza contable</h4>
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
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Configuración jerárquica</h4>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuenta padre
                  </label>
                  <select
                    value={formData.parentId}
                    onChange={handleParentChange}
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
          </div>

          <div className="mt-8 border-t pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancelar
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
        </form>
      </div>
    </div>
  );
}

export default AccountForm;