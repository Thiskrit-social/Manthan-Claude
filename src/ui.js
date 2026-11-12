// Shared UI primitives. Every screen is built from these.
import { html, useState, useEffect } from './lib.js';
import { cx, initials, fmtDate, fmtTime } from './utils.js';
import { user, S } from './store.js';
import { ROLES, by } from './config.js';

/* ---------- routing: plain "#name" hashes so links stay shareable ---------- */
export function route() {
  const h = (location.hash || '#home').slice(1); const p = h.split('-');
  if (p[0] === 'e' && p[1]) return { name: 'event', eventId: p[1], section: p[2] || 'overview' };
  if (p[0] === 'invite' && p[1]) return { name: 'invite', eventId: p[1] };
  return { name: ['home', 'events', 'mytasks', 'inbox', 'profile', 'new'].includes(h) ? h : 'home' };
}
export const go = (to) => { location.hash = to; window.scrollTo(0, 0); };

/* ---------- icons ---------- */
const I = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  check: 'M5 12.5l4.5 4.5L19 7.5', tasks: 'M9 11.5l2.5 2.5L16 9M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.2a3.5 3.5 0 0 1 0 6.6M18 14.5a6 6 0 0 1 3.5 5.5',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11zM12 12.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
  camera: 'M4 8h3l1.5-2.500h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 16.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7z',
  image: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l4.500-4.500 4 4L15 13l5 5M9 9.500a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v3M16 13h1', megaphone: 'M4 10v4h3l8 4V6l-8 4zM18 9.500a3.500 3.500 0 0 1 0 5M7 14l1 5h2.500l-1-4.500',
  folder: 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z', sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 9.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5zM8 19.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
  link: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1', right: 'M9 6l6 6-6 6', left: 'M15 6l-6 6 6 6', down: 'M6 9l6 6 6-6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  send: 'M4 12l16-8-6 16-3-7z', lock: 'M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 0 1 7 0v3', trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', edit: 'M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16', message: 'M4 5h16v11H9l-5 4z', flag: 'M5 21V4h12l-2 4 2 4H5', file: 'M6 3h8l4 4v14H6zM14 3v4h4', swap: 'M7 7h13l-3-3M17 17H4l3 3',
  sparkle: 'M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z', video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3z', chain: 'M9 12h6M8 8H6a4 4 0 0 0 0 8h2M16 8h2a4 4 0 0 1 0 8h-2',
};
export const Icon = ({ name, size }) => html`<svg class="ic" viewBox="0 0 24 24" style=${size ? `width:${size}px;height:${size}px` : ''} aria-hidden="true"><path d=${I[name] || I.sparkle} /></svg>`;

/* ---------- small pieces ---------- */
export const Avatar = ({ id, size = '', name }) => { const u = id ? user(id) : { name, tone: 'grey' }; return html`<span class=${cx('avatar', size, 'c-' + (u.tone || 'grey'))} title=${u.name}>${initials(u.name)}</span>`; };
export const Stack = ({ ids, max = 5 }) => html`<span class="stack">${ids.slice(0, max).map((id) => html`<${Avatar} id=${id} size="sm" key=${id} />`)}${ids.length > max && html`<span class="avatar sm c-grey">+${ids.length - max}</span>`}</span>`;
export const Pill = ({ tone = 'grey', dot, children }) => html`<span class=${cx('pill', 'c-' + tone)}>${dot && html`<i class="pdot"></i>`}${children}</span>`;
export const RolePill = ({ role }) => html`<${Pill} tone=${ROLES[role]?.tone}>${ROLES[role]?.label || role}<//>`;
export const StatusPill = ({ list, id }) => { const o = by(list, id); return html`<${Pill} tone=${o.tone} dot>${o.label}<//>`; };
export const Bar = ({ value, tone }) => html`<div class=${cx('bar', tone && 'c-' + tone)} role="progressbar" aria-valuenow=${value} aria-valuemin="0" aria-valuemax="100"><i style=${`width:${Math.min(100, value)}%`}></i></div>`;
export const Sim = ({ children = 'Simulated' }) => html`<span class="sim" title="This prototype imitates this step. Nothing leaves your browser.">${children}</span>`;
export const Empty = ({ emoji = '🌱', title, children }) => html`<div class="empty"><div class="big">${emoji}</div><b>${title}</b><div class="small">${children}</div></div>`;
export const Tick = ({ on, onClick, label, disabled }) => html`<button class=${cx('tick', on && 'on')} disabled=${disabled} aria-pressed=${!!on} aria-label=${label || 'Toggle done'} onClick=${(e) => { e.stopPropagation(); onClick && onClick(); }}><${Icon} name="check" /></button>`;
export const Switch = ({ on, onChange, disabled, label }) => html`<button class=${cx('switch', on && 'on')} role="switch" aria-checked=${!!on} aria-label=${label} disabled=${disabled} onClick=${() => onChange(!on)}></button>`;
export const Seg = ({ value, onChange, options }) => html`<div class="seg" role="tablist">${options.map((o) => html`<button key=${o.id} class=${cx(value === o.id && 'on')} role="tab" aria-selected=${value === o.id} onClick=${() => onChange(o.id)}>${o.icon && html`<${Icon} name=${o.icon} size=${15} />`}${o.label}${o.count != null && html`<span class="muted num">${o.count}</span>`}</button>`)}</div>`;
export const Field = ({ label, children, hint }) => html`<label class="field"><span>${label}</span>${children}${hint && html`<span class="tiny muted" style="font-weight:600">${hint}</span>`}</label>`;
export const Cover = ({ ev, size = '' }) => html`<div class=${cx('cover', size, 'c-' + (ev.cover?.tone || 'lav'))}>${ev.cover?.image ? html`<img src=${ev.cover.image} alt="" />` : html`<span class="emo">${ev.cover?.emoji || '✨'}</span>`}</div>`;
export const When = ({ ev }) => html`<span class="nowrap">${fmtDate(ev.date)} · ${fmtTime(ev.start)}${ev.end ? '–' + fmtTime(ev.end) : ''}</span>`;
export const Person = ({ id, sub }) => html`<span class="row gap-s" style="min-width:0"><${Avatar} id=${id} /><span class="col" style="gap:0"><b class="clip">${user(id).name}</b>${sub && html`<span class="tiny muted clip">${sub}</span>`}</span></span>`;

// Member picker used wherever something is assigned to a person.
export const UserSelect = ({ value, onChange, ids, placeholder = 'Unassigned', disabled, small }) => html`
  <select class=${cx('input', small && 'sm')} value=${value || ''} disabled=${disabled} onChange=${(e) => onChange(e.target.value || null)}>
    <option value="">${placeholder}</option>${ids.map((id) => html`<option key=${id} value=${id}>${S().users[id]?.name}</option>`)}
  </select>`;

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, wide, eyebrow }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  return html`<div class="scrim" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${cx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head"><div class="grow">${eyebrow && html`<div class="eyebrow">${eyebrow}</div>`}<h2>${title}</h2></div><button class="btn ghost icon" aria-label="Close" onClick=${onClose}><${Icon} name="x" /></button></div>
      <div class="modal-body">${children}</div>
      ${footer && html`<div class="modal-foot">${footer}</div>`}
    </div></div>`;
}
// Two-step destructive button (the page builds its own confirmation; no browser dialogs).
export function Confirm({ label = 'Delete', onConfirm, small = true }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return html`<button class=${cx('btn danger', small && 'sm', armed ? 'soft c-coral' : 'ghost')} onClick=${() => (armed ? onConfirm() : setArmed(true))}><${Icon} name="trash" size=${15} />${armed ? 'Tap again to confirm' : label}</button>`;
}

/* ---------- toasts ---------- */
let pushToast = () => {};
export const toast = (text, sim) => pushToast({ id: Math.random(), text, sim });
export function Toasts() {
  const [list, setList] = useState([]);
  pushToast = (t) => { setList((l) => [...l.slice(-2), t]); setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3200); };
  return html`<div class="toasts" aria-live="polite">${list.map((t) => html`<div class="toast" key=${t.id}>${t.text}${t.sim && html`<${Sim} />`}</div>`)}</div>`;
}
export async function copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

// Editable checklist used for subtasks, task checklists and schedule checklists.
export function Checklist({ items = [], onChange, canEdit = true, canToggle = true, placeholder = 'Add an item' }) {
  const [text, setText] = useState('');
  const add = () => { if (!text.trim()) return; onChange([...items, { id: 'ci' + Math.random().toString(36).slice(2, 8), title: text.trim(), done: false }]); setText(''); };
  return html`<div class="col gap-s">
    ${items.map((it) => html`<div class="row" key=${it.id}><${Tick} on=${it.done} disabled=${!canToggle} onClick=${() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} />
      <span class=${cx('grow', it.done && 'done-text')}>${it.title}</span>
      ${canEdit && html`<button class="btn ghost icon sm" aria-label="Remove" onClick=${() => onChange(items.filter((x) => x.id !== it.id))}><${Icon} name="x" size=${14} /></button>`}</div>`)}
    ${canEdit && html`<div class="row"><input class="input" placeholder=${placeholder} value=${text} onInput=${(e) => setText(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && (e.preventDefault(), add())} /><button class="btn sm" onClick=${add}>Add</button></div>`}
  </div>`;
}
// Renders @mentions of event members as highlighted chips.
export function Rich({ text }) {
  return html`<span style="white-space:pre-wrap">${text.split(/(@[A-Z][\w’']+)/g).map((part, i) => (part.startsWith('@') ? html`<span class="mention" key=${i}>${part}</span>` : part))}</span>`;
}
