import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
};

type AccountingPeriod = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
};

type JournalEntryItem = {
  id?: string;
  journal_entry_id?: string;
  account_id: string;
  description: string;
  amount: number | null;
  is_debit: boolean;
  account?: Account;
  temp_id?: string;
};

type JournalEntryFormProps = {
  entry?: {
    id: string;
    date: string;
    entry_number: string;
    description: string;
    accounting_period_id: string;
  };
  onSuccess: () => void;
  onCancel: () => void;
};

export function JournalEntryForm({ entry, onSuccess, onCancel }: JournalEntryFormProps) {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [formData, setFormData] = useState({
    date: entry?.date || format(new Date(), 'yyyy-MM-dd'),
    description: entry?.description || '',
    accounting_period_id: entry?.accounting_period_id || '',
  });
  const [entryItems, setEntryItems] = useState<JournalEntryItem[]>([
    { 
      account_id: '', 
      description: '', 
      amount: null, 
      is_debit: true,
      temp_id: Date.now().toString() 
    }
  ]);
  const [totals, setTotals] = useState({
    totalDebit: 0,
    totalCredit: 0,
  });
  const [isBalanced, setIsBalanced] = useState(false);

  const fetchPeriods = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('is_closed', false)
        .order('start_date', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setPeriods(data);
        
        if (!entry?.accounting_period_id) {
          setFormData(prev => ({
            ...prev,
            accounting_period_id: data[0].id
          }));
        }
      } else {
        toast.warn('No hay periodos contables abiertos. Debe crear uno antes de registrar asientos.');
      }
    } catch (error) {
      console.error('Error fetching periods:', error);
      toast.error('Error al cargar los periodos contables');
    }
  }, [entry?.accounting_period_id]);

  const calculateTotals = useCallback(() => {
    const debitTotal = entryItems
      .filter(item => item.is_debit)
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    
    const creditTotal = entryItems
      .filter(item => !item.is_debit)
      .reduce((sum, item) => sum + (item.amount || 0), 0);

    setTotals({
      totalDebit: debitTotal,
      totalCredit: creditTotal,
    });

    setIsBalanced(Math.abs(debitTotal - creditTotal) < 0.01);
  }, [entryItems]);

  useEffect(() => {
    fetchAccounts();
    fetchPeriods();
    if (entry) {
      loadEntryItems(entry.id);
    }
  }, [entry, fetchPeriods]);
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  useEffect(() => {
    getCurrentUser();
    
    // Agregando listener para cambios de autenticación
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      getCurrentUser();
    });
    
    return () => {
      // Limpieza del listener cuando se desmonte el componente
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  async function getCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      } else {
        console.error('No hay usuario autenticado');
        setCurrentUserId(null);
        toast.error('No hay usuario autenticado. Inicie sesión nuevamente.');
      }
    } catch (error) {
      console.error('Error obteniendo usuario actual:', error);
      setCurrentUserId(null);
      toast.error('Error al verificar la sesión. Inicie sesión nuevamente.');
    }
  }

  useEffect(() => {
    calculateTotals();
  }, [entryItems, calculateTotals]);

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, code, name, type, nature')
        .eq('is_active', true)
        .order('code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Error al cargar las cuentas contables');
    }
  }

  async function loadEntryItems(entryId: string) {
    try {
      const { data, error } = await supabase
        .from('journal_entry_items')
        .select(`
          *,
          account:accounts(id, code, name, type, nature)
        `)
        .eq('journal_entry_id', entryId);

      if (error) throw error;

      if (data && data.length > 0) {
        const adaptedItems = data.map(item => ({
          id: item.id,
          journal_entry_id: item.journal_entry_id,
          account_id: item.account_id,
          description: item.description || '',
          amount: item.debit || item.credit || null,
          is_debit: item.debit > 0,
          account: item.account
        }));

        setEntryItems(adaptedItems);
      }
    } catch (error) {
      console.error('Error loading entry items:', error);
      toast.error('Error al cargar los detalles del asiento');
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  }

  function handleLineChange(index: number, field: string, value: string | number | boolean) {
    const updatedItems = [...entryItems];
    
    if (field === 'account_id') {
      updatedItems[index] = {
        ...updatedItems[index],
        account_id: value as string,
      };
    } else if (field === 'description') {
      updatedItems[index] = {
        ...updatedItems[index],
        description: value as string,
      };
    } else if (field === 'amount') {
      const numValue = value === '' ? null : parseFloat(value as string);
      updatedItems[index] = {
        ...updatedItems[index],
        amount: numValue,
      };
    } else if (field === 'is_debit') {
      updatedItems[index] = {
        ...updatedItems[index],
        is_debit: value as boolean,
      };
    }
    
    setEntryItems(updatedItems);
  }

  function addLine() {
    setEntryItems([
      ...entryItems,
      {
        account_id: '',
        description: '',
        amount: null,
        is_debit: true,
        temp_id: Date.now().toString(),
      },
    ]);
  }

  function removeLine(index: number) {
    if (entryItems.length <= 1) {
      toast.warn('El asiento debe tener al menos una línea');
      return;
    }
    
    const updatedItems = [...entryItems];
    updatedItems.splice(index, 1);
    setEntryItems(updatedItems);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidating(true);
    
    try {
      // Verificar si hay un usuario autenticado
      if (!currentUserId) {
        toast.error('No hay un usuario autenticado. Inicie sesión nuevamente.');
        setValidating(false);
        return;
      }
      
      if (!formData.date) {
        toast.error('La fecha es requerida');
        setValidating(false);
        return;
      }
      
      if (!formData.accounting_period_id) {
        toast.error('Debe seleccionar un periodo contable');
        setValidating(false);
        return;
      }
      
      if (!formData.description) {
        toast.error('La descripción es requerida');
        setValidating(false);
        return;
      }
      
      if (entryItems.length === 0) {
        toast.error('Debe agregar al menos una línea al asiento');
        setValidating(false);
        return;
      }
      
      const emptyAccount = entryItems.some(item => !item.account_id);
      if (emptyAccount) {
        toast.error('Todas las líneas deben tener una cuenta seleccionada');
        setValidating(false);
        return;
      }
      
      const emptyAmount = entryItems.some(item => item.amount === null || item.amount <= 0);
      if (emptyAmount) {
        toast.error('Todas las líneas deben tener un valor válido mayor a cero');
        setValidating(false);
        return;
      }
      
      if (!isBalanced) {
        toast.error('El asiento no está balanceado. El total de débitos debe ser igual al total de créditos.');
        setValidating(false);
        return;
      }
      
      const selectedPeriod = periods.find(p => p.id === formData.accounting_period_id);
      if (selectedPeriod) {
        const entryDate = new Date(formData.date);
        const periodStart = new Date(selectedPeriod.start_date);
        const periodEnd = new Date(selectedPeriod.end_date);
        
        if (entryDate < periodStart || entryDate > periodEnd) {
          toast.error('La fecha del asiento debe estar dentro del periodo contable seleccionado');
          setValidating(false);
          return;
        }
      }
      
      setValidating(false);
      setLoading(true);
      
      if (entry) {
        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({
            date: formData.date,
            description: formData.description,
            is_balanced: isBalanced,
            updated_at: new Date().toISOString(),
            total_debit: totals.totalDebit,
            total_credit: totals.totalCredit,
          })
          .eq('id', entry.id);
          
        if (updateError) throw updateError;
        
        const { error: deleteError } = await supabase
          .from('journal_entry_items')
          .delete()
          .eq('journal_entry_id', entry.id);
          
        if (deleteError) throw deleteError;
        
        await insertItemsWithStructure(entry.id);
        
        toast.success('Asiento actualizado exitosamente');
      } else {
        const entryNumber = `A-${Date.now().toString().slice(-6)}`;
        
        const { data: newEntry, error: createError } = await supabase
          .from('journal_entries')
          .insert({
            date: formData.date,
            entry_number: entryNumber,
            description: formData.description,
            accounting_period_id: formData.accounting_period_id,
            is_balanced: isBalanced,
            is_approved: false,
            created_at: new Date().toISOString(),
            total_debit: totals.totalDebit,
            total_credit: totals.totalCredit,
            created_by: currentUserId
          })
          .select('id')
          .single();
          
        if (createError) throw createError;
        
        await insertItemsWithStructure(newEntry.id);
        
        toast.success('Asiento creado exitosamente');
      }
      
      onSuccess();
    } catch (error) {
      console.error('Error saving journal entry:', error);
      toast.error('Error al guardar el asiento contable');
    } finally {
      setLoading(false);
    }
  }

  async function insertItemsWithStructure(journalEntryId: string) {
    try {
      // Verificar si currentUserId es nulo antes de insertar
      if (!currentUserId) {
        throw new Error('No hay un usuario autenticado. Inicie sesión nuevamente.');
      }

      const itemsToInsert = entryItems.map(item => {
        if (!item.amount) return null;

        return {
          journal_entry_id: journalEntryId,
          account_id: item.account_id,
          description: item.description || '',
          debit: item.is_debit ? item.amount : 0,
          credit: !item.is_debit ? item.amount : 0,
          created_by: currentUserId // Añadir el currentUserId
        };
      }).filter(item => item !== null);

      const { error } = await supabase
        .from('journal_entry_items')
        .insert(itemsToInsert);

      if (error) throw error;
    } catch (error) {
      console.error('Error inserting items:', error);
      throw error;
    }
  }

  function getAccountByType(type: string) {
    return accounts.filter(account => account.type === type);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700">
            Fecha *
          </label>
          <input
            type="date"
            id="date"
            name="date"
            required
            value={formData.date}
            onChange={handleInputChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="accounting_period_id" className="block text-sm font-medium text-gray-700">
            Periodo Contable *
          </label>
          <select
            id="accounting_period_id"
            name="accounting_period_id"
            required
            value={formData.accounting_period_id}
            onChange={handleInputChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">Seleccione un periodo</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name} ({format(new Date(period.start_date), 'dd/MM/yyyy')} - {format(new Date(period.end_date), 'dd/MM/yyyy')})
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Descripción del Asiento *
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          required
          value={formData.description}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="Describa el propósito de este asiento contable"
        />
      </div>
      
      <div className="border rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Cuenta *
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Descripción
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Tipo
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Monto (RD$) *
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {entryItems.map((item, index) => (
              <tr key={item.id || item.temp_id}>
                <td className="px-3 py-2">
                  <select
                    value={item.account_id}
                    onChange={(e) => handleLineChange(index, 'account_id', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="">Seleccione una cuenta</option>
                    <optgroup label="Activos">
                      {getAccountByType('activo').map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Pasivos">
                      {getAccountByType('pasivo').map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Patrimonio">
                      {getAccountByType('patrimonio').map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Ingresos">
                      {getAccountByType('ingreso').map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Costos">
                      {getAccountByType('costo').map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Gastos">
                      {getAccountByType('gasto').map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Cuentas de Orden">
                      {getAccountByType('cuenta_orden').map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                    placeholder="Descripción opcional"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={item.is_debit ? "debit" : "credit"}
                    onChange={(e) => handleLineChange(index, 'is_debit', e.target.value === "debit")}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="debit">Débito</option>
                    <option value="credit">Crédito</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={item.amount === null ? '' : item.amount}
                    onChange={(e) => handleLineChange(index, 'amount', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-right"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {/* Totales */}
            <tr className="bg-gray-50 font-medium">
              <td colSpan={2} className="px-3 py-2 text-right text-sm">
                Total
              </td>
              <td className="px-3 py-2 text-left text-sm">
                Débito
              </td>
              <td className="px-3 py-2 text-right text-sm">
                RD$ {totals.totalDebit.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
            <tr className="bg-gray-50 font-medium">
              <td colSpan={2} className="px-3 py-2 text-right text-sm">
              </td>
              <td className="px-3 py-2 text-left text-sm">
                Crédito
              </td>
              <td className="px-3 py-2 text-right text-sm">
                RD$ {totals.totalCredit.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar Línea
        </button>
        
        <div className="ml-auto flex items-center space-x-1">
          {isBalanced ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-500" />
          )}
          <span className={`text-sm font-medium ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
            {isBalanced ? 'Asiento balanceado' : 'Asiento no balanceado'}
          </span>
          {!isBalanced && (
            <span className="text-sm text-gray-500">
              (Diferencia: RD$ {Math.abs(totals.totalDebit - totals.totalCredit).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </span>
          )}
        </div>
      </div>
      
      <div className="flex justify-end space-x-3 pt-5 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || validating || !isBalanced}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Guardando...' : entry ? 'Actualizar Asiento' : 'Crear Asiento'}
        </button>
      </div>
    </form>
  );
}