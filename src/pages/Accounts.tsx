import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, AlertCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { AccountForm } from '../components/AccountForm';
import type { Account } from '../types/database';

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | undefined>();
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          *,
          category:account_categories(name),
          parent:accounts(code, name)
        `)
        .order('code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Error al cargar las cuentas');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(account: Account) {
    if (!confirm('¿Está seguro de eliminar esta cuenta? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      setDeleteLoading(account.id);

      // 1. Verificar si la cuenta tiene cuentas hijas
      const { data: childAccounts, error: childError } = await supabase
        .from('accounts')
        .select('id, code, name')
        .eq('parent_id', account.id)
        .limit(1);
      
      if (childError) throw childError;
      
      if (childAccounts && childAccounts.length > 0) {
        toast.error(`No se puede eliminar la cuenta porque tiene cuentas hijas asociadas. Primero debe eliminar o reasignar la cuenta: ${childAccounts[0].code} - ${childAccounts[0].name}`);
        return;
      }
      
      // 2. Verificar si la cuenta está siendo utilizada en asientos contables
      const { data: journalItems, error: journalError } = await supabase
        .from('journal_entry_items')
        .select('id, journal_entry_id')
        .eq('account_id', account.id)
        .limit(1);
      
      if (journalError) throw journalError;
      
      if (journalItems && journalItems.length > 0) {
        toast.error('No se puede eliminar la cuenta porque está siendo utilizada en asientos contables. En sistemas contables, las cuentas con movimientos no deben eliminarse por razones de auditoría.');
        return;
      }
      
      // 3. Si pasa todas las verificaciones, ofrecer opciones:
      //    a. Desactivar la cuenta (recomendado en sistemas contables)
      //    b. Eliminar completamente (solo si no tiene historial)
      
      const shouldDeactivateOnly = confirm(
        'En sistemas contables profesionales, se recomienda desactivar las cuentas en lugar de eliminarlas para mantener la integridad histórica.\n\n' +
        'Presione "Aceptar" para desactivar la cuenta (recomendado).\n' +
        'Presione "Cancelar" para eliminar completamente la cuenta.'
      );
      
      if (shouldDeactivateOnly) {
        // Desactivar la cuenta
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ is_active: false })
          .eq('id', account.id);
        
        if (updateError) throw updateError;
        
        toast.success('Cuenta desactivada exitosamente');
      } else {
        // Eliminar completamente la cuenta
        const { error: deleteError } = await supabase
          .from('accounts')
          .delete()
          .eq('id', account.id);
        
        if (deleteError) throw deleteError;
        
        toast.success('Cuenta eliminada exitosamente');
      }
      
      // Actualizar la lista de cuentas
      fetchAccounts();
    } catch (error: any) {
      console.error('Error al procesar la cuenta:', error);
      
      // Mensajes de error más específicos según el tipo de error
      if (error.code === '23503') { // Foreign key violation
        toast.error('No se puede eliminar la cuenta porque está siendo utilizada en otras partes del sistema');
      } else if (error.message) {
        toast.error(`Error: ${error.message}`);
      } else {
        toast.error('Error al procesar la cuenta');
      }
    } finally {
      setDeleteLoading(null);
    }
  }

  function handleEdit(account: Account) {
    setSelectedAccount(account);
    setShowForm(true);
  }

  function handleFormSuccess() {
    setShowForm(false);
    setSelectedAccount(undefined);
    fetchAccounts();
  }

  function getAccountTypeLabel(type: string) {
    const types: Record<string, string> = {
      'activo': 'Activo',
      'pasivo': 'Pasivo',
      'patrimonio': 'Patrimonio',
      'ingreso': 'Ingreso',
      'costo': 'Costo',
      'gasto': 'Gasto',
      'cuenta_orden': 'Cuenta de Orden',
      // Mantener compatibilidad con tipos antiguos por si acaso
      'activo_corriente': 'Activo Corriente',
      'activo_no_corriente': 'Activo No Corriente',
      'pasivo_corriente': 'Pasivo Corriente',
      'pasivo_no_corriente': 'Pasivo No Corriente',
      'asset': 'Activo',
      'liability': 'Pasivo',
      'equity': 'Capital',
      'revenue': 'Ingreso',
      'expense': 'Gasto'
    };
    return types[type] || type;
  }

  function getAccountTypeColor(type: string) {
    const colors: Record<string, string> = {
      'activo': 'bg-blue-100 text-blue-800',
      'pasivo': 'bg-red-100 text-red-800',
      'patrimonio': 'bg-green-100 text-green-800',
      'ingreso': 'bg-purple-100 text-purple-800',
      'costo': 'bg-orange-100 text-orange-800',
      'gasto': 'bg-pink-100 text-pink-800',
      'cuenta_orden': 'bg-gray-100 text-gray-800',
      // Compatibilidad con tipos antiguos
      'activo_corriente': 'bg-blue-100 text-blue-800',
      'activo_no_corriente': 'bg-blue-100 text-blue-800',
      'pasivo_corriente': 'bg-red-100 text-red-800',
      'pasivo_no_corriente': 'bg-red-100 text-red-800',
      'asset': 'bg-blue-100 text-blue-800',
      'liability': 'bg-red-100 text-red-800',
      'equity': 'bg-green-100 text-green-800',
      'revenue': 'bg-purple-100 text-purple-800',
      'expense': 'bg-pink-100 text-pink-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  }

  function getAccountNatureLabel(nature: string) {
    return nature === 'deudora' ? 'Deudora' : 'Acreedora';
  }

  function getAccountNatureColor(nature: string) {
    return nature === 'deudora' 
      ? 'bg-indigo-100 text-indigo-800'
      : 'bg-yellow-100 text-yellow-800';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Catálogo de Cuentas
        </h1>
        <button
          onClick={() => {
            setSelectedAccount(undefined);
            setShowForm(true);
          }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-5 w-5 mr-2" />
          Nueva Cuenta
        </button>
      </div>

      {showForm && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              {selectedAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
            </h3>
            <AccountForm
              account={selectedAccount}
              onSuccess={handleFormSuccess}
              onCancel={() => {
                setShowForm(false);
                setSelectedAccount(undefined);
              }}
            />
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No hay cuentas
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Comience creando una nueva cuenta contable.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Código
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Nombre
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Tipo
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Naturaleza
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Categoría
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Cuenta Padre
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Estado
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {account.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {account.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getAccountTypeColor(account.type)}`}>
                          {getAccountTypeLabel(account.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getAccountNatureColor(account.nature)}`}>
                          {getAccountNatureLabel(account.nature)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {account.category?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {account.parent ? `${account.parent.code} - ${account.parent.name}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            account.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {account.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleEdit(account)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(account)}
                          disabled={deleteLoading === account.id}
                          className={`text-red-600 hover:text-red-900 ${deleteLoading === account.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {deleteLoading === account.id ? (
                            <div className="animate-spin h-4 w-4 border-b-2 border-red-600 rounded-full"></div>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}