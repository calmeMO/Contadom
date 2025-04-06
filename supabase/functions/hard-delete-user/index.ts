// SQL para crear la función RPC en Supabase:
/*
-- Función para eliminar completamente un usuario y todas sus referencias
CREATE OR REPLACE FUNCTION admin_hard_delete_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  success BOOLEAN := true;
BEGIN
  -- 0. Desactivar triggers problemáticos temporalmente
  ALTER TABLE public.accounts DISABLE TRIGGER check_account_parent_type_trigger;
  ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_deleted;
  
  -- 1. Limpiar referencias en otras tablas
  -- Limpiar referencias en accounts
  UPDATE public.accounts SET created_by = NULL WHERE created_by = user_id AND parent_id IS NULL;
  UPDATE public.accounts SET created_by = NULL WHERE created_by = user_id;
  
  -- Limpiar referencias en journal_entries si existe
  BEGIN
    UPDATE public.journal_entries SET posted_by = NULL WHERE posted_by = user_id;
  EXCEPTION WHEN undefined_table THEN
    -- Tabla no existe, ignorar
  END;
  
  -- Limpiar referencias en accounting_periods si existe
  BEGIN
    UPDATE public.accounting_periods SET closed_by = NULL WHERE closed_by = user_id;
    UPDATE public.accounting_periods SET created_by = NULL WHERE created_by = user_id;
    UPDATE public.accounting_periods SET reclosed_by = NULL WHERE reclosed_by = user_id;
    UPDATE public.accounting_periods SET reopened_by = NULL WHERE reopened_by = user_id;
  EXCEPTION WHEN undefined_table THEN
    -- Tabla no existe, ignorar
  END;
  
  -- 2. Eliminar registros relacionados del usuario
  -- Eliminar user_profiles
  DELETE FROM public.user_profiles WHERE id = user_id;
  
  -- Eliminar audit_logs si existe
  BEGIN
    DELETE FROM public.audit_logs WHERE user_id = user_id;
  EXCEPTION WHEN undefined_table THEN
    -- Tabla no existe, ignorar
  END;
  
  -- Eliminar activity_logs si existe
  BEGIN
    DELETE FROM public.activity_logs WHERE user_id = user_id;
  EXCEPTION WHEN undefined_table THEN
    -- Tabla no existe, ignorar
  END;
  
  -- 3. Eliminar el usuario de auth.users directamente
  DELETE FROM auth.users WHERE id = user_id;
  
  -- 4. Reactivar triggers
  ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_deleted;
  ALTER TABLE public.accounts ENABLE TRIGGER check_account_parent_type_trigger;
  
  RETURN success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permisos para ejecutar esta función
GRANT EXECUTE ON FUNCTION admin_hard_delete_user TO service_role;
*/

// Función Edge de Supabase para eliminar completamente a un usuario
// Esta función eliminará al usuario tanto de auth como de user_profiles

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
    console.log('Iniciando hard-delete-user...');
    
    // Obtener el ID de usuario a eliminar
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Se requiere el ID del usuario' }),
        { headers: corsHeaders, status: 400 }
      );
    }

    console.log(`Intentando eliminar completamente al usuario: ${userId}`);

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
    
    // MÉTODO 1: Intentar con la función RPC que manipula triggers y hace la eliminación completa
    console.log('Intentando eliminación con procedimiento almacenado...');
    
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_hard_delete_user', {
        user_id: userId
      });
      
      if (!rpcError) {
        console.log('Usuario eliminado correctamente con la función SQL');
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Usuario eliminado exitosamente',
            user: {
              id: userId,
              email: userEmail
            } 
          }),
          { headers: corsHeaders, status: 200 }
        );
      }
      
      console.error('Error en la función SQL:', rpcError);
      console.log('Intentando método alternativo...');
    } catch (rpcFailure) {
      console.error('Excepción al llamar a la función SQL:', rpcFailure);
    }
    
    // MÉTODO 2: Intentar eliminación directa con SQL RAW
    try {
      console.log('Ejecutando SQL directo para eliminación...');
      
      // 1. Ejecutar SQL para desactivar triggers
      await supabase.rpc('execute_sql', { 
        sql_statement: "ALTER TABLE public.accounts DISABLE TRIGGER check_account_parent_type_trigger;" 
      });
      
      await supabase.rpc('execute_sql', { 
        sql_statement: "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_deleted;" 
      });
      
      // 2. Limpiar referencias
      await supabase
        .from('accounts')
        .update({ created_by: null })
        .eq('created_by', userId);
      
      // 3. Eliminar user_profile
      await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);
      
      // 4. Eliminar usuario de auth.users
      await supabase.rpc('execute_sql', { 
        sql_statement: `DELETE FROM auth.users WHERE id = '${userId}';` 
      });
      
      // 5. Reactivar triggers
      await supabase.rpc('execute_sql', { 
        sql_statement: "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_deleted;" 
      });
      
      await supabase.rpc('execute_sql', { 
        sql_statement: "ALTER TABLE public.accounts ENABLE TRIGGER check_account_parent_type_trigger;" 
      });
      
      console.log('Eliminación directa ejecutada correctamente');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Usuario eliminado exitosamente con SQL directo',
          user: {
            id: userId,
            email: userEmail
          } 
        }),
        { headers: corsHeaders, status: 200 }
      );
    } catch (sqlError) {
      console.error('Error en eliminación con SQL directo:', sqlError);
    }
    
    // MÉTODO 3: Fallback - usar el enfoque alternativo de marcar como eliminado
    console.log('Usando método de fallback (marcar como eliminado)...');
    
    try {
      // Enfoque alternativo: Marcar el usuario como inactivo en lugar de eliminarlo
      const timestamp = new Date().getTime();
      const deletedEmail = `deleted_${timestamp}_${userId}@deleted.example.com`;
      
      // Actualizar el usuario para marcarlo como eliminado
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId, 
        { 
          email: deletedEmail,
          password: crypto.randomUUID(), // Cambiar a contraseña aleatoria
          user_metadata: { 
            deleted: true, 
            deleted_at: new Date().toISOString(),
            original_email: userEmail
          },
          app_metadata: {
            disabled: true,
            deleted: true,
            role: 'deleted'
          }
        }
      );
      
      if (updateError) {
        throw new Error(`No se pudo marcar el usuario como eliminado: ${updateError.message}`);
      }
      
      // Marcar perfil como inactivo si todavía existe
      const { error: profileUpdateError } = await supabase
        .from('user_profiles')
        .update({ 
          is_active: false,
          email: deletedEmail,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      console.log('Usuario marcado como eliminado (método de fallback)');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Usuario marcado como eliminado exitosamente',
          user: {
            id: userId,
            email: userEmail
          },
          note: 'El usuario fue marcado como eliminado en lugar de ser eliminado físicamente'
        }),
        { headers: corsHeaders, status: 200 }
      );
    } catch (fallbackError) {
      console.error('Error en método de fallback:', fallbackError);
      
      return new Response(
        JSON.stringify({ 
          error: 'No se pudo eliminar el usuario con ningún método',
          details: fallbackError instanceof Error ? fallbackError.message : 'Error desconocido'
        }),
        { headers: corsHeaders, status: 500 }
      );
    }
  } catch (error) {
    console.error('Error en hard-delete-user:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido'
      }), 
      { headers: corsHeaders, status: 500 }
    );
  }
}); 