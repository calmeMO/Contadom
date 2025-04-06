import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Se requiere userId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Crear cliente de Supabase con la URL y clave de servicio (anon)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Actualizar metadata del usuario para incluir rol de admin
    const { data: userData, error: userMetaError } = await supabaseClient.auth.admin.updateUserById(
      userId,
      { 
        user_metadata: { role: 'admin' },
        app_metadata: { role: 'admin' }
      }
    )

    if (userMetaError) {
      console.error('Error actualizando metadata:', userMetaError)
      return new Response(
        JSON.stringify({ error: 'Error al actualizar metadata del usuario', details: userMetaError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Actualizar o crear perfil de usuario en la tabla user_profiles
    const { error: profileError } = await supabaseClient
      .from('user_profiles')
      .upsert({
        user_id: userId,
        role: 'admin',
      }, { onConflict: 'user_id' })

    if (profileError) {
      console.error('Error actualizando perfil:', profileError)
      return new Response(
        JSON.stringify({ error: 'Error al actualizar perfil de usuario', details: profileError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({ 
        message: 'Privilegios de administrador establecidos correctamente', 
        user: userData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error inesperado:', error)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}) 