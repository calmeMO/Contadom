# Guía de implementación de seguridad para control de estado de cuenta

Este documento explica las diferentes opciones para implementar el control de estado de cuenta en Supabase, sus ventajas, desventajas y recomendaciones.

## Problema detectado

Actualmente, los usuarios con estado `inactive` en la base de datos todavía pueden iniciar sesión en el sistema. Esto ocurre porque la verificación del estado de la cuenta se realiza solo a nivel de frontend, pero no hay ninguna restricción a nivel de base de datos que impida la autenticación.

## Posibles soluciones

Existen tres enfoques principales para resolver este problema:

### 1. Verificación en el cliente (actual)

**Implementación actual:**
- El código del frontend (`src/lib/auth.ts`) verifica el estado del usuario al iniciar sesión.
- Si detecta que el usuario está inactivo, muestra un mensaje de error.

**Problemas:**
- Cualquier cliente o API puede eludir esta verificación.
- No hay una restricción real a nivel de base de datos.
- Alguien con conocimientos técnicos puede iniciar sesión de todas formas.

### 2. Trigger en la base de datos (recomendado)

**Implementación:**
- Script SQL: `src/auth/auth_trigger.sql`
- Crear un trigger en la tabla `auth.sessions` que se active ANTES de insertar una nueva sesión.
- El trigger verifica el estado del usuario en `user_profiles` y bloquea el inicio de sesión si está inactivo.

**Ventajas:**
- Muy seguro: la verificación ocurre a nivel de base de datos.
- Imposible de eludir por clientes malintencionados.
- Bajo mantenimiento una vez implementado.

**Desventajas:**
- Requiere permisos de administrador en la base de datos para su implementación.
- No está disponible en todos los planes de Supabase.

### 3. Webhook de autenticación

**Implementación:**
- Script Edge Function: `src/auth/auth_webhook.js`
- Configurar un webhook para el evento `auth.signin`.
- La función verifica el estado del usuario y cierra la sesión si está inactivo.

**Ventajas:**
- Más seguro que la verificación solo en el cliente.
- Disponible en todos los planes de Supabase.
- Fácil de implementar y mantener.

**Desventajas:**
- Hay un pequeño retraso: el usuario puede iniciar sesión momentáneamente antes de que se cierre la sesión.
- Posibilidad de problemas si el webhook falla.

## Recomendación

Para máxima seguridad, recomendamos implementar en este orden:

1. **Trigger de base de datos** (opción 2) como solución principal
2. **Webhook de autenticación** (opción 3) como respaldo
3. Mantener la **verificación en el cliente** (opción 1) para mejorar la experiencia del usuario

### Pasos para implementar

1. Ejecutar el script SQL `src/auth/auth_trigger.sql` en la consola SQL de Supabase
2. Desplegar la función Edge `src/auth/auth_webhook.js` y configurarla como webhook para eventos de autenticación
3. Mantener la verificación en el cliente actual para mostrar mensajes de error amigables

## Pruebas de verificación

Después de implementar cualquiera de estas soluciones, es importante probar:

1. Iniciar sesión con un usuario activo (debe funcionar)
2. Cambiar el estado de un usuario a inactivo y luego intentar iniciar sesión (debe fallar)
3. Cambiar el estado a suspendido y probar (debe fallar)
4. Cambiar el estado a archivado y probar (debe fallar)
5. Probar con un usuario bloqueado por intentos fallidos (debe fallar)

## Mantenimiento

Es importante monitorear los logs de la base de datos y de la función webhook para detectar posibles problemas o intentos de eludir estas restricciones. 