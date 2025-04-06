import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, Edit, Trash2, User, UserCog, Users, Key } from 'lucide-react';

// Definir tipos
interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'accountant' | 'user';
  created_at: string;
}

interface NewUserData {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'accountant' | 'user';
}

interface PasswordChangeData {
  userId: string;
  email: string;
  newPassword: string;
  confirmPassword: string;
}

export function UserManagement() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [newUser, setNewUser] = useState<NewUserData>({
    email: '',
    password: '',
    full_name: '',
    role: 'user'
  });
  const [passwordData, setPasswordData] = useState<PasswordChangeData>({
    userId: '',
    email: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Cargar usuarios al iniciar
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      toast.error('No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Verificar que los campos requeridos estén presentes
      if (!newUser.email || !newUser.password || !newUser.full_name || !newUser.role) {
        throw new Error("Todos los campos son requeridos");
      }
      
      // Usar Edge Function para crear usuario con verificación
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          role: newUser.role,
          admin_check: true, // Agregar verificación de administrador
          verify: true // Solicitar verificación de email
        }
      });

      if (error) throw error;
      
      toast.success('Usuario creado exitosamente');
      setModalOpen(false);
      setNewUser({
        email: '',
        password: '',
        full_name: '',
        role: 'user'
      });
      fetchUsers();
    } catch (error: any) {
      console.error('Error al crear usuario:', error);
      toast.error(error.message || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    setLoading(true);
    try {
      // Usar Edge Function para actualizar usuario
      const { data, error } = await supabase.functions.invoke('update-user', {
        body: {
          userId: editingUser.id,
          full_name: editingUser.full_name,
          role: editingUser.role
        }
      });

      if (error) throw error;

      toast.success('Usuario actualizado exitosamente');
      setModalOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error al actualizar usuario:', error);
      toast.error(error.message || 'Error al actualizar usuario');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      setLoading(true);
      
      // Verificar confirmación
      if (confirmDelete !== userId) {
        setConfirmDelete(userId);
        return;
      }
      
      // Usar Edge Function para eliminación segura
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });
      
      if (error) throw error;
      
      toast.success('Usuario eliminado exitosamente');
      setConfirmDelete(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error al eliminar usuario:', error);
      toast.error(error.message || 'Error al eliminar usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    
    setLoading(true);
    try {
      // Usar Edge Function para cambiar contraseña
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: {
          userId: passwordData.userId,
          newPassword: passwordData.newPassword
        }
      });
      
      if (error) throw error;
      
      toast.success('Contraseña actualizada exitosamente');
      setPasswordModalOpen(false);
      setPasswordData({
        userId: '',
        email: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (error: any) {
      console.error('Error al cambiar contraseña:', error);
      toast.error(error.message || 'Error al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (user: UserData) => {
    setEditingUser(user);
    setModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setNewUser({
      email: '',
      password: '',
      full_name: '',
      role: 'user'
    });
    setModalOpen(true);
  };

  const openPasswordModal = (user: UserData) => {
    setPasswordData({
      userId: user.id,
      email: user.email,
      newPassword: '',
      confirmPassword: ''
    });
    setPasswordModalOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (editingUser) {
      setEditingUser({
        ...editingUser,
        [name]: value
      });
    } else {
      setNewUser({
        ...newUser,
        [name]: value
      });
    }
  };

  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData({
      ...passwordData,
      [name]: value
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <UserCog size={18} className="text-blue-600" />;
      case 'accountant':
        return <Users size={18} className="text-green-600" />;
      default:
        return <User size={18} className="text-gray-600" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'accountant':
        return 'Contador';
      default:
        return 'Usuario';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Administración de Usuarios</h2>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          Crear Usuario
        </button>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {loading && users.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Cargando usuarios...</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No hay usuarios registrados</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {users.map(user => (
              <li key={user.id}>
                <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-4">
                      {getRoleIcon(user.role)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-600">{user.email}</p>
                      <p className="text-sm text-gray-600">{user.full_name || 'Sin nombre'}</p>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                        {getRoleLabel(user.role)}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="text-gray-500 hover:text-blue-600"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => openPasswordModal(user)}
                      className="text-gray-500 hover:text-green-600"
                      title="Cambiar contraseña"
                    >
                      <Key size={18} />
                    </button>
                    {confirmDelete === user.id ? (
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Confirmar eliminación"
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-gray-500 hover:text-gray-700"
                          title="Cancelar"
                        >
                          <XCircle size={18} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(user.id)}
                        className="text-gray-500 hover:text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal para crear/editar usuarios */}
      {modalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
            </h3>
            
            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser}>
              {!editingUser && (
                <>
                  <div className="mb-4">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={newUser.email}
                      onChange={handleInputChange}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={newUser.password}
                      onChange={handleInputChange}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      required
                      minLength={6}
                    />
                    <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
                  </div>
                </>
              )}
              
              <div className="mb-4">
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  id="full_name"
                  name="full_name"
                  value={editingUser ? editingUser.full_name || '' : newUser.full_name}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div className="mb-6">
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                  Rol
                </label>
                <select
                  id="role"
                  name="role"
                  value={editingUser ? editingUser.role : newUser.role}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="admin">Administrador</option>
                  <option value="accountant">Contador</option>
                  <option value="user">Usuario</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {(editingUser?.role || newUser.role) === 'admin' && 'Acceso completo a todos los módulos y funciones'}
                  {(editingUser?.role || newUser.role) === 'accountant' && 'Acceso a todos los módulos excepto configuración, sin permisos para aprobar o anular asientos'}
                  {(editingUser?.role || newUser.role) === 'user' && 'Acceso limitado a estados financieros, libro mayor y balanza de comprobación'}
                </p>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Procesando...' : editingUser ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para cambiar contraseña */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Cambiar Contraseña de Usuario
            </h3>
            
            <form onSubmit={handleChangePassword}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Usuario
                </label>
                <div className="w-full py-2 px-3 bg-gray-100 border border-gray-300 rounded-md text-gray-700">
                  {passwordData.email}
                </div>
              </div>
              
              <div className="mb-4">
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                  minLength={6}
                />
                <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
              </div>
              
              <div className="mb-6">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Procesando...' : 'Cambiar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 