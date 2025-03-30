import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase';

export function CompanySettings() {
  const [loading, setLoading] = useState(false);
  const [companyData, setCompanyData] = useState({
    name: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo: ''
  });

  useEffect(() => {
    fetchCompanyData();
  }, []);

  async function fetchCompanyData() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setCompanyData({
          name: data.name || '',
          taxId: data.tax_id || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          logo: data.logo || ''
        });
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
      toast.error('Error al cargar los datos de la empresa');
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCompanyData({
      ...companyData,
      [name]: value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('company_settings')
        .select('id');
      
      const companyExists = data && data.length > 0;
      
      let result;
      if (companyExists) {
        result = await supabase
          .from('company_settings')
          .update({
            name: companyData.name,
            tax_id: companyData.taxId,
            address: companyData.address,
            phone: companyData.phone,
            email: companyData.email,
            website: companyData.website,
            logo: companyData.logo,
            updated_at: new Date().toISOString()
          })
          .eq('id', data[0].id);
      } else {
        result = await supabase
          .from('company_settings')
          .insert([{
            name: companyData.name,
            tax_id: companyData.taxId,
            address: companyData.address,
            phone: companyData.phone,
            email: companyData.email,
            website: companyData.website,
            logo: companyData.logo
          }]);
      }
      
      if (result.error) throw result.error;
      
      toast.success('Datos de la empresa actualizados exitosamente');
    } catch (error) {
      console.error('Error updating company data:', error);
      toast.error('Error al actualizar los datos de la empresa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Datos de la Empresa
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label 
                htmlFor="name" 
                className="block text-sm font-medium text-gray-700"
              >
                Nombre de la Empresa *
              </label>
              <input
                type="text"
                name="name"
                id="name"
                value={companyData.name}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label 
                htmlFor="taxId" 
                className="block text-sm font-medium text-gray-700"
              >
                RNC / Documento Fiscal *
              </label>
              <input
                type="text"
                name="taxId"
                id="taxId"
                value={companyData.taxId}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>
          
          <div>
            <label 
              htmlFor="address" 
              className="block text-sm font-medium text-gray-700"
            >
              Dirección
            </label>
            <textarea
              name="address"
              id="address"
              rows={3}
              value={companyData.address}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label 
                htmlFor="phone" 
                className="block text-sm font-medium text-gray-700"
              >
                Teléfono
              </label>
              <input
                type="text"
                name="phone"
                id="phone"
                value={companyData.phone}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-gray-700"
              >
                Correo Electrónico
              </label>
              <input
                type="email"
                name="email"
                id="email"
                value={companyData.email}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>
          
          <div>
            <label 
              htmlFor="website" 
              className="block text-sm font-medium text-gray-700"
            >
              Sitio Web
            </label>
            <input
              type="text"
              name="website"
              id="website"
              value={companyData.website}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          
          <div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 