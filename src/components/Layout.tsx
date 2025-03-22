import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Home,
  BookOpen,
  Calculator,
  Calendar,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Activity,
  Scale,
  ChevronLeft
} from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);
  
  // Inicializar estado de ancho de ventana cuando el componente se monta
  useEffect(() => {
    // Establecer el ancho inicial
    setWindowWidth(window.innerWidth);
    
    // Activar sidebar por defecto en pantallas grandes
    setIsSidebarOpen(window.innerWidth >= 1024);
    
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      
      // Si cambia el tipo de dispositivo (desktop/mobile), ajustar automáticamente
      if (window.innerWidth >= 1024 && windowWidth < 1024) {
        setIsSidebarOpen(true);
      } else if (window.innerWidth < 1024 && windowWidth >= 1024) {
        setIsSidebarOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [windowWidth]);
  
  const isMobile = windowWidth < 1024;

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const navItems = [
    { path: '/dashboard', icon: <Home className="h-5 w-5" />, text: 'Inicio' },
    {
      path: '/accounts',
      icon: <BookOpen className="h-5 w-5" />,
      text: 'Catálogo de Cuentas',
    },
    {
      path: '/journal',
      icon: <Calculator className="h-5 w-5" />,
      text: 'Libro Diario',
    },
    {
      path: '/ledger',
      icon: <Activity className="h-5 w-5" />,
      text: 'Libro Mayor',
    },
    {
      path: '/balance',
      icon: <Scale className="h-5 w-5" />,
      text: 'Balanza de Comprobación',
    },
    {
      path: '/periods',
      icon: <Calendar className="h-5 w-5" />,
      text: 'Periodos Contables',
    },
    {
      path: '/reports',
      icon: <FileText className="h-5 w-5" />,
      text: 'Estados Financieros',
    },
    {
      path: '/settings',
      icon: <Settings className="h-5 w-5" />,
      text: 'Configuración',
    },
  ];

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Overlay para mobile */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`bg-blue-700 text-white flex-shrink-0 ${
          isMobile 
            ? 'fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out'
            : 'relative w-64 transition-all duration-300'
        } ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-20'}`}
      >
        {/* Cabecera del sidebar */}
        <div className="flex h-16 items-center justify-between px-4 py-5">
          <div className="flex items-center space-x-3">
            <Building2 className="h-8 w-8" />
            {(isSidebarOpen || !isMobile) && (
              <h1 className={`text-xl font-bold transition-opacity duration-200 ${!isSidebarOpen && !isMobile ? 'opacity-0 w-0' : 'opacity-100'}`}>
                Contadom
              </h1>
            )}
          </div>
          {isMobile && isSidebarOpen && (
            <button 
              className="p-1 rounded-full hover:bg-blue-600" 
              onClick={toggleSidebar}
            >
              <X className="h-5 w-5" />
            </button>
          )}
          {!isMobile && (
            <button 
              className="p-1 rounded-full hover:bg-blue-600" 
              onClick={toggleSidebar}
            >
              <ChevronLeft className={`h-5 w-5 transform transition-transform duration-300 ${isSidebarOpen ? '' : 'rotate-180'}`} />
            </button>
          )}
        </div>

        {/* Navegación */}
        <div className="mt-5 flex flex-col h-[calc(100%-4rem)]">
          <div className="px-3 flex-grow">
            {navItems.map((item) => (
              <div key={item.path} className="py-1">
                <button
                  onClick={() => {
                    navigate(item.path);
                    if (isMobile) setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center rounded-lg ${
                    location.pathname === item.path 
                      ? 'bg-blue-600' 
                      : 'hover:bg-blue-600/40'
                  } ${!isSidebarOpen && !isMobile ? 'justify-center py-3 px-3' : 'px-4 py-3'}`}
                  title={(!isSidebarOpen && !isMobile) ? item.text : ''}
                >
                  <span className="flex-shrink-0">
                    {item.icon}
                  </span>
                  <span 
                    className={`text-sm font-medium ml-3 whitespace-nowrap transition-all duration-300 ${
                      !isSidebarOpen && !isMobile ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'
                    }`}
                  >
                    {item.text}
                  </span>
                </button>
              </div>
            ))}
          </div>
          
          {/* Botón de cerrar sesión */}
          <div className="mt-auto px-3 pb-5">
            <div className="py-1">
              <button
                onClick={handleSignOut}
                className={`w-full flex items-center rounded-lg hover:bg-blue-600/40 ${
                  !isSidebarOpen && !isMobile ? 'justify-center py-3 px-3' : 'px-4 py-3'
                }`}
                title={(!isSidebarOpen && !isMobile) ? "Cerrar Sesión" : ''}
              >
                <span className="flex-shrink-0">
                  <LogOut className="h-5 w-5" />
                </span>
                <span 
                  className={`text-sm font-medium ml-3 whitespace-nowrap transition-all duration-300 ${
                    !isSidebarOpen && !isMobile ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'
                  }`}
                >
                  Cerrar Sesión
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm z-10">
          <div className="h-16 px-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {isMobile && (
                <button 
                  className="text-gray-500 hover:text-gray-700" 
                  onClick={toggleSidebar}
                >
                  <Menu className="h-6 w-6" />
                </button>
              )}
              
              <h2 className="text-lg font-medium text-gray-800">
                {navItems.find(item => item.path === location.pathname)?.text || 'Dashboard'}
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              {user?.role && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {user.role}
                </span>
              )}
              <span className="text-sm text-gray-600 hidden sm:inline">
                {user?.email}
              </span>
            </div>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}