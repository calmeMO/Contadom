import React, { useState, useEffect } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { UserSettings } from '../components/settings/UserSettings';
import { CompanySettings } from '../components/settings/CompanySettings';
import { FiscalYearSettings } from '../components/settings/FiscalYearSettings';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { User, Building2, Calendar, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const [initialTab, setInitialTab] = useState('user');
  const { user, loading } = useAuth();
  
  // Detectar pestaña inicial a partir de la URL
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['user', 'company', 'fiscal-years'].includes(tabParam)) {
      setInitialTab(tabParam);
    }
  }, [searchParams]);
  
  const tabs = [
    { id: 'user', name: 'Usuario', icon: <User size={16} /> },
    { id: 'company', name: 'Empresa', icon: <Building2 size={16} /> },
    { id: 'fiscal-years', name: 'Años Fiscales', icon: <Calendar size={16} /> }
  ];

  // Si está cargando, mostrar indicador de carga
  if (loading) {
    return <div className="flex justify-center items-center h-screen">Cargando...</div>;
  }
  
  // Verificar si el usuario es administrador
  if (user?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="flex items-center justify-center text-red-500 mb-4">
            <Shield size={24} />
          </div>
          <h2 className="text-xl font-bold text-center mb-2">Acceso Restringido</h2>
          <p className="text-gray-600 text-center">
            Solo los administradores pueden acceder al módulo de configuración.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="mt-1 text-sm text-gray-600">
          Administre la configuración de su cuenta y de la empresa
        </p>
      </div>

      <Tabs tabs={tabs} initialTabId={initialTab}>
        <TabPanel id="user">
          <UserSettings />
        </TabPanel>
        <TabPanel id="company">
          <CompanySettings />
        </TabPanel>
        <TabPanel id="fiscal-years">
          <FiscalYearSettings />
        </TabPanel>
      </Tabs>
    </div>
  );
}