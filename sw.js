const SB_URL = 'https://clutqytavmsaghinkrrp.supabase.co';
const SB_KEY = 'sb_publishable_5tYYmvYBTzP-X5VKP-2bFA_vOXD8qqP';
const HDR = {
  'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY
    };

    function getToday() {
      return new Date().toISOString().split('T')[0];
      }

      async function fetchDays() {
        const res = await fetch(SB_URL + '/rest/v1/study_days?select=study_date', { headers: HDR });
          if (!res.ok) return [];
            const rows = await res.json();
              return rows.map(r => r.study_date);
              }

              async function scheduleNext() {
                const now = new Date();
                  const target = new Date();
                    target.setHours(10, 0, 0, 0);
                      if (now >= target) target.setDate(target.getDate() + 1);
                        const delay = target - now;
                          // Guardar el timestamp objetivo en SW storage
                            await self.registration.showNotification('', { silent: true, tag: 'keepalive' });
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

                                                                            self.addEventListener('install', event => {
                                                                              self.skipWaiting();
                                                                              });

                                                                              self.addEventListener('activate', event => {
                                                                                event.waitUntil(self.clients.claim());
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
                                                                                                          
                                                                                                          // Mensaje desde la app para iniciar el scheduling
                                                                                                          self.addEventListener('message', event => {
                                                                                                            if (event.data && event.data.type === 'START_SCHEDULE') {
                                                                                                                scheduleNext();
                                                                                                                  }
                                                                                                                  });
