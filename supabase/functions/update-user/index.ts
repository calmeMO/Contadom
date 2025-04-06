import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Crea un cliente Supabase con la función service_role para tener acceso completo
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Definir cabeceras CORS completas
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE, PUT',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400', // 24 horas
  'Content-Type': 'application/json'
};

serve(async (req) => {
  // Verificar si la solicitud es OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Iniciando update-user...');
    
    // Obtener datos de la solicitud
    const { userId, email, full_name, role } = await req.json();

    // Validar datos requeridos
    if (!userId || !full_name || !role) {
      return new Response(
        JSON.stringify({
          error: 'Se requieren todos los campos: userId, full_name y role'
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Verificar que el rol sea válido
    if (!['admin', 'user', 'accountant'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Rol inválido. Debe ser "admin", "accountant" o "user"' }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    console.log(`Actualizando usuario ${userId}: full_name=${full_name}, role=${role}`);

    // IMPORTANTE: Actualizar primero app_metadata para el control de acceso
    console.log('Actualizando metadatos en auth.users...');
    const { data: updatedAuth, error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        // CRÍTICO: Actualizar ambos metadatos para consistencia
        app_metadata: { role }, // Importante para RLS
        user_metadata: { full_name, role }
      }
    );

    if (metadataError) {
      console.error('Error al actualizar metadatos del usuario:', metadataError);
      return new Response(
        JSON.stringify({ error: metadataError.message }),
        { status: 500, headers: corsHeaders }
      );
    }
    
    console.log('Metadatos actualizados correctamente, ahora actualizando perfil...');

    // Actualizar perfil de usuario en la tabla user_profiles
    const updateData: Record<string, any> = {
      full_name,
      role,
      updated_at: new Date().toISOString()
    };
    
    // Actualizar también el email si se proporcionó
    if (email) {
      updateData.email = email;
    }
    
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId);

    if (profileError) {
      console.error('Error al actualizar perfil de usuario:', profileError);
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Devolver respuesta exitosa
    return new Response(
      JSON.stringify({ 
        success: true,
        user: {
          id: userId,
          full_name,
          role,
          email: email || updatedAuth?.user?.email
        }
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error en la función update-user:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Error desconocido' 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}); 