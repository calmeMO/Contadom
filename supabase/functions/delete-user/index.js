// Función Edge de Supabase para eliminar usuarios como administrador
// Esta función debe desplegarse en Supabase Edge Functions

import { createClient } from '@supabase/supabase-js';

// Obtener variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inicializar cliente de Supabase con la clave de rol de servicio
const supabase = createClient(supabaseUrl, serviceRoleKey);

export default async function handler(req, res) {
  // Configurar cabeceras CORS específicas para desarrollo local
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Responder a las solicitudes preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Extraer el ID del usuario del cuerpo de la solicitud
    const { userId } = req.body;

    // Validar datos
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario es requerido' });
    }

    // 1. Eliminar usuario de Auth
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);

    if (authError) {
      throw authError;
    }

    // 2. Eliminar perfil de usuario (puede ser manejado por triggers de BD)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.warn('Error al eliminar perfil de usuario, posiblemente ya eliminado por trigger de BD:', profileError);
    }

    return res.status(200).json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    return res.status(500).json({
      error: error.message || 'Error al eliminar usuario'
    });
  }
} 