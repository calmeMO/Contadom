// Función Edge de Supabase para corregir roles de usuarios existentes
// Esta función actualizará app_metadata para asegurarse de que los roles se aplican correctamente

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
    console.log('Iniciando fix-user-roles...');
    
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
    
    // Corregir roles de usuarios
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of authUsers) {
      try {
        // Ignorar usuarios con email que comience con "deleted_"
        if (user.email && user.email.startsWith('deleted_')) {
          console.log(`Ignorando usuario eliminado: ${user.email}`);
          continue;
        }
        
        // Encontrar perfil correspondiente
        const userProfile = profiles.find(profile => profile.id === user.id);
        
        if (!userProfile) {
          console.log(`No se encontró perfil para ${user.email}, no se puede corregir el rol`);
          results.push({
            email: user.email,
            status: 'skipped',
            reason: 'No profile found'
          });
          continue;
        }
        
        const correctRole = userProfile.role;
        const currentAppMetaRole = user.app_metadata?.role;
        
        console.log(`Usuario ${user.email}: Rol en perfil=${correctRole}, Rol en app_metadata=${currentAppMetaRole}`);
        
        // Verificar si necesita actualización
        if (currentAppMetaRole !== correctRole) {
          console.log(`Actualizando rol para ${user.email} de ${currentAppMetaRole || 'none'} a ${correctRole}`);
          
          const { error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            {
              app_metadata: { role: correctRole },
              user_metadata: { 
                full_name: userProfile.full_name || user.user_metadata?.full_name || user.email.split('@')[0],
                role: correctRole
              }
            }
          );
          
          if (updateError) {
            console.error(`Error al actualizar rol para ${user.email}:`, updateError);
            results.push({
              email: user.email,
              status: 'error',
              message: updateError.message
            });
            errorCount++;
          } else {
            console.log(`Rol actualizado correctamente para ${user.email}`);
            results.push({
              email: user.email,
              status: 'updated',
              role: correctRole
            });
            successCount++;
          }
        } else {
          console.log(`El rol de ${user.email} ya es correcto (${correctRole})`);
          results.push({
            email: user.email,
            status: 'correct',
            role: correctRole
          });
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
        roles_updated: successCount,
        roles_failed: errorCount,
        results
      }),
      { headers: corsHeaders, status: 200 }
    );
  } catch (error) {
    console.error('Error en fix-user-roles:', error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido'
      }), 
      { headers: corsHeaders, status: 500 }
    );
  }
}); 