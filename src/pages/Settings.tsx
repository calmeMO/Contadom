import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserSettings } from '../components/settings/UserSettings';
import { CompanySettings } from '../components/settings/CompanySettings';
import { FiscalYearSettings } from '../components/settings/FiscalYearSettings';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { User, Building2, Calendar } from 'lucide-react';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const [initialTab, setInitialTab] = useState('user');
  
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