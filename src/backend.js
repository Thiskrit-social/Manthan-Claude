// Cloud mode: Supabase as the backend (auth, Postgres, storage).
//
// How it works: the app keeps the same in-memory store it uses in the demo, and every screen keeps
// calling the same actions. In cloud mode the store hands each change to this module, which compares
// the store with what the server last confirmed and sends only the rows that were added, changed or
// removed. The database's row-level security (supabase/schema.sql) is the authority on who may do what;
// if it refuses a change, the app says so and reloads the server's copy.
import { BACKEND } from './backend-config.js';
import { seed } from './seed.js';
import { S, attachCloud, replaceState, hooks } from './store.js';

/* ---------------- configuration ---------------- */
const CFG_KEY = 'gather.backend';
const MODE_KEY = 'gather.mode';
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } } };
// A key saved from the sign-in screen overrides the file, so a deployed copy can be connected without editing code.
export function cloudConfig() {
  let saved = null; try { saved = JSON.parse(ls.get(CFG_KEY) || 'null'); } catch { /* ignore */ }
  const cfg = { url: (saved?.url || BACKEND.url || '').replace(/\/+$/, ''), anonKey: saved?.anonKey || BACKEND.anonKey || '' };
  return cfg.url && cfg.anonKey ? cfg : null;
}
export function saveCloudConfig(cfg) { ls.set(CFG_KEY, cfg ? JSON.stringify(cfg) : null); client = null; }
// Choosing the demo lasts for this tab only, so it never hides a real account on the next visit.
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ignore */ } } };
export const getMode = () => ss.get(MODE_KEY);
export const setMode = (m) => { ss.set(MODE_KEY, m === 'demo' ? 'demo' : null); ls.set(MODE_KEY, null); };

/* ---------------- client ---------------- */
let client = null; let libPromise = null;
function loadLib() {
  if (window.supabase?.createClient) return Promise.resolve();
  if (!libPromise) libPromise = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/supabase.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the Supabase library.')); document.head.appendChild(s); });
  return libPromise;
}
export async function sb() {
  if (client) return client;
  const cfg = cloudConfig(); if (!cfg) throw new Error('No Supabase project is configured.');
  await loadLib();
  client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gather.auth' } });
  return client;
}
const check = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data; };
function friendly(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied|42501/i.test(m + (e?.code || ''))) return m.includes('violates row-level security') ? 'You don’t have permission to make that change.' : m;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m;
}

/* ---------------- auth ---------------- */
export async function session() { const c = await sb(); return check(await c.auth.getSession()).session; }
export async function signIn(email, password) { const c = await sb(); return check(await c.auth.signInWithPassword({ email, password })); }
export async function signUp(name, email, password) {
  const c = await sb();
  const here = location.origin + location.pathname;
  return check(await c.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: here } }));
}
export async function resetPassword(email) { const c = await sb(); return check(await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); }
export async function signOut() { stopPolling(); const c = await sb(); await c.auth.signOut(); }

/* ---------------- table mapping ---------------- */
// Each store collection maps to a table. `cols` lists the store fields that become columns, with the
// value to use when the field is missing (OMIT: leave it out so the database default applies).
const OMIT = Symbol('omit');
const SPECS = [
  { coll: 'users', table: 'people', cols: { id: null, name: '', email: '', tone: 'lav', bio: '', createdBy: null } },
  { coll: 'events', table: 'events', rename: { start: 'start_time', end: 'end_time' },
    cols: { id: null, name: '', category: 'other', description: '', cover: {}, date: '', start: '', end: '', location: '', expected: 0, privacy: 'private', complexity: 'simple', modules: [], features: [], taskView: 'list', permissions: {}, currency: '£', createdBy: null, createdAt: OMIT } },
  { coll: 'memberships', table: 'memberships', cols: { id: null, eventId: null, userId: null, role: 'guest', company: null, service: null, phone: null } },
  { coll: 'committees', table: 'committees', rename: { group: 'team_group' }, cols: { id: null, eventId: null, name: '', description: '', icon: '⭐', tone: 'lav', status: 'ontrack', group: '' } },
  { coll: 'committeeMemberships', table: 'committee_memberships', cols: { id: null, committeeId: null, userId: null, role: 'member' } },
  { coll: 'invitations', table: 'invitations', rename: { group: 'guest_group' },
    cols: { id: null, eventId: null, userId: null, name: '', email: '', group: '', plusOneAllowed: false, invitedAt: OMIT, reminders: 0, checkedIn: false, rsvp: { status: 'pending' } } },
  { coll: 'tasks', table: 'tasks', cols: { id: null, eventId: null, committeeId: null, title: '', description: '', assigneeId: null, due: '', priority: 'medium', status: 'todo', subtasks: [], checklist: [], dependsOn: [], comments: [], attachments: [], createdAt: OMIT } },
  { coll: 'scheduleItems', table: 'schedule_items', rename: { start: 'start_time', end: 'end_time' },
    cols: { id: null, eventId: null, userId: null, at: null, date: '', start: '', end: '', title: '', location: '', ownerId: null, description: '', checklist: [], reminder: 0 } },
  { coll: 'expenses', table: 'expenses', cols: { id: null, eventId: null, committeeId: null, title: '', amount: 0, status: 'planned', paidBy: null, date: '', description: '', receipt: '', userId: null, at: null } },
  { coll: 'media', table: 'media', cols: { id: null, eventId: null, gallery: 'memories', type: 'photo', emoji: null, tone: null, caption: '', name: null, path: null, userId: null, at: OMIT, sample: false, simulated: false, lost: false } },
  { coll: 'announcements', table: 'announcements', cols: { id: null, eventId: null, scope: 'event', committeeId: null, userId: null, text: '', at: OMIT, mediaId: null, comments: [] } },
  { coll: 'files', table: 'files', cols: { id: null, eventId: null, folder: 'General', name: '', kind: 'other', size: '', url: '', userId: null, at: OMIT, confidential: false, vendorShared: false, committeeId: null } },
  { coll: 'activity', table: 'activity', cols: { id: null, eventId: null, userId: null, text: '', at: OMIT } },
  { coll: 'notifications', table: 'notifications', cols: { id: null, userId: null, eventId: null, text: '', link: '', at: OMIT, read: false } },
];
// Budget figures live in their own tables so guests can read an event without seeing them.
const DERIVED = {
  event_private: { pk: 'event_id', rows: (s) => s.events.map((e) => ({ event_id: e.id, budget: +e.budget || 0, planner: e.planner || {} })) },
  committee_budgets: { pk: 'committee_id', rows: (s) => s.committees.map((c) => ({ committee_id: c.id, event_id: c.eventId, amount: +c.budget || 0 })) },
};
// Order matters: a row's parent goes in first, and a member's own role row before anything that checks it.
const ORDER = ['people', 'events', 'memberships', 'event_private', 'committees', 'committee_budgets', 'committee_memberships', 'invitations',
  'tasks', 'schedule_items', 'expenses', 'media', 'announcements', 'files', 'activity', 'notifications'];
const pkOf = (t) => DERIVED[t]?.pk || 'id';
const TIMESTAMPS = new Set(['createdAt', 'invitedAt', 'at']); const NUMBERS = new Set(['amount', 'expected', 'reminders', 'reminder']);
const snake = (k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const colOf = (spec, key) => spec.rename?.[key] || snake(key);

function toRow(spec, o) {
  const row = {};
  for (const [key, def] of Object.entries(spec.cols)) {
    let v = o[key];
    if (v === undefined || v === null) { if (def === OMIT) continue; v = def; }
    row[colOf(spec, key)] = v;
  }
  return row;
}
function fromRow(spec, row) {
  const o = {};
  for (const key of Object.keys(spec.cols)) {
    const col = colOf(spec, key); if (!(col in row)) continue; let v = row[col];
    if (v != null && TIMESTAMPS.has(key)) v = new Date(v).toISOString();
    if (v != null && NUMBERS.has(key)) v = Number(v);
    o[key] = v;
  }
  return o;
}
function rowsOf(s) {
  const out = {};
  for (const spec of SPECS) { const list = spec.coll === 'users' ? Object.values(s.users) : s[spec.coll]; out[spec.table] = new Map(list.map((o) => [o.id, toRow(spec, o)])); }
  for (const [t, d] of Object.entries(DERIVED)) out[t] = new Map(d.rows(s).map((r) => [r[d.pk], r]));
  return out;
}

/* ---------------- loading ---------------- */
async function fetchAll(c, table) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const rows = check(await c.from(table).select('*').order(pkOf(table)).range(from, from + page - 1));
    out.push(...rows); if (rows.length < page) return out;
  }
}
async function loadState(c, meRow) {
  const raw = Object.fromEntries(await Promise.all(ORDER.map(async (t) => [t, await fetchAll(c, t)])));
  const st = { v: 1, rev: 0, cloud: true, currentUserId: meRow.id, users: {} };
  for (const spec of SPECS) {
    const list = raw[spec.table].map((r) => fromRow(spec, r));
    if (spec.coll === 'users') list.forEach((u) => { st.users[u.id] = u; }); else st[spec.coll] = list;
  }
  st.users[meRow.id] = st.users[meRow.id] || fromRow(SPECS[0], meRow);
  const priv = new Map(raw.event_private.map((r) => [r.event_id, r])); const budgets = new Map(raw.committee_budgets.map((r) => [r.committee_id, r]));
  st.events.forEach((e) => { const p = priv.get(e.id); if (p) { e.budget = Number(p.budget); e.planner = p.planner; } });
  st.committees.forEach((cm) => { const b = budgets.get(cm.id); if (b) cm.budget = Number(b.amount); });
  // Photos are private: fetch short-lived links to display them.
  const withPath = st.media.filter((m) => m.path);
  if (withPath.length) {
    const { data } = await c.storage.from('media').createSignedUrls(withPath.map((m) => m.path), 60 * 60 * 6);
    const urls = new Map((data || []).map((d) => [d.path, d.signedUrl]));
    withPath.forEach((m) => { m.src = urls.get(m.path) || null; });
  }
  return st;
}

/* ---------------- status ---------------- */
const listeners = new Set();
export const syncStatus = { state: 'idle', message: '', at: null };
export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function setStatus(state, message = '') { Object.assign(syncStatus, { state, message, at: Date.now() }); listeners.forEach((f) => f(syncStatus)); }
let reportError = () => {};

/* ---------------- syncing ---------------- */
let snap = null; let timer = null; let flushing = false; let again = false;
const snapshot = (s) => { const rows = rowsOf(s); snap = Object.fromEntries(Object.entries(rows).map(([t, m]) => [t, new Map([...m].map(([id, r]) => [id, JSON.stringify(r)]))])); };
const pending = () => !!timer || flushing;
function schedule() { setStatus('saving'); clearTimeout(timer); timer = setTimeout(() => { timer = null; flush(); }, 350); }

async function uploadPhotos(c, s) {
  for (const m of s.media) {
    if (m.path || typeof m.src !== 'string' || !m.src.startsWith('data:')) continue;
    const blob = await (await fetch(m.src)).blob();
    const path = `${m.eventId}/${m.gallery}/${m.id}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
    check(await c.storage.from('media').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false }));
    m.path = path;
  }
}

async function flush() {
  if (flushing) { again = true; return; }
  flushing = true; again = false; setStatus('saving');
  const c = await sb(); const s = S(); const me = s.currentUserId;
  try {
    await uploadPhotos(c, s);
    const cur = rowsOf(s);
    const deletedEvents = new Set([...snap.events.keys()].filter((id) => !cur.events.has(id)));
    const deletedTeams = new Set([...snap.committees.keys()].filter((id) => !cur.committees.has(id)));
    // Inserts, parents first.
    for (const t of ORDER) {
      const fresh = [...cur[t]].filter(([id]) => !snap[t].has(id)).map(([, r]) => r);
      for (let i = 0; i < fresh.length; i += 500) {
        check(await c.from(t).insert(fresh.slice(i, i + 500), { defaultToNull: false }));
        fresh.slice(i, i + 500).forEach((r) => snap[t].set(r[pkOf(t)], JSON.stringify(r)));
      }
    }
    // Updates: only the columns that changed. A person's own rows go last, so someone handing over a
    // team lead role still has the rights to do it while the other changes are applied.
    for (const t of ORDER) {
      const changed = [...cur[t]].filter(([id, r]) => snap[t].has(id) && snap[t].get(id) !== JSON.stringify(r))
        .sort(([, a], [, b]) => (a.user_id === me) - (b.user_id === me));
      for (const [id, r] of changed) {
        const before = JSON.parse(snap[t].get(id)); const patch = {};
        for (const [k, v] of Object.entries(r)) if (JSON.stringify(v) !== JSON.stringify(before[k])) patch[k] = v;
        const rows = check(await c.from(t).update(patch).eq(pkOf(t), id).select(pkOf(t)));
        if (!rows.length) throw new Error('You don’t have permission to make that change.');
        snap[t].set(id, JSON.stringify(r));
      }
    }
    // Deletes, children first. Rows inside a deleted event or team go with it automatically.
    for (const t of [...ORDER].reverse()) {
      const gone = [...snap[t].keys()].filter((id) => !cur[t].has(id)).filter((id) => {
        const r = JSON.parse(snap[t].get(id));
        return t === 'events' || !(deletedEvents.has(r.event_id) || (['committee_memberships', 'committee_budgets'].includes(t) && deletedTeams.has(r.committee_id)));
      });
      const silent = [...snap[t].keys()].filter((id) => !cur[t].has(id) && !gone.includes(id));
      silent.forEach((id) => snap[t].delete(id));
      if (!gone.length) continue;
      if (t === 'media') { const paths = gone.map((id) => JSON.parse(snap[t].get(id)).path).filter(Boolean); if (paths.length) await c.storage.from('media').remove(paths); }
      for (let i = 0; i < gone.length; i += 200) {
        const ids = gone.slice(i, i + 200); check(await c.from(t).delete().in(pkOf(t), ids));
        ids.forEach((id) => snap[t].delete(id));
      }
    }
    setStatus('saved');
  } catch (e) {
    flushing = false; again = false;
    setStatus('error', friendly(e)); reportError(`Couldn’t save: ${friendly(e)} Showing the latest saved version.`);
    await reload().catch(() => {});
    return;
  }
  flushing = false;
  if (again) flush();
}

/* ---------------- lifecycle ---------------- */
let pollTimer = null; let meRow = null;
async function reload() {
  const c = await sb(); const st = await loadState(c, meRow);
  st.rev = (S().rev || 0) + 1; snapshot(st); replaceState(st); setStatus('saved');
}
// Picks up other people's changes while the app is open.
async function refreshIfIdle() { if (document.visibilityState !== 'visible' || pending()) return; try { await reload(); } catch { setStatus('offline', 'Can’t reach the server.'); } }
function startPolling() { stopPolling(); pollTimer = setInterval(refreshIfIdle, 30000); window.addEventListener('focus', refreshIfIdle); }
function stopPolling() { clearInterval(pollTimer); window.removeEventListener('focus', refreshIfIdle); }

// Signs in to the data: makes sure the person's profile exists, loads everything they can see,
// and swaps the store over to cloud saving.
export async function startCloud({ name, onError } = {}) {
  const c = await sb(); reportError = onError || reportError;
  meRow = check(await c.rpc('ensure_me', { p_name: name || null }));
  const st = await loadState(c, meRow); snapshot(st);
  attachCloud(st, () => schedule());
  hooks.joinViaInvite = joinViaInvite;
  setStatus('saved'); startPolling();
  return st;
}
export const refresh = () => reload();

/* ---------------- server-side actions ---------------- */
export async function invitePreview(eventId) { const c = await sb(); return check(await c.rpc('invite_preview', { eid: eventId })); }
async function joinViaInvite(eventId, patch) {
  const c = await sb();
  try { if (pending()) { clearTimeout(timer); timer = null; await flush(); } check(await c.rpc('respond_to_invite', { eid: eventId, p_rsvp: patch })); await reload(); }
  catch (e) { reportError(friendly(e)); }
}

// Copies the two sample events into the signed-in account, with fresh ids, owned by this person.
export async function importSamples() {
  const c = await sb(); const me = S().currentUserId; const s = seed(); const keep = new Set(['evparty', 'evfc']);
  const tag = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => (n % 36).toString(36)).join('');
  const inEv = (o) => keep.has(o.eventId);
  const pick = { events: s.events.filter((e) => keep.has(e.id)), memberships: s.memberships.filter(inEv), invitations: s.invitations.filter(inEv), committees: s.committees.filter(inEv),
    tasks: s.tasks.filter(inEv), scheduleItems: s.scheduleItems.filter(inEv), expenses: s.expenses.filter(inEv), media: s.media.filter(inEv), announcements: s.announcements.filter(inEv),
    files: s.files.filter(inEv), activity: s.activity.filter(inEv), notifications: [] };
  pick.committeeMemberships = s.committeeMemberships.filter((m) => pick.committees.some((c2) => c2.id === m.committeeId));
  const ids = new Set([...Object.keys(s.users), ...Object.values(pick).flat().map((o) => o.id)]);
  const ren = (v) => (v === s.currentUserId ? me : typeof v === 'string' && ids.has(v) ? `${v}_${tag}` : v);
  const REF = ['id', 'eventId', 'userId', 'committeeId', 'assigneeId', 'ownerId', 'paidBy', 'createdBy', 'mediaId'];
  const remap = (o) => { const x = { ...o }; REF.forEach((k) => { if (k in x) x[k] = ren(x[k]); });
    if (x.dependsOn) x.dependsOn = x.dependsOn.map(ren); if (x.comments) x.comments = x.comments.map((k) => ({ ...k, userId: ren(k.userId) })); return x; };
  const st = { users: {}, events: [], committees: [] };
  for (const [k, list] of Object.entries(pick)) st[k] = list.map(remap);
  st.events.forEach((e) => { e.createdBy = me; });
  Object.values(s.users).filter((u) => u.id !== s.currentUserId).forEach((u) => { const r = remap(u); st.users[r.id] = { ...r, email: '', createdBy: me }; });
  const rows = rowsOf({ ...st, users: st.users });
  const payload = {}; for (const [t, m] of Object.entries(rows)) if (t !== 'notifications' && m.size) payload[t] = [...m.values()];
  if (pending()) { clearTimeout(timer); timer = null; await flush(); }
  check(await c.rpc('import_events', { payload }));
  await reload();
}
