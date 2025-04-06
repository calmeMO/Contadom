// Función Edge de Supabase para crear usuarios como administrador
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
    console.log('Iniciando create-user...');
    
    const { email, password, full_name, role, verify } = await req.json();
    
    // Validar entradas
    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: 'Se requieren todos los campos: email, password, full_name, role' }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    // Verificar que el rol sea válido
    if (!['admin', 'user', 'accountant'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Rol inválido. Debe ser "admin", "accountant" o "user"' }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    console.log(`Intentando crear usuario: email=${email}, full_name=${full_name}, role=${role}`);
    
    // Crear el usuario en auth.users con rol en app_metadata y datos en user_metadata
    // IMPORTANTE: app_metadata es donde Supabase verifica los roles para RLS
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: verify === true, // Confirmar email automáticamente si verify es true
      user_metadata: {
        full_name,
        role
      },
      app_metadata: {
        role // El rol DEBE ir en app_metadata para el control de acceso
      }
    });
    
    if (authError) {
      console.error('Error al crear usuario en auth:', authError);
      throw authError;
    }
    
    console.log(`Usuario creado en auth: ID=${authUser.user.id}, email=${authUser.user.email}`);
    console.log(`Metadatos guardados - user_metadata:`, authUser.user.user_metadata);
    console.log(`Metadatos guardados - app_metadata:`, authUser.user.app_metadata);
    
    // VERIFICACIÓN CRÍTICA: Asegurarse de que el rol se guardó correctamente en app_metadata
    if (authUser.user.app_metadata?.role !== role) {
      console.log(`ERROR: El rol no se guardó correctamente en app_metadata. Actualizando...`);
      
      // Actualizar explícitamente para asegurar que los datos sean correctos
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        authUser.user.id,
        { 
          app_metadata: { role },
          user_metadata: { full_name, role }
        }
      );
      
      if (updateError) {
        console.error('Error al actualizar metadatos:', updateError);
        throw updateError;
      } else {
        console.log(`Metadatos actualizados correctamente:`, updatedUser);
      }
    }
    
    // Crear el perfil de usuario en la tabla user_profiles
    console.log(`Creando perfil para usuario ${authUser.user.id} con role=${role}, full_name=${full_name}`);
    
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authUser.user.id,
        email,
        full_name,
        role,
        is_active: true
      });
    
    if (profileError) {
      console.error(`Error al crear perfil: ${profileError.message}`, profileError);
      
      // Verificar si es un error de permisos RLS
      if (profileError.code === '42501') {
        console.error('ERROR: Se detectó un problema de permisos. Verifica las políticas RLS de la tabla user_profiles.');
      }
      
      // Devolver respuesta con advertencia pero no fallar completamente
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: 'Usuario creado en auth pero falló la creación del perfil',
          user: {
            id: authUser.user.id,
            email,
            role,
            full_name
          },
          error: profileError.message
        }),
        { headers: corsHeaders, status: 207 } // Status 207: Multi-Status
      );
    }
    
    console.log(`Usuario ${email} creado exitosamente. ID: ${authUser.user.id}, role: ${role}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: authUser.user.id,
          email,
          role,
          full_name
        }
      }),
      { headers: corsHeaders, status: 201 }
    );
  } catch (error) {
    console.error('Error en create-user:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido'
      }), 
      { headers: corsHeaders, status: 500 }
    );
  }
}); 