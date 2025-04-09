import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard,
  BookOpen,
  BookText,
  FileSpreadsheet,
  CalendarDays,
  Settings,
  Menu,
  X,
  Scale,
  BarChart3,
  Home,
  Database,
  LineChart,
  Calculator,
  Lock,
  Unlock,
  FileText,
  BarChart,
  RefreshCw,
  TrendingUp,
  User
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Definir tipo para elementos de navegación
interface NavItem {
  name: string;
  path: string;
  icon: JSX.Element;
  roles?: ('admin' | 'accountant' | 'user')[];
}

export function Layout() {
  const location = useLocation();
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      // Cerrar automáticamente el sidebar en modo móvil cuando cambia el tamaño
      if (window.innerWidth >= 1024 && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen]);

  // Cerrar sidebar al cambiar de ruta
  useEffect(() => {
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname]);

  // Cerrar el menú de usuario al hacer clic fuera de él
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Sesión cerrada exitosamente');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      toast.error('Error al cerrar sesión');
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Elementos de navegación con información de roles permitidos
  const navigation: NavItem[] = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: <Home size={18} />,
      roles: ['admin', 'accountant', 'user']
    },
    {
      name: 'Cuentas',
      path: '/accounts',
      icon: <Database size={18} />,
      roles: ['admin', 'accountant']
    },
    {
      name: 'Diario',
      path: '/journal',
      icon: <BookOpen size={18} />,
      roles: ['admin', 'accountant']
    },
    {
      name: 'Balanza',
      path: '/balance',
      icon: <FileSpreadsheet size={18} />,
      roles: ['admin', 'accountant', 'user']
    },
    {
      name: 'Libro Mayor',
      path: '/general-ledger',
      icon: <BookText size={18} />,
      roles: ['admin', 'accountant', 'user']
    },
    {
      name: 'Estados Financieros',
      path: '/financial-statements',
      icon: <BarChart size={18} />,
      roles: ['admin', 'accountant', 'user']
    },
    {
      name: 'Configuración',
      path: '/settings',
      icon: <Settings size={18} />,
      roles: ['admin']
    }
  ];

  // Filtrar elementos de navegación según el rol del usuario
  const filteredNavigation = navigation.filter(item => 
    !item.roles || (user && item.roles.includes(user.role))
  );
  
  // Ya no mostrar todas las opciones, solo las permitidas según el rol
  // const filteredNavigation = navigation;
  
  // Eliminar el console.log que indicaba que todas las opciones estaban visibles
  // console.log('NAVEGACIÓN COMPLETA ACTIVADA TEMPORALMENTE: Todas las opciones de menú son visibles');

  return (
    <div className="flex h-screen">
      {/* Sidebar Móvil */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-gray-600 bg-opacity-75 z-20"
          onClick={toggleSidebar}
        />
      )}

      <div 
        className={`lg:hidden fixed inset-y-0 left-0 w-64 bg-white shadow-lg transform z-30 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <Link to="/dashboard" className="flex items-center" onClick={toggleSidebar}>
            <span className="text-xl font-bold text-blue-600">Contadom</span>
          </Link>
          <button onClick={toggleSidebar} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {filteredNavigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium ${
                location.pathname === item.path
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="mr-3">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Barra superior */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white shadow-sm z-10">
        <div className="px-4 py-3 flex justify-between items-center">
          <button 
            onClick={toggleSidebar}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            <Menu size={24} />
          </button>
          <Link to="/dashboard" className="text-lg font-semibold text-blue-600">
            Contadom
          </Link>
          <div className="relative">
            <button 
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center"
            >
              <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
                <User size={14} className="text-blue-600" />
              </div>
            </button>
            
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50 py-1">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium">{user?.full_name || user?.email || 'Usuario'}</p>
                  <p className="text-xs text-gray-500">
                    {user?.role === 'admin' && 'Administrador'}
                    {user?.role === 'accountant' && 'Contador'}
                    {user?.role === 'user' && 'Usuario'}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white shadow-lg z-10">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-200">
            <Link to="/dashboard" className="flex items-center">
              <span className="text-xl font-bold text-blue-600">Contadom</span>
            </Link>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {filteredNavigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium ${
                  location.pathname === item.path
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span className="truncate">{item.name}</span>
              </Link>
            ))}
          </nav>
          {/* Identificador de usuario integrado en sidebar */}
          <div className="p-4 border-t border-gray-200" ref={userMenuRef}>
            <div className="relative">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md hover:bg-red-50 transition-colors group"
              >
                <div className="flex items-center">
                  <div className="mr-2">
                    <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                      <User size={16} className="text-blue-600 group-hover:text-red-600 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-left max-w-[120px] truncate group-hover:hidden">{user?.full_name || user?.email || 'Usuario'}</p>
                    <p className="text-xs text-gray-500 text-left group-hover:hidden">
                      {user?.role === 'admin' && 'Administrador'}
                      {user?.role === 'accountant' && 'Contador'}
                      {user?.role === 'user' && 'Usuario'}
                    </p>
                    <p className="text-sm font-medium text-red-600 hidden group-hover:block">Cerrar Sesión</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 lg:ml-64">
        <div className="p-4 md:p-6 min-h-screen">
          <Outlet />
        </div>
      </div>
    </div>
  );
}