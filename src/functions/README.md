# Funciones Edge para gestión de usuarios en Supabase

Este directorio contiene las funciones Edge que deben desplegarse en Supabase para manejar las operaciones administrativas de usuarios de forma segura.

## Problema que resuelven estas funciones

Las operaciones administrativas como crear usuarios, cambiar contraseñas y eliminar usuarios requieren permisos especiales en Supabase que no se pueden ejecutar directamente desde el frontend por razones de seguridad. Las funciones de administración como `auth.admin.createUser`, `auth.admin.updateUserById` y `auth.admin.deleteUser` solo funcionan con una clave de rol de servicio (service role key) que nunca debe estar expuesta en el código frontend.

## Cómo desplegar estas funciones en Supabase

### Requisitos previos
1. Tener instalado y configurado [Supabase CLI](https://supabase.com/docs/guides/cli)
2. Tener un proyecto en Supabase

### Pasos para el despliegue

1. Inicia sesión en Supabase CLI:
   ```bash
   supabase login
   ```

2. Navega al directorio raíz de tu proyecto (donde se encuentra el archivo `supabase/config.toml`)

3. Copia las funciones Edge a tu directorio de funciones de Supabase:
   ```bash
   mkdir -p supabase/functions/create-user
   mkdir -p supabase/functions/change-user-password
   mkdir -p supabase/functions/delete-user
   
   cp src/functions/create-user.js supabase/functions/create-user/index.js
   cp src/functions/change-user-password.js supabase/functions/change-user-password/index.js
   cp src/functions/delete-user.js supabase/functions/delete-user/index.js
   ```

4. Despliega las funciones a Supabase:
   ```bash
   supabase functions deploy create-user
   supabase functions deploy change-user-password
   supabase functions deploy delete-user
   ```

5. Configura las variables de entorno necesarias para las funciones:
   ```bash
   supabase secrets set SUPABASE_URL=https://tu-proyecto.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
   ```

   Puedes obtener la URL y la clave de rol de servicio desde la interfaz de administración de Supabase > Configuración > API.

6. Habilita las funciones para invocación desde el cliente (frontend):
   ```bash
   supabase functions update --no-verify-jwt create-user
   supabase functions update --no-verify-jwt change-user-password
   supabase functions update --no-verify-jwt delete-user
   ```

7. Configura CORS para permitir solicitudes desde tu frontend:
   ```bash
   # Para desarrollo local (localhost)
   supabase functions update --cors-origin "http://localhost:5173,http://localhost:5174" create-user
   supabase functions update --cors-origin "http://localhost:5173,http://localhost:5174" change-user-password
   supabase functions update --cors-origin "http://localhost:5173,http://localhost:5174" delete-user
   
   # Para producción (agregar tu dominio)
   supabase functions update --cors-origin "https://tu-dominio.com" create-user
   supabase functions update --cors-origin "https://tu-dominio.com" change-user-password
   supabase functions update --cors-origin "https://tu-dominio.com" delete-user
   ```

> **Nota importante:** Además de la configuración CORS en Supabase, cada función ahora incluye encabezados CORS para manejar las solicitudes preflight OPTIONS. Esto es necesario porque la configuración CORS de Supabase a veces puede no funcionar correctamente.

## Seguridad

Aunque estas funciones están configuradas para ser invocadas sin verificación JWT, deberías considerar implementar tu propia lógica de autorización dentro de las funciones para asegurarte de que solo los administradores puedan realizar estas operaciones. Por ejemplo:

1. Verificar que el usuario que hace la solicitud tenga un rol de administrador
2. Implementar un token de API personalizado
3. Restringir el acceso por IP

## Solución alternativa: API backend

Si prefieres no usar funciones Edge de Supabase, puedes implementar estas funciones en un backend tradicional (Node.js, Express, etc.) y hacer las mismas operaciones con la API de administración de Supabase usando la clave de rol de servicio en el backend. 