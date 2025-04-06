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

// SQL para arreglar permisos
const migrationSQL = `
-- Eliminar la política actual de inserción que solo permite administradores
DROP POLICY IF EXISTS "admin_insert" ON public.user_profiles;

-- Crear una política de inserción que permita a cualquier usuario crear SU PROPIO perfil
CREATE POLICY "users_insert_own_profile" ON public.user_profiles
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = id);

-- Crear función para crear perfil automáticamente cuando un usuario se registra
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'full_name'), ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Desactivar el trigger existente si existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Crear nuevo trigger para manejar la creación automática de perfiles
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
`;

// Ejecutar migración en diferentes pasos
async function applyMigration() {
  const sqlCommands = migrationSQL.split(';').filter(sql => sql.trim() !== '');
  const results = [];
  
  try {
    for (const sql of sqlCommands) {
      try {
        await supabase.rpc('admin_run_sql', { sql: sql + ';' });
        results.push({ success: true, sql: sql.substring(0, 50) + '...' });
      } catch (error) {
        console.error('Error en SQL:', sql);
        console.error('Mensaje de error:', error);
        results.push({ 
          success: false, 
          sql: sql.substring(0, 50) + '...', 
          error: error.message 
        });
      }
    }
    
    return { 
      success: results.every(r => r.success), 
      results 
    };
  } catch (error) {
    console.error('Error general:', error);
    return { success: false, error: error.message };
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
    // Ejecutar la migración
    const result = await applyMigration();

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