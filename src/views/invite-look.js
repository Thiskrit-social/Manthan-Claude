// The invitation page's extras: themes, confetti, who's going, guest comments and the chip-in link.
// Each piece is used by the no-account guest page (guest.js), the signed-in invitation page (home.js)
// and the event workspace; the host's settings live in InvitePageCard on the People tab.
import { html, useState } from '../lib.js';
import { THEMES, themeOf } from '../config.js';
import { setTheme, setChipIn, toggleIn, has } from '../store.js';
import { isOwner } from '../permissions.js';
import { Icon, Field, Switch, Pill, toast } from '../ui.js';
import { cx, ago } from '../utils.js';

/* ---------- themes ---------- */
export const themeClass = (ev) => { const t = themeOf(ev); return cx('themed', 'theme-' + t.id, t.dark && 'theme-dark'); };
export function ThemePicker({ value, onChange }) {
  return html`<div class="theme-picker" role="radiogroup" aria-label="Invitation theme">${THEMES.map((t) => html`
    <button key=${t.id} type="button" role="radio" aria-checked=${(value || 'classic') === t.id} id=${'theme-' + t.id} class=${cx('theme-swatch', 'theme-' + t.id, t.dark && 'theme-dark', (value || 'classic') === t.id && 'on')} onClick=${() => onChange(t.id)}>
      <span class="theme-emoji">${t.emoji}</span><span class="theme-name">${t.label}</span></button>`)}</div>`;
}

/* ---------- confetti ---------- */
// A short burst when a guest says yes. Skipped for people who ask their device for less motion.
export function confetti() {
  try { if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; } catch { /* ignore */ }
  const c = document.createElement('canvas'); c.id = 'confetti'; c.setAttribute('aria-hidden', 'true');
  Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 });
  document.body.appendChild(c); const ctx = c.getContext('2d'); const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (c.width = innerWidth * dpr); const H = (c.height = innerHeight * dpr);
  const colors = ['#a996f0', '#f3c94a', '#ff8a75', '#6fd3a8', '#74bdf2', '#ff6fc7'];
  const bits = Array.from({ length: 150 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 18 * dpr, vy: (-Math.random() * 16 - 6) * dpr,
    s: (5 + Math.random() * 6) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0], round: Math.random() < 0.3 }));
  const start = performance.now();
  const tick = (t) => {
    const age = t - start; ctx.clearRect(0, 0, W, H); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1400) / 800);
    bits.forEach((b) => { b.vy += 0.45 * dpr; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
      if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.s / 2, 0, 7); ctx.fill(); } else ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore(); });
    if (age < 2200) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}

/* ---------- who's going ---------- */
const TONES = ['lav', 'butter', 'coral', 'mint', 'sky'];
const toneFor = (s) => TONES[[...String(s)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONES.length];
export function GoingList({ people }) {
  if (!people?.length) return null;
  const shown = people.slice(0, 14); const rest = people.length - shown.length; const plus = people.filter((p) => p.plus).length;
  return html`<div class="card col" id="going-list"><div class="row between wrap"><h3>Who’s going</h3><span class="small muted">${people.length + plus} ${people.length + plus === 1 ? 'person' : 'people'}${plus ? `, including ${plus} plus-one${plus === 1 ? '' : 's'}` : ''}</span></div>
    <div class="going">${shown.map((p, i) => html`<span class="going-person" key=${i}><span class=${'avatar c-' + toneFor(p.name)}>${(p.name || '?')[0].toUpperCase()}</span><span class="small">${p.name}${p.plus ? html`<span class="tiny muted"> +1</span>` : ''}</span></span>`)}
      ${rest > 0 && html`<span class="going-person"><span class="avatar c-grey">+${rest}</span><span class="small muted">more</span></span>`}</div></div>`;
}

/* ---------- comments ---------- */
// posts: [{ id, author, body, at|createdAt, mine }]. onPost(text) and onDelete(id) may throw; errors are shown.
export function Wall({ posts, canPost, onPost, canDelete, onDelete, intro }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const send = async () => { if (!text.trim() || busy) return; setBusy(true); setMsg(null); try { await onPost(text.trim()); setText(''); } catch (e) { setMsg(e.message); } setBusy(false); };
  return html`<div class="card col" id="wall"><div class="col" style="gap:2px"><h3>Comments</h3>${intro && html`<span class="small muted">${intro}</span>`}</div>
    ${posts.length ? html`<div class="col gap-s">${posts.map((p) => html`<div class="row top" key=${p.id}><span class=${'avatar c-' + toneFor(p.author)}>${(p.author || '?')[0].toUpperCase()}</span>
        <div class="col grow" style="gap:0"><span class="small"><b>${p.author}</b> <span class="tiny muted">${ago(p.at || p.createdAt)}</span></span><span style="white-space:pre-line;overflow-wrap:anywhere">${p.body}</span></div>
        ${canDelete?.(p) && html`<button class="btn icon ghost sm" aria-label=${'Delete comment by ' + p.author} onClick=${async () => { try { await onDelete(p.id); } catch (e) { setMsg(e.message); } }}><${Icon} name="trash" size=${15} /></button>`}</div>`)}</div>`
      : html`<span class="small muted">No comments yet.${canPost ? ' Say hello!' : ''}</span>`}
    ${canPost && html`<div class="row top"><textarea id="wall-text" class="input grow" style="min-height:44px" maxlength="500" placeholder="Write something to everyone" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
      <button id="wall-post" class="btn primary" disabled=${!text.trim() || busy} onClick=${send}><${Icon} name="send" size=${15} />Post</button></div>`}
    ${msg && html`<div class="banner c-coral" role="status">${msg}</div>`}</div>`;
}

/* ---------- chip in ---------- */
export const safePayLink = (u) => /^(https:\/\/|upi:\/\/)[^\s<>"']{3,}$/i.test(String(u || '')) && String(u).length <= 500;
export function ChipIn({ chip, currency = '£' }) {
  if (!chip?.url || !safePayLink(chip.url)) return null;
  const amount = Number(chip.amount) > 0 ? `${currency}${Number(chip.amount) % 1 ? Number(chip.amount).toFixed(2) : Number(chip.amount)}` : '';
  return html`<div class="card row wrap between" id="chip-in"><div class="col" style="gap:2px"><b>💸 Chip in${amount ? ` ${amount}` : ''}</b>${chip.note && html`<span class="small muted">${chip.note}</span>`}</div>
    <a id="chip-in-link" class="btn primary" href=${chip.url} target="_blank" rel="noopener noreferrer">Pay${amount ? ` ${amount}` : ''}</a></div>`;
}

/* ---------- host settings ---------- */
export function InvitePageCard({ ev }) {
  const owner = isOwner(ev.id); const chip = ev.extras?.chipIn || {};
  const [d, setD] = useState({ url: chip.url || '', amount: chip.amount || '', note: chip.note || '' });
  if (!owner) return null;
  const dirty = d.url.trim() !== (chip.url || '') || String(d.amount) !== String(chip.amount || '') || d.note.trim() !== (chip.note || '');
  const save = () => {
    const url = d.url.trim();
    if (url && !safePayLink(url)) return toast('Use a link that starts with https:// (PayPal, Revolut, Monzo…) or upi://');
    setChipIn(ev.id, url ? { url, amount: Number(d.amount) > 0 ? Math.round(Number(d.amount) * 100) / 100 : null, note: d.note.trim().slice(0, 200) } : null);
    toast(url ? 'Chip-in link is on the invitation' : 'Chip-in link removed');
  };
  return html`<div class="card col" id="invite-page-card"><div class="row between wrap"><div class="col" style="gap:2px"><h3>Invitation page</h3><span class="small muted">How the page your guests open looks, and what’s on it.</span></div>
      <button class="btn sm" onClick=${() => (location.hash = `invite-${ev.id}`)}><${Icon} name="right" size=${15} />Preview</button></div>
    <div class="col gap-s"><span class="eyebrow">Theme</span><${ThemePicker} value=${ev.cover?.theme} onChange=${(t) => { setTheme(ev.id, t); toast(`${THEMES.find((x) => x.id === t).label} theme`); }} /></div>
    <div class="grid g2">
      <div class="row"><div class="col grow" style="gap:0"><b>Show who’s going</b><span class="tiny muted">First names of guests who said yes.</span></div><${Switch} on=${has(ev, 'guestList')} label="Show who’s going" onChange=${() => toggleIn(ev.id, 'features', 'guestList')} /></div>
      <div class="row"><div class="col grow" style="gap:0"><b>Guest comments</b><span class="tiny muted">Guests can write messages; you can delete any.</span></div><${Switch} on=${has(ev, 'wall')} label="Guest comments" onChange=${() => toggleIn(ev.id, 'features', 'wall')} /></div>
    </div>
    <div class="col gap-s"><span class="eyebrow">Chip in (optional)</span>
      <div class="form-grid"><${Field} label="Payment link" hint="PayPal.me, Revolut, Monzo, a UPI link (upi://…) or any https link"><input id="chip-url" class="input" inputmode="url" placeholder="https://paypal.me/yourname" value=${d.url} onInput=${(e) => setD({ ...d, url: e.target.value })} /><//>
        <${Field} label=${`Amount per person (${ev.currency || '£'})`}><input id="chip-amount" class="input" type="number" min="0" step="0.5" placeholder="Optional" value=${d.amount} onInput=${(e) => setD({ ...d, amount: e.target.value })} /><//></div>
      <${Field} label="What it’s for"><input id="chip-note" class="input" maxlength="200" placeholder="e.g. Towards food and drinks" value=${d.note} onInput=${(e) => setD({ ...d, note: e.target.value })} /><//>
      <div class="row wrap"><button id="chip-save" class="btn primary" disabled=${!dirty} onClick=${save}>Save chip-in</button>${chip.url && !dirty && html`<${Pill} tone="mint">Showing on the invitation<//>`}
        <span class="tiny muted grow">Money goes straight to you through that service; Gather never handles it.</span></div></div>
  </div>`;
}
