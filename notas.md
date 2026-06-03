# Notas - Web Push + VAPID

## El problema
El Service Worker en iOS puede ser terminado por el sistema en cualquier momento.
Un setTimeout adentro del SW para disparar la notif a las 10:00 no es confiable porque si iOS mata el proceso, el timer se pierde.

## La solucion
Web Push del servidor: el servidor manda el push, iOS recibe la señal y despierta el SW aunque estuviera cerrado.
Para eso se necesitan VAPID keys (una especie de firma que identifica al servidor).

## Como funciona
1. El usuario acepta notificaciones en el browser
2. El browser crea una PushSubscription (tiene endpoint, p256dh, auth)
3. Se guarda esa suscripcion en Supabase (tabla push_subscriptions)
4. Cada dia a las 10:00 AR corre una Edge Function en Supabase
5. La funcion lee todas las suscripciones, firma un JWT con la VAPID private key, y hace POST al endpoint de cada dispositivo
6. iOS/Android reciben el push y despiertan el SW
7. El SW verifica si ya se estudio hoy antes de mostrar la notif

## Archivos que se tocaron
- sw.js: se agrego addEventListener('push') para recibir el push del servidor
- index.html: se agrego subscribeToPush() que suscribe el dispositivo y guarda en Supabase
- supabase/functions/push-reminder/index.ts: la Edge Function que manda los pushes
- supabase/config.toml: define el cron (0 13 * * * = 13:00 UTC = 10:00 Argentina)

## Pendiente para activarlo
1. npx web-push generate-vapid-keys
2. Crear tabla push_subscriptions en Supabase
3. supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... etc
4. Reemplazar el placeholder en sw.js e index.html con la public key real
5. supabase functions deploy push-reminder
