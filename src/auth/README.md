# Control de Estado de Cuenta en Contadom

## Problema Actual

Hemos detectado que los usuarios con estado `inactive` todavía pueden iniciar sesión en el sistema, lo que representa un riesgo de seguridad. Esto ocurre porque la validación del estado de cuenta solo se realiza en el frontend.

## Solución

En esta carpeta encontrarás tres soluciones complementarias para asegurar que los usuarios inactivos, suspendidos o archivados no puedan iniciar sesión:

1. **Trigger SQL en la base de datos** (`auth_trigger.sql`)
2. **Webhook de autenticación** (`auth_webhook.js`)
3. **Documentación de seguridad** (`backend_security.md`)

## Implementación del Trigger SQL (Recomendado)

El trigger SQL es la solución más segura y debe implementarse primero:

1. Inicia sesión en tu [panel de Supabase](https://app.supabase.io)
2. Ve a la sección "SQL Editor"
3. Copia y pega el contenido de `auth_trigger.sql`
4. Ejecuta la consulta

Este trigger verificará automáticamente el estado de la cuenta del usuario en cada intento de inicio de sesión y bloqueará los usuarios inactivos, suspendidos o archivados.

## Implementación del Webhook (Complementario)

El webhook proporciona una capa adicional de seguridad:

1. En tu panel de Supabase, ve a "Edge Functions"
2. Crea una nueva función llamada "auth_webhook"
3. Copia y pega el contenido de `auth_webhook.js`
4. Despliega la función
5. Ve a "Database" → "Webhooks"
6. Configura un nuevo webhook para los eventos `auth.signin` y `auth.signin.error` que apunte a tu función Edge

## Columnas Necesarias

Asegúrate de que la tabla `user_profiles` tenga estas columnas:

- `account_status` (TEXT, DEFAULT 'active')
- `is_active` (BOOLEAN, DEFAULT true)
- `login_attempts` (INTEGER, DEFAULT 0)
- `locked_until` (TIMESTAMPTZ, DEFAULT NULL)

Si no existen, puedes crearlas con el script en `../migrations/add_columns.sql`.

## Verificación

Después de implementar estas soluciones, realiza las siguientes pruebas:

1. Inicia sesión con un usuario activo (debe permitirse)
2. Cambia el estado de un usuario a "inactive" e intenta iniciar sesión (debe bloquearse)
3. Intenta iniciar sesión con credenciales incorrectas 3 veces (debe bloquear temporalmente)

## Notas Importantes

- No modifiques los triggers sin antes hacer una copia de seguridad de la base de datos
- Monitorea los logs para detectar posibles problemas
- La verificación en el frontend debe mantenerse para mejorar la experiencia del usuario
- Para más detalles sobre cada solución, consulta `backend_security.md`

## Soporte

Si encuentras algún problema, contacta al equipo de desarrollo. 