// Supabase Edge Function: push-reminder
// Triggered by a cron job every day at 10:00 (server time / UTC-3 Argentina = 13:00 UTC)
// Reads all push subscriptions from the DB and sends a Web Push notification
// to devices that haven't studied today.
//
// Required secrets (set via: supabase secrets set KEY=VALUE):
//   VAPID_PRIVATE_KEY  — generated with: npx web-push generate-vapid-keys
//   VAPID_PUBLIC_KEY   — same command output
//   VAPID_SUBJECT      — e.g. mailto:you@example.com
//   SB_SERVICE_KEY     — Supabase service_role key (for server-side DB access)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SB_SERVICE_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

const supabase = createClient(SB_URL, SB_SERVICE_KEY);

function getToday(): string {
  // Argentina timezone (UTC-3)
  const now = new Date();
  const ar = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  return ar.toISOString().split('T')[0];
}

// Build the VAPID Authorization header using Web Crypto
async function buildVapidHeaders(endpoint: string): Promise<Record<string, string>> {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsigned = `${encode(header)}.${encode(payload)}`;

  // Import the VAPID private key (base64url-encoded raw EC private key)
  const rawKey = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw', rawKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsigned}.${sig}`;

  return {
    'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    'Content-Type': 'application/json',
    'TTL': '86400',
  };
}

async function sendPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: object) {
  const headers = await buildVapidHeaders(subscription.endpoint);
  const body = JSON.stringify(payload);

  const resp = await fetch(subscription.endpoint, {
    method: 'POST',
    headers,
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`Push failed for ${subscription.endpoint}: ${resp.status} ${text}`);
    // Remove expired/invalid subscriptions (410 Gone or 404)
    if (resp.status === 410 || resp.status === 404) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    }
  }
  return resp.ok;
}

Deno.serve(async (_req) => {
  try {
    const today = getToday();
    console.log('push-reminder running for date:', today);

    // Get all push subscriptions
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth');

    if (subsError) throw subsError;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), { status: 200 });
    }

    // Get today's study days
    const { data: studied, error: studyError } = await supabase
      .from('study_days')
      .select('study_date')
      .eq('study_date', today);

    if (studyError) throw studyError;

    // NOTE: We don't know which subscription belongs to which user in this simple setup,
    // so we send to ALL subscriptions and let the SW client-side check filter it.
    const payload = {
      title: '\u00a1Hora de estudiar JavaScript!',
      body: 'Son las 10:00. Abr\u00ed el curso y estudi\u00e1 aunque sea 30 minutos.',
    };

    const results = await Promise.allSettled(
      subs.map(sub => sendPush(sub, payload))
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`Sent ${sent}/${subs.length} push notifications`);

    return new Response(JSON.stringify({ sent, total: subs.length }), { status: 200 });
  } catch (err) {
    console.error('push-reminder error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
