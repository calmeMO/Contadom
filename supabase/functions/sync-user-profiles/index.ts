// Función Edge de Supabase para sincronizar perfiles de usuarios
// Esta función reparará usuarios sin perfil y sincronizará metadatos

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
    console.log('Iniciando sync-user-profiles...');
    
    // Obtener todos los usuarios de auth
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error al obtener usuarios de auth:', authError);
      throw authError;
    }
    
    const authUsers = authData.users;
    console.log(`Se encontraron ${authUsers.length} usuarios en auth`);
    
    // Obtener todos los perfiles existentes
    const { data: profilesData, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*');
      
    if (profilesError) {
      console.error('Error al obtener perfiles:', profilesError);
      throw profilesError;
    }
    
    const profiles = profilesData || [];
    console.log(`Se encontraron ${profiles.length} perfiles en la base de datos`);
    
    // Identificar usuarios sin perfil (excluyendo los marcados como eliminados)
    const usersWithoutProfiles = authUsers.filter(authUser => {
      // Ignorar usuarios con email que comience con "deleted_"
      if (authUser.email && authUser.email.startsWith('deleted_')) {
        return false;
      }
      
      // Buscar si tiene perfil
      return !profiles.some(profile => profile.id === authUser.id);
    });
    
    console.log(`Se encontraron ${usersWithoutProfiles.length} usuarios sin perfil`);
    
    // Crear perfiles para usuarios que no lo tienen
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of usersWithoutProfiles) {
      try {
        const userMeta = user.user_metadata || {};
        const appMeta = user.app_metadata || {};
        
        // Determinar el mejor rol disponible
        const role = appMeta.role || userMeta.role || 'user';
        
        // Crear perfil
        const { error } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: userMeta.full_name || user.email?.split('@')[0] || 'Usuario',
            role: role,
            is_active: true,
            created_at: user.created_at || new Date().toISOString()
          });
          
        if (error) {
          console.error(`Error al crear perfil para ${user.email}:`, error);
          results.push({
            email: user.email,
            status: 'error',
            message: error.message
          });
          errorCount++;
        } else {
          console.log(`Perfil creado para ${user.email}`);
          
          // También actualizar el rol en app_metadata si no está establecido
          if (!appMeta.role) {
            await supabase.auth.admin.updateUserById(user.id, {
              app_metadata: { role }
            });
          }
          
          results.push({
            email: user.email,
            status: 'success',
            role: role
          });
          successCount++;
        }
      } catch (err) {
        console.error(`Error al procesar usuario ${user.email}:`, err);
        results.push({
          email: user.email,
          status: 'error',
          message: err instanceof Error ? err.message : 'Error desconocido'
        });
        errorCount++;
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        total_auth_users: authUsers.length,
        total_profiles: profiles.length,
        users_without_profiles: usersWithoutProfiles.length,
        profiles_created: successCount,
        profiles_failed: errorCount,
        results
      }),
      { headers: corsHeaders, status: 200 }
    );
  } catch (error) {
    console.error('Error en sync-user-profiles:', error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido'
      }), 
      { headers: corsHeaders, status: 500 }
    );
  }
}); 