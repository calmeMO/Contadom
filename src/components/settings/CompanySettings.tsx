import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase';
import { FiscalYearType } from '../../types/database';
import { AlertCircle, InfoIcon } from 'lucide-react';

export function CompanySettings() {
  const [loading, setLoading] = useState(false);
  const [companyData, setCompanyData] = useState({
    company_name: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo_url: '',
    fiscal_year_type: 'calendar' as FiscalYearType
  });
  const [fiscalYearTypeIsSet, setFiscalYearTypeIsSet] = useState(false);

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
        console.log('Datos de compañía recibidos:', data);
        
        setCompanyData({
          company_name: data.company_name || '',
          taxId: data.tax_id || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          logo_url: data.logo_url || '',
          fiscal_year_type: data.fiscal_year_type || 'calendar'
        });
        
        // Solo bloquear si ya se ha guardado explícitamente un valor
        // Verifica si la propiedad existe y no es null/undefined/string vacío
        const hasFiscalYearType = 
          data.fiscal_year_type !== null && 
          data.fiscal_year_type !== undefined && 
          data.fiscal_year_type !== '';
        
        console.log('¿Tiene tipo de año fiscal establecido?', hasFiscalYearType);
        
        // Establecer el estado de bloqueo según si hay un valor guardado
        setFiscalYearTypeIsSet(hasFiscalYearType);
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
      toast.error('Error al cargar los datos de la empresa');
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
        .select('id, fiscal_year_type');
      
      const companyExists = data && data.length > 0;
      
      let result;
      if (companyExists) {
        // Si la empresa ya existe, usar el valor seleccionado (que puede ser nuevo si aún no se ha establecido)
        result = await supabase
          .from('company_settings')
          .update({
            company_name: companyData.company_name,
            tax_id: companyData.taxId,
            address: companyData.address,
            phone: companyData.phone,
            email: companyData.email,
            website: companyData.website,
            logo_url: companyData.logo_url,
            fiscal_year_type: companyData.fiscal_year_type,
            updated_at: new Date().toISOString()
          })
          .eq('id', data[0].id);
      } else {
        // Si es un nuevo registro, usar el valor seleccionado
        result = await supabase
          .from('company_settings')
          .insert([{
            company_name: companyData.company_name,
            tax_id: companyData.taxId,
            address: companyData.address,
            phone: companyData.phone,
            email: companyData.email,
            website: companyData.website,
            logo_url: companyData.logo_url,
            fiscal_year_type: companyData.fiscal_year_type
          }]);
      }
      
      if (result.error) throw result.error;
      
      toast.success('Datos de la empresa actualizados exitosamente');
      
      // Después de guardar, bloquear el selector de tipo fiscal
      setFiscalYearTypeIsSet(true);
      
      // Recargar los datos para verificar el estado
      fetchCompanyData();
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
                htmlFor="company_name" 
                className="block text-sm font-medium text-gray-700"
              >
                Nombre de la Empresa *
              </label>
              <input
                type="text"
                name="company_name"
                id="company_name"
                value={companyData.company_name}
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
            <label 
              htmlFor="fiscal_year_type" 
              className="block text-sm font-medium text-gray-700"
            >
              Tipo de Año Fiscal *
            </label>
            <div className="flex items-center mb-2">
              <AlertCircle className="h-4 w-4 text-amber-500 mr-1" />
              <p className="text-xs text-amber-700">
                {fiscalYearTypeIsSet 
                  ? 'Este valor no puede ser modificado una vez establecido.' 
                  : 'Una vez guardado, este valor no podrá ser modificado posteriormente.'}
              </p>
            </div>
            <select
              name="fiscal_year_type"
              id="fiscal_year_type"
              value={companyData.fiscal_year_type}
              onChange={handleInputChange}
              disabled={fiscalYearTypeIsSet}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${fiscalYearTypeIsSet ? 'bg-gray-100' : ''}`}
              required
            >
              <option value="calendar">Año Calendario (01-Ene a 31-Dic)</option>
              <option value="fiscal_mar">Año Fiscal (01-Abr a 31-Mar)</option>
              <option value="fiscal_jun">Año Fiscal (01-Jul a 30-Jun)</option>
              <option value="fiscal_sep">Año Fiscal (01-Oct a 30-Sep)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {companyData.fiscal_year_type === 'calendar' && 'Período: del 01-Ene hasta el 31-Dic del mismo año.'}
              {companyData.fiscal_year_type === 'fiscal_mar' && 'Período: del 01-Abr hasta el 31-Mar del año siguiente.'}
              {companyData.fiscal_year_type === 'fiscal_jun' && 'Período: del 01-Jul hasta el 30-Jun del año siguiente.'}
              {companyData.fiscal_year_type === 'fiscal_sep' && 'Período: del 01-Oct hasta el 30-Sep del año siguiente.'}
            </p>
            {!fiscalYearTypeIsSet && (
              <p className="mt-1 text-xs text-blue-600">
                Importante: Seleccione el tipo de año fiscal según el código tributario 11-92.
                Este valor define cómo se crearán y manejarán todos los períodos fiscales del sistema.
              </p>
            )}
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