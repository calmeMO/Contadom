import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lee las variables de entorno
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Crea un cliente Supabase con la clave de servicio (tiene permisos totales)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

// Función para ejecutar instrucciones SQL de forma segura
async function fixPolicies() {
  try {
    console.log('Eliminando políticas existentes...')
    await supabase.rpc('admin_drop_policy', {
      p_table: 'user_profiles',
      p_policy: 'Solo administradores pueden actualizar perfiles'
    })
    await supabase.rpc('admin_drop_policy', {
      p_table: 'user_profiles',
      p_policy: 'Solo administradores pueden crear perfiles'
    })
    await supabase.rpc('admin_drop_policy', {
      p_table: 'user_profiles',
      p_policy: 'Solo administradores pueden eliminar perfiles'
    })
    await supabase.rpc('admin_drop_policy', {
      p_table: 'user_profiles',
      p_policy: 'Solo administradores pueden ver todos los perfiles'
    })
    await supabase.rpc('admin_drop_policy', {
      p_table: 'user_profiles',
      p_policy: 'Usuarios pueden actualizar su propio perfil'
    })
    await supabase.rpc('admin_drop_policy', {
      p_table: 'user_profiles',
      p_policy: 'Usuarios pueden ver su propio perfil'
    })
    await supabase.rpc('admin_drop_policy', {
      p_table: 'user_profiles',
      p_policy: 'Permitir service_role para todas las operaciones'
    })

    // Crear política simple para service_role
    console.log('Creando nuevas políticas...')
    const sql1 = `
      CREATE POLICY "service_role_all" ON public.user_profiles
      FOR ALL TO authenticated
      USING (auth.role() = 'service_role'::text);
    `
    await supabase.rpc('admin_run_sql', { sql: sql1 })

    // Política para usuarios ver su propio perfil
    const sql2 = `
      CREATE POLICY "users_select_own" ON public.user_profiles
      FOR SELECT TO authenticated
      USING (auth.uid() = id);
    `
    await supabase.rpc('admin_run_sql', { sql: sql2 })

    // Crear función is_admin
    const sql3 = `
      CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
      RETURNS boolean
      SECURITY DEFINER
      LANGUAGE plpgsql
      AS $$
      DECLARE
          is_admin boolean;
      BEGIN
          SELECT EXISTS (
              SELECT 1 FROM public.user_profiles 
              WHERE id = user_id AND role = 'admin'
          ) INTO is_admin;
          
          RETURN is_admin;
      END;
      $$;
    `
    await supabase.rpc('admin_run_sql', { sql: sql3 })

    // Desactivar RLS temporalmente
    const sql4 = `
      ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;
    `
    await supabase.rpc('admin_run_sql', { sql: sql4 })

    return { success: true, message: 'Políticas RLS corregidas correctamente' }
  } catch (error) {
    console.error('Error al corregir políticas:', error)
    return { success: false, error: error.message }
  }
}

serve(async (req) => {
  // Verificar método
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Ejecutar la corrección de políticas
    const result = await fixPolicies()

    // Devolver resultados
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  } catch (error) {
    console.error('Error al procesar solicitud:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}) 