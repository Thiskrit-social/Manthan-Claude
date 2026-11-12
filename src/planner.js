// Planner engine: a rule-based stand-in for an AI co-pilot. No model is called.
// It turns an event plus a short brief into a proposed plan (teams, hand-offs, tasks, schedule, budget,
// invitations), and looks at the live event to suggest next steps. Everything it does goes through the
// same store actions a person would use, so a real model could later replace `draftPlan` and `suggestions`
// without touching the rest of the app.
import { COMPLEXITY } from './config.js';
import { S, me, meId, user, committeesOf, teamMembers, leadOf, tasksOf, invitationsOf, scheduleOf, rsvpStats, budgetOf, membersOf, has,
  ensureUser, addGuest, createCommittee, updateCommittee, setTeamMember, createTask, updateTask, addItem, updateEvent, postUpdate, remind, nudgeTasks, setPlanner, plannerLog } from './store.js';
import { addDays, today, daysUntil, parse, iso, fmtTime } from './utils.js';

// Each area: budget weight and a task playbook of [title, days before the event, priority, index of the task it waits on].
export const AREAS = {
  drinks: { name: 'Drinks', icon: '🍹', tone: 'sky', share: 3, tasks: [['Plan the drinks list and quantities', 5, 'medium'], ['Buy drinks, ice and mixers', 1, 'high', 0], ['Set up the drinks station', 0, 'medium', 1]] },
  food: { name: 'Food', icon: '🍕', tone: 'coral', share: 4, tasks: [['Collect dietary needs from RSVPs', 4, 'high'], ['Decide the menu and order or shop', 2, 'high', 0], ['Lay out food and label allergens', 0, 'medium', 1]] },
  music: { name: 'Music', icon: '🎵', tone: 'lav', share: 1, tasks: [['Build the playlist', 3, 'medium'], ['Test speakers and volume', 0, 'medium']] },
  decoration: { name: 'Decoration', icon: '🎈', tone: 'butter', share: 2, tasks: [['Pick a look and buy decorations', 4, 'medium'], ['Decorate the space', 0, 'medium', 0], ['Set up a photo corner', 0, 'low']] },
  logistics: { name: 'Logistics', icon: '🚚', tone: 'butter', share: 5, tasks: [['Confirm the venue booking and access times', 21, 'high'], ['Draw the floor plan', 14, 'high', 0], ['Book AV and furniture', 12, 'medium', 0], ['Write the run sheet for the day', 4, 'medium', 1]] },
  registration: { name: 'Registration', icon: '🎟️', tone: 'sky', share: 1, tasks: [['Open the registration page', 28, 'high'], ['Close registration and export the list', 5, 'high', 0], ['Print name badges', 3, 'medium', 1], ['Brief the welcome desk', 1, 'medium']] },
  marketing: { name: 'Marketing', icon: '📣', tone: 'coral', share: 2, tasks: [['Agree the event look and key message', 24, 'high'], ['Launch the announcement campaign', 20, 'medium', 0], ['Send a reminder to everyone registered', 3, 'medium'], ['Brief the photographer', 2, 'low']] },
  sponsorship: { name: 'Sponsorship', icon: '🤝', tone: 'mint', share: 1, tasks: [['Shortlist and approach partners', 30, 'high'], ['Confirm partners and their requirements', 14, 'high', 0], ['Send partner invoices', 10, 'medium', 1]] },
  hospitality: { name: 'Hospitality', icon: '☕', tone: 'mint', share: 6, tasks: [['Get catering quotes', 21, 'high'], ['Confirm catering numbers and dietary breakdown', 5, 'high', 0], ['Prepare the speaker and volunteer area', 1, 'low']] },
  programme: { name: 'Programme', icon: '🎤', tone: 'lav', share: 2, tasks: [['Draft the programme', 25, 'high'], ['Confirm speakers and hosts', 14, 'high', 0], ['Collect bios and slides', 5, 'low', 1]] },
  finance: { name: 'Finance', icon: '💷', tone: 'butter', share: 0, tasks: [['Set team budgets and approval rules', 26, 'high'], ['Reconcile spend against budget', 2, 'medium']] },
  photos: { name: 'Photos', icon: '📸', tone: 'sky', share: 1, tasks: [['Plan the shot list', 3, 'low'], ['Share the memories gallery link on the day', 0, 'low']] },
};
export const defaultAreas = (ev) => (ev.complexity === 'simple' ? (['dinner', 'birthday'].includes(ev.category) ? ['food', 'drinks', 'decoration'] : ['drinks', 'food', 'music', 'decoration'])
  : ev.complexity === 'organised' ? ['registration', 'marketing', 'logistics', 'hospitality', 'programme'] : ['registration', 'marketing', 'sponsorship', 'logistics', 'hospitality', 'programme', 'finance']);

// Things worth acting on when they appear in the host's own notes.
const CUES = [
  [/vegan|vegetarian|halal|kosher|gluten|allerg/i, 'food', 'Plan clearly labelled options for dietary needs', 3, 'high', 'dietary needs'],
  [/outdoor|garden|rooftop|park|terrace/i, null, 'Agree a wet-weather plan', 3, 'high', 'an outdoor space'],
  [/surprise/i, null, 'Brief every guest that it is a surprise', 5, 'high', 'a surprise'],
  [/kids|children|famil/i, null, 'Plan something for the children', 4, 'medium', 'children coming'],
  [/neighbour|noise|late/i, null, 'Warn the neighbours and agree a music cut-off', 2, 'medium', 'noise'],
  [/speaker|talk|panel|keynote/i, 'programme', 'Send speakers their briefing and timings', 6, 'medium', 'speakers'],
  [/parking|travel|train|coach/i, null, 'Send travel and parking details to guests', 4, 'medium', 'travel'],
];
const mins = (t) => { const [h, m] = (t || '19:00').split(':').map(Number); return h * 60 + m; };
const hhmm = (n) => { const v = Math.max(0, Math.min(1439, Math.round(n))); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const dueFor = (ev, daysBefore) => { const d = addDays(-daysBefore, parse(ev.date)); return d < today() ? today() : d; };

function runOfDay(ev) {
  const a = mins(ev.start); let b = mins(ev.end || ev.start) ; if (b <= a) b = Math.min(1439, a + 240); const len = b - a;
  return ev.complexity === 'simple'
    ? [['Set-up crew arrives', a - 90, a - 15], ['Doors open and welcome', a, a + 30], ['Food is served', a + Math.min(60, len * 0.25), a + Math.min(105, len * 0.45)], ['The main moment: toast and group photo', a + len * 0.5, a + len * 0.5 + 20], ['Wind down and tidy', b - 20, b]]
    : [['Load-in and set-up', a - 120, a - 30], ['Registration opens', a - 30, a], ['Welcome and opening', a, a + 20], ['Main session', a + 20, a + len * 0.35], ['Break and refreshments', a + len * 0.35, a + len * 0.35 + 45], ['Networking', a + len * 0.55, a + len * 0.8], ['Closing remarks', b - 30, b], ['Pack-down', b, b + 60]];
}

// brief: { notes, budget, areas: [keys], helpers: [names], guests: [names] }
export function draftPlan(ev, brief) {
  const owner = me().name; const helpers = [...new Set(brief.helpers.map((n) => n.trim()).filter(Boolean))].filter((n) => n !== owner);
  const existing = committeesOf(ev.id); const haveTask = new Set(tasksOf(ev.id).map((t) => t.title.toLowerCase())); const cues = CUES.filter(([re]) => re.test(brief.notes || ''));
  const keys = brief.areas.filter((k) => AREAS[k]); const weight = keys.reduce((n, k) => n + AREAS[k].share, 0) || 1; const budget = +brief.budget || 0; const reserve = budget ? Math.round(budget * 0.1) : 0;
  const teams = keys.map((key, i) => {
    const a = AREAS[key]; const found = existing.find((c) => c.name.toLowerCase() === a.name.toLowerCase());
    const current = found ? teamMembers(found.id).map((m) => user(m.userId).name) : []; const currentLead = found && leadOf(found.id) ? user(leadOf(found.id)).name : null;
    // Hand-offs: one lead per team first, then spread everyone else round the teams.
    const lead = currentLead || (helpers.length ? helpers[i % helpers.length] : null);
    const extra = helpers.filter((h, n) => n >= keys.length && n % keys.length === i);
    const people = [...new Set([lead, ...current, ...extra].filter(Boolean))]; const crew = people.length ? people : [owner];
    const playbook = [...a.tasks, ...cues.filter((c) => c[1] === key).map((c) => [c[2], c[3], c[4]])];
    const tasks = playbook.map(([title, days, priority, dep], n) => ({ title, due: dueFor(ev, days), priority, assignee: crew[n % crew.length], dep: dep != null ? a.tasks[dep][0] : null })).filter((t) => !haveTask.has(t.title.toLowerCase()));
    return { key, name: a.name, icon: a.icon, tone: a.tone, existingId: found?.id || null, lead, members: people.filter((p) => p !== lead), budget: budget ? Math.round(((budget - reserve) * a.share) / weight) : 0, tasks, on: true };
  });
  const organised = ev.complexity !== 'simple';
  const core = [['Send invitations and chase replies', organised ? 21 : 6, 'high'], ['Confirm the final headcount', 2, 'high'], ...(organised ? [['Complete the risk assessment and insurance', 14, 'high'], ['Share the run sheet with every team', 3, 'medium']] : [['Tidy up and clear space for guests', 0, 'medium']]),
    ...cues.filter((c) => !c[1] || !keys.includes(c[1])).map((c) => [c[2], c[3], c[4]])]
    .map(([title, days, priority]) => ({ title, due: dueFor(ev, days), priority, assignee: owner })).filter((t) => !haveTask.has(t.title.toLowerCase()));
  const people = [owner, ...helpers]; const schedule = scheduleOf(ev.id).length ? [] : runOfDay(ev).map(([title, s, e], n) => ({ title, start: hhmm(s), end: hhmm(e), owner: people[n % people.length] }));
  const invited = new Set(invitationsOf(ev.id).map((i) => i.name.toLowerCase()));
  const guests = [...new Set([...brief.guests, ...helpers].map((n) => n.trim()).filter(Boolean))].filter((n) => !invited.has(n.toLowerCase()) && n !== owner);
  const welcome = `Welcome to ${ev.name}! It’s on ${parse(ev.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} from ${fmtTime(ev.start)}${ev.location ? ' at ' + ev.location : ''}. Please RSVP and tell us about any dietary needs.`;
  return { teams, core, schedule, guests, budget, reserve, welcome, noticed: cues.map((c) => c[5]), on: { core: true, schedule: schedule.length > 0, guests: guests.length > 0, budget: budget > 0, welcome: !ev.planner?.appliedAt } };
}

export function applyPlan(ev, plan) {
  const id = ev.id; const uidOf = (name) => (name === me().name ? meId() : ensureUser(name)); const made = { teams: 0, tasks: 0, handoffs: 0, invites: 0, schedule: 0 }; const titleToId = {};
  tasksOf(id).forEach((t) => { titleToId[t.title] = t.id; });
  plan.teams.filter((t) => t.on).forEach((t) => {
    let cid = t.existingId;
    if (!cid) { cid = createCommittee(id, { name: t.name, icon: t.icon, tone: t.tone, description: `Looks after ${t.name.toLowerCase()} for ${ev.name}.`, budget: plan.on.budget ? t.budget : 0, leadId: t.lead ? uidOf(t.lead) : null }); made.teams += 1; }
    else { if (plan.on.budget && t.budget) updateCommittee(cid, { budget: t.budget }); if (t.lead && !leadOf(cid)) setTeamMember(cid, uidOf(t.lead), 'lead'); }
    t.members.forEach((m) => { const u = uidOf(m); if (!teamMembers(cid).some((x) => x.userId === u)) setTeamMember(cid, u); });
    t.tasks.forEach((k) => { const who = uidOf(k.assignee); titleToId[k.title] = createTask(id, { title: k.title, committeeId: cid, assigneeId: who, due: k.due, priority: k.priority, dependsOn: has(ev, 'dependencies') && k.dep && titleToId[k.dep] ? [titleToId[k.dep]] : [] }); made.tasks += 1; if (who !== meId()) made.handoffs += 1; });
  });
  if (plan.on.core) plan.core.forEach((k) => { createTask(id, { title: k.title, assigneeId: meId(), due: k.due, priority: k.priority }); made.tasks += 1; });
  if (plan.on.schedule) plan.schedule.forEach((x) => { addItem('scheduleItems', id, { title: x.title, date: ev.date, start: x.start, end: x.end, location: ev.location || '', ownerId: uidOf(x.owner), description: '', checklist: [], reminder: 15 }); made.schedule += 1; });
  if (plan.on.budget && plan.budget) updateEvent(id, { budget: plan.budget });
  if (plan.on.guests) plan.guests.forEach((n) => { addGuest(id, { name: n, plusOneAllowed: has(ev, 'plusOnes') }); made.invites += 1; });
  if (plan.on.welcome && plan.welcome.trim()) postUpdate(id, { scope: 'event', text: plan.welcome.trim() });
  const parts = [made.teams && `${made.teams} teams`, made.tasks && `${made.tasks} tasks (${made.handoffs} handed to other people)`, made.schedule && `${made.schedule} schedule items`, made.invites && `${made.invites} invitations`].filter(Boolean);
  setPlanner(id, { appliedAt: new Date().toISOString() }); plannerLog(id, `Set up the plan: ${parts.join(', ') || 'nothing new was needed'}.`);
  return made;
}

// Co-pilot: reads the live event and proposes the next useful step. Each suggestion can be run in one tap.
export function suggestions(ev) {
  const id = ev.id; const out = []; const st = rsvpStats(id); const tasks = tasksOf(id); const teams = committeesOf(id); const days = daysUntil(ev.date); const done = (text) => plannerLog(id, text);
  const add = (s) => out.push(s);
  if (st.pending > 0) add({ id: 'remind', emoji: '💌', tone: 'butter', sim: true, title: `${st.pending} ${st.pending === 1 ? 'guest has' : 'guests have'} not replied`, detail: days <= 7 ? `The event is in ${Math.max(days, 0)} days, so it is time to chase.` : 'A friendly reminder usually gets most replies within a day.', cta: 'Send RSVP reminders',
    run: () => { const n = remind(id); done(`Sent RSVP reminders to ${n} guests.`); return `Reminders logged for ${n} guests`; } });
  const loose = tasks.filter((t) => !t.assigneeId && t.status !== 'done');
  if (loose.length) add({ id: 'handoff', emoji: '🤝', tone: 'sky', title: `${loose.length} ${loose.length === 1 ? 'task has' : 'tasks have'} nobody responsible`, detail: 'I can hand each one to the least busy person in its team.', cta: 'Hand them off',
    run: () => { const load = {}; tasks.forEach((t) => { if (t.assigneeId && t.status !== 'done') load[t.assigneeId] = (load[t.assigneeId] || 0) + 1; });
      loose.forEach((t) => { const pool = t.committeeId ? teamMembers(t.committeeId).map((m) => m.userId) : []; const who = (pool.length ? pool : [meId()]).sort((a, b) => (load[a] || 0) - (load[b] || 0))[0]; load[who] = (load[who] || 0) + 1; updateTask(t.id, { assigneeId: who }); });
      done(`Handed off ${loose.length} unassigned tasks.`); return `${loose.length} tasks handed off`; } });
  const stuck = tasks.filter((t) => t.assigneeId && t.assigneeId !== meId() && t.status !== 'done' && (t.status === 'blocked' || (t.due && daysUntil(t.due) < 0)));
  if (stuck.length) add({ id: 'nudge', emoji: '⏰', tone: 'coral', sim: true, title: `${stuck.length} ${stuck.length === 1 ? 'task is' : 'tasks are'} overdue or blocked`, detail: stuck.slice(0, 3).map((t) => `${t.title} (${user(t.assigneeId).name.split(' ')[0]})`).join(' · '), cta: 'Nudge the owners',
    run: () => { const n = nudgeTasks(stuck.map((t) => t.id)); done(`Nudged the owners of ${n} overdue or blocked tasks.`); return `${n} nudges sent in the app`; } });
  const headless = teams.filter((c) => !leadOf(c.id) && teamMembers(c.id).length > 0);
  if (headless.length) add({ id: 'leads', emoji: '🧭', tone: 'lav', title: `${headless.length} ${headless.length === 1 ? 'team has' : 'teams have'} no lead`, detail: headless.map((c) => c.name).join(', '), cta: 'Appoint leads',
    run: () => { headless.forEach((c) => setTeamMember(c.id, teamMembers(c.id)[0].userId, 'lead')); done(`Appointed leads for ${headless.map((c) => c.name).join(', ')}.`); return 'Leads appointed'; } });
  const diets = {}; invitationsOf(id).filter((i) => i.rsvp.status === 'going' && i.rsvp.dietary).forEach((i) => { diets[i.rsvp.dietary] = (diets[i.rsvp.dietary] || 0) + 1; });
  const dietText = Object.entries(diets).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', '); const foodTeam = teams.find((c) => /food|hospitality|catering/i.test(c.name));
  if (dietText && ev.planner?.dietSent !== dietText) add({ id: 'diet', emoji: '🥗', tone: 'mint', title: 'Dietary needs have come in', detail: dietText, cta: foodTeam ? `Brief the ${foodTeam.name} team` : 'Post to organisers',
    run: () => { postUpdate(id, { scope: foodTeam ? 'team' : 'internal', committeeId: foodTeam?.id || null, text: `Planner summary of dietary needs from confirmed guests: ${dietText}. ${st.headcount} people confirmed in total.` }); setPlanner(id, { dietSent: dietText }); done('Shared the dietary summary with the food team.'); return 'Dietary summary posted'; } });
  if (!scheduleOf(id).length) add({ id: 'schedule', emoji: '🕰️', tone: 'lav', title: 'There is no schedule yet', detail: 'I can draft a run of the day from your start and end times.', cta: 'Draft the schedule',
    run: () => { const items = runOfDay(ev); items.forEach(([title, s, e]) => addItem('scheduleItems', id, { title, date: ev.date, start: hhmm(s), end: hhmm(e), location: ev.location || '', ownerId: meId(), description: '', checklist: [], reminder: 15 })); done(`Drafted a schedule with ${items.length} items.`); return 'Schedule drafted'; } });
  const b = budgetOf(id); const over = b.teams.filter((t) => t.allocated > 0 && t.planned > t.allocated);
  if (over.length) add({ id: 'budget', emoji: '💷', tone: 'coral', title: `${over.length} ${over.length === 1 ? 'team is' : 'teams are'} planning to overspend`, detail: over.map((t) => `${t.committee.name} by ${ev.currency}${Math.round(t.planned - t.allocated)}`).join(', '), cta: 'Open the budget', link: `e-${id}-budget` });
  if (days >= 0 && days <= 3 && st.going > 0 && ev.planner?.headcountFor !== ev.date) add({ id: 'final', emoji: '📣', tone: 'butter', title: 'Time for the final details message', detail: `${st.headcount} people confirmed. Send everyone the time, place and what to bring.`, cta: 'Post to everyone',
    run: () => { postUpdate(id, { scope: 'event', text: `See you ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'on ' + parse(ev.date).toLocaleDateString('en-GB', { weekday: 'long' })} at ${fmtTime(ev.start)}${ev.location ? ', ' + ev.location : ''}. ${st.headcount} of us confirmed so far. Reply here if anything changes!` }); setPlanner(id, { headcountFor: ev.date }); done('Posted the final details to everyone.'); return 'Announcement posted'; } });
  return out;
}

// A short written status the host can post to the organisers.
export function statusSummary(ev) {
  const st = rsvpStats(ev.id); const tasks = tasksOf(ev.id); const open = tasks.filter((t) => t.status !== 'done'); const b = budgetOf(ev.id); const days = daysUntil(ev.date);
  return `Planner status for ${ev.name}, ${days >= 0 ? days + ' days to go' : 'event passed'}: ${st.going} going, ${st.maybe} maybe, ${st.pending} waiting for a reply. ${tasks.length - open.length} of ${tasks.length} tasks done, ${open.filter((t) => t.status === 'blocked').length} blocked, ${open.filter((t) => t.due && daysUntil(t.due) < 0).length} overdue.${b.total ? ` Budget: ${ev.currency}${Math.round(b.actual)} paid of ${ev.currency}${Math.round(b.total)}.` : ''}`;
}

/* ---------------------------------------------------------------------------------------------
   Real-model path. The model only ever proposes: its JSON is validated and normalised here into the
   same plan shape the rules produce, then goes through the same review screen and `applyPlan`.
   --------------------------------------------------------------------------------------------- */
import { askJSON } from './ai.js';
import { committee } from './store.js';
const TONE_SET = ['lav', 'butter', 'coral', 'mint', 'sky']; const PRI = ['low', 'medium', 'high'];
const str = (v, max = 140) => (typeof v === 'string' ? v.trim().slice(0, max) : ''); const arr = (v) => (Array.isArray(v) ? v : []);
const time = (v) => (/^\d{1,2}:\d{2}$/.test(String(v)) ? hhmm(mins(String(v))) : null);
const eventFacts = (ev) => `Event: ${ev.name}. Type: ${ev.category}, ${COMPLEXITY[ev.complexity].label.toLowerCase()} size, about ${ev.expected} people. Date: ${ev.date} (today is ${today()}). Time: ${ev.start} to ${ev.end || 'late'}. Location: ${ev.location || 'not decided'}. Description: ${ev.description || 'none'}.`;

export async function draftPlanAI(ev, brief) {
  const base = draftPlan(ev, brief); const owner = me().name; const helpers = [...new Set(brief.helpers.map((n) => n.trim()).filter(Boolean))].filter((n) => n !== owner); const people = [owner, ...helpers];
  const existing = committeesOf(ev.id); const haveTask = new Set(tasksOf(ev.id).map((t) => t.title.toLowerCase()));
  const prompt = `You are planning a real event for its host. Draft a practical, specific plan.
${eventFacts(ev)}
Host's notes: ${brief.notes || 'none'}.
Areas the host wants organised: ${brief.areas.map((k) => AREAS[k]?.name).filter(Boolean).join(', ')}.
Total budget: ${brief.budget ? ev.currency + brief.budget : 'not set'}.
People who can be given work (use these exact names only): ${people.join(', ')}. "${owner}" is the host.
Teams that already exist: ${existing.map((c) => c.name).join(', ') || 'none'}. Reuse their names rather than inventing near-duplicates.
Tasks that already exist (do not repeat): ${[...haveTask].slice(0, 40).join('; ') || 'none'}.

JSON shape:
{"insights":["short things you noticed in the notes that shaped the plan"],
 "teams":[{"name":"","icon":"one emoji","tone":"lav|butter|coral|mint|sky","lead":"a name from the list","members":["names"],"budget":0,
   "tasks":[{"title":"","daysBefore":0,"priority":"low|medium|high","assignee":"a name","dependsOn":"title of another task in this plan, or empty"}]}],
 "hostTasks":[{"title":"","daysBefore":0,"priority":"low|medium|high"}],
 "schedule":[{"title":"","start":"HH:MM","end":"HH:MM","owner":"a name"}],
 "welcome":"a warm 2 sentence announcement to guests"}
Rules: one team per area the host listed, 2 to 5 tasks each, written for this specific event and its notes. Spread leads and tasks fairly across the people. daysBefore is days before the event date. Team budgets must add up to no more than 90% of the total. Schedule times are on the event day, 24 hour clock, 4 to 8 items.`;
  const raw = await askJSON(prompt); const budget = +brief.budget || 0; const pick = (n, pool, i) => { const hit = pool.find((p) => p.toLowerCase() === str(n).toLowerCase()); return hit || pool[i % pool.length]; };
  const teams = arr(raw.teams).slice(0, 9).map((t, i) => {
    const name = str(t.name, 40) || `Team ${i + 1}`; const found = existing.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const lead = helpers.length ? pick(t.lead, helpers, i) : null; const members = [...new Set(arr(t.members).map((m) => helpers.find((h) => h.toLowerCase() === str(m).toLowerCase())).filter((m) => m && m !== lead))];
    const crew = [lead, ...members].filter(Boolean); const pool = crew.length ? crew : [owner];
    const tasks = arr(t.tasks).slice(0, 6).map((k, n) => ({ title: str(k.title), due: dueFor(ev, Math.max(0, Math.min(120, +k.daysBefore || 0))), priority: PRI.includes(k.priority) ? k.priority : 'medium', assignee: pick(k.assignee, pool, n), dep: str(k.dependsOn) || null }))
      .filter((k) => k.title && !haveTask.has(k.title.toLowerCase()));
    return { key: 'ai' + i, name, icon: str(t.icon, 4) || '⭐', tone: TONE_SET.includes(t.tone) ? t.tone : TONE_SET[i % 5], existingId: found?.id || null, lead: found && leadOf(found.id) ? user(leadOf(found.id)).name : lead, members, budget: Math.max(0, Math.round(+t.budget || 0)), tasks, on: true };
  });
  if (!teams.length) throw new Error('The model returned no teams.');
  const all = new Set(teams.flatMap((t) => t.tasks.map((k) => k.title))); teams.forEach((t) => t.tasks.forEach((k) => { if (k.dep && (!all.has(k.dep) || k.dep === k.title)) k.dep = null; }));
  const spent = teams.reduce((n, t) => n + t.budget, 0); if (budget && spent > budget) teams.forEach((t) => { t.budget = Math.floor((t.budget * budget * 0.9) / spent); }); if (!budget) teams.forEach((t) => { t.budget = 0; });
  const core = arr(raw.hostTasks).slice(0, 8).map((k) => ({ title: str(k.title), due: dueFor(ev, Math.max(0, Math.min(120, +k.daysBefore || 0))), priority: PRI.includes(k.priority) ? k.priority : 'medium', assignee: owner })).filter((k) => k.title && !haveTask.has(k.title.toLowerCase()));
  const schedule = scheduleOf(ev.id).length ? [] : arr(raw.schedule).slice(0, 10).map((x, n) => ({ title: str(x.title, 80), start: time(x.start), end: time(x.end) || '', owner: pick(x.owner, people, n) })).filter((x) => x.title && x.start).sort((a, b) => a.start.localeCompare(b.start));
  return { ...base, teams, core: core.length ? core : base.core, schedule: schedule.length ? schedule : base.schedule, welcome: str(raw.welcome, 600) || base.welcome, noticed: arr(raw.insights).map((x) => str(x, 90)).filter(Boolean).slice(0, 5),
    reserve: budget ? budget - teams.reduce((n, t) => n + t.budget, 0) : 0, ai: true, on: { ...base.on, schedule: (schedule.length || base.schedule.length) > 0 } };
}

// Free-form request -> a reply plus proposed actions the host approves one by one.
export async function askCopilot(ev, question) {
  const id = ev.id; const st = rsvpStats(id); const teams = committeesOf(id); const open = tasksOf(id).filter((t) => t.status !== 'done').slice(0, 45);
  const people = membersOf(id).filter((m) => m.role !== 'guest').map((m) => user(m.userId).name); const byName = (n) => membersOf(id).map((m) => user(m.userId)).find((u) => u.name.toLowerCase() === str(n).toLowerCase());
  const prompt = `You are the planning co-pilot inside an event app. Answer the host's request briefly and propose actions only when they clearly help.
${eventFacts(ev)}
RSVPs: ${st.invited} invited, ${st.going} going, ${st.maybe} maybe, ${st.pending} no reply, ${st.declined} declined.
Teams: ${teams.map((c) => `${c.name} (lead ${leadOf(c.id) ? user(leadOf(c.id)).name : 'none'}; ${teamMembers(c.id).map((m) => user(m.userId).name).join(', ') || 'no members'})`).join(' | ') || 'none'}.
Organisers (exact names): ${people.join(', ')}.
Open tasks as id | title | team | assignee | due | status:
${open.map((t) => `${t.id} | ${t.title} | ${t.committeeId ? committee(t.committeeId)?.name : '-'} | ${t.assigneeId ? user(t.assigneeId).name : 'unassigned'} | ${t.due || '-'} | ${t.status}`).join('\n') || 'none'}

Host's request: ${question}

JSON shape: {"reply":"2 to 4 plain sentences","actions":[ ... ]} with at most 6 actions, each one of:
{"type":"remind_rsvps"}
{"type":"create_task","title":"","team":"existing team name or empty","assignee":"organiser name or empty","dueInDays":3,"priority":"low|medium|high"}
{"type":"assign_task","taskId":"","assignee":"organiser name"}
{"type":"set_task_status","taskId":"","status":"todo|doing|blocked|done"}
{"type":"post_update","audience":"everyone|organisers","text":""}
{"type":"invite_guest","name":""}
{"type":"add_schedule_item","title":"","start":"HH:MM","end":"HH:MM"}
Use only task ids and names given above.`;
  const raw = await askJSON(prompt); const note = (t) => plannerLog(id, t);
  const actions = arr(raw.actions).slice(0, 6).map((a) => {
    const t = a.taskId && tasksOf(id).find((x) => x.id === a.taskId); const who = byName(a.assignee);
    if (a.type === 'remind_rsvps' && st.pending) return { label: `Send RSVP reminders to ${st.pending} guests`, sim: true, run: () => { remind(id); note(`Sent RSVP reminders to ${st.pending} guests.`); } };
    if (a.type === 'create_task' && str(a.title)) { const c = teams.find((x) => x.name.toLowerCase() === str(a.team).toLowerCase()); const due = addDays(Math.max(0, Math.min(365, +a.dueInDays || 0)));
      return { label: `Add task “${str(a.title)}”${who ? ' for ' + who.name : ''}${c ? ' in ' + c.name : ''}`, run: () => { createTask(id, { title: str(a.title), committeeId: c?.id || null, assigneeId: who?.id || null, due, priority: PRI.includes(a.priority) ? a.priority : 'medium' }); note(`Added the task “${str(a.title)}”.`); } }; }
    if (a.type === 'assign_task' && t && who) return { label: `Hand “${t.title}” to ${who.name}`, run: () => { updateTask(t.id, { assigneeId: who.id }); note(`Handed “${t.title}” to ${who.name}.`); } };
    if (a.type === 'set_task_status' && t && ['todo', 'doing', 'blocked', 'done'].includes(a.status)) return { label: `Mark “${t.title}” as ${a.status === 'doing' ? 'in progress' : a.status === 'todo' ? 'not started' : a.status}`, run: () => { updateTask(t.id, { status: a.status }); } };
    if (a.type === 'post_update' && str(a.text, 800)) return { label: `Post to ${a.audience === 'everyone' ? 'everyone' : 'organisers'}: “${str(a.text, 70)}${str(a.text, 800).length > 70 ? '…' : ''}”`, run: () => { postUpdate(id, { scope: a.audience === 'everyone' ? 'event' : 'internal', text: str(a.text, 800) }); note('Posted an update it drafted.'); } };
    if (a.type === 'invite_guest' && str(a.name, 60)) return { label: `Invite ${str(a.name, 60)}`, sim: true, run: () => { addGuest(id, { name: str(a.name, 60), plusOneAllowed: has(ev, 'plusOnes') }); note(`Invited ${str(a.name, 60)}.`); } };
    if (a.type === 'add_schedule_item' && str(a.title) && time(a.start)) return { label: `Add “${str(a.title)}” to the schedule at ${time(a.start)}`, run: () => { addItem('scheduleItems', id, { title: str(a.title), date: ev.date, start: time(a.start), end: time(a.end) || '', location: ev.location || '', ownerId: meId(), description: '', checklist: [], reminder: 0 }); } };
    return null;
  }).filter(Boolean);
  return { reply: str(raw.reply, 900) || 'Done.', actions };
}
