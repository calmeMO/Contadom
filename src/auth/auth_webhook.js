// Webhook de Supabase para verificación de estado de cuenta durante la autenticación
// Este script debe desplegarse como una función Edge de Supabase

import { createClient } from '@supabase/supabase-js'

// Configuración del cliente de Supabase (se debe configurar con variables de entorno)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Función principal para manejar las solicitudes
Deno.serve(async (req) => {
  // Respuesta para solicitudes OPTIONS (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    // Inicializar cliente de Supabase con la clave de servicio
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Extraer el evento y datos de la solicitud
    const payload = await req.json()
    const { type, record } = payload
    
    console.log(`Procesando evento de auth: ${type}`)
    
    // Solo procesar eventos de inicio de sesión
    if (type === 'auth.signin') {
      const userId = record.user_id
      
      // Verificar estado de la cuenta
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('is_active, account_status, locked_until')
        .eq('id', userId)
        .single()
      
      if (profileError) {
        console.error('Error al obtener perfil del usuario:', profileError)
        if (profileError.code !== 'PGRST116') { // No-data error
          throw new Error('Error al verificar estado de cuenta')
        }
        return new Response(JSON.stringify({ success: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        })
      }
      
      // Si el perfil existe, verificar estado
      if (userProfile) {
        // Verificar si está bloqueada por intentos fallidos
        if (userProfile.locked_until && new Date(userProfile.locked_until) > new Date()) {
          // Cerrar la sesión creada
          await supabase.auth.admin.signOut(userId)
          
          const timeRemaining = Math.ceil((new Date(userProfile.locked_until).getTime() - new Date().getTime()) / 60000)
          throw new Error(`Cuenta bloqueada temporalmente por ${timeRemaining} minutos.`)
        }
        
        // Verificar estado de la cuenta
        if (userProfile.is_active === false || 
            userProfile.account_status === 'inactive' || 
            userProfile.account_status === 'suspended' || 
            userProfile.account_status === 'archived') {
          
          // Cerrar la sesión creada
          await supabase.auth.admin.signOut(userId)
          
          throw new Error(`La cuenta no está activa: ${userProfile.account_status || 'inactiva'}`)
        }
        
        // Si todo está bien, reiniciar los intentos fallidos
        await supabase
          .from('user_profiles')
          .update({ 
            login_attempts: 0,
            locked_until: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
      }
    }
    
    // Si el evento es un intento fallido de inicio de sesión
    if (type === 'auth.signin.error') {
      const email = record.email
      
      if (email) {
        // Incrementar contador de intentos fallidos
        const { data: userProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('login_attempts')
          .eq('email', email)
          .single()
        
        if (!profileError && userProfile) {
          const newAttempts = (userProfile.login_attempts || 0) + 1
          const updateData = { 
            login_attempts: newAttempts,
            updated_at: new Date().toISOString()
          }
          
          // Si alcanzó el límite, bloquear temporalmente
          if (newAttempts >= 3) {
            const lockUntil = new Date()
            lockUntil.setMinutes(lockUntil.getMinutes() + 30)
            updateData.locked_until = lockUntil.toISOString()
          }
          
          await supabase
            .from('user_profiles')
            .update(updateData)
            .eq('email', email)
        }
      }
    }
    
    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })
  } catch (error) {
    console.error('Error en webhook de autenticación:', error)
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400 
    })
  }
}) 