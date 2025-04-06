// Función Edge de Supabase para cambiar la contraseña de un usuario como administrador
// Esta función debe desplegarse en Supabase Edge Functions

import { createClient } from '@supabase/supabase-js';

// Obtener variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inicializar cliente de Supabase con la clave de rol de servicio
const supabase = createClient(supabaseUrl, serviceRoleKey);

export default async function handler(req, res) {
  // Configurar cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Responder a las solicitudes preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Extraer datos del cuerpo de la solicitud
    const { userId, password } = req.body;

    // Validar datos
    if (!userId || !password) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Validar longitud de la contraseña
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Cambiar la contraseña del usuario
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password
    });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return res.status(500).json({
      error: error.message || 'Error al cambiar la contraseña'
    });
  }
} 