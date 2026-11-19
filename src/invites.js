// Invitation messages and the links that open WhatsApp or an email app with them already written.
// WhatsApp's own API charges for business-sent invitations, so Gather opens WhatsApp with the message
// ready and the host taps Send: free, and it comes from the host's own number.
import { fmtDate, fmtTime } from './utils.js';
import { BACKEND } from './backend-config.js';

export const appBase = () => location.origin + location.pathname.replace(/[^/]*$/, '');
// On the published site, links go through /i/… so chat apps can show the event's own preview.
const previewLinks = () => { try { return !!BACKEND.siteUrl && new URL(BACKEND.siteUrl).origin === location.origin; } catch { return false; } };
export const eventLink = (ev) => (previewLinks() ? `${location.origin}/i/${ev.id}` : `${appBase()}#invite-${ev.id}`);
export const personalLinkFor = (ev, token) => (!token ? eventLink(ev) : previewLinks() ? `${location.origin}/i/${ev.id}/${token}` : `${appBase()}#invite-${ev.id}-${token}`);

export function inviteText(ev, guestName, link, { kind = 'invite', host } = {}) {
  const hi = guestName ? `Hi ${guestName.trim().split(/\s+/)[0]}! ` : 'Hi! ';
  const when = `${fmtDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })}${ev.start ? ' at ' + fmtTime(ev.start) : ''}`;
  const where = ev.location ? `, ${ev.location}` : '';
  const who = host ? `${host} ` : '';
  return kind === 'reminder'
    ? `${hi}Just checking if you can make ${ev.name} on ${when}${where}. You can reply here: ${link}`
    : `${hi}${who ? who + 'would love you to come to' : 'You’re invited to'} ${ev.name} on ${when}${where}. Let me know if you can make it: ${link}`;
}
export const inviteSubject = (ev, kind = 'invite') => (kind === 'reminder' ? `Reminder: can you make ${ev.name}?` : `You’re invited: ${ev.name}`);

// WhatsApp needs the full international number. Returns digits only, or null if there is no country code.
export function waNumber(phone) {
  let p = String(phone || '').trim().replace(/[\s().-]/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) return null;
  const d = p.slice(1).replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : null;
}
export const whatsappUrl = (phone, text) => `https://wa.me/${waNumber(phone) || ''}?text=${encodeURIComponent(text)}`;
export const mailtoUrl = (email, subject, body) => `mailto:${String(email || '').replace(/[?&#\s]/g, '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim());
