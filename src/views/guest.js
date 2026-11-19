// The invitation page for someone who is not signed in. A personal link (#invite-<event>-<token>) is
// all a guest needs: they see the event and reply, with no account. The token is checked by the
// database (guest_invite / guest_rsvp), which only ever shows this one event and changes only this
// guest's reply.
import { html, useState, useEffect } from '../lib.js';
import { BRAND } from '../config.js';
import { guestInvite, guestRsvp, guestClaim, guestComment, guestUncomment } from '../backend.js';
import { themeClass, confetti, GoingList, Wall, ChipIn } from './invite-look.js';
import { NoteBanner, GuestBringList } from './extras.js';
import { Icon, Pill, Cover, Field, Switch } from '../ui.js';
import { cx, fmtLong, fmtTime } from '../utils.js';

const ANSWERS = [{ id: 'going', label: 'Going', emoji: '🎉' }, { id: 'maybe', label: 'Maybe', emoji: '🤔' }, { id: 'declined', label: 'Can’t go', emoji: '💌' }];
const HEADLINE = { going: 'You’re going 🎉', maybe: 'You said maybe', declined: 'You can’t make it' };

/* ---------- add to calendar ---------- */
const pad = (n) => String(n).padStart(2, '0');
// Start and end as local wall-clock times (no time zone): the calendar shows them as written.
function span(ev) {
  const [y, m, d] = ev.date.split('-').map(Number); const [sh, sm] = (ev.start || '19:00').split(':').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, sh, sm));
  let end;
  if (ev.end) { const [eh, em] = ev.end.split(':').map(Number); end = new Date(Date.UTC(y, m - 1, d, eh, em)); if (end <= start) end = new Date(end.getTime() + 864e5); }
  else end = new Date(start.getTime() + 3 * 36e5);
  const f = (t) => `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`;
  return [f(start), f(end)];
}
const link = () => location.href;
export function googleCalendarUrl(ev) {
  const [a, b] = span(ev);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.name, dates: `${a}/${b}`, details: `${ev.description || ''}\n\n${link()}`.trim(), location: ev.location || '' });
  return `https://calendar.google.com/calendar/render?${q}`;
}
export function icsFile(ev) {
  const [a, b] = span(ev); const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${BRAND.name}//EN`, 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${ev.id}@gather`, `DTSTAMP:${now}`,
    `DTSTART:${a}`, `DTEND:${b}`, `SUMMARY:${esc(ev.name)}`, ev.location && `LOCATION:${esc(ev.location)}`, `DESCRIPTION:${esc(`${ev.description || ''}\n\n${link()}`.trim())}`,
    `URL:${esc(link())}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  return URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
}
const mapUrl = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

/* ---------- the page ---------- */
function Reply({ ev, token, guest, onSaved }) {
  const r = guest.rsvp || { status: 'pending' }; const answered = r.status && r.status !== 'pending';
  const [editing, setEditing] = useState(!answered); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const [d, setD] = useState({ plusOne: !!r.plusOne, plusOneName: r.plusOneName || '', dietary: r.dietary || '', arrival: r.arrival || '', message: r.message || '' });
  const send = async (patch, after) => {
    setBusy(true); setMsg(null);
    try { const saved = await guestRsvp(ev.id, token, patch); onSaved(saved); after?.(saved); }
    catch (e) { setMsg({ tone: 'coral', text: e.message }); }
    setBusy(false);
  };
  const answer = (status) => send({ status }, () => { if (status === 'going') confetti(); setEditing(false); setMsg({ tone: 'mint', text: status === 'declined' ? `Thanks for letting ${ev.hostName?.split(' ')[0] || 'the host'} know.` : `${ev.hostName?.split(' ')[0] || 'The host'} can see your reply.` }); });
  const save = () => send({ ...d }, () => setMsg({ tone: 'mint', text: 'Details saved.' }));
  const first = guest.name?.split(' ')[0];
  return html`<div class=${cx('card col', !answered && 'tint c-butter')} id="guest-reply">
    <div class="row between wrap"><div><div class="eyebrow">Your reply${first ? `, ${first}` : ''}</div><h2>${answered ? HEADLINE[r.status] : 'Can you make it?'}</h2></div>
      ${answered && !editing && html`<button class="btn sm" onClick=${() => setEditing(true)}><${Icon} name="edit" size=${15} />Change answer</button>`}</div>
    ${editing && html`<div class="row wrap">${ANSWERS.map((o) => html`<button key=${o.id} id=${'rsvp-' + o.id} class=${cx('btn', r.status === o.id ? 'primary' : '')} disabled=${busy} onClick=${() => answer(o.id)}>${o.emoji} ${o.label}</button>`)}</div>`}
    ${msg && html`<div class=${'banner c-' + msg.tone} role="status">${msg.text}</div>`}
    ${answered && r.status !== 'declined' && html`<details class="col" open=${!r.arrival && !r.dietary && !r.message}><summary class="b" style="cursor:pointer">Add details for the host (optional)</summary>
      <div class="col" style="margin-top:10px"><div class="form-grid">
        <${Field} label="Arriving around"><input id="guest-arrival" class="input" type="time" value=${d.arrival} onInput=${(e) => setD({ ...d, arrival: e.target.value })} /><//>
        <${Field} label="Dietary needs"><input id="guest-dietary" class="input" maxlength="300" placeholder="e.g. vegetarian, nut allergy" value=${d.dietary} onInput=${(e) => setD({ ...d, dietary: e.target.value })} /><//></div>
      ${guest.plusOneAllowed && html`<div class="row wrap"><${Switch} on=${d.plusOne} label="Bring a plus-one" onChange=${(v) => setD({ ...d, plusOne: v })} /><span class="b">Bring a plus-one</span>${d.plusOne && html`<input class="input" style="max-width:220px" maxlength="120" placeholder="Their name" value=${d.plusOneName} onInput=${(e) => setD({ ...d, plusOneName: e.target.value })} />`}</div>`}
      <${Field} label="Message to the host"><textarea id="guest-message" class="input" style="min-height:56px" maxlength="1000" placeholder="Say hello" value=${d.message} onInput=${(e) => setD({ ...d, message: e.target.value })}></textarea><//>
      <div><button id="guest-save" class="btn primary" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save details'}</button></div></div></details>`}
  </div>`;
}

export function GuestInvite({ eventId, token, onSignIn }) {
  const [ev, setEv] = useState(undefined); const [error, setError] = useState('');
  useEffect(() => { guestInvite(eventId, token).then((x) => setEv(x || null)).catch((e) => { setError(e.message); setEv(null); }); }, [eventId, token]);
  useEffect(() => { if (ev?.name) document.title = `${ev.name} · ${BRAND.name}`; }, [ev?.name]);
  const brand = html`<div class="row between on-bg" style="margin-bottom:6px"><span class="brand" style="padding:0"><span class="brand-mark">${BRAND.mark}</span>${BRAND.name}</span>
    <button class="btn ghost sm" onClick=${() => onSignIn()}>Sign in</button></div>`;
  const shell = (body) => html`<div class=${'guest-wrap ' + themeClass(ev)}><main class="page" style="max-width:640px"><div class="col gap-l">${brand}${body}
    <p class="small muted center on-bg" style="margin-top:10px">Planning something yourself? <a href="./#home" onClick=${(e) => { e.preventDefault(); onSignIn('home'); }}>Make your own event with ${BRAND.name}</a>, free.</p></div></main></div>`;
  if (ev === undefined) return shell(html`<div class="card center muted" style="padding:40px">Opening your invitation…</div>`);
  if (!ev) return shell(html`<div class="card col center" style="padding:32px"><span style="font-size:2.4rem">💌</span><h2>This invitation isn’t available</h2><p class="muted">${error || 'The event may have been deleted, or the link was copied incompletely. Ask the host to send it again.'}</p></div>`);
  if (ev.private) return shell(html`<div class="card col center" style="padding:32px"><span style="font-size:2.4rem">🔒</span><h2>This event is invite only</h2><p class="muted">Open the personal link the host sent you by WhatsApp or email. If you have an account, sign in to see your events.</p><div><button class="btn primary" onClick=${() => onSignIn()}>Sign in</button></div></div>`);
  const g = ev.guest; const status = g?.rsvp?.status; const cover = ev.cover?.tone ? ev.cover : { tone: 'lav', emoji: '🎉' };
  return shell(html`
    <div class="card col gap-l" style="padding:12px 12px 22px"><${Cover} ev=${{ ...ev, cover }} size="hero" />
      <div class="col" style="padding:0 10px;text-align:center;align-items:center">
        <span class="small muted">${g?.name ? `Hi ${g.name.split(' ')[0]}, ` : ''}${ev.hostName || 'Your host'} invites you to</span><h1 id="guest-event-name">${ev.name}</h1>
        <div class="row wrap" style="justify-content:center"><${Pill} tone="lav"><${Icon} name="calendar" size=${13} />${fmtLong(ev.date)}<//>${ev.start && html`<${Pill} tone="butter"><${Icon} name="clock" size=${13} />${fmtTime(ev.start)}${ev.end ? '–' + fmtTime(ev.end) : ''}<//>`}</div>
        ${ev.location ? html`<a class="row gap-s" href=${mapUrl(ev.location)} target="_blank" rel="noopener"><${Icon} name="pin" size=${15} />${ev.location}</a>` : html`<span class="row gap-s muted"><${Icon} name="pin" size=${15} />Location to be confirmed</span>`}
        ${ev.description && html`<p style="white-space:pre-line">${ev.description}</p>`}
        <span class="small muted">${ev.going} going · ${ev.maybe} maybe</span></div></div>
    <${NoteBanner} text=${ev.guestNote} at=${ev.guestNoteAt} host=${ev.hostName} />
    <${GoingList} people=${ev.goingList} />
    ${g ? html`<${Reply} ev=${ev} token=${token} guest=${g} onSaved=${(rsvp) => { if (ev.goingList && rsvp.status !== status) guestInvite(ev.id, token).then((x) => x && setEv((cur) => ({ ...cur, goingList: x.goingList }))).catch(() => {}); setEv({ ...ev, guest: { ...g, rsvp }, going: ev.going + (rsvp.status === 'going') - (status === 'going'), maybe: ev.maybe + (rsvp.status === 'maybe') - (status === 'maybe') }); }} />`
      : html`<div class="card col"><h3>Want to reply?</h3><p class="small muted">This is the event’s shared link. Sign in or create a free account so the host knows who is coming. If the host sent you a personal link, open that one instead: it needs no account.</p><div><button class="btn primary" onClick=${() => onSignIn()}>Sign in to reply</button></div></div>`}
    ${(status === 'going' || status === 'maybe') && html`<${ChipIn} chip=${ev.chipIn} currency=${ev.currency} />`}
    ${g && status !== 'declined' && html`<${GuestBringList} items=${ev.bring} onClaim=${async (item, on) => { const bring = await guestClaim(ev.id, token, item, on); setEv((cur) => ({ ...cur, bring })); }} />`}
    ${(status === 'going' || status === 'maybe') && html`<div class="card row wrap between"><span class="b">Add it to your calendar</span><div class="row wrap">
      <a class="btn sm" id="cal-google" href=${googleCalendarUrl(ev)} target="_blank" rel="noopener"><${Icon} name="calendar" size=${15} />Google Calendar</a>
      <a class="btn sm" id="cal-ics" href=${icsFile(ev)} download=${ev.name.replace(/[^\w ]+/g, '').trim() + '.ics'}><${Icon} name="calendar" size=${15} />Apple / Outlook</a></div></div>`}
    ${ev.wallOn && html`<${Wall} posts=${ev.wall || []} canPost=${!!g} intro=${g ? 'Everyone invited can read these.' : 'Open your personal link to join in.'}
      onPost=${async (text) => { const wall = await guestComment(ev.id, token, text); setEv((cur) => ({ ...cur, wall })); }}
      canDelete=${(p) => p.mine} onDelete=${async (id) => { const wall = await guestUncomment(ev.id, token, id); setEv((cur) => ({ ...cur, wall })); }} />`}
    <p class="tiny muted center on-bg">Only you have this link: anyone you forward it to can answer as you. <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></p>`);
}
