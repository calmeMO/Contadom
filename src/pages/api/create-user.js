import { createClient } from '@supabase/supabase-js';

// Configura el cliente de Supabase con las credenciales de servicio (service_role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dfgplljylupvbvtyaxsr.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { email, password, full_name, role } = req.body;

    // Validar datos
    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Crear usuario usando la API de admin
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role
      }
    });

    if (userError) {
      console.error('Error al crear usuario:', userError);
      return res.status(400).json({ error: userError.message });
    }

    // Crear perfil en tabla user_profiles
    if (userData?.user?.id) {
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: userData.user.id,
          email,
          full_name,
          role,
          is_active: true
        });

      if (profileError) {
        console.error('Error al crear perfil:', profileError);
        // No eliminar el usuario auth para mantener consistencia
        return res.status(500).json({ 
          error: 'Usuario creado pero hubo un error al crear el perfil',
          userId: userData.user.id
        });
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Usuario creado exitosamente',
      userId: userData?.user?.id
    });
  } catch (error) {
    console.error('Error completo:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
} 