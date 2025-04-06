import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  });
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }

  try {
    const { email } = await req.json();
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Se requiere el email' }),
        { headers, status: 400 }
      );
    }
    
    // 1. Verificar si el usuario existe en auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 20
    });
    
    if (authError) {
      throw authError;
    }
    
    const authUser = authUsers.users.find(user => user.email === email);
    
    if (!authUser) {
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado en auth.users' }),
        { headers, status: 404 }
      );
    }
    
    // 2. Actualizar metadatos en auth.users para asegurar que tenga rol admin
    const { error: metadataError } = await supabase.auth.admin.updateUserById(
      authUser.id,
      {
        user_metadata: {
          ...authUser.user_metadata,
          role: 'admin'
        },
        app_metadata: {
          ...authUser.app_metadata,
          role: 'admin'
        }
      }
    );
    
    if (metadataError) {
      throw metadataError;
    }
    
    // 3. Actualizar rol en user_profiles
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({ 
        role: 'admin',
        is_active: true 
      })
      .eq('id', authUser.id);
      
    if (profileError) {
      // Si no existe perfil, crearlo
      if (profileError.message.includes('no rows to update')) {
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: authUser.id,
            email: email,
            role: 'admin',
            full_name: authUser.user_metadata?.full_name || email.split('@')[0],
            is_active: true
          });
          
        if (insertError) {
          throw insertError;
        }
      } else {
        throw profileError;
      }
    }
    
    // 4. Verificar RLS para asegurar acceso
    await supabase.rpc('grant_supabase_admin', { user_id: authUser.id })
      .catch(e => console.log('RPC no disponible, ignorando: ', e.message));
      
    // 5. Confirmar solución completa
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Usuario actualizado a super-admin en todos los niveles',
        user: {
          id: authUser.id,
          email: email,
          role: 'admin'
        }
      }),
      { headers, status: 200 }
    );
  } catch (error) {
    console.error('Error en super-admin-fix:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido'
      }), 
      { headers, status: 500 }
    );
  }
}); 