// Three host helpers on the People tab, and the guest-facing side of two of them:
//   HeadcountCard   the real numbers for the day: people coming with plus-ones, food needs, what's being brought
//   GuestNoteCard   a short note shown at the top of every invitation page, shareable by WhatsApp or email
//   BringListCard   things guests can offer to bring (hosts manage it; guests claim from their link or the app)
import { html, useState, useEffect } from '../lib.js';
import { invitationsOf, invitationFor, bringOf, addBringItem, updateBringItem, removeBringItem, claimBringItem, setGuestNote, user, isCloud } from '../store.js';
import { emailSetup, sendInviteEmails } from '../backend.js';
import { whatsappUrl, eventLink, validEmail } from '../invites.js';
import { can, isOwner } from '../permissions.js';
import { Icon, Pill, Field, Confirm, toast, copyText } from '../ui.js';
import { cx, fmtDate, fmtTime, ago } from '../utils.js';

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'Someone';

/* ---------------- headcount ---------------- */
// "Vegetarian, nut allergy" from several guests -> [["Vegetarian", 2], ["Nut allergy", 1]].
export function foodNeeds(list) {
  const seen = new Map();
  list.forEach((i) => String(i.rsvp.dietary || '').split(/[,;/]+|\s+and\s+|\s*&\s*/i).map((x) => x.trim()).filter((x) => x && !/^(none|no|n\/?a|nothing|-+)$/i.test(x)).forEach((x) => {
    const k = x.toLowerCase(); const cur = seen.get(k); seen.set(k, cur ? [cur[0], cur[1] + 1] : [x[0].toUpperCase() + x.slice(1), 1]);
  }));
  return [...seen.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
export function headcount(eventId) {
  const all = invitationsOf(eventId); const by = (s) => all.filter((i) => i.rsvp.status === s);
  const going = by('going'); const maybe = by('maybe'); const plus = going.filter((i) => i.rsvp.plusOne).length; const maybePlus = maybe.filter((i) => i.rsvp.plusOne).length;
  return { going: going.length, plus, total: going.length + plus, maybe: maybe.length, maybeTotal: maybe.length + maybePlus, pending: by('pending').length, declined: by('declined').length, food: foodNeeds(going), invited: all.length };
}
function summaryText(ev) {
  const h = headcount(ev.id); const items = bringOf(ev.id); const invs = invitationsOf(ev.id);
  const taken = items.filter((b) => b.claimedBy).map((b) => `${b.name}: ${first(invs.find((i) => i.id === b.claimedBy)?.name)}`);
  const open = items.filter((b) => !b.claimedBy).map((b) => b.name);
  return [`${ev.name} · ${fmtDate(ev.date)}${ev.start ? ', ' + fmtTime(ev.start) : ''}`,
    `Coming: ${h.total}${h.plus ? ` (${h.going} guests + ${h.plus} plus-one${h.plus === 1 ? '' : 's'})` : ''}`,
    `Maybe: ${h.maybeTotal} · No reply yet: ${h.pending}`,
    h.food.length ? `Food needs: ${h.food.map(([k, n]) => `${k} ${n}`).join(', ')}` : 'Food needs: none mentioned',
    taken.length ? `Bringing: ${taken.join(' · ')}` : '', open.length ? `Still needed: ${open.join(', ')}` : ''].filter(Boolean).join('\n');
}
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
function downloadGuestList(ev) {
  const label = { going: 'Going', maybe: 'Maybe', pending: 'No reply', declined: 'Can’t go' }; const items = bringOf(ev.id);
  const rows = [['Name', 'Reply', 'Plus-one', 'Plus-one name', 'Dietary', 'Arriving', 'Bringing', 'Message', 'Group', 'Email', 'Phone', 'Checked in'],
    ...invitationsOf(ev.id).map((i) => [i.name, label[i.rsvp.status] || i.rsvp.status, i.rsvp.plusOne ? 'Yes' : '', i.rsvp.plusOne ? i.rsvp.plusOneName : '', i.rsvp.dietary, i.rsvp.arrival,
      items.filter((b) => b.claimedBy === i.id).map((b) => b.name).join('; '), i.rsvp.message, i.group, i.email, i.phone, i.checkedIn ? 'Yes' : ''])];
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${ev.name.replace(/[^\w ]+/g, '').trim() || 'event'} guests.csv`; document.body.appendChild(a); a.click(); a.remove();
}
export function HeadcountCard({ ev }) {
  const h = headcount(ev.id); const items = bringOf(ev.id); const taken = items.filter((b) => b.claimedBy).length;
  return html`<div class="card col" id="headcount"><div class="row between wrap"><div class="col" style="gap:2px"><h3>Headcount for the day</h3><span class="small muted">Who to cater for, worked out from the replies.</span></div>
      <div class="row wrap"><a id="headcount-whatsapp" class="btn sm soft c-mint" href=${whatsappUrl('', summaryText(ev))} target="_blank" rel="noopener"><${Icon} name="message" size=${15} />Share on WhatsApp</a>
        <button class="btn sm" onClick=${async () => toast((await copyText(summaryText(ev))) ? 'Summary copied' : 'Copy is unavailable here')}><${Icon} name="link" size=${15} />Copy</button>
        <button id="headcount-csv" class="btn sm" onClick=${() => downloadGuestList(ev)}><${Icon} name="file" size=${15} />Download guest list</button></div></div>
    <div class="row wrap" style="gap:18px">
      <div class="col" style="gap:0"><span class="num" style="font:800 2rem var(--display)" id="headcount-total">${h.total}</span><span class="small muted">coming${h.plus ? ` (${h.going} + ${h.plus} plus-one${h.plus === 1 ? '' : 's'})` : ''}</span></div>
      <div class="col" style="gap:0"><span class="num" style="font:800 2rem var(--display)">${h.maybeTotal}</span><span class="small muted">maybe</span></div>
      <div class="col" style="gap:0"><span class="num" style="font:800 2rem var(--display)">${h.pending}</span><span class="small muted">no reply yet</span></div>
      ${items.length > 0 && html`<div class="col" style="gap:0"><span class="num" style="font:800 2rem var(--display)">${taken}/${items.length}</span><span class="small muted">things to bring taken</span></div>`}</div>
    <div class="col gap-s"><span class="eyebrow">Food needs of people coming</span>
      ${h.food.length ? html`<div class="chips" id="food-needs">${h.food.map(([k, n]) => html`<span class="chip" key=${k}>${k} <b class="num">${n}</b></span>`)}</div>` : html`<span class="small muted">Nobody coming has mentioned any yet.</span>`}</div>
  </div>`;
}

/* ---------------- note to guests ---------------- */
export function NoteBanner({ text, at, host }) {
  if (!text) return null;
  return html`<div class="card tint c-butter col" id="guest-note" style="gap:6px"><div class="row wrap gap-s"><span class="eyebrow" style="color:var(--ci)">📌 Note from ${first(host) === 'Someone' ? 'the host' : first(host)}</span>${at && html`<span class="tiny" style="color:var(--ci)">${ago(at)}</span>`}</div>
    <p style="white-space:pre-line;margin:0;font-weight:600">${text}</p></div>`;
}
export function GuestNoteCard({ ev }) {
  const owner = isOwner(ev.id); const [text, setText] = useState(ev.guestNote || ''); const [auto, setAuto] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (isCloud()) emailSetup().then(setAuto); }, []);
  useEffect(() => { setText(ev.guestNote || ''); }, [ev.guestNote]);
  const saved = ev.guestNote || ''; const dirty = text.trim() !== saved;
  const coming = invitationsOf(ev.id).filter((i) => ['going', 'maybe'].includes(i.rsvp.status));
  const emailable = coming.filter((i) => validEmail(i.email));
  const shareText = `Update for ${ev.name}: ${saved}${ev.privacy !== 'private' ? `\n${eventLink(ev)}` : ''}`;
  const email = async () => { setBusy(true); try { const r = await sendInviteEmails(ev.id, emailable.slice(0, 100).map((i) => i.id), 'update'); toast(`Note emailed to ${r.sent} ${r.sent === 1 ? 'guest' : 'guests'}${r.failed?.length ? `, ${r.failed.length} failed` : ''}`); } catch (e) { toast(e.message); } setBusy(false); };
  return html`<div class="card col" id="note-card"><div class="col" style="gap:2px"><h3>Note to guests</h3><span class="small muted">Shown at the top of every guest’s invitation page, e.g. “Parking is behind the hall” or “We’ve moved to 8pm”.</span></div>
    ${owner ? html`<textarea id="note-text" class="input" style="min-height:64px" maxlength="1000" placeholder="Write a short update for your guests" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
      <div class="row wrap"><button id="note-save" class="btn primary" disabled=${!dirty} onClick=${() => { setGuestNote(ev.id, text); toast(text.trim() ? 'Note is on every invitation now' : 'Note removed'); }}>${saved && !text.trim() ? 'Remove note' : 'Save note'}</button>
        ${saved && !dirty && html`<span class="small muted">Showing since ${ago(ev.guestNoteAt)}</span>`}</div>`
      : saved ? html`<${NoteBanner} text=${saved} at=${ev.guestNoteAt} host=${user(ev.createdBy).name} />` : html`<span class="small muted">No note yet. The host can add one.</span>`}
    ${saved && !dirty && html`<span class="small b">Tell people now</span><div class="row wrap">
      <a id="note-whatsapp" class="btn sm soft c-mint" href=${whatsappUrl('', shareText)} target="_blank" rel="noopener"><${Icon} name="message" size=${15} />Share on WhatsApp</a>
      ${auto && html`<button id="note-email" class="btn sm" disabled=${!emailable.length || busy} onClick=${email}><${Icon} name="send" size=${15} />${busy ? 'Sending…' : `Email ${emailable.length} going or maybe`}</button>`}</div>
      <span class="tiny muted">WhatsApp opens with the note written: pick your guest group or a chat.${ev.privacy === 'private' ? ' The event link isn’t included because this event is invite only; guests see the note when they open their own link.' : ''}</span>`}
  </div>`;
}

/* ---------------- bring list ---------------- */
const IDEAS = {
  houseparty: ['Ice', 'Snacks', 'Mixers', 'Cups', 'Speaker', 'Dessert'], birthday: ['Cake', 'Candles', 'Balloons', 'Snacks', 'Drinks', 'Plates'],
  dinner: ['Wine', 'Dessert', 'Bread', 'Salad', 'Flowers'], networking: ['Name badges', 'Extension lead', 'Snacks', 'Water'],
  wedding: ['Guest book', 'Fairy lights', 'Card box'], celebration: ['Drinks', 'Snacks', 'Decorations', 'Music'],
};
const ideasFor = (ev, have) => (IDEAS[ev.category] || ['Snacks', 'Drinks', 'Cups', 'Dessert', 'Music']).filter((x) => !have.some((h) => h.toLowerCase() === x.toLowerCase())).slice(0, 5);

export function BringListCard({ ev }) {
  const items = bringOf(ev.id); const invs = invitationsOf(ev.id); const manage = can(ev.id, 'manageGuests'); const mine = invitationFor(ev.id);
  const [name, setName] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState('');
  if (!manage && (!mine || !items.length)) return null;
  const add = (n = name) => { if (!n.trim()) return; addBringItem(ev.id, n, n === name ? note : ''); if (n === name) { setName(''); setNote(''); } };
  const claim = async (b, on) => { setBusy(b.id); try { await claimBringItem(b.id, on); toast(on ? `Thanks! You’re bringing ${b.name}.` : 'Given back'); } catch (e) { toast(e.message); } setBusy(''); };
  const who = (id) => invs.find((i) => i.id === id);
  return html`<div class="card col" id="bring-list"><div class="row between wrap"><div class="col" style="gap:2px"><h3>Who’s bringing what</h3>
      <span class="small muted">${manage ? 'Guests pick something from their invitation link, no account needed. You can also assign items yourself.' : 'Pick something to bring, if you’d like to help.'}</span></div>
      ${items.length > 0 && html`<${Pill} tone="mint">${items.filter((b) => b.claimedBy).length} of ${items.length} taken<//>`}</div>
    ${items.length > 0 && html`<div class="list">${items.map((b) => { const by = b.claimedBy && who(b.claimedBy); const me_ = mine && b.claimedBy === mine.id; return html`<div class="row wrap" key=${b.id} style="padding:6px 0">
      <span class="col grow" style="gap:0;min-width:140px"><b>${b.name}</b>${b.note && html`<span class="tiny muted">${b.note}</span>`}</span>
      ${manage ? html`<select class="input sm" style="max-width:190px" aria-label=${'Who is bringing ' + b.name} value=${b.claimedBy || ''} onChange=${(e) => updateBringItem(b.id, { claimedBy: e.target.value || null })}>
          <option value="">Nobody yet</option>${invs.filter((i) => i.rsvp.status !== 'declined' || i.id === b.claimedBy).map((i) => html`<option value=${i.id}>${i.name}</option>`)}</select>
          <${Confirm} label="Remove" onConfirm=${() => removeBringItem(b.id)} />`
        : me_ ? html`<span class="row gap-s nowrap"><${Pill} tone="mint">You’re bringing this<//><button class="btn sm ghost" disabled=${busy === b.id} onClick=${() => claim(b, false)}>Give back</button></span>`
          : by ? html`<span class="small muted">${first(by.name)} is bringing it</span>`
            : html`<button class="btn sm primary" disabled=${!!busy} onClick=${() => claim(b, true)}>I’ll bring this</button>`}</div>`; })}</div>`}
    ${manage && html`<div class="col gap-s"><div class="row wrap"><input id="bring-name" class="input grow" style="min-width:160px" maxlength="120" placeholder="Add something, e.g. Ice" value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} />
        <input class="input" style="flex:1;min-width:140px" maxlength="300" placeholder="Note (optional)" value=${note} onInput=${(e) => setNote(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} />
        <button id="bring-add" class="btn" disabled=${!name.trim()} onClick=${() => add()}><${Icon} name="plus" size=${15} />Add</button></div>
      ${(() => { const ideas = ideasFor(ev, items.map((b) => b.name)); return ideas.length > 0 && html`<div class="chips"><span class="tiny muted">Ideas:</span>${ideas.map((x) => html`<button class="chip" key=${x} onClick=${() => add(x)}>+ ${x}</button>`)}</div>`; })()}</div>`}
  </div>`;
}

// The same list on the no-account invitation page, driven by the personal link.
export function GuestBringList({ items, onClaim }) {
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(null);
  if (!items?.length) return null;
  const go = async (b, on) => { setBusy(b.id); setMsg(null); try { await onClaim(b.id, on); setMsg({ tone: 'mint', text: on ? `Thanks! You’re bringing ${b.name}.` : 'Given back.' }); } catch (e) { setMsg({ tone: 'coral', text: e.message }); } setBusy(''); };
  return html`<div class="card col" id="guest-bring"><div class="row between wrap"><div class="col" style="gap:2px"><h3>Want to bring something?</h3><span class="small muted">Optional. Pick anything that’s still free.</span></div>
      <${Pill} tone="mint">${items.filter((b) => b.by).length} of ${items.length} taken<//></div>
    <div class="list">${items.map((b) => html`<div class="row wrap" key=${b.id} style="padding:6px 0"><span class="col grow" style="gap:0;min-width:140px"><b>${b.name}</b>${b.note && html`<span class="tiny muted">${b.note}</span>`}</span>
      ${b.mine ? html`<span class="row gap-s nowrap"><${Pill} tone="mint">You’re bringing this<//><button class="btn sm ghost" disabled=${busy === b.id} onClick=${() => go(b, false)}>Give back</button></span>`
        : b.by ? html`<span class="small muted">${b.by} is bringing it</span>`
          : html`<button class=${cx('btn sm primary')} id=${'bring-' + b.id} disabled=${!!busy} onClick=${() => go(b, true)}>I’ll bring this</button>`}</div>`)}</div>
    ${msg && html`<div class=${'banner c-' + msg.tone} role="status">${msg.text}</div>`}</div>`;
}
