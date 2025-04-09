import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Lock, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import CustomAlert from '../components/ui/CustomAlert';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      if (isResetMode) {
        toast.info(
          'Para recuperar su contraseña, contacte al equipo de soporte técnico',
          { autoClose: false }
        );
        setIsResetMode(false);
      } else {
        // Verificar primero si el usuario está activo
        try {
          const { data } = await supabase
            .from('user_profiles')
            .select('is_active, account_status')
            .eq('email', email.toLowerCase())
            .single();
          
          if (data) {
            if (data.is_active === false) {
              setErrorMessage('Su cuenta está inactiva. Por favor, contacte a soporte.');
              toast.error('Su cuenta está inactiva. Por favor, contacte a soporte.');
              setLoading(false);
              return;
            }
            
            if (data.account_status === 'inactive' || 
                data.account_status === 'suspended' ||
                data.account_status === 'archived') {
              setErrorMessage(`Su cuenta está ${data.account_status}. Por favor, contacte a soporte.`);
              toast.error(`Su cuenta está ${data.account_status}. Por favor, contacte a soporte.`);
              setLoading(false);
              return;
            }
          }
        } catch (profileError) {
          // Si no podemos verificar el perfil, continuamos con la autenticación normal
          console.warn('No se pudo verificar el estado del perfil:', profileError);
        }
        
        await signIn(email, password);
        navigate(from, { replace: true });
      }
    } catch (error: any) {
      console.error('Error en autenticación:', error);
      
      // Manejar mensajes de error específicos
      let mensajeError = 'Error al iniciar sesión';
      
      if (error.message) {
        switch (error.message) {
          case 'cuenta_inactiva':
            mensajeError = 'Su cuenta está inactiva. Por favor, contacte a soporte.';
            break;
          case 'cuenta_suspendida':
            mensajeError = 'Su cuenta está suspendida. Por favor, contacte a soporte.';
            break;
          case 'cuenta_archivada':
            mensajeError = 'Su cuenta ha sido archivada. Por favor, contacte a soporte.';
            break;
          case 'credenciales_invalidas':
            mensajeError = 'Correo electrónico o contraseña incorrectos.';
            break;
          default:
            // Verificar si es error de bloqueo temporal
            if (error.message.startsWith('cuenta_bloqueada:')) {
              const minutos = error.message.split(':')[1];
              mensajeError = `Cuenta bloqueada temporalmente. Intente nuevamente en ${minutos} minutos.`;
            } else if (error.message.includes('Database error granting user')) {
              // Error específico que ocurre cuando hay problemas de permisos en la BD
              mensajeError = 'Usuario inactivo, contacte al departamento de administración';
            } else {
              mensajeError = 'Error al iniciar sesión. Por favor, verifique sus credenciales.';
            }
        }
      }
      
      setErrorMessage(mensajeError);
      toast.error(mensajeError);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setShowSupportModal(true);
  };

  const handleCloseSupportModal = () => {
    setShowSupportModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {showSupportModal && (
        <CustomAlert
          title="¿Olvidaste tu contraseña?"
          message="Por favor, contacta a nuestro equipo de soporte para restablecer tu contraseña."
          confirmText="Entendido"
          onConfirm={handleCloseSupportModal}
          onCancel={handleCloseSupportModal}
        />
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="flex justify-center">
          <Building2 className="h-12 w-12 text-white" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Contadom
        </h2>
        <p className="mt-2 text-center text-sm text-blue-200">
          Sistema de Contabilidad
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block mb-2 text-sm font-medium text-gray-700"
              >
                Correo electrónico
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="usuario@empresa.com"
                />
              </div>
            </div>

            {!isResetMode && (
              <div>
                <label
                  htmlFor="password"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  Contraseña
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="text-sm text-red-600 font-medium p-2 bg-red-50 rounded border border-red-200">
                {errorMessage}
              </div>
            )}

            <div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading
                  ? 'Procesando...'
                  : isResetMode
                  ? 'Contactar a soporte'
                  : 'Iniciar sesión'}
              </motion.button>
            </div>
          </form>

          <div className="mt-6">
            <button
              type="button"
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              onClick={handleForgotPassword}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}