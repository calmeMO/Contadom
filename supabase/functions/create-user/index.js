// Función Edge de Supabase para crear usuarios como administrador
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
    // Extraer datos del cuerpo de la solicitud
    const { email, password, full_name, role } = req.body;

    // Validar datos
    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Verificar que el rol sea válido
    if (!['admin', 'accountant', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }

    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      throw authError;
    }

    if (!authData.user) {
      throw new Error('No se pudo crear el usuario');
    }

    // 2. Crear perfil de usuario
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role
      });

    if (profileError) {
      // Si falla la creación del perfil, intentar eliminar el usuario de Auth
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Usuario creado exitosamente',
      userId: authData.user.id 
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    return res.status(500).json({ 
      error: error.message || 'Error al crear usuario'
    });
  }
} 