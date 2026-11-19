// Event workspace: header, section tabs, Overview and Setup. Every event renders through this one component;
// what differs between a house party and a conference is the event's modules, features and permissions.
import { html, useState, useEffect } from '../lib.js';
import { SECTIONS, COMPLEXITY, FEATURES, CAPS, PRIVACY, CATEGORIES, category, RSVP, by } from '../config.js';
import { eventById, roleIn, rsvpStats, tasksOf, progress, scheduleOf, postsOf, activityOf, committeesOf, invitationsOf, invitationFor, budgetOf, updateEvent, setComplexity, toggleIn, deleteEvent, has, user, meId, mediaOf, isCloud } from '../store.js';
import { can, sectionsFor, visibleTasks, canSeePost, canCreateTask, isOwner } from '../permissions.js';
import { go, Icon, Avatar, Stack, Pill, RolePill, Bar, Cover, When, Field, Switch, Confirm, Empty, toast, Rich } from '../ui.js';
import { cx, fmtLong, fmtTime, fmtDate, parse, ago, money, daysUntil } from '../utils.js';
import { People, RsvpCard } from './people.js';
import { Teams } from './teams.js';
import { Tasks, TaskRow, TaskModal } from './tasks.js';
import { Schedule, Budget } from './plan.js';
import { Gallery, PermTable } from './gallery.js';
import { Updates, Files } from './feed.js';
import { NoteBanner, BringListCard } from './extras.js';
import { Planner, PlannerNudge } from './planner.js';

function Countdown({ ev }) {
  const [, tick] = useState(0); useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const ms = parse(ev.date, ev.start) - Date.now(); if (ms <= 0) return html`<${Pill} tone="mint">${daysUntil(ev.date) === 0 ? 'Happening today 🎉' : 'This event has happened'}<//>`;
  const d = Math.floor(ms / 864e5); const h = Math.floor((ms % 864e5) / 36e5); const m = Math.floor((ms % 36e5) / 6e4);
  return html`<div class="count-down" aria-label=${`${d} days ${h} hours until the event`}><div><b>${d}</b><span class="tiny muted">days</span></div><div><b>${h}</b><span class="tiny muted">hours</span></div><div><b>${m}</b><span class="tiny muted">mins</span></div></div>`;
}

function Overview({ ev, sections }) {
  const [task, setTask] = useState(null); const id = ev.id; const role = roleIn(id); const st = rsvpStats(id); const simple = ev.complexity === 'simple';
  const showPeople = sections.includes('people'); const tasks = visibleTasks(id); const mine = tasks.filter((t) => t.assigneeId === meId() && t.status !== 'done');
  const next = scheduleOf(id).filter((s) => parse(s.date, s.end || s.start) >= Date.now()).slice(0, 4);
  const posts = postsOf(id).filter(canSeePost).slice(0, 3); const teams = sections.includes('teams') && can(id, 'viewTeams') ? committeesOf(id) : [];
  const going = invitationsOf(id).filter((i) => i.rsvp.status === 'going'); const arrivals = going.filter((i) => i.rsvp.arrival).sort((a, b) => a.rsvp.arrival.localeCompare(b.rsvp.arrival));
  const blocked = tasks.filter((t) => t.status === 'blocked'); const late = tasks.filter((t) => t.due && t.status !== 'done' && daysUntil(t.due) < 0);
  const actions = [showPeople && can(id, 'manageGuests') && ['people', 'users', 'Invite guests', 'lav'], canCreateTask(id) && ['tasks', 'tasks', 'Add a task', 'sky'],
    sections.includes('updates') && ['updates', 'megaphone', 'Post an update', 'butter'], sections.includes('gallery') && ['gallery', 'camera', 'Add a photo', 'coral'],
    can(id, 'manageSchedule') && ['schedule', 'clock', 'Plan the day', 'mint'], sections.includes('budget') && ['budget', 'wallet', 'Record expense', 'mint']].filter(Boolean).slice(0, 4);
  return html`
    ${ev.guestNote && html`<${NoteBanner} text=${ev.guestNote} at=${ev.guestNoteAt} host=${user(ev.createdBy).name} />`}
    ${invitationFor(id) && role !== 'owner' && html`<${RsvpCard} ev=${ev} />`}
    ${invitationFor(id) && !can(id, 'manageGuests') && invitationFor(id).rsvp.status !== 'declined' && html`<${BringListCard} ev=${ev} />`}
    ${sections.includes('planner') && html`<${PlannerNudge} ev=${ev} />`}
    <div class="split">
      <div class="col gap-l">
        <div class=${'card tint col c-' + ev.cover.tone}><div class="row between wrap"><div class="col" style="gap:4px"><div class="eyebrow" style="color:var(--ci)">Countdown</div><${Countdown} ev=${ev} /></div>
          <div class="col small" style="gap:4px;color:var(--ci)"><span class="row gap-s"><${Icon} name="calendar" size=${15} />${fmtLong(ev.date)}</span><span class="row gap-s"><${Icon} name="clock" size=${15} />${fmtTime(ev.start)}${ev.end ? ' to ' + fmtTime(ev.end) : ''}</span><span class="row gap-s"><${Icon} name="pin" size=${15} />${ev.location || 'Location to be confirmed'}</span></div></div>
          ${ev.description && html`<p style="color:var(--ci)">${ev.description}</p>`}</div>
        ${(showPeople || tasks.length > 0) && html`<div class="grid g4">
          ${showPeople && html`<button class="card click stat" onClick=${() => go(`e-${id}-people`)}><span class="v">${st.invited}</span><span class="k">Invited</span></button>
            <button class="card click stat" onClick=${() => go(`e-${id}-people`)}><span class="v">${st.going}</span><span class="k">Confirmed${st.headcount > st.going ? ` · ${st.headcount} with +1s` : ''}</span></button>
            <button class="card click stat" onClick=${() => go(`e-${id}-people`)}><span class="v">${st.pending + st.maybe}</span><span class="k">Pending RSVPs</span></button>`}
          ${sections.includes('tasks') && html`<button class="card click stat" onClick=${() => go(`e-${id}-tasks`)}><span class="v">${progress(tasks)}%</span><span class="k">${can(id, 'viewTasks') ? 'Tasks complete' : 'Of your tasks done'}</span><${Bar} value=${progress(tasks)} /></button>`}</div>`}
        ${actions.length > 0 && html`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">${actions.map(([s, icon, label, tone]) => html`<button key=${s + label} class=${'qa c-' + tone} onClick=${() => go(`e-${id}-${s}`)}><${Icon} name=${icon} size=${22} />${label}</button>`)}</div>`}
        ${!simple && can(id, 'viewTasks') && (blocked.length > 0 || late.length > 0) && html`<div class="card col"><div class="row between"><h3>Needs attention</h3><${Pill} tone="coral">${blocked.length} blocked · ${late.length} overdue<//></div><div class="list">${[...new Set([...blocked, ...late])].slice(0, 5).map((t) => html`<${TaskRow} key=${t.id} t=${t} onOpen=${setTask} />`)}</div></div>`}
        ${mine.length > 0 && html`<div class="card col"><div class="row between"><h3>Your tasks here</h3><button class="btn ghost sm" onClick=${() => go(`e-${id}-tasks`)}>All tasks<${Icon} name="right" size=${14} /></button></div><div class="list">${mine.slice(0, 5).map((t) => html`<${TaskRow} key=${t.id} t=${t} onOpen=${setTask} />`)}</div></div>`}
        ${teams.length > 0 && html`<div class="card col"><div class="row between"><h3>${COMPLEXITY[ev.complexity].teamWord} progress</h3><button class="btn ghost sm" onClick=${() => go(`e-${id}-teams`)}>Open<${Icon} name="right" size=${14} /></button></div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))">${teams.map((c) => { const ts = tasksOf(id).filter((t) => t.committeeId === c.id); return html`<div class=${'col gap-s c-' + c.tone} key=${c.id}><div class="row between small"><b>${c.icon} ${c.name}</b><span class="muted num">${ts.filter((t) => t.status === 'done').length}/${ts.length}</span></div><${Bar} value=${progress(ts)} tone=${c.tone} /></div>`; })}</div></div>`}
      </div>
      <div class="col gap-l">
        ${simple && showPeople && going.length > 0 && html`<div class="card col"><h3>Who’s coming</h3><${Stack} ids=${going.map((i) => i.userId).filter(Boolean)} max=${9} />
          ${arrivals.length > 0 && html`<div class="col gap-s"><span class="eyebrow">Expected arrivals</span>${arrivals.slice(0, 6).map((i) => html`<div class="row small" key=${i.id}><b class="num" style="width:58px">${fmtTime(i.rsvp.arrival)}</b><span class="grow">${i.name}${i.rsvp.plusOne ? ' +1' : ''}</span>${i.rsvp.dietary && html`<${Pill} tone="butter">${i.rsvp.dietary}<//>`}</div>`)}</div>`}</div>`}
        <div class="card col"><div class="row between"><h3>Coming up</h3><button class="btn ghost sm" onClick=${() => go(`e-${id}-schedule`)}>Schedule<${Icon} name="right" size=${14} /></button></div>
          ${next.length ? next.map((s) => html`<div class="row top" key=${s.id}><b class="num small" style="width:58px">${fmtTime(s.start)}</b><div class="col grow" style="gap:0"><b>${s.title}</b><span class="tiny muted">${s.date !== ev.date ? fmtDate(s.date) + ' · ' : ''}${s.location}</span></div>${s.ownerId && html`<${Avatar} id=${s.ownerId} size="sm" />`}</div>`) : html`<p class="small muted">Nothing scheduled yet.</p>`}</div>
        <div class="card col"><div class="row between"><h3>Recent updates</h3><button class="btn ghost sm" onClick=${() => go(`e-${id}-updates`)}>All<${Icon} name="right" size=${14} /></button></div>
          ${posts.length ? posts.map((p) => html`<div class="row top" key=${p.id}><${Avatar} id=${p.userId} size="sm" /><div class="grow small"><b>${user(p.userId).name}</b> <span class="tiny muted">${ago(p.at)}</span><div style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden"><${Rich} text=${p.text} /></div></div></div>`) : html`<p class="small muted">No announcements yet.</p>`}</div>
        ${can(id, 'viewInternal') && activityOf(id).length > 0 && html`<div class="card col"><h3>Activity</h3>${activityOf(id).slice(0, 6).map((a) => html`<div class="small" key=${a.id}><b>${user(a.userId).name.split(' ')[0]}</b> ${a.text} <span class="tiny muted">${ago(a.at)}</span></div>`)}</div>`}
      </div>
    </div>
    ${task && html`<${TaskModal} taskId=${task} onClose=${() => setTask(null)} />`}`;
}

function Setup({ ev }) {
  const [d, setD] = useState({ name: ev.name, description: ev.description, date: ev.date, start: ev.start, end: ev.end, location: ev.location, expected: ev.expected, privacy: ev.privacy, category: ev.category });
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value }); const groups = [...new Set(CAPS.map((c) => c.group))];
  return html`<div class="sec-head"><h2>Workspace setup</h2><${Pill} tone="butter">Owner only<//></div>
    <div class="card col"><h3>Workspace size</h3><p class="small muted">Change this any time. Moving up adds sections and tools. Nothing you have made is ever removed.</p>
      <div class="grid g3">${Object.entries(COMPLEXITY).map(([k, c]) => html`<button key=${k} class=${cx('pick', ev.complexity === k && 'on')} onClick=${() => { if (ev.complexity !== k) { setComplexity(ev.id, k); toast(`Workspace is now ${c.label}`); } }}><span style="font-size:1.5rem">${c.emoji}</span><b>${c.label} event</b><span class="small muted">${c.blurb}</span></button>`)}</div></div>
    <div class="grid g2">
      <div class="card col"><h3>Sections</h3>${SECTIONS.filter((s) => !['overview', 'planner', 'setup'].includes(s.id) && !(isCloud() && s.id === 'files')).map((s) => html`<div class="row" key=${s.id}><${Icon} name=${s.icon} /><b class="grow">${s.label}</b><${Switch} on=${ev.modules.includes(s.id)} label=${s.label} onChange=${() => toggleIn(ev.id, 'modules', s.id)} /></div>`)}</div>
      <div class="card col"><h3>Extra tools</h3>${FEATURES.map((f) => html`<div class="row" key=${f.id}><div class="col grow" style="gap:0"><b>${f.label}</b><span class="tiny muted">${f.hint}</span></div><${Switch} on=${has(ev, f.id)} label=${f.label} onChange=${() => toggleIn(ev.id, 'features', f.id)} /></div>`)}</div>
    </div>
    <div class="card col"><h3>Roles and permissions</h3><p class="small muted">Permissions apply to this event only. Owners can always do everything. Being invited never unlocks budgets, internal discussions or contracts unless you switch it on here.</p>
      ${groups.map((g) => html`<div class="col gap-s" key=${g}><div class="eyebrow">${g}</div><${PermTable} ev=${ev} caps=${CAPS.filter((c) => c.group === g).map((c) => c.id)} /></div>`)}</div>
    <div class="card col"><h3>Event details</h3>
      <div class="form-grid"><${Field} label="Name"><input class="input" value=${d.name} onInput=${set('name')} /><//><${Field} label="Category"><select class="input" value=${d.category} onChange=${set('category')}>${CATEGORIES.map((c) => html`<option value=${c.id}>${c.emoji} ${c.label}</option>`)}</select><//>
        <${Field} label="Date"><input class="input" type="date" value=${d.date} onInput=${set('date')} /><//><${Field} label="Starts"><input class="input" type="time" value=${d.start} onInput=${set('start')} /><//><${Field} label="Ends"><input class="input" type="time" value=${d.end} onInput=${set('end')} /><//>
        <${Field} label="Expected attendance"><input class="input" type="number" value=${d.expected} onInput=${set('expected')} /><//><${Field} label="Privacy"><select class="input" value=${d.privacy} onChange=${set('privacy')}>${PRIVACY.map((p) => html`<option value=${p.id}>${p.label}</option>`)}</select><//></div>
      <${Field} label="Location"><input class="input" value=${d.location} onInput=${set('location')} /><//><${Field} label="Description"><textarea class="input" value=${d.description} onInput=${set('description')}></textarea><//>
      <div class="row between wrap"><${Confirm} label="Delete this event" small=${false} onConfirm=${() => { deleteEvent(ev.id); go('events'); toast('Event deleted'); }} /><button class="btn primary" onClick=${() => { updateEvent(ev.id, { ...d, expected: +d.expected || 0 }); toast('Event details saved'); }}>Save details</button></div></div>`;
}

const VIEWS = { planner: Planner, people: People, teams: Teams, tasks: Tasks, schedule: Schedule, budget: Budget, gallery: Gallery, updates: Updates, files: Files, setup: Setup };

export function Workspace({ eventId, section }) {
  const ev = eventById(eventId); const role = ev && roleIn(eventId);
  if (!ev || !role) return html`<div class="card"><${Empty} emoji="🔒" title=${ev ? 'You are not part of this event' : 'This event does not exist'}>${ev ? 'Ask the host for an invitation.' : 'It may have been deleted.'}<div style="margin-top:8px"><button class="btn primary" onClick=${() => go(ev ? `invite-${ev.id}` : 'events')}>${ev ? 'Open the invitation' : 'Back to my events'}</button></div><//></div>`;
  const sections = sectionsFor(ev); const cur = sections.includes(section) ? section : 'overview'; const View = VIEWS[cur]; const cat = category(ev.category);
  const label = (s) => (s.id === 'teams' ? COMPLEXITY[ev.complexity].teamWord + 's' : s.label);
  return html`<div class="ws-head">
      <${Cover} ev=${ev} size=${cur === 'overview' ? 'hero' : 'sm'} />
      <div class="ws-title"><div class="col grow" style="gap:6px;min-width:220px"><div class="row wrap gap-s"><${Pill} tone=${cat.tone}>${cat.emoji} ${cat.label}<//><${Pill}>${COMPLEXITY[ev.complexity].label} workspace<//><${RolePill} role=${role} /></div><h1>${ev.name}</h1>
        <span class="row wrap small muted"><${When} ev=${ev} /><span class="clip">${ev.location}</span></span></div></div>
      <nav class="ws-tabs" aria-label="Event sections">${SECTIONS.filter((s) => sections.includes(s.id)).map((s) => html`<button key=${s.id} class=${cx('ws-tab', cur === s.id && 'on')} onClick=${() => { location.hash = `e-${ev.id}-${s.id}`; }}><${Icon} name=${s.icon} size=${16} />${label(s)}</button>`)}</nav>
    </div>
    ${cur === 'overview' ? html`<${Overview} ev=${ev} sections=${sections} />` : html`<${View} ev=${ev} key=${cur} />`}`;
}
