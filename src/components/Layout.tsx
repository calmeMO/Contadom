import React, { useState, useEffect } from 'react';
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
  FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';

export function Layout() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  const navigation = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: <Home size={18} />
    },
    {
      name: 'Cuentas',
      path: '/accounts',
      icon: <Database size={18} />
    },
    {
      name: 'Diario',
      path: '/journal',
      icon: <BookOpen size={18} />
    },
    {
      name: 'Mayor',
      path: '/ledger',
      icon: <BookText size={18} />
    },
    {
      name: 'Balance',
      path: '/trial-balance',
      icon: <Scale size={18} />
    },
    {
      name: 'Ajustes',
      path: '/adjustments',
      icon: <Calculator size={18} />
    },
    {
      name: 'Cierre',
      path: '/closing-process',
      icon: <Lock size={18} />
    },
    {
      name: 'Reapertura',
      path: '/period-reopening',
      icon: <Unlock size={18} />
    },
    {
      name: 'Estados Financieros',
      path: '/financial-statements',
      icon: <FileText size={18} />
    },
    {
      name: 'Análisis Financiero',
      path: '/financial-analysis',
      icon: <Calculator size={18} />
    },
    {
      name: 'Configuración',
      path: '/settings',
      icon: <Settings size={18} />
    }
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar para móviles */}
      <div className="lg:hidden">
        <button
          onClick={toggleSidebar}
          className="fixed top-4 left-4 z-50 p-2 rounded-md bg-white shadow-md"
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {isSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black bg-opacity-50" onClick={toggleSidebar}></div>
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transform ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } transition-transform duration-300 ease-in-out`}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-200">
              <Link to="/dashboard" className="flex items-center">
                <span className="text-xl font-bold text-blue-600">Contadom</span>
              </Link>
            </div>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navigation.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    location.pathname === item.path
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Sidebar para desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white shadow-lg z-10">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-200">
            <Link to="/dashboard" className="flex items-center">
              <span className="text-xl font-bold text-blue-600">Contadom</span>
            </Link>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === item.path
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Cerrar Sesión
            </button>
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