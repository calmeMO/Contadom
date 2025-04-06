import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0';

// Crea un cliente Supabase con la función service_role para tener acceso completo
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  try {
    // Verificar si la solicitud es OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Obtener datos de la solicitud
    const { userId, newPassword } = await req.json();

    // Validar datos requeridos
    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({
          error: 'Se requieren todos los campos: userId y newPassword'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Validar longitud mínima de contraseña
    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({
          error: 'La contraseña debe tener al menos 6 caracteres'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Actualizar contraseña del usuario
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) {
      console.error('Error al cambiar contraseña del usuario:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Devolver respuesta exitosa
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Contraseña actualizada exitosamente'
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error en la función reset-user-password:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error desconocido' }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Configuración de CORS para permitir solicitudes desde cualquier origen
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}; 