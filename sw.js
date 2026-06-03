const SB_URL = 'https://clutqytavmsaghinkrrp.supabase.co';
const SB_KEY = 'sb_publishable_5tYYmvYBTzP-X5VKP-2bFA_vOXD8qqP';
const HDR = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY
};

// VAPID public key (must match the private key used in the Edge Function)
const VAPID_PUBLIC_KEY = 'BNS7PLACEHOLDER_REPLACE_WITH_REAL_VAPID_PUBLIC_KEY';

function getToday() {
    return new Date().toISOString().split('T')[0];
}

async function fetchDays() {
    const res = await fetch(SB_URL + '/rest/v1/study_days?select=study_date', { headers: HDR });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(r => r.study_date);
}

// ─── Web Push: server-sent notification (reliable on iOS) ───────────────────
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch(e) {}

                        const title = data.title || '¡Hora de estudiar JavaScript!';
    const options = {
          body: data.body || 'Son las 10:00. Abrí el curso y estudiá aunque sea 30 minutos.',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'daily-reminder',
          requireInteraction: false,
          data: data
    };

                        event.waitUntil(
                              fetchDays().then(dates => {
        if (!dates.includes(getToday())) {
                  return self.registration.showNotification(title, options);
        }
                              })
                            );
});

// ─── Fallback: setTimeout scheduling (works on Android, fragile on iOS) ─────
async function scheduleNext() {
    const now = new Date();
    const target = new Date();
    target.setHours(10, 0, 0, 0);
    if (now >= target) target.setDate(target.getDate() + 1);
    const delay = target - now;
    setTimeout(fireNotif, delay);
}

async function fireNotif() {
    const dates = await fetchDays();
    if (!dates.includes(getToday())) {
          await self.registration.showNotification('\u00a1Hora de estudiar JavaScript!', {
                  body: 'Son las 10:00. Abr\u00ed el curso y estudi\u00e1 aunque sea 30 minutos.',
                  icon: '/icon-192.png',
                  badge: '/icon-192.png',
                  tag: 'daily-reminder',
                  requireInteraction: false
          });
    }
    scheduleNext();
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'START_SCHEDULE') {
          scheduleNext();
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
          self.clients.matchAll({ type: 'window' }).then(clients => {
                  if (clients.length > 0) return clients[0].focus();
                                       return self.clients.openWindow('/');
          })
        );
});
