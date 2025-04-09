/**
 * Script para corregir perfiles de usuario en la base de datos
 * Asegura que todos los registros en user_profiles tengan los campos necesarios para el sistema de login
 * 
 * Para ejecutar:
 * 1. Coloca este archivo en la carpeta scripts/ de tu proyecto
 * 2. Ejecuta: npx ts-node scripts/fix-user-profiles.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Configurar cliente de Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Variables de entorno de Supabase no encontradas.');
  console.error('Asegúrate de tener VITE_SUPABASE_URL y VITE_SUPABASE_SERVICE_ROLE_KEY en tu archivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Iniciando corrección de perfiles de usuario...');
  
  try {
    // 1. Obtener todos los perfiles de usuario
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, email, account_status, login_attempts, locked_until');
      
    if (error) {
      throw new Error(`Error al obtener perfiles: ${error.message}`);
    }
    
    console.log(`Se encontraron ${profiles.length} perfiles de usuario.`);
    
    // 2. Filtrar perfiles que necesitan actualización
    const profilesToUpdate = profiles.filter(profile => 
      profile.account_status === null || 
      profile.login_attempts === null
    );
    
    console.log(`${profilesToUpdate.length} perfiles necesitan actualización.`);
    
    // 3. Actualizar perfiles
    let successCount = 0;
    let errorCount = 0;
    
    for (const profile of profilesToUpdate) {
      const updateData: any = {};
      
      if (profile.account_status === null) {
        updateData.account_status = 'active';
      }
      
      if (profile.login_attempts === null) {
        updateData.login_attempts = 0;
      }
      
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', profile.id);
        
      if (updateError) {
        console.error(`Error al actualizar perfil ${profile.email}: ${updateError.message}`);
        errorCount++;
      } else {
        console.log(`Perfil actualizado: ${profile.email}`);
        successCount++;
      }
    }
    
    // 4. Reporte final
    console.log('\n--- RESUMEN ---');
    console.log(`Total de perfiles: ${profiles.length}`);
    console.log(`Perfiles que necesitaban actualización: ${profilesToUpdate.length}`);
    console.log(`Actualizaciones exitosas: ${successCount}`);
    console.log(`Errores: ${errorCount}`);
    
    // 5. Verificar que todos los perfiles ahora tengan los campos necesarios
    const { data: afterProfiles, error: afterError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .or('account_status.is.null,login_attempts.is.null');
      
    if (afterError) {
      console.error(`Error al verificar perfiles finales: ${afterError.message}`);
    } else {
      if (afterProfiles.length > 0) {
        console.warn(`Todavía hay ${afterProfiles.length} perfiles con campos faltantes.`);
        console.warn('Emails:', afterProfiles.map(p => p.email).join(', '));
      } else {
        console.log('¡Todos los perfiles ahora tienen los campos necesarios!');
      }
    }
    
  } catch (error: any) {
    console.error('Error en el script:', error.message);
    process.exit(1);
  }
}

// Ejecutar script
main().then(() => {
  console.log('Script completado.');
  process.exit(0);
}).catch(error => {
  console.error('Error inesperado:', error);
  process.exit(1);
}); 