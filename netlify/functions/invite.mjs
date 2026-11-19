// Gather: link previews for invitations, so WhatsApp (and iMessage, Telegram, Slack…) show the event's
// own name, date, place and picture instead of the generic Gather card.
//
//   /i/<event>                 the event's shared link
//   /i/<event>/<token>         a guest's personal link
//   /i/<event>[/<token>]/image the preview picture: the event's uploaded cover photo, or its theme image
//
// Link-preview robots get a small HTML page with Open Graph tags. People are sent straight on to the
// app (/#invite-<event>[-<token>]), which is where the invitation really lives. Event details come from
// the same database function the invitation page uses (guest_invite), with the public key, so an
// invite-only event shows nothing without a valid personal link.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bqofayrgxygsigbdugzu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Q_qdt_c-MeE9mIjvxbky_A_8GOQo0K0';
const THEMES = ['classic', 'disco', 'garden', 'confetti', 'lights', 'midnight', 'minimal'];
const BOTS = /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|discordbot|linkedinbot|pinterest|skypeuripreview|applebot|googlebot|bingbot|redditbot|embedly|iframely|vkshare|snapchat|viber|signal|preview|crawler|spider|bot\b/i;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
function time12(t) {
  if (!/^\d{1,2}:\d{2}$/.test(t || '')) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
}
function day(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function parsePath(pathname) {
  const m = String(pathname).match(/^\/i\/([A-Za-z0-9_]{2,40})(?:\/([A-Za-z0-9]{16,64}))?(\/image)?\/?$/);
  return m ? { eventId: m[1], token: m[2] || null, image: !!m[3] } : null;
}

async function fetchEvent(eventId, token, doFetch) {
  try {
    const r = await doFetch(`${SUPABASE_URL}/rest/v1/rpc/guest_invite`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eid: eventId, p_token: token }), signal: AbortSignal.timeout(3500),
    });
    if (!r.ok) return null;
    const ev = await r.json();
    return ev && !ev.private && ev.name ? ev : null;
  } catch { return null; }
}

export function previewFor(ev) {
  if (!ev) return { title: 'You’re invited', description: 'Open your invitation on Gather to see the details and reply.' };
  const when = [day(ev.date), time12(ev.start)].filter(Boolean).join(', ');
  const hello = ev.guest?.name ? `Hi ${first(ev.guest.name)}! ` : '';
  const host = first(ev.hostName) ? `${first(ev.hostName)} invites you. ` : '';
  return { title: clip(ev.name, 90), description: clip(`${hello}${host}${[when, ev.location].filter(Boolean).join(' · ')}. Tap to reply.`, 200) };
}

export function page({ title, description, image, url, target }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Gather">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body style="font-family:system-ui,sans-serif;padding:24px"><p><a href="${esc(target)}">Open the invitation</a></p>
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script></body></html>`;
}

function dataUrlImage(src) {
  const m = String(src || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  return bytes.length > 0 && bytes.length <= 3_000_000 ? { type: m[1], bytes } : null;
}

export async function handle(req, deps = {}) {
  const doFetch = deps.fetch || fetch;
  const url = new URL(req.url); const origin = url.origin;
  const p = parsePath(url.pathname);
  if (!p) return Response.redirect(`${origin}/`, 302);
  const target = `${origin}/#invite-${p.eventId}${p.token ? '-' + p.token : ''}`;
  const themeImage = (theme) => `${origin}/og/theme-${THEMES.includes(theme) ? theme : 'classic'}.jpg`;

  if (p.image) {
    const ev = await fetchEvent(p.eventId, p.token, doFetch);
    const img = dataUrlImage(ev?.cover?.image);
    if (img) return new Response(img.bytes, { headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=600', 'X-Robots-Tag': 'noindex' } });
    return Response.redirect(themeImage(ev?.cover?.theme), 302);
  }

  // People go straight to the app; only preview robots need the page below.
  const ua = req.headers.get('user-agent') || '';
  if (!BOTS.test(ua)) return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });

  const ev = await fetchEvent(p.eventId, p.token, doFetch);
  const { title, description } = previewFor(ev);
  const image = ev?.cover?.image ? `${origin}/i/${p.eventId}${p.token ? '/' + p.token : ''}/image` : themeImage(ev?.cover?.theme);
  return new Response(page({ title, description, image, url: url.href, target }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export default (req) => handle(req);
export const config = { path: '/i/*' };
