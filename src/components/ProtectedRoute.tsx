import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  allowedRoles: ('admin' | 'accountant' | 'user')[];
  redirectTo?: string;
}

/**
 * Componente para proteger rutas basado en roles de usuario
 * @param allowedRoles - Array de roles permitidos para acceder a la ruta
 * @param redirectTo - Ruta a la que redirigir si no tiene permisos (por defecto: dashboard)
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  allowedRoles,
  redirectTo = '/dashboard'
}) => {
  const { user, loading } = useAuth();

  // Si está cargando, mostrar un estado de carga
  if (loading) {
    return <div className="flex justify-center items-center h-screen">Cargando...</div>;
  }

  // Si no hay usuario autenticado, redirigir al login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // REACTIVAR: Verificación de roles
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }
  
  // Si el usuario está autenticado y tiene el rol adecuado, mostrar los hijos
  return <Outlet />;
}; 