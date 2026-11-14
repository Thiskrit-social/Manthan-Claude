// Personal screens: dashboard, My Events, My Tasks, notifications, profile and the invitation page.
import { html, useState, useEffect } from '../lib.js';
import { BRAND, ROLES, COMPLEXITY, PRIVACY, by } from '../config.js';
import { me, meId, user, eventsFor, tasksFor, notificationsFor, invitationFor, eventById, roleIn, rsvpStats, S, activityOf, markRead, markAllRead, resetDemo, respondToInvite, isCloud, myTeams, tasksOf, progress, membersOf, scheduleOf } from '../store.js';
import { visibleTasks } from '../permissions.js';
import { go, Icon, Avatar, Pill, RolePill, Bar, Cover, When, Empty, Sim, Confirm, toast, Seg, Field } from '../ui.js';
import { cx, greeting, fmtDate, fmtLong, fmtTime, daysUntil, dueLabel, ago, today, addDays } from '../utils.js';
import { TaskRow, TaskModal } from './tasks.js';
import { RsvpCard } from './people.js';
import { importSamples, signOut, setMode, cloudConfig, invitePreview, sendFeedback, deleteAccount } from '../backend.js';
import { ConnectBackend, LegalLinks } from './auth.js';

// Offered to a signed-in person with no events yet, and on their profile.
function SamplesButton({ label = 'Add the two sample events' }) {
  const [busy, setBusy] = useState(false);
  return html`<button class="btn" disabled=${busy} onClick=${async () => { setBusy(true); try { await importSamples(); toast('Sample events added to your account'); } catch (e) { toast('Couldn’t add the samples: ' + e.message); } setBusy(false); }}>
    <${Icon} name="sparkle" />${busy ? 'Adding…' : label}</button>`;
}

const inDays = (ev) => { const n = daysUntil(ev.date); return n < 0 ? 'Past' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`; };
const pendingInvites = () => eventsFor().filter(({ event, role }) => role === 'guest' && invitationFor(event.id)?.rsvp.status === 'pending');

export function EventCard({ event: e, role }) {
  const st = rsvpStats(e.id); const organiser = role !== 'guest' && role !== 'vendor'; const tasks = organiser ? visibleTasks(e.id) : []; const inv = invitationFor(e.id);
  return html`<button class="card click col" style="padding:10px 10px 16px" onClick=${() => go(`e-${e.id}-overview`)}>
    <${Cover} ev=${e} size="sm" />
    <div class="col gap-s" style="padding:0 6px"><div class="row between"><${RolePill} role=${role} /><span class="small b muted">${inDays(e)}</span></div><h3>${e.name}</h3>
      <span class="small muted"><${When} ev=${e} /></span>
      ${organiser ? html`<div class="row small"><span class="num"><b>${st.going}</b> going</span><span class="grow"><${Bar} value=${progress(tasks)} /></span><span class="muted num">${progress(tasks)}%</span></div>`
        : inv ? html`<span class="small">Your RSVP: <b>${by([{ id: 'going', label: 'Going' }, { id: 'maybe', label: 'Maybe' }, { id: 'declined', label: "Can't go" }, { id: 'pending', label: 'Not answered yet' }], inv.rsvp.status).label}</b></span>` : null}</div>
  </button>`;
}

// First visit with a real account: the three steps that get an event out of the door.
function Welcome() {
  const steps = [['🎈', 'Create your event', 'Name, date and place. About a minute.'], ['💌', 'Add guests and send invitations', 'By WhatsApp or email. Everyone gets a personal link to reply.'], ['✅', 'Share out the jobs', 'Hand tasks to friends and watch replies come in.']];
  return html`<div class="card tint c-lav col gap-l"><div class="col" style="gap:4px"><h2>Welcome to ${BRAND.name}</h2><span class="small" style="color:var(--ci)">Plan it, invite everyone and keep track in one place.</span></div>
    <div class="grid g3">${steps.map(([e, t, s], i) => html`<div class="card col" key=${t} style="gap:4px"><span style="font-size:1.6rem">${e}</span><b>${i + 1}. ${t}</b><span class="small muted">${s}</span></div>`)}</div>
    <div class="row wrap"><button id="welcome-create" class="btn primary" onClick=${() => go('new')}><${Icon} name="plus" />Create your first event</button><${SamplesButton} label="Or explore two sample events" /></div></div>`;
}

function FeedbackCard() {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { if (!text.trim() || busy) return; setBusy(true); try { await sendFeedback(text.trim()); setText(''); toast('Thank you. Your message was sent.'); } catch (e) { toast('Couldn’t send that: ' + e.message); } setBusy(false); };
  return html`<div class="card col" id="feedback"><h3>Help and feedback</h3><p class="small muted">Something broken, confusing or missing? Tell us. We read every message. Add your email if you’d like a reply.</p>
    <textarea id="feedback-text" class="input" style="min-height:84px" maxlength="4000" placeholder="What happened, or what would make this better?" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
    <div class="row between wrap"><span class="small muted"><${LegalLinks} /></span><button class="btn primary" disabled=${!text.trim() || busy} onClick=${send}><${Icon} name="send" />${busy ? 'Sending…' : 'Send'}</button></div></div>`;
}

function DeleteAccountCard() {
  const [open, setOpen] = useState(false); const [typed, setTyped] = useState(''); const [busy, setBusy] = useState(false);
  const owned = eventsFor().filter((x) => x.role === 'owner').length;
  const run = async () => { setBusy(true); try { await deleteAccount(); location.hash = 'home'; location.reload(); } catch (e) { toast('Couldn’t delete the account: ' + e.message); setBusy(false); } };
  return html`<div class="card col"><h3>Delete account</h3>
    ${!open ? html`<div class="row between wrap"><span class="small muted grow">Removes your account and your data for good.</span><button id="delete-account" class="btn" onClick=${() => setOpen(true)}>Delete my account…</button></div>`
      : html`<p class="small">This permanently deletes your profile, ${owned ? html`<b>the ${owned} ${owned === 1 ? 'event' : 'events'} you host (for everyone in them)</b>, ` : ''}your photos and your replies to other people’s events. It cannot be undone.</p>
        <${Field} label="Type DELETE to confirm"><input id="delete-confirm" class="input" autocomplete="off" value=${typed} onInput=${(e) => setTyped(e.target.value)} /><//>
        <div class="row wrap"><button class="btn" onClick=${() => { setOpen(false); setTyped(''); }}>Cancel</button><button id="delete-go" class="btn danger" disabled=${typed.trim() !== 'DELETE' || busy} onClick=${run}>${busy ? 'Deleting…' : 'Delete my account for good'}</button></div>`}</div>`;
}

export function Home() {
  const [task, setTask] = useState(null); const u = me(); const mine = eventsFor().filter(({ event }) => daysUntil(event.date) >= 0);
  const tasks = tasksFor().filter((t) => t.status !== 'done').sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const invites = pendingInvites(); const week = addDays(7); const dueSoon = tasks.filter((t) => t.due && t.due <= week);
  const groups = [['Hosting', mine.filter((x) => x.role === 'owner')], ['Managing', mine.filter((x) => ['manager', 'lead', 'member', 'vendor'].includes(x.role))], ['Attending', mine.filter((x) => x.role === 'guest')]];
  // The next two weeks as one list: events, deadlines and schedule items this person is responsible for.
  const horizon = addDays(14); const agenda = [
    ...mine.filter(({ event }) => event.date <= horizon).map(({ event, role }) => ({ k: event.date + event.start, date: event.date, icon: event.cover.emoji, title: event.name, sub: `${fmtTime(event.start)} · ${ROLES[role].label}`, to: `e-${event.id}-overview`, tone: event.cover.tone })),
    ...tasks.filter((t) => t.due && t.due <= horizon).map((t) => ({ k: t.due + '99', date: t.due, icon: '✅', title: t.title, sub: `Deadline · ${eventById(t.eventId).name}`, task: t.id, tone: daysUntil(t.due) < 0 ? 'coral' : 'grey' })),
    ...mine.flatMap(({ event }) => scheduleOf(event.id).filter((s) => s.ownerId === u.id && s.date <= horizon && s.date >= today()).map((s) => ({ k: s.date + s.start, date: s.date, icon: '🕰️', title: s.title, sub: `${fmtTime(s.start)} · you’re responsible · ${event.name}`, to: `e-${event.id}-schedule`, tone: 'sky' }))),
  ].sort((a, b) => a.k.localeCompare(b.k));
  const feed = mine.flatMap(({ event, role }) => (role === 'guest' || role === 'vendor' ? [] : activityOf(event.id).slice(0, 6).map((a) => ({ ...a, event })))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);
  if (isCloud() && !eventsFor().length) return html`<div class="sec-head"><div class="col" style="gap:4px"><span class="eyebrow">${fmtLong(today())}</span><h1>${greeting()}, ${u.name.split(' ')[0]} 👋</h1></div></div><${Welcome} />`;
  return html`
    <div class="sec-head"><div class="col" style="gap:4px"><span class="eyebrow">${fmtLong(today())}</span><h1>${greeting()}, ${u.name.replace(/^Dr\.\s*/, '').split(' ')[0]} 👋</h1>
      <p class="muted">${mine.length ? `You have ${mine.length} ${mine.length === 1 ? 'event' : 'events'} coming up and ${tasks.length} open ${tasks.length === 1 ? 'task' : 'tasks'}.` : 'Nothing planned yet. Start something!'}</p></div>
      <button class="btn primary" onClick=${() => go('new')}><${Icon} name="plus" />Create event</button></div>
    <div class="grid g4">
      <button class="card click tint c-lav stat" onClick=${() => go('events')}><span class="v">${mine.length}</span><span class="k">Upcoming events</span></button>
      <button class="card click tint c-sky stat" onClick=${() => go('mytasks')}><span class="v">${dueSoon.length}</span><span class="k">Tasks due this week</span></button>
      <button class="card click tint c-butter stat" onClick=${() => go('inbox')}><span class="v">${invites.length}</span><span class="k">Pending invitations</span></button>
      <button class="card click tint c-coral stat" onClick=${() => go('inbox')}><span class="v">${notificationsFor().filter((n) => !n.read).length}</span><span class="k">Unread notifications</span></button>
    </div>
    ${invites.length > 0 && html`<div class="col"><h2>Pending invitations</h2><div class="grid g2">${invites.map(({ event: e }) => html`<div class="card row wrap" key=${e.id}>
      <div style="width:84px;flex:none"><${Cover} ev=${e} size="sm" /></div><div class="col grow" style="gap:2px;min-width:150px"><h3>${e.name}</h3><span class="small muted"><${When} ev=${e} /></span><span class="small muted">Hosted by ${user(e.createdBy).name}</span></div>
      <div class="row wrap"><button class="btn primary sm" onClick=${() => { respondToInvite(e.id, { status: 'going' }); toast('You’re going! 🎉'); }}>Accept</button><button class="btn sm" onClick=${() => { respondToInvite(e.id, { status: 'maybe' }); toast('Marked as maybe'); }}>Maybe</button><button class="btn sm" onClick=${() => { respondToInvite(e.id, { status: 'declined' }); toast('Declined'); }}>Decline</button><button class="btn ghost sm" onClick=${() => go(`invite-${e.id}`)}>View</button></div></div>`)}</div></div>`}
    <div class="col"><div class="sec-head"><h2>Upcoming events</h2><button class="btn ghost sm" onClick=${() => go('events')}>See all<${Icon} name="right" size=${14} /></button></div>
      ${mine.length ? html`<div class="hscroll">${mine.map((x) => html`<${EventCard} key=${x.event.id} ...${x} />`)}</div>` : html`<div class="card"><${Empty} emoji="🎈" title="No events yet">Create your first event. It takes about a minute.${isCloud() && html`<div class="row wrap" style="justify-content:center;margin-top:10px"><button class="btn primary" onClick=${() => go('new')}><${Icon} name="plus" />Create event</button><${SamplesButton} label="Or explore the sample events" /></div>`}<//></div>`}</div>
    <div class="split">
      <div class="col gap-l">
        <div class="card col"><div class="row between"><h3>Tasks assigned to me</h3><button class="btn ghost sm" onClick=${() => go('mytasks')}>All ${tasks.length}<${Icon} name="right" size=${14} /></button></div>
          ${tasks.length ? html`<div class="list">${tasks.slice(0, 6).map((t) => html`<${TaskRow} key=${t.id} t=${t} showEvent onOpen=${setTask} />`)}</div>` : html`<${Empty} emoji="🌤️" title="Nothing on your plate">Tasks assigned to you in any event show up here.<//>`}</div>
        <div class="grid g3">${groups.map(([label, list]) => html`<div class="card col" key=${label}><div class="row between"><h3>${label}</h3><span class="pill num">${list.length}</span></div>
          ${list.length ? list.map(({ event: e, role }) => html`<button class="row" style="text-align:left" key=${e.id} onClick=${() => go(`e-${e.id}-overview`)}><span class=${'avatar c-' + e.cover.tone} style="border-radius:10px">${e.cover.emoji}</span><span class="col grow" style="gap:0"><b class="clip">${e.name}</b><span class="tiny muted">${inDays(e)}${label === 'Managing' ? ' · ' + ROLES[role].label : ''}</span></span></button>`) : html`<span class="small muted">None right now.</span>`}</div>`)}</div>
      </div>
      <div class="col gap-l">
        <div class="card col"><h3>Your next two weeks</h3>
          ${agenda.length ? agenda.slice(0, 9).map((a, i) => html`<button class="row top" style="text-align:left" key=${i} onClick=${() => (a.task ? setTask(a.task) : go(a.to))}><span class="col" style="width:46px;gap:0;flex:none"><b class="small">${daysUntil(a.date) < 0 ? 'Late' : fmtDate(a.date, { weekday: 'short' })}</b><span class="tiny muted num">${fmtDate(a.date, { day: 'numeric', month: 'short' })}</span></span>
            <span class=${'avatar sm c-' + a.tone} style="border-radius:8px">${a.icon}</span><span class="col grow" style="gap:0"><b class="small">${a.title}</b><span class="tiny muted">${a.sub}</span></span></button>`) : html`<p class="small muted">A quiet fortnight. Enjoy it.</p>`}</div>
        <div class="card col"><h3>Recent activity</h3>${feed.length ? feed.map((a) => html`<div class="row top small" key=${a.id}><${Avatar} id=${a.userId} size="sm" /><span class="grow"><b>${user(a.userId).name.split(' ')[0]}</b> ${a.text} <span class="tiny muted">· ${a.event.name} · ${ago(a.at)}</span></span></div>`) : html`<p class="small muted">Activity from events you help organise appears here.</p>`}</div>
      </div>
    </div>
    ${task && html`<${TaskModal} taskId=${task} onClose=${() => setTask(null)} />`}`;
}

export function Events() {
  const [f, setF] = useState('all'); const all = eventsFor();
  const match = { all: () => true, hosting: (r) => r === 'owner', managing: (r) => r === 'manager', team: (r) => ['lead', 'member', 'vendor'].includes(r), attending: (r) => r === 'guest' };
  const opts = [['all', 'All'], ['hosting', 'Hosting'], ['managing', 'Managing'], ['team', 'On a team'], ['attending', 'Attending']].map(([id, label]) => ({ id, label, n: all.filter((x) => match[id](x.role)).length }));
  const list = all.filter((x) => match[f](x.role));
  return html`<div class="sec-head"><h1>My Events</h1><button class="btn primary" onClick=${() => go('new')}><${Icon} name="plus" />Create event</button></div>
    <div class="chips scroll">${opts.map((o) => html`<button key=${o.id} class=${cx('chip', f === o.id && 'on')} onClick=${() => setF(o.id)}>${o.label} <span class="num">${o.n}</span></button>`)}</div>
    ${list.length ? html`<div class="grid g3">${list.map((x) => html`<${EventCard} key=${x.event.id} ...${x} />`)}</div>` : html`<div class="card"><${Empty} emoji="🗓️" title="No events in this view">Try another filter or create an event.<//></div>`}`;
}

export function MyTasks() {
  const [open, setOpen] = useState(null); const [ev, setEv] = useState('all'); const [showDone, setShowDone] = useState(false);
  const all = tasksFor(); const events = [...new Set(all.map((t) => t.eventId))].map(eventById);
  const list = all.filter((t) => ev === 'all' || t.eventId === ev).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')); const openTasks = list.filter((t) => t.status !== 'done'); const week = addDays(7);
  const groups = [['Overdue', openTasks.filter((t) => t.due && t.due < today()), 'coral'], ['Due this week', openTasks.filter((t) => t.due && t.due >= today() && t.due <= week), 'butter'], ['Later', openTasks.filter((t) => !t.due || t.due > week), 'grey']];
  const done = list.filter((t) => t.status === 'done');
  return html`<div class="sec-head"><div class="col" style="gap:4px"><h1>My Tasks</h1><p class="muted">Everything assigned to you, across every event. Tick things off right here.</p></div><span class="pill c-mint num">${done.length} of ${list.length} done</span></div>
    <div class="chips scroll"><button class=${cx('chip', ev === 'all' && 'on')} onClick=${() => setEv('all')}>All events <span class="num">${all.length}</span></button>${events.map((e) => html`<button key=${e.id} class=${cx('chip', ev === e.id && 'on')} onClick=${() => setEv(e.id)}>${e.cover.emoji} ${e.name}</button>`)}</div>
    ${!list.length && html`<div class="card"><${Empty} emoji="🌤️" title="No tasks assigned to you">When someone gives you a job in any event, it lands here.<//></div>`}
    ${groups.map(([label, items, tone]) => items.length > 0 && html`<div class="card col" key=${label}><div class="row"><h3>${label}</h3><${Pill} tone=${tone}>${items.length}<//></div><div class="list">${items.map((t) => html`<${TaskRow} key=${t.id} t=${t} showEvent onOpen=${setOpen} />`)}</div></div>`)}
    ${done.length > 0 && html`<div class="card col"><button class="row between" onClick=${() => setShowDone(!showDone)}><h3>Completed · ${done.length}</h3><${Icon} name=${showDone ? 'down' : 'right'} /></button>${showDone && html`<div class="list">${done.map((t) => html`<${TaskRow} key=${t.id} t=${t} showEvent onOpen=${setOpen} />`)}</div>`}</div>`}
    ${open && html`<${TaskModal} taskId=${open} onClose=${() => setOpen(null)} />`}`;
}

export function Inbox() {
  const list = notificationsFor(); const unread = list.filter((n) => !n.read).length;
  return html`<div class="sec-head"><div class="col" style="gap:4px"><h1>Notifications</h1><p class="muted">${unread ? `${unread} unread` : 'You’re all caught up.'} ${!isCloud() && html`<${Sim}>In-app only<//>`}</p></div>${unread > 0 && html`<button class="btn" onClick=${markAllRead}><${Icon} name="check" />Mark all read</button>`}</div>
    ${!list.length ? html`<div class="card"><${Empty} emoji="🔔" title="Nothing yet">Invitations, mentions and task changes appear here.<//></div>`
      : html`<div class="col gap-s">${list.map((n) => { const e = eventById(n.eventId); return html`<button key=${n.id} class=${cx('card click row', !n.read && 'unread')} onClick=${() => { markRead(n.id); if (n.link) go(n.link); }}>
        <span class=${'avatar lg c-' + (e?.cover.tone || 'grey')} style="border-radius:14px">${e?.cover.emoji || '🔔'}</span><span class="col grow" style="gap:1px"><span class=${cx(!n.read && 'b')}>${n.text}</span><span class="tiny muted">${e?.name || ''} · ${ago(n.at)}</span></span>${!n.read && html`<${Pill} tone="coral">New<//>`}</button>`; })}</div>`}`;
}

export function Profile({ onSwitch }) {
  const u = me(); const mine = eventsFor();
  return html`<div class="sec-head"><h1>Profile</h1></div>
    <div class="card row wrap"><${Avatar} id=${u.id} size="xl" /><div class="col grow" style="gap:2px;min-width:200px"><h2>${u.name}</h2><span class="muted">${u.email}</span>${u.bio && html`<span class="small">${u.bio}</span>`}</div>
      ${isCloud() ? html`<button class="btn" onClick=${async () => { await signOut(); location.hash = 'home'; location.reload(); }}><${Icon} name="left" />Sign out</button>`
        : html`<button class="btn primary" onClick=${onSwitch}><${Icon} name="swap" />Switch demo persona</button>`}</div>
    <div class="card col"><h3>Your roles</h3><p class="small muted">One account, a different role in each event.</p>
      <div class="list">${mine.map(({ event: e, role }) => html`<button class="row wrap" style="text-align:left" key=${e.id} onClick=${() => go(`e-${e.id}-overview`)}><span class=${'avatar c-' + e.cover.tone} style="border-radius:10px">${e.cover.emoji}</span>
        <span class="col grow" style="gap:0;min-width:160px"><b>${e.name}</b><span class="tiny muted">${fmtDate(e.date)} · ${myTeams(e.id).map((c) => c.icon + ' ' + c.name).join(', ') || ROLES[role].blurb}</span></span><${RolePill} role=${role} /></button>`)}</div>
      ${!mine.length && html`<span class="small muted">You are not part of any event yet.</span>`}</div>
    ${isCloud() ? html`<div class="card col"><h3>Your account</h3><p class="small muted">Signed in. Your events, guests, tasks and photos are saved to your ${BRAND.name} account and shared with the people in each event, according to their role. You send invitations yourself from each event’s People tab, by WhatsApp or email.</p>
        <div class="row wrap"><${SamplesButton} /></div></div><${FeedbackCard} /><${DeleteAccountCard} />`
      : html`<div class="card col"><h3>About this demo</h3><p class="small muted">You are using local sample data. Your changes are saved in this browser only. Emails, invitations, file uploads and reminders are imitated and marked <${Sim} />. Photos you add stay on this device.</p>
        <div class="row wrap"><${Confirm} label="Reset demo data" small=${false} onConfirm=${() => { resetDemo(); go('home'); toast('Demo data restored'); }} />
          ${cloudConfig() && html`<button class="btn primary" onClick=${() => { setMode(null); location.hash = 'home'; location.reload(); }}>Sign in to save for real</button>`}</div></div>
        ${!cloudConfig() && html`<div class="card col"><h3>Connect a backend</h3><p class="small muted">Point this copy at a Supabase project (with <code>supabase/schema.sql</code> applied) to get real accounts and shared data.</p><${ConnectBackend} /></div>`}`}`;
}

export function Invite({ eventId, token }) {
  const known = eventById(eventId); const [preview, setPreview] = useState(undefined);
  useEffect(() => { if (!known && isCloud()) invitePreview(eventId, token).then((p) => setPreview(p || null)).catch(() => setPreview(null)); }, [eventId, token, !!known]);
  if (!known && isCloud() && preview === undefined) return html`<div class="card"><${Empty} emoji="💌" title="Opening the invitation…"><//></div>`;
  if (!known && preview?.private) return html`<div class="card"><${Empty} emoji="🔒" title="This event is invite only">Ask the host to send you your personal invitation link.<//></div>`;
  const ev = known || (preview && { ...preview, cover: preview.cover?.tone ? preview.cover : { tone: 'lav', emoji: '🎉' }, features: preview.features || [] });
  if (!ev) return html`<div class="card"><${Empty} emoji="💌" title="This invitation is no longer available">The event may have been deleted.<//></div>`;
  const role = roleIn(eventId); const st = known ? rsvpStats(eventId) : { going: ev.going || 0, maybe: ev.maybe || 0 }; const inv = invitationFor(eventId); const host = known ? user(ev.createdBy) : { name: ev.hostName || 'The host' };
  return html`<div class="col gap-l" style="max-width:640px;margin:0 auto;width:100%">
    <div class="row between wrap"><span class="eyebrow">Invitation</span>${!isCloud() && html`<${Sim}>Link preview, viewed as ${me().name.split(' ')[0]}<//>`}</div>
    <div class="card col gap-l" style="padding:12px 12px 22px"><${Cover} ev=${ev} size="hero" />
      <div class="col" style="padding:0 10px;text-align:center;align-items:center"><span class="small muted">${!known && preview?.guestName ? `Hi ${preview.guestName.split(' ')[0]}, ` : ''}${host.name} invites you to</span><h1>${ev.name}</h1>
        <div class="row wrap" style="justify-content:center"><${Pill} tone="lav"><${Icon} name="calendar" size=${13} />${fmtLong(ev.date)}<//><${Pill} tone="butter"><${Icon} name="clock" size=${13} />${fmtTime(ev.start)}${ev.end ? '–' + fmtTime(ev.end) : ''}<//></div>
        <span class="row gap-s muted"><${Icon} name="pin" size=${15} />${ev.location || 'Location to be confirmed'}</span><p>${ev.description}</p>
        <span class="small muted">${st.going} going · ${st.maybe} maybe</span></div></div>
    ${role === 'owner' ? html`<div class="banner c-butter">This is what guests see when they open your link. You’re the host, so there is nothing to answer.</div>` : html`<${RsvpCard} ev=${ev} key=${meId()} />`}
    ${(role || inv) && html`<button class="btn primary" onClick=${() => go(`e-${ev.id}-overview`)}>Open the event<${Icon} name="right" /></button>`}
  </div>`;
}
