// App state: one normalised store. The demo persists it to localStorage; cloud mode syncs it to Supabase (backend.js).
// Collections mirror the conceptual entities (User, Event, EventMembership, Invitation+RSVP,
// Committee, CommitteeMembership, Task, ScheduleItem, Expense, Media, Announcement, File, Notification).
// Views never mutate state directly; they call the actions below, which is the seam a real API would replace.
import { seed } from './seed.js';
import { COMPLEXITY, category, defaultPermissions } from './config.js';
import { uid, today, pct } from './utils.js';

const KEY = 'gather.prototype.v1';
const subs = new Set();
let state = load();

function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 1 ? s : null; } catch { return null; } }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {
    // Storage full or blocked (large photos): keep everything except image payloads.
    try { localStorage.setItem(KEY, JSON.stringify({ ...state, media: state.media.map((m) => (m.src ? { ...m, src: null, lost: true } : m)) })); } catch { /* run in-memory */ }
  }
}
if (!state) { state = seed(); save(); }
// Where changes go. The demo saves to this browser; cloud mode (backend.js) swaps in a saver that writes to Supabase.
let persist = save; let cloud = false;
export const isCloud = () => cloud;
// Hooks the cloud backend fills in for actions that need the server (joining an event from a link).
export const hooks = { joinViaInvite: null };
export function attachCloud(next, saver) { state = next; persist = saver; cloud = true; subs.forEach((f) => f()); }
// Replaces everything with a fresh copy from the server without saving it back.
export function replaceState(next) { state = next; subs.forEach((f) => f()); }
export const S = () => state;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
function mutate(fn) { const r = fn(state); state.rev = (state.rev || 0) + 1; persist(state); subs.forEach((f) => f()); return r; }
export function resetDemo() { state = seed(); save(); subs.forEach((f) => f()); }
const now = () => new Date().toISOString();

/* ---------------- selectors ---------------- */
export const meId = () => state.currentUserId;
export const me = () => state.users[state.currentUserId];
export const user = (id) => state.users[id] || { id, name: 'Someone', tone: 'grey' };
export const eventById = (id) => state.events.find((e) => e.id === id);
export const membership = (eventId, userId = meId()) => state.memberships.find((m) => m.eventId === eventId && m.userId === userId);
export const roleIn = (eventId, userId = meId()) => membership(eventId, userId)?.role || null;
export const membersOf = (eventId) => state.memberships.filter((m) => m.eventId === eventId);
export const invitationsOf = (eventId) => state.invitations.filter((i) => i.eventId === eventId);
export const invitationFor = (eventId, userId = meId()) => state.invitations.find((i) => i.eventId === eventId && i.userId === userId);
export const committeesOf = (eventId) => state.committees.filter((c) => c.eventId === eventId);
export const committee = (id) => state.committees.find((c) => c.id === id);
export const teamMembers = (committeeId) => state.committeeMemberships.filter((m) => m.committeeId === committeeId);
export const leadOf = (committeeId) => teamMembers(committeeId).find((m) => m.role === 'lead')?.userId || null;
export const myTeams = (eventId, userId = meId()) => committeesOf(eventId).filter((c) => teamMembers(c.id).some((m) => m.userId === userId));
export const tasksOf = (eventId) => state.tasks.filter((t) => t.eventId === eventId);
export const taskById = (id) => state.tasks.find((t) => t.id === id);
export const progress = (tasks) => pct(tasks.filter((t) => t.status === 'done').length, tasks.length);
export const openDeps = (task) => (task.dependsOn || []).map(taskById).filter((t) => t && t.status !== 'done');
export const scheduleOf = (eventId) => state.scheduleItems.filter((s) => s.eventId === eventId).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
export const expensesOf = (eventId) => state.expenses.filter((x) => x.eventId === eventId);
export const mediaOf = (eventId, gallery) => state.media.filter((m) => m.eventId === eventId && (!gallery || m.gallery === gallery)).sort((a, b) => b.at.localeCompare(a.at));
export const postsOf = (eventId) => state.announcements.filter((a) => a.eventId === eventId).sort((a, b) => b.at.localeCompare(a.at));
export const filesOf = (eventId) => state.files.filter((f) => f.eventId === eventId);
export const activityOf = (eventId) => state.activity.filter((a) => a.eventId === eventId).sort((a, b) => b.at.localeCompare(a.at));
export const notificationsFor = (userId = meId()) => state.notifications.filter((n) => n.userId === userId).sort((a, b) => b.at.localeCompare(a.at));
export const unreadCount = () => notificationsFor().filter((n) => !n.read).length;
export const has = (ev, feature) => ev.features.includes(feature);

export function eventsFor(userId = meId()) {
  return state.memberships.filter((m) => m.userId === userId).map((m) => ({ event: eventById(m.eventId), role: m.role, membership: m }))
    .filter((x) => x.event).sort((a, b) => a.event.date.localeCompare(b.event.date));
}
export const tasksFor = (userId = meId()) => state.tasks.filter((t) => t.assigneeId === userId && eventById(t.eventId) && membership(t.eventId, userId));
export function rsvpStats(eventId) {
  const inv = invitationsOf(eventId); const n = (s) => inv.filter((i) => i.rsvp.status === s).length;
  const going = inv.filter((i) => i.rsvp.status === 'going');
  return { invited: inv.length, going: going.length, maybe: n('maybe'), declined: n('declined'), pending: n('pending'),
    headcount: going.length + going.filter((i) => i.rsvp.plusOne).length, checkedIn: inv.filter((i) => i.checkedIn).length };
}
export function budgetOf(eventId) {
  const ev = eventById(eventId); const xs = expensesOf(eventId); const sum = (l) => l.reduce((a, x) => a + (+x.amount || 0), 0);
  const actual = sum(xs.filter((x) => x.status === 'paid')); const planned = sum(xs);
  const teams = committeesOf(eventId).map((c) => { const mine = xs.filter((x) => x.committeeId === c.id);
    return { committee: c, allocated: +c.budget || 0, planned: sum(mine), actual: sum(mine.filter((x) => x.status === 'paid')) }; });
  const loose = xs.filter((x) => !x.committeeId);
  return { total: +ev.budget || 0, planned, actual, remaining: (+ev.budget || 0) - actual, teams, unassigned: { planned: sum(loose), actual: sum(loose.filter((x) => x.status === 'paid')) } };
}

/* ---------------- internal helpers ---------------- */
function log(s, eventId, text) { s.activity.push({ id: uid('ac'), eventId, userId: s.currentUserId, text, at: now() }); }
function notify(s, userId, eventId, text, link) { if (userId && userId !== s.currentUserId) s.notifications.push({ id: uid('n'), userId, eventId, text, link, at: now(), read: false }); }
const RANK = { owner: 5, manager: 4, lead: 3, member: 2, vendor: 1, guest: 1 };
function ensureMembership(s, eventId, userId, role) {
  const m = s.memberships.find((x) => x.eventId === eventId && x.userId === userId);
  if (!m) s.memberships.push({ id: uid('m'), eventId, userId, role });
  else if (RANK[role] > RANK[m.role]) m.role = role;
}
const ownerOf = (s, eventId) => s.memberships.find((m) => m.eventId === eventId && m.role === 'owner')?.userId;

/* ---------------- actions ---------------- */
export const switchUser = (id) => mutate((s) => { s.currentUserId = id; });
export const ensureUser = (name, email = '') => mutate((s) => {
  const found = Object.values(s.users).find((u) => u.name.toLowerCase() === name.trim().toLowerCase());
  if (found) return found.id;
  const id = uid('u'); const tones = ['lav', 'butter', 'coral', 'mint', 'sky'];
  s.users[id] = { id, name: name.trim(), email, tone: tones[Object.keys(s.users).length % 5], bio: '', createdBy: s.currentUserId }; return id;
});

export const createEvent = (d, withTeams) => mutate((s) => {
  const preset = COMPLEXITY[d.complexity]; const cat = category(d.category); const id = uid('ev');
  s.events.push({ id, name: d.name, category: d.category, description: d.description || '', cover: d.cover || { tone: cat.tone, emoji: cat.emoji },
    date: d.date, start: d.start, end: d.end, location: d.location || '', expected: +d.expected || 0, privacy: d.privacy, complexity: d.complexity,
    modules: [...preset.modules], features: [...preset.features], taskView: preset.taskView, permissions: defaultPermissions(d.complexity),
    budget: 0, currency: '£', createdBy: s.currentUserId, createdAt: now() });
  s.memberships.push({ id: uid('m'), eventId: id, userId: s.currentUserId, role: 'owner' });
  if (withTeams) preset.teams.slice(0, d.complexity === 'large' ? 8 : 4).forEach(([name, icon, tone]) =>
    s.committees.push({ id: uid('c'), eventId: id, name, icon, tone, description: '', budget: 0, status: 'ontrack', group: '' }));
  log(s, id, `created ${d.name}`); return id;
});
export const updateEvent = (id, patch) => mutate((s) => { Object.assign(s.events.find((e) => e.id === id), patch); });
export const setComplexity = (id, complexity) => mutate((s) => {
  const ev = s.events.find((e) => e.id === id); const p = COMPLEXITY[complexity];
  ev.complexity = complexity; ev.taskView = p.taskView; // only ever adds modules and features; nothing is removed
  ev.modules = [...new Set([...ev.modules, ...p.modules])]; ev.features = [...new Set([...ev.features, ...p.features])];
  log(s, id, `switched the workspace to ${p.label}`);
});
export const toggleIn = (id, key, value) => mutate((s) => { const ev = s.events.find((e) => e.id === id); ev[key] = ev[key].includes(value) ? ev[key].filter((x) => x !== value) : [...ev[key], value]; });
export const setPermission = (id, role, cap, val) => mutate((s) => { s.events.find((e) => e.id === id).permissions[role][cap] = val; });
export const deleteEvent = (id) => mutate((s) => {
  const cids = s.committees.filter((c) => c.eventId === id).map((c) => c.id);
  s.committeeMemberships = s.committeeMemberships.filter((m) => !cids.includes(m.committeeId));
  ['memberships', 'invitations', 'committees', 'tasks', 'scheduleItems', 'expenses', 'media', 'announcements', 'files', 'notifications', 'activity']
    .forEach((k) => { s[k] = s[k].filter((x) => x.eventId !== id); });
  s.events = s.events.filter((e) => e.id !== id);
});

/* people */
const blankRsvp = () => ({ status: 'pending', plusOne: false, plusOneName: '', dietary: '', arrival: '', message: '', respondedAt: null });
export const addGuest = (eventId, d) => mutate((s) => {
  const u = d.userId ? s.users[d.userId] : Object.values(s.users).find((x) => x.name.toLowerCase() === d.name.trim().toLowerCase());
  const inv = { id: uid('i'), eventId, userId: u?.id || null, name: u?.name || d.name.trim(), email: d.email || u?.email || '', phone: d.phone || '', sent: {}, group: d.group || '',
    plusOneAllowed: !!d.plusOneAllowed, invitedAt: now(), reminders: 0, checkedIn: false, rsvp: blankRsvp() };
  s.invitations.push(inv);
  if (u) { ensureMembership(s, eventId, u.id, 'guest'); notify(s, u.id, eventId, `You're invited to ${s.events.find((e) => e.id === eventId).name}`, `invite-${eventId}`); }
  log(s, eventId, `invited ${inv.name}`); return inv.id;
});
export const updateInvitation = (id, patch) => mutate((s) => { Object.assign(s.invitations.find((i) => i.id === id), patch); });
export const setRsvp = (id, patch) => mutate((s) => {
  const inv = s.invitations.find((i) => i.id === id); const before = inv.rsvp.status;
  Object.assign(inv.rsvp, patch, { respondedAt: now() });
  if (patch.status && patch.status !== before) {
    const self = inv.userId === s.currentUserId; const ev = s.events.find((e) => e.id === inv.eventId);
    log(s, inv.eventId, self ? `RSVP'd “${patch.status === 'declined' ? "can't go" : patch.status}”` : `updated ${inv.name}'s RSVP to ${patch.status}`);
    if (self) notify(s, ownerOf(s, inv.eventId), inv.eventId, `${inv.name} replied “${patch.status === 'declined' ? "can't go" : patch.status}” to ${ev.name}`, `e-${inv.eventId}-people`);
  }
});
// A person opening the invitation link: make sure they have an invitation, then record the RSVP.
export const respondToInvite = (eventId, patch) => {
  if (cloud && hooks.joinViaInvite && !invitationFor(eventId)) return hooks.joinViaInvite(eventId, patch);
  let inv = invitationFor(eventId);
  if (!inv) { const id = addGuest(eventId, { userId: meId(), plusOneAllowed: has(eventById(eventId), 'plusOnes'), group: 'Via link' }); inv = S().invitations.find((i) => i.id === id); }
  setRsvp(inv.id, patch);
};
export const removeInvitation = (id) => mutate((s) => { s.invitations = s.invitations.filter((i) => i.id !== id); });
export const toggleCheckIn = (id) => mutate((s) => { const i = s.invitations.find((x) => x.id === id); i.checkedIn = !i.checkedIn; });
export const remind = (eventId, invId) => mutate((s) => {
  const list = s.invitations.filter((i) => i.eventId === eventId && (invId ? i.id === invId : i.rsvp.status === 'pending'));
  const ev = s.events.find((e) => e.id === eventId);
  list.forEach((i) => { i.reminders += 1; notify(s, i.userId, eventId, `Reminder: please RSVP to ${ev.name}`, `invite-${eventId}`); });
  return list.length;
});
export const addMember = (eventId, userId, role, meta = {}) => mutate((s) => {
  const m = s.memberships.find((x) => x.eventId === eventId && x.userId === userId);
  if (m) Object.assign(m, { role }, meta); else s.memberships.push({ id: uid('m'), eventId, userId, role, ...meta });
  notify(s, userId, eventId, `You were added to ${s.events.find((e) => e.id === eventId).name}`, `e-${eventId}-overview`);
  log(s, eventId, `added ${s.users[userId].name} to the event team`);
});
export const setRole = (membershipId, role) => mutate((s) => { s.memberships.find((m) => m.id === membershipId).role = role; });
export const removeMember = (membershipId) => mutate((s) => {
  const m = s.memberships.find((x) => x.id === membershipId); if (!m) return;
  const cids = s.committees.filter((c) => c.eventId === m.eventId).map((c) => c.id);
  s.committeeMemberships = s.committeeMemberships.filter((x) => !(x.userId === m.userId && cids.includes(x.committeeId)));
  s.memberships = s.memberships.filter((x) => x.id !== membershipId);
});

/* committees */
export const createCommittee = (eventId, d) => mutate((s) => {
  const id = uid('c');
  s.committees.push({ id, eventId, name: d.name, description: d.description || '', icon: d.icon || '⭐', tone: d.tone || 'lav', budget: +d.budget || 0, status: 'ontrack', group: d.group || '' });
  if (d.leadId) { s.committeeMemberships.push({ id: uid('cm'), committeeId: id, userId: d.leadId, role: 'lead' }); ensureMembership(s, eventId, d.leadId, 'lead'); notify(s, d.leadId, eventId, `You're leading ${d.name}`, `e-${eventId}-teams`); }
  log(s, eventId, `created the ${d.name} team`); return id;
});
export const updateCommittee = (id, patch) => mutate((s) => { Object.assign(s.committees.find((c) => c.id === id), patch); });
export const deleteCommittee = (id) => mutate((s) => {
  s.committees = s.committees.filter((c) => c.id !== id); s.committeeMemberships = s.committeeMemberships.filter((m) => m.committeeId !== id);
  s.tasks.forEach((t) => { if (t.committeeId === id) t.committeeId = null; }); s.expenses.forEach((x) => { if (x.committeeId === id) x.committeeId = null; });
});
export const setTeamMember = (committeeId, userId, role = 'member') => mutate((s) => {
  const c = s.committees.find((x) => x.id === committeeId);
  if (role === 'lead') s.committeeMemberships.forEach((m) => { if (m.committeeId === committeeId && m.role === 'lead') m.role = 'member'; });
  const m = s.committeeMemberships.find((x) => x.committeeId === committeeId && x.userId === userId);
  if (m) m.role = role; else s.committeeMemberships.push({ id: uid('cm'), committeeId, userId, role });
  ensureMembership(s, c.eventId, userId, role);
  notify(s, userId, c.eventId, role === 'lead' ? `You're now leading ${c.name}` : `You were added to ${c.name}`, `e-${c.eventId}-teams`);
  log(s, c.eventId, userId === s.currentUserId ? `volunteered for ${c.name}` : `added ${s.users[userId].name} to ${c.name}`);
});
export const removeTeamMember = (committeeId, userId) => mutate((s) => { s.committeeMemberships = s.committeeMemberships.filter((m) => !(m.committeeId === committeeId && m.userId === userId)); });

/* tasks */
export const createTask = (eventId, d) => mutate((s) => {
  const t = { id: uid('t'), eventId, title: d.title, description: d.description || '', committeeId: d.committeeId || null, assigneeId: d.assigneeId || null,
    due: d.due || '', priority: d.priority || 'medium', status: d.status || 'todo', subtasks: d.subtasks || [], checklist: d.checklist || [], dependsOn: d.dependsOn || [], comments: [], attachments: [], createdAt: now() };
  s.tasks.push(t); log(s, eventId, `added the task “${t.title}”`);
  notify(s, t.assigneeId, eventId, `New task for you: ${t.title}`, `e-${eventId}-tasks`); return t.id;
});
export const updateTask = (id, patch) => mutate((s) => {
  const t = s.tasks.find((x) => x.id === id); const was = { a: t.assigneeId, st: t.status };
  Object.assign(t, patch);
  if (patch.assigneeId && patch.assigneeId !== was.a) notify(s, patch.assigneeId, t.eventId, `You were assigned: ${t.title}`, `e-${t.eventId}-tasks`);
  if (patch.status && patch.status !== was.st) {
    log(s, t.eventId, patch.status === 'done' ? `completed “${t.title}”` : `moved “${t.title}” to ${patch.status === 'doing' ? 'in progress' : patch.status === 'blocked' ? 'blocked' : 'not started'}`);
    if (patch.status === 'done' || patch.status === 'blocked') notify(s, ownerOf(s, t.eventId), t.eventId, `${s.users[s.currentUserId].name} marked “${t.title}” ${patch.status === 'done' ? 'complete' : 'blocked'}`, `e-${t.eventId}-tasks`);
  }
});
export const deleteTask = (id) => mutate((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); s.tasks.forEach((t) => { t.dependsOn = (t.dependsOn || []).filter((d) => d !== id); }); });
export const commentTask = (id, text) => mutate((s) => { s.tasks.find((t) => t.id === id).comments.push({ id: uid('k'), userId: s.currentUserId, text, at: now() }); });

/* generic collections: schedule, expenses, media, files */
const NAMES = { scheduleItems: 'sc', expenses: 'x', media: 'md', files: 'f' };
export const addItem = (coll, eventId, d, logText) => mutate((s) => { const item = { id: uid(NAMES[coll]), eventId, userId: s.currentUserId, at: now(), ...d }; s[coll].push(item); if (logText) log(s, eventId, logText); return item.id; });
export const updateItem = (coll, id, patch) => mutate((s) => { Object.assign(s[coll].find((x) => x.id === id), patch); });
export const removeItem = (coll, id) => mutate((s) => { s[coll] = s[coll].filter((x) => x.id !== id); });

/* announcements */
export const postUpdate = (eventId, d) => mutate((s) => {
  s.announcements.push({ id: uid('a'), eventId, userId: s.currentUserId, at: now(), scope: d.scope, committeeId: d.committeeId || null, text: d.text, mediaId: d.mediaId || null, comments: [] });
  const ev = s.events.find((e) => e.id === eventId);
  s.memberships.filter((m) => m.eventId === eventId).forEach((m) => { const u = s.users[m.userId]; if (u && d.text.includes('@' + u.name.split(' ')[0])) notify(s, u.id, eventId, `${s.users[s.currentUserId].name} mentioned you in ${ev.name}`, `e-${eventId}-updates`); });
  log(s, eventId, d.scope === 'event' ? 'posted an announcement' : 'posted an internal update');
});
export const commentUpdate = (id, text) => mutate((s) => { s.announcements.find((a) => a.id === id).comments.push({ id: uid('k'), userId: s.currentUserId, text, at: now() }); });
export const deleteUpdate = (id) => mutate((s) => { s.announcements = s.announcements.filter((a) => a.id !== id); });

/* notifications */
/* planner (co-pilot) */
export const setPlanner = (eventId, patch) => mutate((s) => { const ev = s.events.find((e) => e.id === eventId); ev.planner = { log: [], ...(ev.planner || {}), ...patch }; });
export const plannerLog = (eventId, text) => mutate((s) => { const ev = s.events.find((e) => e.id === eventId); ev.planner = { log: [], ...(ev.planner || {}) }; ev.planner.log.unshift({ id: uid('pl'), text, at: now() }); });
export const nudgeTasks = (ids) => mutate((s) => { let n = 0; s.tasks.filter((t) => ids.includes(t.id) && t.assigneeId).forEach((t) => { notify(s, t.assigneeId, t.eventId, `Planner nudge: “${t.title}” needs your attention`, `e-${t.eventId}-tasks`); n += 1; }); return n; });

export const markRead = (id) => mutate((s) => { const n = s.notifications.find((x) => x.id === id); if (n) n.read = true; });
export const markAllRead = () => mutate((s) => { s.notifications.forEach((n) => { if (n.userId === s.currentUserId) n.read = true; }); });
export { today };
