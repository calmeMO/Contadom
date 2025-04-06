import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase';
import { User, Mail, Shield, Calendar, Edit, Trash2, XCircle, CheckCircle, PlusCircle, UserCog } from 'lucide-react';

// Interfaces
interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'accountant' | 'user';
  created_at: string;
  is_active: boolean;
}

interface UserFormData {
  email: string;
  full_name: string;
  role: 'admin' | 'accountant' | 'user';
  password?: string;
}

// Componente Modal
const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}> = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">{title}</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Cerrar"
          >
            <XCircle size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export function UserSettings() {
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [fixRolesLoading, setFixRolesLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    full_name: '',
    role: 'user',
    password: ''
  });
  const [syncStats, setSyncStats] = useState<any>(null);
  const [fixRolesStats, setFixRolesStats] = useState<any>(null);

  // Cargar datos iniciales
  useEffect(() => {
    fetchCurrentUser();
  }, []);

  // Obtener usuario actual
  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        
        if (data) {
          setCurrentUser(data as UserData);
          // Solo administradores pueden ver y gestionar usuarios
          if (data.role === 'admin') {
          fetchUsers();
          }
        }
      }
    } catch (error) {
      console.error('Error al obtener usuario actual:', error);
      toast.error('No se pudo cargar la información del usuario');
    }
  };

  // Obtener todos los usuarios
  const fetchUsers = async () => {
    setLoading(true);
    try {
      console.log('Obteniendo usuarios de la tabla user_profiles...');
      
      // 1. Consultar todos los perfiles, incluidos inactivos para depuración
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error al consultar user_profiles:', error);
        throw error;
      }
      
      console.log(`Se encontraron ${data?.length || 0} perfiles en la base de datos:`, data);
      
      // Mostrar todos los usuarios para depuración, incluso los inactivos
      setUsers(data || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      toast.error('No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  // Sincronizar perfiles de usuarios manualmente
  const syncUserProfiles = async () => {
    setSyncLoading(true);
    setSyncStats(null);
    
    try {
      toast.info('Sincronizando perfiles de usuario...');
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-user-profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al sincronizar perfiles');
      }
      
      const result = await response.json();
      console.log('Resultado de sincronización:', result);
      
      // Guardar estadísticas
      setSyncStats(result);
      
      // Mostrar resultados
      if (result.profiles_created > 0) {
        toast.success(`Se han creado ${result.profiles_created} perfiles de usuario`);
      } else {
        toast.success('Todos los perfiles están sincronizados correctamente');
      }
      
      // Actualizar la lista de usuarios
      fetchUsers();
    } catch (error: any) {
      console.error('Error al sincronizar perfiles:', error);
      toast.error(`Error al sincronizar perfiles: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  // Corregir roles de usuarios
  const fixUserRoles = async () => {
    setFixRolesLoading(true);
    setFixRolesStats(null);
    
    try {
      toast.info('Corrigiendo roles de usuario...');
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fix-user-roles`, {
          method: 'POST',
          headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
        });
        
        if (!response.ok) {
          const errorData = await response.json();
        throw new Error(errorData.error || 'Error al corregir roles');
      }
      
      const result = await response.json();
      console.log('Resultado de corrección de roles:', result);
      
      // Guardar estadísticas
      setFixRolesStats(result);
      
      // Mostrar resultados
      if (result.roles_updated > 0) {
        toast.success(`Se han corregido ${result.roles_updated} roles de usuario`);
      } else {
        toast.success('Todos los roles estaban ya correctamente configurados');
      }
      
      // Actualizar la lista de usuarios
      fetchUsers();
    } catch (error: any) {
      console.error('Error al corregir roles:', error);
      toast.error(`Error al corregir roles: ${error.message}`);
    } finally {
      setFixRolesLoading(false);
    }
  };

  // Crear nuevo usuario
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.password) {
      toast.error('La contraseña es obligatoria para nuevos usuarios');
        return;
      }

    setLoading(true);
    try {
      console.log('Creando usuario con datos:', {
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role
      });
      
      // PASO 1: Crear el usuario con la función Edge
      const createResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
          verify: true
        })
      });
      
      const createResult = await createResponse.json();
      
      if (!createResponse.ok) {
        throw new Error(createResult.error || 'Error al crear usuario');
      }
      
      console.log('Usuario creado con éxito:', createResult);
      const newUserId = createResult.user?.id;
      
      if (!newUserId) {
        throw new Error('No se pudo obtener el ID del usuario creado');
      }
      
      // PASO 2: Verificar que se creó correctamente el perfil
      const { data: createdProfile, error: profileCheckError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', newUserId)
        .single();
      
      if (profileCheckError || !createdProfile) {
        console.error('Error al verificar perfil creado o perfil no encontrado:', profileCheckError);
        console.log('Intentando crear el perfil manualmente...');
        
        // Si el perfil no existe, crearlo manualmente
        const { error: createProfileError } = await supabase
          .from('user_profiles')
          .insert({
            id: newUserId,
            email: formData.email,
            full_name: formData.full_name,
            role: formData.role,
            is_active: true
          });

        if (createProfileError) {
          console.error('Error al crear perfil manualmente:', createProfileError);
          toast.warning('Usuario creado pero hubo un problema con el perfil');
        }
        } else {
        console.log('Perfil encontrado:', createdProfile);
        
        // PASO 3: Verificar que el perfil tiene los datos correctos
        if (createdProfile.full_name !== formData.full_name || createdProfile.role !== formData.role) {
          console.log('Los datos del perfil no coinciden, actualizando...');
          
          // Actualizar el perfil con los datos correctos
          const { error: updateProfileError } = await supabase
            .from('user_profiles')
            .update({
              full_name: formData.full_name,
              role: formData.role,
              updated_at: new Date().toISOString()
            })
            .eq('id', newUserId);
          
          if (updateProfileError) {
            console.error('Error al actualizar perfil:', updateProfileError);
            toast.warning('Usuario creado pero no se pudieron actualizar todos sus datos');
          }
        }
      }
      
      // PASO 4: Aplicar fix-user-roles para sincronizar metadatos
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fix-user-roles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          }
        });
        console.log('Fix-user-roles ejecutado con éxito');
      } catch (fixError) {
        console.warn('Error al ejecutar fix-user-roles:', fixError);
      }
      
      toast.success('Usuario creado exitosamente');
      setCreateModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      console.error('Error al crear usuario:', error);
      
      // Manejar errores específicos
      if (error.message.includes('duplicate key')) {
        toast.error('El correo electrónico ya está registrado');
      } else {
        toast.error(`Error al crear usuario: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Actualizar usuario existente
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setLoading(true);
    try {
      // Primero actualizar solo el perfil local (que siempre funciona)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          full_name: formData.full_name,
          role: formData.role,
          email: formData.email,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id);

      if (profileError) {
        throw new Error(`Error al actualizar perfil: ${profileError.message}`);
      }
      
      // Luego ejecutar fix-user-roles para sincronizar los metadatos
      const fixResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fix-user-roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (!fixResponse.ok) {
        console.warn('La actualización del perfil fue exitosa pero hubo un problema al sincronizar los roles');
      }

      toast.success('Usuario actualizado exitosamente');
      setEditModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      console.error('Error al actualizar usuario:', error);
      toast.error(`Error al actualizar usuario: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Eliminar usuario definitivamente (hard delete)
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    try {
      // Ejecutar script SQL directamente para eliminar el usuario
      console.log(`Eliminando usuario ${selectedUser.id} (${selectedUser.email})...`);
      
      // 1. Primero desactivar temporalmente el trigger en accounts
      const { error: error1 } = await supabase.rpc('execute_sql', {
        sql_statement: "ALTER TABLE public.accounts DISABLE TRIGGER check_account_parent_type_trigger;"
      });
      
      if (error1) {
        console.warn('Error al desactivar trigger de accounts:', error1);
        // Continuar de todos modos, podría ser que el trigger no exista
      }
      
      // 2. Actualizar las referencias al usuario en accounts (en pequeños lotes)
      const { error: error2 } = await supabase
        .from('accounts')
        .update({ created_by: null })
        .eq('created_by', selectedUser.id)
        .is('parent_id', null);
      
      if (error2 && !error2.message.includes('does not exist')) {
        console.warn('Error al actualizar accounts (lote 1):', error2);
      }
      
      // 3. Luego actualizar el resto de referencias
      const { error: error3 } = await supabase
        .from('accounts')
        .update({ created_by: null })
        .eq('created_by', selectedUser.id);
      
      if (error3 && !error3.message.includes('does not exist')) {
        console.warn('Error al actualizar accounts (lote 2):', error3);
      }
      
      // 4. Desactivar el trigger que causa problemas con user_profiles
      const { error: error4 } = await supabase.rpc('execute_sql', {
        sql_statement: "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_deleted;"
      });
      
      if (error4) {
        console.warn('Error al desactivar trigger de auth.users:', error4);
        // Continuar de todos modos
      }
      
      // 5. Eliminar el perfil de usuario
      const { error: error5 } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', selectedUser.id);
      
      if (error5) {
        console.error('Error al eliminar perfil:', error5);
        throw new Error(`No se pudo eliminar el perfil: ${error5.message}`);
      }
      
      // 6. Eliminar directamente el usuario
      const { error: error6 } = await supabase.rpc('execute_sql', {
        sql_statement: `DELETE FROM auth.users WHERE id = '${selectedUser.id}';`
      });
      
      if (error6) {
        console.error('Error al eliminar usuario de auth:', error6);
        throw new Error(`No se pudo eliminar el usuario de auth: ${error6.message}`);
      }
      
      // 7. Reactivar los triggers
      await supabase.rpc('execute_sql', {
        sql_statement: "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_deleted;"
      });
      
      await supabase.rpc('execute_sql', {
        sql_statement: "ALTER TABLE public.accounts ENABLE TRIGGER check_account_parent_type_trigger;"
      });
      
      // Si llegamos aquí, todo salió bien
      toast.success('Usuario eliminado exitosamente');
      setDeleteModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      console.error('Error al eliminar usuario:', error);
      toast.error(`Error al eliminar usuario: ${error.message}`);
      
      // Intentar reactivar los triggers por si acaso
      try {
        await supabase.rpc('execute_sql', {
          sql_statement: "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_deleted;"
        });
        
        await supabase.rpc('execute_sql', {
          sql_statement: "ALTER TABLE public.accounts ENABLE TRIGGER check_account_parent_type_trigger;"
        });
      } catch (cleanupError) {
        console.error('Error al reactivar triggers:', cleanupError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Resetear formulario
  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      role: 'user',
      password: ''
    });
  };

  // Abrir modal de edición
  const openEditModal = (user: UserData) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name || '',
      role: user.role
    });
    setEditModalOpen(true);
  };

  // Abrir modal de eliminación
  const openDeleteModal = (user: UserData) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  // Manejar cambios en formulario
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Iconos para roles
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield size={16} className="text-red-500" />;
      case 'accountant': return <UserCog size={16} className="text-blue-500" />;
      default: return <User size={16} className="text-gray-500" />;
    }
  };

  // Etiquetas para roles
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'accountant': return 'Contador';
      default: return 'Usuario';
    }
  };

  // Renderizar nombre de usuario con valores por defecto si está vacío
  const renderUserName = (user: UserData) => {
    if (user.full_name) {
      return user.full_name;
    }
    
    // Si el nombre está vacío, usar primera parte del email
    const emailPrefix = user.email.split('@')[0];
    const formattedName = emailPrefix
      .split(/[._-]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    return <span className="text-gray-500">{formattedName} <small>(sin nombre)</small></span>;
  };

  // Si el usuario no es administrador, mostrar mensaje de acceso restringido
  if (currentUser && currentUser.role !== 'admin') {
  return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-center text-red-500 mb-4">
          <Shield size={24} />
        </div>
        <h2 className="text-xl font-bold text-center mb-2">Acceso Restringido</h2>
        <p className="text-gray-600 text-center">
          Solo los administradores pueden acceder a la gestión de usuarios.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Gestión de Usuarios</h2>
        <div className="flex space-x-2">
          {/* Botón para sincronizar perfiles - ya no es necesario
          <button
            onClick={syncUserProfiles}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center"
            disabled={syncLoading}
          >
            {syncLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sincronizando...
              </span>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Sincronizar Perfiles
              </>
            )}
          </button>
          
          <button
            onClick={fixUserRoles}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md flex items-center"
            disabled={fixRolesLoading}
          >
            {fixRolesLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Corrigiendo...
                      </span>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                Corregir Roles
              </>
            )}
          </button>
          */}
          
          <button
            onClick={() => {
              resetForm();
              setCreateModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center"
            disabled={loading}
          >
            <PlusCircle size={16} className="mr-2" />
            Nuevo Usuario
          </button>
                  </div>
                </div>
                
      {/* Mostrar estadísticas de sincronización si existen */}
      {(syncStats || fixRolesStats) && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg text-sm">
          {syncStats && (
            <div className="mb-3">
              <h3 className="font-medium mb-2">Resultado de sincronización:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                  <p className="text-gray-500">Total usuarios:</p>
                  <p className="font-medium">{syncStats.total_auth_users}</p>
                  </div>
                <div>
                  <p className="text-gray-500">Total perfiles:</p>
                  <p className="font-medium">{syncStats.total_profiles}</p>
                </div>
                  <div>
                  <p className="text-gray-500">Sin perfil:</p>
                  <p className="font-medium">{syncStats.users_without_profiles}</p>
                </div>
                <div>
                  <p className="text-gray-500">Perfiles creados:</p>
                  <p className="font-medium text-green-600">{syncStats.profiles_created}</p>
                  </div>
                </div>
              </div>
            )}
          
          {fixRolesStats && (
            <div>
              <h3 className="font-medium mb-2">Resultado de corrección de roles:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-gray-500">Total usuarios:</p>
                  <p className="font-medium">{fixRolesStats.total_auth_users}</p>
          </div>
                <div>
                  <p className="text-gray-500">Total perfiles:</p>
                  <p className="font-medium">{fixRolesStats.total_profiles}</p>
        </div>
                <div>
                  <p className="text-gray-500">Roles actualizados:</p>
                  <p className="font-medium text-purple-600">{fixRolesStats.roles_updated}</p>
      </div>
      <div>
                  <p className="text-gray-500">Roles correctos:</p>
                  <p className="font-medium text-green-600">
                    {(fixRolesStats.results || []).filter((r: any) => r.status === 'correct').length}
                  </p>
        </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-center text-gray-600">Cargando...</p>}

      {/* Tabla de usuarios */}
      {!loading && users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Nombre</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Rol</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Estado</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Registro</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{user.id.substring(0, 8)}...</td>
                  <td className="px-4 py-3 text-sm">{renderUserName(user)}</td>
                  <td className="px-4 py-3 text-sm flex items-center">
                    <Mail size={14} className="text-gray-400 mr-2" />
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center">
                        {getRoleIcon(user.role)}
                      <span className="ml-2">{getRoleLabel(user.role)}</span>
                      </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.is_active !== false ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle size={12} className="mr-1" />
                        Activo
                        </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle size={12} className="mr-1" />
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center">
                      <Calendar size={14} className="text-gray-400 mr-2" />
                      {new Date(user.created_at).toLocaleDateString()}
                      </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Editar"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => openDeleteModal(user)}
                            className="text-red-600 hover:text-red-800"
                        title="Eliminar"
                            disabled={user.id === currentUser?.id}
                      >
                        <Trash2 size={16} />
                          </button>
                        </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && users.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No hay usuarios registrados</p>
        </div>
      )}

      {/* Modal de creación */}
      <Modal 
        isOpen={createModalOpen} 
        onClose={() => setCreateModalOpen(false)}
        title="Crear Nuevo Usuario"
      >
        <form onSubmit={handleCreateUser}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                <input
                  type="text"
                  name="full_name"
                value={formData.full_name}
                  onChange={handleInputChange}
                  required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Rol</label>
                <select
                  name="role"
                value={formData.role}
                  onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="user">Usuario</option>
                <option value="accountant">Contador</option>
                <option value="admin">Administrador</option>
                </select>
              </div>
            <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
                >
                {loading ? 'Creando...' : 'Crear Usuario'}
                </button>
            </div>
              </div>
            </form>
      </Modal>

      {/* Modal de edición */}
      <Modal 
        isOpen={editModalOpen} 
        onClose={() => setEditModalOpen(false)}
        title="Editar Usuario"
      >
        <form onSubmit={handleUpdateUser}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                  required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleInputChange}
                  required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Rol</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="user">Usuario</option>
                <option value="accountant">Contador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
                >
                {loading ? 'Actualizando...' : 'Actualizar Usuario'}
                </button>
              </div>
          </div>
        </form>
      </Modal>

      {/* Modal de eliminación */}
      <Modal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)}
        title="Eliminar Usuario"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            ¿Estás seguro de que deseas eliminar al usuario <span className="font-medium">{selectedUser?.full_name || selectedUser?.email}</span>?
          </p>
          <p className="text-sm text-red-600 font-medium">
            ¡Advertencia! Esta acción eliminará completamente al usuario del sistema y no se podrá recuperar.
          </p>
          <p className="text-sm text-gray-600">
            Se eliminarán todos sus datos de la base de datos, incluyendo su perfil y cuenta de autenticación.
          </p>
          <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
              onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
              type="button"
              onClick={handleDeleteUser}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium"
            >
              {loading ? 'Eliminando...' : 'Eliminar Usuario'}
              </button>
            </div>
          </div>
      </Modal>
    </div>
  );
} 