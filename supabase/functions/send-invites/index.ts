// Gather: sends invitation, reminder and update (note to guests) emails through Brevo's free plan (300 emails a day).
//
// Setup, once, in the Supabase dashboard (Edge Functions -> Secrets):
//   BREVO_API_KEY  an API key from Brevo (Settings -> SMTP & API -> API keys)
//   SENDER_EMAIL   an address you have verified as a sender in Brevo
//   APP_URL        optional; the address of your Gather site (defaults to the one below)
//
// The browser calls this with the signed-in person's session. The function never trusts the request
// for who may send what: it asks the database (prepare_invite_emails), which checks that the person may
// manage guests for that event, applies a daily cap, records the send and returns each guest's
// personal link. Deploy with JWT verification off; the database call verifies the session instead.
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_APP_URL = 'https://manthan-gather.netlify.app/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';

function time12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
}
function when(ev) {
  const d = new Date(`${ev.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `${d}${ev.start ? ' at ' + time12(ev.start) : ''}`;
}
function publishableKey(env) {
  try { const keys = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}'); if (keys.default) return keys.default; } catch { /* fall back */ }
  return env('SUPABASE_ANON_KEY') || '';
}

export function buildEmail({ event, host, kind, recipient, link }) {
  const hostName = host?.name || 'Your host';
  const subject = kind === 'reminder' ? `Reminder: can you make ${event.name}?` : kind === 'update' ? `Update: ${event.name}` : `You’re invited: ${event.name}`;
  const lead = kind === 'reminder'
    ? `${hostName} is still hoping to hear whether you can make it.`
    : kind === 'update' ? `${hostName} has an update for you:` : `${hostName} would love you to come.`;
  const note = kind === 'update' ? String(event.note || '').trim() : '';
  const details = [when(event), event.location].filter(Boolean);
  const text = `Hi ${firstName(recipient.name)},\n\n${lead}\n${note ? '\n' + note + '\n' : ''}\n${event.name}\n${details.join('\n')}\n${event.description ? '\n' + event.description + '\n' : ''}\nReply here: ${link}\n\nSent with Gather on behalf of ${hostName}. Reply to this email to reach them.`;
  const html = `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Helvetica,Arial,sans-serif;color:#2a2733">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:18px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#8a8597">${kind === 'reminder' ? 'Reminder' : kind === 'update' ? 'Update' : 'Invitation'}</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.2">${esc(event.name)}</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.5">Hi ${esc(firstName(recipient.name))}, ${esc(lead)}</p>
${note ? `<p style="margin:0 0 16px;padding:14px 16px;background:#fdf3d6;border-radius:12px;font-size:16px;line-height:1.5;white-space:pre-line"><b>${esc(note)}</b></p>` : ''}
<p style="margin:0 0 4px;font-size:15px"><b>${esc(when(event))}</b></p>
${event.location ? `<p style="margin:0 0 14px;font-size:15px;color:#5d596b">${esc(event.location)}</p>` : ''}
${event.description ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#5d596b">${esc(event.description)}</p>` : ''}
<p style="margin:22px 0"><a href="${esc(link)}" style="background:#2a2733;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold;display:inline-block">${kind === 'update' ? 'See the invitation' : 'Reply to the invitation'}</a></p>
<p style="margin:0;font-size:13px;color:#8a8597;line-height:1.5">Or open this link: <a href="${esc(link)}" style="color:#5b46b8">${esc(link)}</a><br>Sent with Gather on behalf of ${esc(hostName)}. Reply to this email to reach them.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function handle(req, deps = {}) {
  const env = deps.env || ((k) => globalThis.Deno?.env.get(k));
  const doFetch = deps.fetch || fetch;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Send a JSON body.' }, 400); }
  const brevoKey = env('BREVO_API_KEY'); const sender = env('SENDER_EMAIL');
  if (body?.action === 'status') return json({ configured: Boolean(brevoKey && sender) });
  if (!brevoKey || !sender) return json({ error: 'Automatic email is not set up yet.' }, 503);

  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: 'Sign in first.' }, 401);
  const { eventId, invitationIds, kind = 'invite' } = body || {};
  if (typeof eventId !== 'string' || !Array.isArray(invitationIds) || invitationIds.length < 1 || invitationIds.length > 100 || !invitationIds.every((x) => typeof x === 'string')) {
    return json({ error: 'Choose between 1 and 100 guests.' }, 400);
  }
  if (!['invite', 'reminder', 'update'].includes(kind)) return json({ error: 'Unknown message type.' }, 400);

  // The database checks the caller's session and permissions, records the send, and returns the details.
  const prep = await doFetch(`${env('SUPABASE_URL')}/rest/v1/rpc/prepare_invite_emails`, {
    method: 'POST',
    headers: { apikey: publishableKey(env), Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ eid: eventId, p_ids: invitationIds, p_kind: kind }),
  });
  const data = await prep.json().catch(() => ({}));
  if (!prep.ok) return json({ error: data.message || 'Could not prepare the invitations.' }, [401, 403].includes(prep.status) ? prep.status : 400);

  const app = (env('APP_URL') || DEFAULT_APP_URL).replace(/#.*$/, '');
  const replyTo = data.host?.email ? { email: data.host.email, name: data.host.name || undefined } : undefined;
  const results = await Promise.all((data.recipients || []).map(async (r) => {
    const link = `${app}#invite-${data.event.id}-${r.token}`;
    const mail = buildEmail({ event: data.event, host: data.host, kind, recipient: r, link });
    try {
      const res = await doFetch(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: sender, name: `${data.host?.name || 'Gather'} via Gather` },
          to: [{ email: r.email, name: r.name || undefined }],
          replyTo, subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
        }),
      });
      if (res.ok) return { id: r.id, ok: true };
      const err = await res.json().catch(() => ({}));
      return { id: r.id, ok: false, error: err.message || `Brevo answered ${res.status}` };
    } catch (e) {
      return { id: r.id, ok: false, error: String(e?.message || e) };
    }
  }));
  const failed = results.filter((r) => !r.ok);
  return json({ sent: results.length - failed.length, failed, skipped: invitationIds.length - results.length });
}

if (globalThis.Deno?.serve && !globalThis.__GATHER_TEST__) Deno.serve((req) => handle(req));
