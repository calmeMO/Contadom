import { useState, useEffect } from 'react';
import { Plus, Pencil, AlertCircle, Power, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { AccountForm } from '../components/AccountForm';
import type { Account as BaseAccount, AccountType } from '../types/database';

type Account = BaseAccount & { child_count?: number; children?: Account[] };

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | undefined>();
  const [deactivateLoading, setDeactivateLoading] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [hierarchicalView, setHierarchicalView] = useState<boolean>(true);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      setLoading(true);
      
      // Obtener todas las cuentas
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          *,
          parent:accounts(id, code, name, type)
        `)
        .order('code');

      if (error) throw error;
      
      // Verificar cuáles cuentas son padres y contar hijos
      const processedAccounts = await calculateChildCounts(data || []);
      
      // Construir estructura jerárquica para la vista
      const hierarchicalAccounts = hierarchicalView 
        ? buildHierarchy(processedAccounts) 
        : processedAccounts;
      
      setAccounts(hierarchicalAccounts);
    } catch (error) {
      console.error('Error al cargar las cuentas:', error);
      toast.error('Error al cargar las cuentas');
    } finally {
      setLoading(false);
    }
  }
  
  // Calcular cuántos hijos directos tiene cada cuenta
  async function calculateChildCounts(accounts: Account[]): Promise<Account[]> {
    const accountMap = new Map<string, number>();
    
    // Contar los hijos para cada cuenta padre
    accounts.forEach(account => {
      if (account.parent_id) {
        const currentCount = accountMap.get(account.parent_id) || 0;
        accountMap.set(account.parent_id, currentCount + 1);
      }
    });
    
    // Asignar los conteos a las cuentas
    return accounts.map(account => ({
      ...account,
      child_count: accountMap.get(account.id) || 0
    }));
  }
  
  // Construir estructura jerárquica de cuentas
  function buildHierarchy(accounts: Account[]): Account[] {
    const accountMap = new Map<string, Account>();
    const rootAccounts: Account[] = [];
    
    // Primero crear un mapa de todas las cuentas por id
    accounts.forEach(account => {
      accountMap.set(account.id, {...account, children: []});
    });
    
    // Luego construir la jerarquía
    accounts.forEach(account => {
      const mappedAccount = accountMap.get(account.id)!;
      
      if (account.parent_id && accountMap.has(account.parent_id)) {
        // Si tiene padre, agregar a los hijos del padre
        const parent = accountMap.get(account.parent_id)!;
        parent.children = parent.children || [];
        parent.children.push(mappedAccount);
      } else {
        // Si no tiene padre, es una cuenta raíz
        rootAccounts.push(mappedAccount);
      }
    });
    
    // Ordenar las cuentas por código
    return rootAccounts.sort((a, b) => a.code.localeCompare(b.code));
  }

  function toggleExpandAccount(accountId: string) {
    setExpandedAccounts(prev => 
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  }

  async function handleDeactivate(account: Account) {
    if (!confirm(`¿Está seguro de desactivar la cuenta "${account.code} - ${account.name}"?`)) {
      return;
    }

    try {
      setDeactivateLoading(account.id);

      // Verificar si la cuenta tiene cuentas hijas
      if (account.child_count && account.child_count > 0) {
        toast.error(`No se puede desactivar la cuenta porque tiene ${account.child_count} cuentas hijas asociadas.`);
        return;
      }
      
      // Verificar si la cuenta está siendo utilizada en asientos contables
      const { data: journalItems, error: journalError } = await supabase
        .from('journal_entry_items')
        .select('id')
        .eq('account_id', account.id)
        .limit(1);
      
      if (journalError) throw journalError;
      
      if (journalItems && journalItems.length > 0) {
        toast.error('No se puede desactivar la cuenta porque está siendo utilizada en asientos contables.');
        return;
      }
      
      // Desactivar la cuenta
      const { error: updateError } = await supabase
        .from('accounts')
        .update({ is_active: false })
        .eq('id', account.id);
      
      if (updateError) throw updateError;
      
      toast.success('Cuenta desactivada exitosamente');
      
      // Actualizar la lista de cuentas
      fetchAccounts();
    } catch (error: any) {
      console.error('Error al desactivar la cuenta:', error);
      
      if (error.message) {
        toast.error(`Error: ${error.message}`);
      } else {
        toast.error('Error al desactivar la cuenta');
      }
    } finally {
      setDeactivateLoading(null);
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

  function getFilteredAccounts() {
    let filtered = accounts;
    
    // Filtrar por tipo de cuenta si se ha seleccionado un filtro
    if (filter !== 'all') {
      if (hierarchicalView) {
        // En modo jerárquico, filtrar recursivamente
        filtered = filterAccountsRecursively(accounts, filter);
      } else {
        // En modo plano, filtrar directamente
        filtered = accounts.filter(account => account.type === filter);
      }
    }
    
    // Filtrar por término de búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      if (hierarchicalView) {
        // En modo jerárquico, filtrar recursivamente
        filtered = searchAccountsRecursively(filtered, term);
      } else {
        // En modo plano, filtrar directamente
        filtered = filtered.filter(account => 
          account.code.toLowerCase().includes(term) || 
          account.name.toLowerCase().includes(term)
        );
      }
    }
    
    return filtered;
  }
  
  // Filtrar cuentas jerárquicamente por tipo
  function filterAccountsRecursively(accounts: Account[], type: string): Account[] {
    return accounts
      .filter(account => {
        // Incluir la cuenta si coincide con el filtro
        const matchesFilter = account.type === type;
        
        // O si tiene hijos que coincidan con el filtro
        let hasMatchingChildren = false;
        if (account.children && account.children.length > 0) {
          const filteredChildren = filterAccountsRecursively(account.children, type);
          hasMatchingChildren = filteredChildren.length > 0;
        }
        
        return matchesFilter || hasMatchingChildren;
      })
      .map(account => {
        // Si tiene hijos, filtrarlos también
        if (account.children && account.children.length > 0) {
          return {
            ...account,
            children: filterAccountsRecursively(account.children, type)
          };
        }
        return account;
      });
  }
  
  // Buscar cuentas jerárquicamente por término
  function searchAccountsRecursively(accounts: Account[], term: string): Account[] {
    return accounts
      .filter(account => {
        // Incluir la cuenta si coincide con la búsqueda
        const matchesTerm = 
          account.code.toLowerCase().includes(term) || 
          account.name.toLowerCase().includes(term);
        
        // O si tiene hijos que coincidan con la búsqueda
        let hasMatchingChildren = false;
        if (account.children && account.children.length > 0) {
          const searchedChildren = searchAccountsRecursively(account.children, term);
          hasMatchingChildren = searchedChildren.length > 0;
        }
        
        return matchesTerm || hasMatchingChildren;
      })
      .map(account => {
        // Si tiene hijos, filtrarlos también
        if (account.children && account.children.length > 0) {
          return {
            ...account,
            children: searchAccountsRecursively(account.children, term)
          };
        }
        return account;
      });
  }

  function getAccountTypeLabel(type: string): string {
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
  }

  function getAccountTypeColor(type: string): string {
    const colors: Record<string, string> = {
      'activo': 'bg-blue-100 text-blue-800',
      'pasivo': 'bg-red-100 text-red-800',
      'patrimonio': 'bg-green-100 text-green-800',
      'ingreso': 'bg-purple-100 text-purple-800',
      'costo': 'bg-orange-100 text-orange-800',
      'gasto': 'bg-pink-100 text-pink-800',
      'cuenta_orden': 'bg-gray-100 text-gray-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  }

  function getAccountNatureLabel(nature: string): string {
    return nature === 'deudora' ? 'Deudora' : 'Acreedora';
  }

  function getAccountNatureColor(nature: string): string {
    return nature === 'deudora' 
      ? 'bg-indigo-100 text-indigo-800'
      : 'bg-yellow-100 text-yellow-800';
  }

  function getAccountUsageLabel(account: Account): string {
    return account.is_parent 
      ? 'Cuenta Padre' 
      : 'Cuenta de Movimiento';
  }

  function getAccountUsageColor(account: Account): string {
    return account.is_parent
      ? 'bg-blue-100 text-blue-800'
      : 'bg-emerald-100 text-emerald-800';
  }
  
  function getAvailableTypes(): {value: string, label: string}[] {
    return [
      { value: 'all', label: 'Todos los tipos' },
      { value: 'activo', label: 'Activos' },
      { value: 'pasivo', label: 'Pasivos' },
      { value: 'patrimonio', label: 'Patrimonio' },
      { value: 'ingreso', label: 'Ingresos' },
      { value: 'gasto', label: 'Gastos' },
      { value: 'costo', label: 'Costos' },
      { value: 'cuenta_orden', label: 'Cuentas de Orden' }
    ];
  }
  
  // Renderizar tabla de cuentas de forma recursiva
  function renderAccountRows(accounts: Account[], level: number = 0) {
    const renderedRows: JSX.Element[] = [];
    
    accounts.forEach(account => {
      const hasChildren = account.children && account.children.length > 0;
      const isExpanded = expandedAccounts.includes(account.id);
      
      renderedRows.push(
        <tr 
          key={account.id} 
          className={level > 0 ? 'bg-gray-50' : ''}
        >
          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
            <div className="flex items-center">
              <div style={{ width: `${level * 20}px` }} className="flex-shrink-0"></div>
              {hasChildren && (
                <button 
                  onClick={() => toggleExpandAccount(account.id)}
                  className="mr-2 focus:outline-none"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              )}
              {!hasChildren && (
                <div className="w-6"></div>
              )}
              <span className={account.is_parent ? 'font-semibold' : ''}>
                {account.code}
              </span>
            </div>
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            <div className="flex items-center">
              <div style={{ width: `${level * 20}px` }} className="flex-shrink-0"></div>
              <span className={account.is_parent ? 'font-semibold' : ''}>
                {account.name}
              </span>
            </div>
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
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getAccountUsageColor(account)}`}>
              {getAccountUsageLabel(account)}
            </span>
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(account)}
                className="text-blue-600 hover:text-blue-900"
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              {account.is_active && (
                <button
                  onClick={() => handleDeactivate(account)}
                  disabled={deactivateLoading === account.id || (account.child_count && account.child_count > 0)}
                  className={`text-red-600 hover:text-red-900 ${
                    deactivateLoading === account.id || (account.child_count && account.child_count > 0) 
                      ? 'opacity-50 cursor-not-allowed' 
                      : ''
                  }`}
                  title={account.child_count && account.child_count > 0 
                    ? 'No se puede desactivar: tiene cuentas hijas' 
                    : 'Desactivar'}
                >
                  {deactivateLoading === account.id ? (
                    <div className="animate-spin h-4 w-4 border-b-2 border-red-600 rounded-full"></div>
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </td>
        </tr>
      );
      
      // Renderizar hijos si existen y la cuenta está expandida
      if (hasChildren && isExpanded) {
        renderedRows.push(...renderAccountRows(account.children!, level + 1));
      }
    });
    
    return renderedRows;
  }

  // Renderizar tabla de cuentas en modo plano
  function renderFlatAccountRows(accounts: Account[]) {
    return accounts.map(account => (
      <tr key={account.id}>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          <span className={account.is_parent ? 'font-semibold' : ''}>
            {account.code}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <span className={account.is_parent ? 'font-semibold' : ''}>
            {account.name}
          </span>
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
          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getAccountUsageColor(account)}`}>
            {getAccountUsageLabel(account)}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <div className="flex space-x-2">
            <button
              onClick={() => handleEdit(account)}
              className="text-blue-600 hover:text-blue-900"
              title="Editar"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {account.is_active && (
              <button
                onClick={() => handleDeactivate(account)}
                disabled={deactivateLoading === account.id || (account.child_count && account.child_count > 0)}
                className={`text-red-600 hover:text-red-900 ${
                  deactivateLoading === account.id || (account.child_count && account.child_count > 0) 
                    ? 'opacity-50 cursor-not-allowed' 
                    : ''
                }`}
                title={account.child_count && account.child_count > 0 
                  ? 'No se puede desactivar: tiene cuentas hijas' 
                  : 'Desactivar'}
              >
                {deactivateLoading === account.id ? (
                  <div className="animate-spin h-4 w-4 border-b-2 border-red-600 rounded-full"></div>
                ) : (
                  <Power className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </td>
      </tr>
    ));
  }

  const filteredAccounts = getFilteredAccounts();

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

      {/* Filtros y búsqueda */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3">
            <label htmlFor="type-filter" className="block text-sm font-medium text-gray-700">
              Filtrar por tipo
            </label>
            <select
              id="type-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              {getAvailableTypes().map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="md:col-span-5">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700">
              Buscar por código o nombre
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="text"
                name="search"
                id="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-3 pr-10 py-2 sm:text-sm border-gray-300 rounded-md"
                placeholder="Buscar cuenta..."
              />
            </div>
          </div>
          
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={() => setHierarchicalView(!hierarchicalView)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <FileText className="h-5 w-5 mr-2" />
              {hierarchicalView ? 'Vista Plana' : 'Vista Jerárquica'}
            </button>
          </div>
          
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={() => {
                setExpandedAccounts(
                  expandedAccounts.length === 0 
                    ? accounts.filter(a => a.children && a.children.length > 0).map(a => a.id)
                    : []
                );
              }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {expandedAccounts.length === 0 ? 'Expandir Todo' : 'Colapsar Todo'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {searchTerm || filter !== 'all' 
                  ? 'No se encontraron cuentas con los filtros aplicados' 
                  : 'No hay cuentas'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || filter !== 'all' 
                  ? 'Intente con otros criterios de búsqueda' 
                  : 'Comience creando una nueva cuenta contable'}
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
                      Estado
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Tipo de Cuenta
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
                  {hierarchicalView 
                    ? renderAccountRows(filteredAccounts)
                    : renderFlatAccountRows(filteredAccounts)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}