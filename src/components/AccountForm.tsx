import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import type { Account, AccountCategory, AccountType, AccountNature } from '../types/database';

interface AccountFormProps {
  account?: Account;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AccountForm({ account, onSuccess, onCancel }: AccountFormProps) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [parentAccounts, setParentAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState({
    code: account?.code || '',
    name: account?.name || '',
    description: account?.description || '',
    type: account?.type || 'activo',
    nature: account?.nature || 'deudora',
    categoryId: account?.category_id || '',
    parentId: account?.parent_id || '',
  });
  const [autoGenerateCode, setAutoGenerateCode] = useState(!account);

  useEffect(() => {
    fetchCategories();
    fetchParentAccounts();
  }, []);

  // Efecto para generar automáticamente el código cuando cambian los valores relevantes
  useEffect(() => {
    if (autoGenerateCode && !account) {
      generateAccountCode();
    }
  }, [formData.type, formData.categoryId, formData.parentId, autoGenerateCode]);

  async function fetchCategories() {
    try {
      const { data, error } = await supabase
        .from('account_categories')
        .select('*')
        .order('code');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Error al cargar las categorías');
    }
  }

  async function fetchParentAccounts() {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('code');
      
      if (error) throw error;
      setParentAccounts(data || []);
    } catch (error) {
      console.error('Error fetching parent accounts:', error);
      toast.error('Error al cargar las cuentas padre');
    }
  }

  // Función para generar automáticamente el código de la cuenta
  async function generateAccountCode() {
    try {
      // Si tiene cuenta padre, el código se basa en la cuenta padre
      if (formData.parentId) {
        const parentAccount = parentAccounts.find(acc => acc.id === formData.parentId);
        if (parentAccount) {
          // Buscar el último hijo de esta cuenta padre para incrementar el código
          const { data, error } = await supabase
            .from('accounts')
            .select('code')
            .eq('parent_id', formData.parentId)
            .order('code', { ascending: false })
            .limit(1);
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            // Incrementar el último dígito del código del último hijo
            const lastChildCode = data[0].code;
            const baseCode = parentAccount.code;
            
            // Si el código del hijo tiene la misma longitud que el padre + 2 dígitos
            if (lastChildCode.startsWith(baseCode) && lastChildCode.length >= baseCode.length + 2) {
              const suffix = lastChildCode.substring(baseCode.length);
              const newSuffix = (parseInt(suffix) + 1).toString().padStart(2, '0');
              setFormData(prev => ({ ...prev, code: baseCode + newSuffix }));
            } else {
              // Si no hay un patrón claro, simplemente añadir "01" al código del padre
              setFormData(prev => ({ ...prev, code: baseCode + '01' }));
            }
          } else {
            // Si no hay hijos, este es el primero, añadir "01"
            setFormData(prev => ({ ...prev, code: parentAccount.code + '01' }));
          }
        }
      } 
      // Si no tiene cuenta padre pero tiene categoría, basar el código en la categoría
      else if (formData.categoryId) {
        const category = categories.find(cat => cat.id === formData.categoryId);
        if (category) {
          // Buscar la última cuenta en esta categoría para incrementar el código
          const { data, error } = await supabase
            .from('accounts')
            .select('code')
            .eq('category_id', formData.categoryId)
            .is('parent_id', null) // Solo cuentas principales (sin padre)
            .order('code', { ascending: false })
            .limit(1);
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            const lastCode = data[0].code;
            const categoryPrefix = category.code;
            
            // Si el código comienza con el prefijo de la categoría
            if (lastCode.startsWith(categoryPrefix)) {
              // Extraer el número después del prefijo de la categoría
              const suffix = lastCode.substring(categoryPrefix.length);
              // Incrementar este número y mantener el mismo número de dígitos
              const newSuffix = (parseInt(suffix) + 1).toString().padStart(suffix.length, '0');
              setFormData(prev => ({ ...prev, code: categoryPrefix + newSuffix }));
            } else {
              // Si no hay un patrón claro, usar el código de categoría + "01"
              setFormData(prev => ({ ...prev, code: categoryPrefix + '01' }));
            }
          } else {
            // Si no hay cuentas en esta categoría, esta es la primera
            setFormData(prev => ({ ...prev, code: category.code + '01' }));
          }
        }
      } 
      // Si no tiene ni padre ni categoría, generar basado en el tipo
      else {
        // Prefijos según el tipo de cuenta
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
        
        // Buscar la última cuenta de este tipo
        const { data, error } = await supabase
          .from('accounts')
          .select('code')
          .eq('type', formData.type)
          .is('parent_id', null) // Solo cuentas principales
          .is('category_id', null) // Sin categoría
          .order('code', { ascending: false })
          .limit(1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const lastCode = data[0].code;
          if (lastCode.startsWith(prefix)) {
            // Incrementar el número manteniendo la misma longitud
            const numericPart = lastCode.substring(1);
            const newNumericPart = (parseInt(numericPart) + 1).toString().padStart(numericPart.length, '0');
            setFormData(prev => ({ ...prev, code: prefix + newNumericPart }));
          } else {
            // Si no hay un patrón claro, usar el prefijo + "001"
            setFormData(prev => ({ ...prev, code: prefix + '001' }));
          }
        } else {
          // Si no hay cuentas de este tipo, esta es la primera
          setFormData(prev => ({ ...prev, code: prefix + '001' }));
        }
      }
    } catch (error) {
      console.error('Error generando código de cuenta:', error);
      // No mostrar error al usuario, simplemente dejar el código vacío
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Obtener el usuario actual
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
        category_id: formData.categoryId || null,
        parent_id: formData.parentId || null,
        created_by: user.id // Solo incluir la columna created_by, sin updated_by
      };

      if (account) {
        // Update existing account - No incluir created_by en actualizaciones
        const { error } = await supabase
          .from('accounts')
          .update({
            code: formData.code,
            name: formData.name,
            description: formData.description,
            type: formData.type as AccountType,
            nature: formData.nature as AccountNature,
            category_id: formData.categoryId || null,
            parent_id: formData.parentId || null
            // No incluimos created_by ni updated_by en la actualización
          })
          .eq('id', account.id);

        if (error) throw error;
        toast.success('Cuenta actualizada exitosamente');
      } else {
        // Create new account
        const { error } = await supabase
          .from('accounts')
          .insert([accountData]);

        if (error) throw error;
        toast.success('Cuenta creada exitosamente');
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error((error as Error).message || 'Error al guardar la cuenta');
    } finally {
      setLoading(false);
    }
  }

  // Función para mapear el tipo de cuenta a etiquetas en español
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

  // Función para las opciones de naturaleza de la cuenta
  function getAccountNatureOptions(): { value: AccountNature; label: string }[] {
    return [
      { value: 'deudora', label: 'Deudora' },
      { value: 'acreedora', label: 'Acreedora' }
    ];
  }

  // Función para actualizar automáticamente la naturaleza basada en el tipo de cuenta
  function handleTypeChange(type: string) {
    const newType = type as AccountType;
    let newNature: AccountNature = formData.nature;
    
    // Asignar naturaleza por defecto según el tipo
    if (newType === 'activo' || newType === 'gasto' || newType === 'costo') {
      newNature = 'deudora';
    } else if (newType === 'pasivo' || newType === 'patrimonio' || newType === 'ingreso') {
      newNature = 'acreedora';
    }
    
    setFormData({ ...formData, type: newType, nature: newNature });
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">
        {account ? 'Editar Cuenta' : 'Nueva Cuenta'}
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                Código
              </label>
              {!account && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="autoGenerateCode"
                    checked={autoGenerateCode}
                    onChange={(e) => setAutoGenerateCode(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="autoGenerateCode" className="ml-2 block text-sm text-gray-500">
                    Autogenerar
                  </label>
                </div>
              )}
            </div>
            <input
              type="text"
              id="code"
              name="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
              readOnly={autoGenerateCode && !account}
            />
          </div>
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nombre
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">
              Tipo
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              {getAccountTypeOptions().map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="nature" className="block text-sm font-medium text-gray-700">
              Naturaleza
            </label>
            <select
              id="nature"
              name="nature"
              value={formData.nature}
              onChange={(e) => setFormData({ ...formData, nature: e.target.value as AccountNature })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              {getAccountNatureOptions().map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">
              Categoría
            </label>
            <select
              id="categoryId"
              name="categoryId"
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Seleccionar categoría</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.code} - {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="parentId" className="block text-sm font-medium text-gray-700">
              Cuenta Padre
            </label>
            <select
              id="parentId"
              name="parentId"
              value={formData.parentId}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Sin cuenta padre</option>
              {parentAccounts
                .filter((a) => a.id !== account?.id)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Descripción
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {loading ? 'Guardando...' : account ? 'Actualizar' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Añadir exportación por defecto manteniendo la exportación con nombre
export default AccountForm;