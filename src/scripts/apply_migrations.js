/**
 * Script para aplicar migraciones SQL que solucionan el problema de perfiles de usuario
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configurar variables de entorno
config();

// Configurar rutas para ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar cliente de Supabase con clave de servicio (service_role)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Variables de entorno NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Archivos de migración a aplicar en orden
const migrationsToApply = [
  'fix_closing_function.sql',
  'fix_user_profile_sync.sql'
];

// Función para leer y ejecutar un archivo SQL
async function applyMigration(fileName) {
  console.log(`Aplicando migración: ${fileName}`);
  
  try {
    const filePath = path.join(__dirname, '../migrations', fileName);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Ejecutar SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error(`Error al aplicar migración ${fileName}:`, error);
      return false;
    }
    
    console.log(`✅ Migración ${fileName} aplicada exitosamente`);
    return true;
  } catch (err) {
    console.error(`Error al leer o aplicar migración ${fileName}:`, err);
    return false;
  }
}

// Función para verificar existencia de tabla de migraciones
async function checkMigrationsTable() {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_name', '_migrations')
    .eq('table_schema', 'public');
  
  if (error) {
    console.error('Error al verificar tabla de migraciones:', error);
    return false;
  }
  
  if (!data || data.length === 0) {
    console.log('Creando tabla de migraciones...');
    
    const { error: createError } = await supabase.rpc('exec_sql', { 
      sql_query: `
        CREATE TABLE IF NOT EXISTS _migrations (
          name TEXT PRIMARY KEY,
          executed_at TIMESTAMP WITH TIME ZONE NOT NULL
        );
      `
    });
    
    if (createError) {
      console.error('Error al crear tabla de migraciones:', createError);
      return false;
    }
    
    console.log('✅ Tabla de migraciones creada');
  }
  
  return true;
}

// Función para verificar migraciones ya aplicadas
async function getAppliedMigrations() {
  const { data, error } = await supabase
    .from('_migrations')
    .select('name');
  
  if (error) {
    console.error('Error al verificar migraciones aplicadas:', error);
    return [];
  }
  
  return data.map(row => row.name);
}

// Función principal
async function main() {
  console.log('Iniciando aplicación de migraciones...');
  
  // Verificar tabla de migraciones
  const tableExists = await checkMigrationsTable();
  if (!tableExists) {
    console.error('No se pudo asegurar la existencia de la tabla de migraciones');
    process.exit(1);
  }
  
  // Obtener migraciones ya aplicadas
  const appliedMigrations = await getAppliedMigrations();
  console.log('Migraciones ya aplicadas:', appliedMigrations);
  
  // Aplicar migraciones pendientes
  let successCount = 0;
  let failCount = 0;
  
  for (const migration of migrationsToApply) {
    const migrationName = path.basename(migration, '.sql');
    
    if (appliedMigrations.includes(migrationName)) {
      console.log(`➖ Migración ${migrationName} ya está aplicada, saltando...`);
      continue;
    }
    
    const success = await applyMigration(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('\nResumen de migraciones:');
  console.log(`- Aplicadas exitosamente: ${successCount}`);
  console.log(`- Fallidas: ${failCount}`);
  
  if (failCount > 0) {
    console.error('⚠️ No se pudieron aplicar todas las migraciones');
    process.exit(1);
  } else {
    console.log('✅ Todas las migraciones se aplicaron correctamente');
  }
}

// Ejecutar script
main().catch(err => {
  console.error('Error al ejecutar migraciones:', err);
  process.exit(1);
}); 