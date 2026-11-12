export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 9);
export const cx = (...a) => a.filter(Boolean).join(' ');
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return iso(d); };
export const parse = (s, t = '00:00') => new Date(`${s}T${t || '00:00'}:00`);
export const daysUntil = (s) => Math.round((parse(s) - parse(today())) / 864e5);
export const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => (s ? parse(s).toLocaleDateString('en-GB', o) : '');
export const fmtLong = (s) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? ':' + pad(m) : ''}${h < 12 ? 'am' : 'pm'}`; };
export const dueLabel = (s) => { if (!s) return 'No date'; const n = daysUntil(s); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n < 0 ? `${-n}d overdue` : n < 7 ? fmtDate(s, { weekday: 'short' }) : fmtDate(s, { day: 'numeric', month: 'short' }); };
export const ago = (ts) => { const m = Math.max(0, Math.round((Date.now() - new Date(ts)) / 6e4)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
export const money = (n, cur = '£') => cur + Math.round(n).toLocaleString('en-GB');
export const initials = (name = '?') => name.replace(/^(Dr\.|Prof\.)\s*/, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
// Downscale an image file to a small JPEG data URL so it can live in local prototype state.
export const readImage = (file, max = 720) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onerror = rej;
  r.onload = () => { const img = new Image(); img.onerror = rej; img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    res(c.toDataURL('image/jpeg', 0.78)); }; img.src = r.result; };
  r.readAsDataURL(file);
});
