// Teams and committees: overview grid and a team page (members, tasks, budget, discussion, attachments).
import { html, useState } from '../lib.js';
import { TEAM_STATUS, TONES, COMPLEXITY } from '../config.js';
import { committeesOf, teamMembers, leadOf, tasksOf, progress, budgetOf, membersOf, postsOf, filesOf, createCommittee, updateCommittee, deleteCommittee, setTeamMember, removeTeamMember, postUpdate, has, roleIn, meId, user, ensureUser } from '../store.js';
import { can, canManageTeam, inTeam, canCreateTask, canSeePost } from '../permissions.js';
import { Icon, Avatar, Stack, Pill, StatusPill, Bar, Field, Modal, Confirm, Empty, UserSelect, toast, Person, Rich, Sim } from '../ui.js';
import { cx, money, ago } from '../utils.js';
import { TaskRow, TaskModal } from './tasks.js';

const ICONS = ['🍹', '🍕', '🎵', '🎈', '📣', '🤝', '⚙️', '🚚', '🎟️', '☕', '💷', '🎬', '🎤', '📸', '🧹', '🎁', '🚗', '⭐'];

function TeamModal({ ev, team, onClose }) {
  const word = COMPLEXITY[ev.complexity].teamWord.toLowerCase();
  const [d, setD] = useState(team ? { ...team } : { name: '', description: '', icon: '⭐', tone: 'lav', budget: '', leadId: null, group: '' });
  const people = membersOf(ev.id).filter((m) => m.role !== 'vendor').map((m) => m.userId);
  const used = committeesOf(ev.id).map((c) => c.name);
  const ideas = [...COMPLEXITY.simple.teams, ...COMPLEXITY.large.teams].filter(([n]) => !used.includes(n)).slice(0, ev.complexity === 'simple' ? 5 : 10);
  const save = () => { if (!d.name.trim()) return toast('Give the team a name');
    if (team) { updateCommittee(team.id, { name: d.name, description: d.description, icon: d.icon, tone: d.tone, budget: +d.budget || 0, group: d.group }); toast('Team updated'); }
    else { createCommittee(ev.id, d); toast(`${d.name} ${word} created`); } onClose(); };
  return html`<${Modal} title=${team ? 'Edit ' + word : 'New ' + word} eyebrow=${ev.name} onClose=${onClose}
    footer=${html`${team && html`<${Confirm} label=${'Delete ' + word} onConfirm=${() => { deleteCommittee(team.id); onClose(); }} /><span class="grow"></span>`}<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>${team ? 'Save' : 'Create'}</button>`}>
    ${!team && ideas.length > 0 && html`<div class="col gap-s"><span class="eyebrow">Quick start</span><div class="chips">${ideas.map(([name, icon, tone]) => html`<button class="chip" key=${name} onClick=${() => setD({ ...d, name, icon, tone })}>${icon} ${name}</button>`)}</div></div>`}
    <${Field} label="Name"><input class="input" value=${d.name} placeholder="e.g. Drinks" onInput=${(e) => setD({ ...d, name: e.target.value })} /><//>
    <${Field} label="What this team looks after"><textarea class="input" style="min-height:56px" value=${d.description} onInput=${(e) => setD({ ...d, description: e.target.value })}></textarea><//>
    <div class="col gap-s"><span class="eyebrow">Icon</span><div class="chips">${ICONS.map((i) => html`<button key=${i} class=${cx('chip', d.icon === i && 'on')} aria-label=${'Icon ' + i} onClick=${() => setD({ ...d, icon: i })}>${i}</button>`)}</div></div>
    <div class="col gap-s"><span class="eyebrow">Colour</span><div class="row">${TONES.map((t) => html`<button key=${t} aria-label=${t} class=${'c-' + t} style=${`width:34px;height:34px;border-radius:12px;background:var(--c);outline:${d.tone === t ? '3px solid var(--ink)' : 'none'};outline-offset:2px`} onClick=${() => setD({ ...d, tone: t })}></button>`)}</div></div>
    <div class="form-grid">
      ${!team && html`<${Field} label="Lead"><${UserSelect} value=${d.leadId} ids=${people} placeholder="Choose later" onChange=${(v) => setD({ ...d, leadId: v })} /><//>`}
      <${Field} label="Budget allocation"><input class="input" type="number" min="0" value=${d.budget} placeholder="0" onInput=${(e) => setD({ ...d, budget: e.target.value })} /><//>
      ${has(ev, 'groups') && html`<${Field} label="Department"><input class="input" value=${d.group} placeholder="e.g. Operations" onInput=${(e) => setD({ ...d, group: e.target.value })} /><//>`}
    </div>
  <//>`;
}

function TeamCard({ c, onOpen }) {
  const ev = { id: c.eventId }; const tasks = tasksOf(c.eventId).filter((t) => t.committeeId === c.id); const lead = leadOf(c.id); const ids = teamMembers(c.id).map((m) => m.userId);
  const b = can(c.eventId, 'viewBudget') && budgetOf(ev.id).teams.find((x) => x.committee.id === c.id);
  return html`<button class=${cx('card click col', 'c-' + c.tone)} onClick=${onOpen}>
    <div class="row top"><span style="font-size:1.6rem;width:46px;height:46px;border-radius:14px;background:var(--cs);display:grid;place-items:center;flex:none">${c.icon}</span>
      <div class="col grow" style="gap:1px"><h3>${c.name}</h3><span class="small muted">${lead ? 'Led by ' + user(lead).name : 'No lead yet'}</span></div><${StatusPill} list=${TEAM_STATUS} id=${c.status} /></div>
    ${c.description && html`<p class="small muted">${c.description}</p>`}
    <div class="col gap-s"><div class="row between small"><span class="b num">${tasks.filter((t) => t.status === 'done').length} of ${tasks.length} tasks done</span><span class="muted num">${progress(tasks)}%</span></div><${Bar} value=${progress(tasks)} tone=${c.tone} /></div>
    <div class="row between"><${Stack} ids=${ids} />${b && c.budget > 0 && html`<span class="small muted num">${money(b.actual)} of ${money(c.budget)} spent</span>`}</div>
  </button>`;
}

function TeamPage({ ev, c, onBack }) {
  const [edit, setEdit] = useState(false); const [task, setTask] = useState(null); const [text, setText] = useState(''); const [adding, setAdding] = useState('');
  const manage = canManageTeam(c); const member = inTeam(c.id); const tm = teamMembers(c.id).sort((a) => (a.role === 'lead' ? -1 : 1));
  const tasks = tasksOf(ev.id).filter((t) => t.committeeId === c.id); const role = roleIn(ev.id);
  const b = can(ev.id, 'viewBudget') && budgetOf(ev.id).teams.find((x) => x.committee.id === c.id);
  const posts = postsOf(ev.id).filter((p) => p.committeeId === c.id && canSeePost(p)); const files = filesOf(ev.id).filter((f) => f.committeeId === c.id);
  const inside = member || can(ev.id, 'viewInternal'); const candidates = membersOf(ev.id).filter((m) => m.role !== 'vendor' && !tm.some((x) => x.userId === m.userId)).map((m) => m.userId);
  const canVolunteer = !member && has(ev, 'volunteering') && ['guest', 'member', 'lead'].includes(role);
  const addPerson = () => { if (!adding.trim()) return; setTeamMember(c.id, ensureUser(adding)); setAdding(''); toast('Member added', true); };
  return html`<div class=${'col gap-l c-' + c.tone}>
    <div class="row wrap"><button class="btn sm" onClick=${onBack}><${Icon} name="left" size=${15} />All teams</button></div>
    <div class="card tint col"><div class="row top wrap"><span style="font-size:2.2rem">${c.icon}</span>
      <div class="col grow" style="gap:2px;min-width:200px"><div class="row wrap"><h2>${c.name}</h2>${c.group && html`<${Pill}>${c.group}<//>`}</div><p style="color:var(--ci)">${c.description || 'No description yet.'}</p></div>
      ${manage ? html`<select class="input sm" aria-label="Progress status" value=${c.status} onChange=${(e) => { updateCommittee(c.id, { status: e.target.value }); toast('Progress status updated'); }}>${TEAM_STATUS.map((s) => html`<option value=${s.id}>${s.label}</option>`)}</select><button class="btn sm" onClick=${() => setEdit(true)}><${Icon} name="edit" size=${15} />Edit</button>` : html`<${StatusPill} list=${TEAM_STATUS} id=${c.status} />`}
      ${canVolunteer && html`<button class="btn primary" onClick=${() => { setTeamMember(c.id, meId()); toast(`You joined ${c.name} 🙌`); }}>Volunteer for this team</button>`}</div>
      <div class="col gap-s"><div class="row between small"><span class="b">${tasks.filter((t) => t.status === 'done').length} of ${tasks.length} tasks done</span><span class="num">${progress(tasks)}%</span></div><${Bar} value=${progress(tasks)} tone=${c.tone} /></div></div>
    <div class="split">
      <div class="col gap-l">
        <div class="card col"><div class="row between"><h3>Tasks</h3>${(manage || canCreateTask(ev.id)) && html`<button class="btn sm" onClick=${() => setTask('new')}><${Icon} name="plus" size=${15} />Add task</button>`}</div>
          ${!inside && !tasks.some((t) => t.assigneeId === meId()) ? html`<p class="small muted">Join the team to see its tasks.</p>` : tasks.length ? html`<div class="list">${tasks.map((t) => html`<${TaskRow} key=${t.id} t=${t} onOpen=${setTask} />`)}</div>` : html`<${Empty} emoji="📝" title="No tasks yet">Add the first job for this team.<//>`}</div>
        ${inside && html`<div class="card col"><h3>Discussion and updates</h3>
          ${(member || manage) && html`<form class="row" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) { postUpdate(ev.id, { scope: 'team', committeeId: c.id, text: text.trim() }); setText(''); toast('Posted to the team'); } }}><input class="input" placeholder=${`Share progress with ${c.name}`} value=${text} onInput=${(e) => setText(e.target.value)} /><button class="btn primary sm">Post</button></form>`}
          ${posts.length ? html`<div class="list">${posts.map((p) => html`<div class="row top" key=${p.id}><${Avatar} id=${p.userId} /><div class="grow"><b>${user(p.userId).name}</b> <span class="tiny muted">${ago(p.at)}</span><div><${Rich} text=${p.text} /></div></div></div>`)}</div>` : html`<p class="small muted">Nothing posted yet. Only this team and the organisers can read this.</p>`}</div>`}
      </div>
      <div class="col gap-l">
        <div class="card col"><h3>Members</h3><div class="list">${tm.map((m) => html`<div class="row" key=${m.id}><div class="grow"><${Person} id=${m.userId} sub=${m.role === 'lead' ? 'Team lead' : 'Member'} /></div>
            ${manage && m.role !== 'lead' && html`<button class="btn ghost sm" title="Make lead" onClick=${() => { setTeamMember(c.id, m.userId, 'lead'); toast('Lead changed'); }}>Make lead</button><button class="btn ghost sm icon" aria-label="Remove" onClick=${() => removeTeamMember(c.id, m.userId)}><${Icon} name="x" size=${14} /></button>`}</div>`)}</div>
          ${!tm.length && html`<p class="small muted">No members yet.</p>`}
          ${manage && html`<div class="col gap-s"><${UserSelect} value="" ids=${candidates} placeholder="Add someone from this event…" onChange=${(v) => { if (v) { setTeamMember(c.id, v); toast('Member added'); } }} />
            <div class="row"><input class="input" placeholder="Or invite by name" value=${adding} onInput=${(e) => setAdding(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && addPerson()} /><button class="btn sm" onClick=${addPerson}>Invite</button></div></div>`}</div>
        ${b && html`<div class="card col"><h3>Budget</h3><div class="row between"><div class="stat"><span class="v">${money(b.actual)}</span><span class="k">spent of ${money(b.allocated)}</span></div><div class="stat" style="text-align:right"><span class="v">${money(b.allocated - b.planned)}</span><span class="k">unplanned</span></div></div>
          <div class="budget-bar"><i class="planned" style=${`width:${Math.min(100, (b.planned / (b.allocated || 1)) * 100)}%`}></i><i class="actual" style=${`width:${Math.min(100, (b.actual / (b.allocated || 1)) * 100)}%`}></i></div><span class="tiny muted">Solid is paid, pale is planned.</span></div>`}
        ${inside && html`<div class="card col"><h3>Attachments</h3>${files.length ? files.map((f) => html`<div class="row small" key=${f.id}><${Icon} name="file" /><span class="grow clip">${f.name}</span><span class="muted">${f.size}</span></div>`) : html`<p class="small muted">Files added to this team appear here.</p>`}</div>`}
      </div>
    </div>
    ${edit && html`<${TeamModal} ev=${ev} team=${c} onClose=${() => setEdit(false)} />`}
    ${task && html`<${TaskModal} taskId=${task === 'new' ? null : task} eventId=${ev.id} preset=${{ committeeId: c.id }} onClose=${() => setTask(null)} />`}
  </div>`;
}

export function Teams({ ev }) {
  const [open, setOpen] = useState(null); const [create, setCreate] = useState(false);
  const teams = committeesOf(ev.id); const word = COMPLEXITY[ev.complexity].teamWord; const cur = teams.find((c) => c.id === open);
  if (cur) return html`<${TeamPage} ev=${ev} c=${cur} onBack=${() => setOpen(null)} />`;
  const grouped = has(ev, 'groups') ? [...new Set(teams.map((c) => c.group || 'Other'))].map((g) => [g, teams.filter((c) => (c.group || 'Other') === g)]) : [['', teams]];
  const all = tasksOf(ev.id);
  return html`<div class="sec-head"><div class="row wrap"><h2>${word}s</h2><span class="pill c-mint num">${progress(all)}% of all tasks done</span></div>
      ${can(ev.id, 'manageTeams') && html`<button class="btn primary" onClick=${() => setCreate(true)}><${Icon} name="plus" />New ${word.toLowerCase()}</button>`}</div>
    ${roleIn(ev.id) === 'guest' && has(ev, 'volunteering') && html`<div class="banner c-mint">🙌 The host is looking for helpers. Open a ${word.toLowerCase()} to volunteer.</div>`}
    ${!teams.length ? html`<div class="card"><${Empty} emoji="🧩" title=${`No ${word.toLowerCase()}s yet`}>Split the work into small groups, each with a lead.<//></div>`
      : grouped.map(([g, list]) => html`<div class="col" key=${g}>${g && html`<div class="eyebrow">${g}</div>`}<div class="grid g3">${list.map((c) => html`<${TeamCard} key=${c.id} c=${c} onOpen=${() => setOpen(c.id)} />`)}</div></div>`)}
    ${create && html`<${TeamModal} ev=${ev} onClose=${() => setCreate(false)} />`}`;
}
