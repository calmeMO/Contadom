// Función Edge de Supabase para "eliminar" (desactivar) usuarios como administrador
// Esta función debe desplegarse en Supabase Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Obtener variables de entorno
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Inicializar cliente de Supabase con la clave de rol de servicio
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
    console.log('Iniciando delete-user...');
    
    // Obtener el ID de usuario a eliminar
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Se requiere el ID del usuario' }),
        { headers: corsHeaders, status: 400 }
      );
    }

    console.log(`Intentando eliminar usuario: ${userId}`);

    // Verificar que el usuario existe en auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado en auth.users' }),
        { headers: corsHeaders, status: 404 }
      );
    }
    
    const userEmail = authData.user.email || '';
    console.log(`Usuario encontrado: ${userEmail}`);
    
    // *** IMPLEMENTAR SOFT DELETE EN LUGAR DE HARD DELETE ***
    
    // Generar un timestamp único para el email de eliminación
    const timestamp = new Date().getTime();
    const safeEmail = `deleted_${timestamp}_${userEmail}`;
    
    console.log(`Marcando usuario como inactivo y cambiando email a: ${safeEmail}`);
    
    // 1. Primero deshabilitar el usuario en auth
    console.log('Deshabilitando usuario en auth...');
    
    const { data: updatedAuth, error: authUpdateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        email: safeEmail,
        app_metadata: { 
          disabled: true,
          inactive_since: new Date().toISOString()
        }
      }
    );
    
    if (authUpdateError) {
      console.error(`Error al deshabilitar usuario en auth: ${authUpdateError.message}`);
      throw authUpdateError;
    }
    
    console.log('Usuario deshabilitado correctamente en auth');
    
    // 2. Actualizar el perfil en user_profiles
    console.log('Actualizando perfil de usuario...');
    
    const { error: profileUpdateError } = await supabase
      .from('user_profiles')
      .update({
        is_active: false,
        email: safeEmail,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
    
    if (profileUpdateError) {
      console.error(`Error al actualizar perfil: ${profileUpdateError.message}`);
      // No bloqueamos la operación completa, pero registramos el error
      console.warn('La desactivación en auth se realizó correctamente, pero hubo problemas con el perfil');
    } else {
      console.log('Perfil actualizado correctamente');
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Usuario deshabilitado correctamente',
        user: {
          id: userId,
          email: userEmail,
          safe_email: safeEmail
        } 
      }),
      { headers: corsHeaders, status: 200 }
    );
  } catch (error) {
    console.error('Error en delete-user:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido'
      }), 
      { headers: corsHeaders, status: 500 }
    );
  }
}); 