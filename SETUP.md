# SETUP — Web Push con VAPID (notificaciones robustas en iOS)

## ¿Qué se implementó?

Se reemplazó el sistema frágil de `setTimeout` dentro del Service Worker por **Web Push del servidor via VAPID keys**, que es la solución robusta de largo plazo para iOS. iOS puede matar el SW en cualquier momento, pero si el push viene del servidor el sistema operativo lo despierta de todas formas.

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `sw.js` | Se agregó `self.addEventListener('push')` para recibir notificaciones del servidor. El `setTimeout` fallback sigue para Android/desktop. |
| `index.html` | Se agregó `subscribeToPush()` que suscribe el dispositivo a Web Push y guarda el endpoint en Supabase. |
| `supabase/functions/push-reminder/index.ts` | Edge Function nueva: corre en el servidor, firma JWT VAPID y envía push a todos los dispositivos suscritos. |
| `supabase/config.toml` | Define el cron `0 13 * * *` (13:00 UTC = 10:00 Argentina UTC-3). |

---

## Pasos manuales pendientes

### 1. Generar las VAPID keys

```bash
npx web-push generate-vapid-keys
```

Guarda el output, vas a necesitar ambas claves.

---

### 2. Crear la tabla `push_subscriptions` en Supabase

Ejecutá este SQL en el **SQL Editor** de tu proyecto Supabase:

```sql
CREATE TABLE push_subscriptions (
  endpoint  TEXT PRIMARY KEY,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Permite insertar/leer desde el frontend (anon key)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert for all" ON push_subscriptions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow read for service role only" ON push_subscriptions
  FOR SELECT USING (false);
```

---

### 3. Cargar los secrets en Supabase

Necesitás tener el [Supabase CLI](https://supabase.com/docs/guides/cli) instalado y estar logueado.

```bash
supabase secrets set VAPID_PUBLIC_KEY=<tu_clave_publica>
supabase secrets set VAPID_PRIVATE_KEY=<tu_clave_privada>
supabase secrets set VAPID_SUBJECT=mailto:tu@email.com
supabase secrets set SB_SERVICE_KEY=<tu_service_role_key>
```

La `SB_SERVICE_KEY` la encontrás en: Supabase Dashboard → Settings → API → `service_role` (secret).

---

### 4. Reemplazar el placeholder de la VAPID public key

En **`sw.js`** e **`index.html`**, reemplazá esta línea:

```js
const VAPID_PUBLIC_KEY = 'BNS7PLACEHOLDER_REPLACE_WITH_REAL_VAPID_PUBLIC_KEY';
```

por la clave pública real generada en el paso 1.

---

### 5. Deployar la Edge Function

```bash
supabase functions deploy push-reminder --project-ref clutqytavmsaghinkrrp
```

---

### 6. Verificar el cron

En el Dashboard de Supabase: **Edge Functions → push-reminder → Schedules**
Deberías ver el cron `0 13 * * *` activo.

Para testear manualmente sin esperar al cron:
```bash
supabase functions invoke push-reminder --project-ref clutqytavmsaghinkrrp
```

---

## Cómo funciona el flujo completo

```
Usuario abre la app en iPhone
  → toca "Activar recordatorio"
  → el browser pide permiso de notificaciones
  → si acepta: subscribeToPush() crea una PushSubscription
  → se guarda {endpoint, p256dh, auth} en la tabla push_subscriptions

Cada día a las 10:00 AR (13:00 UTC):
  → Supabase Cron dispara la Edge Function push-reminder
  → Lee todos los registros de push_subscriptions
  → Para cada uno: firma un JWT VAPID y hace POST al endpoint
  → El sistema operativo (iOS/Android) recibe el push y despierta el SW
  → El SW verifica si ya se estudió hoy (fetch a Supabase)
  → Si no se estudió: muestra la notificación
```

---

## Dependencias del proyecto Supabase

- **Tabla:** `study_days` (ya existente) — columna `study_date: text`
- **Tabla:** `push_subscriptions` (nueva, ver paso 2)
- **Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SB_SERVICE_KEY`
