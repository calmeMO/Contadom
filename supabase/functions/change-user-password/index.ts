// Función Edge de Supabase para cambiar la contraseña de un usuario como administrador
// Esta función debe desplegarse en Supabase Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Obtener variables de entorno
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Inicializar cliente de Supabase con la clave de rol de servicio
const supabase = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  // Configurar cabeceras CORS específicas para desarrollo local
  const headers = new Headers({
    'Access-Control-Allow-Origin': 'http://localhost:5174',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  });

  // Responder a las solicitudes preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }
  
  try {
    // Extraer datos del cuerpo de la solicitud
    const { userId, password } = await req.json();

    // Validar datos
    if (!userId || !password) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos requeridos' }), 
        { headers, status: 400 }
      );
    }

    // Validar longitud de la contraseña
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), 
        { headers, status: 400 }
      );
    }

    // Cambiar la contraseña del usuario
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password
    });

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Contraseña actualizada exitosamente'
      }), 
      { headers, status: 200 }
    );
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error al cambiar la contraseña'
      }), 
      { headers, status: 500 }
    );
  }
}); 