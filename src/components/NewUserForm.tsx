import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';

type NewUserFormProps = {
  onUserCreated?: () => void;
};

export default function NewUserForm({ onUserCreated }: NewUserFormProps) {
  const [loading, setLoading] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'user'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setUserForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (userForm.password !== userForm.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (userForm.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      // Intentar usar la API directamente
      try {
        // Primer intento: Usar fetch para llamar al endpoint de la API
        const response = await fetch('/api/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: userForm.email,
            password: userForm.password,
            full_name: userForm.full_name,
            role: userForm.role
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Usuario creado con éxito:', data);
          toast.success('Usuario creado con éxito. Se requiere verificación por correo electrónico.');
          
          // Limpiar formulario
          setUserForm({
            email: '',
            password: '',
            confirmPassword: '',
            full_name: '',
            role: 'user'
          });
          
          if (onUserCreated) onUserCreated();
          return;
        }
      } catch (apiError) {
        console.error('Error al llamar a la API:', apiError);
        // Continuar con el enfoque alternativo
      }
      
      // Segundo intento: Usar signUp directamente
      const { data, error } = await supabase.auth.signUp({
        email: userForm.email,
        password: userForm.password,
        options: {
          data: {
            full_name: userForm.full_name,
            role: userForm.role
          },
          emailRedirectTo: window.location.origin
        }
      });

      if (error) throw error;

      if (data.user) {
        // Mostrar mensaje de éxito
        toast.success('Usuario creado correctamente. Confírmalo desde el correo electrónico enviado.');
        
        // Mostrar mensaje con instrucciones
        console.log('ID del usuario: ' + data.user.id);
        alert(`Usuario creado. Si el perfil no se crea automáticamente, sigue estos pasos:
        
1. Verifica tu correo electrónico para confirmar la cuenta
2. Un administrador debe ejecutar esta SQL en Supabase:

INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
VALUES ('${data.user.id}', '${userForm.email}', '${userForm.full_name}', '${userForm.role}', true);`);
        
        // Limpiar formulario
        setUserForm({
          email: '',
          password: '',
          confirmPassword: '',
          full_name: '',
          role: 'user'
        });
        
        // Callback
        if (onUserCreated) onUserCreated();
      }
    } catch (error: any) {
      console.error('Error al crear usuario:', error);
      toast.error(error.message || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Crear Nuevo Usuario</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Correo Electrónico
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={userForm.email}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
            Nombre Completo
          </label>
          <input
            type="text"
            id="full_name"
            name="full_name"
            value={userForm.full_name}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Contraseña
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={userForm.password}
            onChange={handleChange}
            required
            minLength={6}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Confirmar Contraseña
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={userForm.confirmPassword}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700">
            Rol
          </label>
          <select
            id="role"
            name="role"
            value={userForm.role}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="user">Usuario</option>
            <option value="accountant">Contador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Creando...' : 'Crear Usuario'}
        </button>
      </form>
    </div>
  );
} 