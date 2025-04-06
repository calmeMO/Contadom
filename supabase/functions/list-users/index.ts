// Función Edge de Supabase para listar todos los usuarios
// Esta función debe desplegarse en Supabase Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Definir cabeceras CORS completas
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE, PUT',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400', // 24 horas
  'Content-Type': 'application/json'
};

serve(async (req) => {
  // Manejar peticiones OPTIONS para CORS
  if (req.method === 'OPTIONS') {
    console.log('Recibida petición OPTIONS para CORS');
    return new Response(null, { 
      headers: corsHeaders, 
      status: 204 
    });
  }

  try {
    console.log('Iniciando list-users...');
    
    // Verificar cabeceras de autorización
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Falta cabecera de autorización');
      return new Response(
        JSON.stringify({ error: 'Se requiere autorización' }),
        { headers: corsHeaders, status: 401 }
      );
    }
    
    // Obtener todos los usuarios de auth
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error('Error al listar usuarios:', error);
      throw error;
    }
    
    console.log(`Se encontraron ${data.users.length} usuarios`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        users: data.users
      }),
      { headers: corsHeaders, status: 200 }
    );
  } catch (error) {
    console.error('Error en list-users:', error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido'
      }), 
      { headers: corsHeaders, status: 500 }
    );
  }
}); 