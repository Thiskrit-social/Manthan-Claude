// Task management: board, list and calendar views plus the task editor. Reused by My Tasks and team pages.
import { html, useState } from '../lib.js';
import { TASK_STATUS, PRIORITY, by } from '../config.js';
import { S, eventById, committeesOf, committee, membersOf, tasksOf, taskById, openDeps, progress, createTask, updateTask, deleteTask, commentTask, has, meId, user, isCloud } from '../store.js';
import { can, canEditTask, canUpdateTask, canCreateTask, visibleTasks, leadsTeam } from '../permissions.js';
import { Icon, Avatar, Pill, StatusPill, Bar, Seg, Field, Modal, Confirm, Tick, Checklist, UserSelect, Empty, toast, Sim } from '../ui.js';
import { cx, dueLabel, daysUntil, fmtDate, iso, today, ago } from '../utils.js';

export const Due = ({ t }) => { const late = t.due && t.status !== 'done' && daysUntil(t.due) < 0; return html`<span class=${cx('small nowrap num', late ? 'b' : 'muted')} style=${late ? 'color:var(--coral-ink)' : ''}>${t.status === 'done' && t.due ? fmtDate(t.due, { day: 'numeric', month: 'short' }) : dueLabel(t.due)}</span>`; };
export const TeamTag = ({ id }) => { const c = id && committee(id); return c ? html`<${Pill} tone=${c.tone}>${c.icon} ${c.name}<//>` : null; };
const Waiting = ({ t }) => { const d = openDeps(t); return d.length ? html`<span class="pill c-butter" title=${'Waiting on: ' + d.map((x) => x.title).join(', ')}><${Icon} name="chain" size=${13} />Waiting on ${d.length}</span>` : null; };
const StatusSelect = ({ t }) => html`<select class="input sm" aria-label="Status" value=${t.status} disabled=${!canUpdateTask(t)} onClick=${(e) => e.stopPropagation()} onChange=${(e) => updateTask(t.id, { status: e.target.value })}>${TASK_STATUS.map((s) => html`<option value=${s.id}>${s.label}</option>`)}</select>`;

// One task as a row. `showEvent` adds the event name (used by the personal task list).
export function TaskRow({ t, onOpen, showEvent }) {
  const ev = eventById(t.eventId); const done = t.status === 'done'; const subs = t.subtasks.length;
  return html`<div class="row" style="cursor:pointer" onClick=${() => onOpen(t.id)}>
    <${Tick} on=${done} disabled=${!canUpdateTask(t)} label=${'Complete ' + t.title} onClick=${() => updateTask(t.id, { status: done ? 'todo' : 'done' })} />
    <div class="col grow" style="gap:3px"><span class=${cx('b', done && 'done-text')}>${t.title}</span>
      <span class="row wrap gap-s">${showEvent && html`<span class="small muted">${ev.cover.emoji} ${ev.name}</span>`}<${TeamTag} id=${t.committeeId} />
        ${t.priority === 'high' && !done && html`<${Pill} tone="coral">High<//>`}${t.status === 'blocked' && html`<${StatusPill} list=${TASK_STATUS} id="blocked" />`}${t.status === 'doing' && html`<${StatusPill} list=${TASK_STATUS} id="doing" />`}
        <${Waiting} t=${t} />${subs > 0 && html`<span class="tiny muted num">${t.subtasks.filter((x) => x.done).length}/${subs} subtasks</span>`}</span></div>
    <${Due} t=${t} />${t.assigneeId && !showEvent && html`<${Avatar} id=${t.assigneeId} size="sm" />`}
  </div>`;
}

export function TaskModal({ taskId, eventId, preset = {}, onClose }) {
  const existing = taskId && taskById(taskId); const ev = eventById(existing?.eventId || eventId);
  const [draft, setDraft] = useState(() => ({ title: '', description: '', assigneeId: null, due: '', priority: 'medium', status: 'todo', subtasks: [], checklist: [], dependsOn: [],
    committeeId: can(ev.id, 'manageTasks') ? null : committeesOf(ev.id).find((c) => leadsTeam(c.id))?.id || null, ...preset }));
  const [comment, setComment] = useState('');
  if (taskId && !existing) return null;
  const t = existing || draft; const full = existing ? canEditTask(t) : true; const upd = existing ? canUpdateTask(t) : true;
  const set = (patch) => (existing ? updateTask(t.id, patch) : setDraft({ ...draft, ...patch }));
  const people = membersOf(ev.id).filter((m) => m.role !== 'guest').map((m) => m.userId);
  // Team leads without event-wide rights may only file tasks under the teams they lead.
  const teams = committeesOf(ev.id).filter((c) => can(ev.id, 'manageTasks') || leadsTeam(c.id) || c.id === t.committeeId);
  const others = tasksOf(ev.id).filter((x) => x.id !== t.id); const waiting = openDeps(t);
  const save = () => { if (!draft.title.trim()) return toast('Give the task a name first'); createTask(ev.id, draft); toast('Task added'); onClose(); };
  return html`<${Modal} wide title=${existing ? 'Task' : 'New task'} eyebrow=${ev.name} onClose=${onClose}
    footer=${existing ? html`${full && html`<${Confirm} onConfirm=${() => { deleteTask(t.id); onClose(); toast('Task deleted'); }} />`}<span class="grow"></span><button class="btn primary" onClick=${onClose}>Done</button>`
      : html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Add task</button>`}>
    ${existing && !full && html`<div class="banner c-sky"><${Icon} name="lock" />${upd ? 'You can update progress on this task. Only organisers and the team lead can change its details.' : 'You can view this task but not change it.'}</div>`}
    <input class="input" style="font:700 1.15rem var(--display)" placeholder="What needs doing?" value=${t.title} disabled=${!full} onInput=${(e) => set({ title: e.target.value })} />
    <div class="form-grid">
      <${Field} label="Status"><select class="input" value=${t.status} disabled=${!upd} onChange=${(e) => set({ status: e.target.value })}>${TASK_STATUS.map((s) => html`<option value=${s.id}>${s.label}</option>`)}</select><//>
      <${Field} label="Priority"><select class="input" value=${t.priority} disabled=${!full} onChange=${(e) => set({ priority: e.target.value })}>${PRIORITY.map((s) => html`<option value=${s.id}>${s.label}</option>`)}</select><//>
      <${Field} label="Due date"><input class="input" type="date" value=${t.due} disabled=${!full} onInput=${(e) => set({ due: e.target.value })} /><//>
      <${Field} label="Team"><select class="input" value=${t.committeeId || ''} disabled=${!full} onChange=${(e) => set({ committeeId: e.target.value || null })}>${(can(ev.id, 'manageTasks') || !teams.length) && html`<option value="">No team</option>`}${teams.map((c) => html`<option value=${c.id}>${c.icon} ${c.name}</option>`)}</select><//>
      <${Field} label="Responsible"><${UserSelect} value=${t.assigneeId} ids=${people} disabled=${!full} onChange=${(v) => set({ assigneeId: v })} /><//>
    </div>
    <${Field} label="Description"><textarea class="input" value=${t.description} disabled=${!full} placeholder="Add context, links or instructions" onInput=${(e) => set({ description: e.target.value })}></textarea><//>
    ${has(ev, 'dependencies') && html`<div class="col gap-s"><span class="eyebrow">Depends on</span>
      ${waiting.length > 0 && html`<div class="banner c-butter"><${Icon} name="chain" />Waiting on ${waiting.length} unfinished ${waiting.length === 1 ? 'task' : 'tasks'} before this can finish.</div>`}
      <div class="chips">${(t.dependsOn || []).map((id) => { const d = taskById(id); return d && html`<span class="chip" key=${id}><${StatusPill} list=${TASK_STATUS} id=${d.status} />${d.title}${full && html`<button aria-label="Remove dependency" onClick=${() => set({ dependsOn: t.dependsOn.filter((x) => x !== id) })}><${Icon} name="x" size=${13} /></button>`}</span>`; })}</div>
      ${full && html`<select class="input" value="" onChange=${(e) => e.target.value && set({ dependsOn: [...(t.dependsOn || []), e.target.value] })}><option value="">Add a task this one waits on…</option>${others.filter((x) => !(t.dependsOn || []).includes(x.id)).map((x) => html`<option value=${x.id}>${x.title}</option>`)}</select>`}</div>`}
    <div class="grid g2">
      <div class="col gap-s"><span class="eyebrow">Subtasks</span><${Checklist} items=${t.subtasks} canEdit=${full} canToggle=${upd} placeholder="Add a subtask" onChange=${(v) => set({ subtasks: v })} /></div>
      <div class="col gap-s"><span class="eyebrow">Checklist</span><${Checklist} items=${t.checklist} canEdit=${full} canToggle=${upd} placeholder="Add a checklist item" onChange=${(v) => set({ checklist: v })} /></div>
    </div>
    ${existing && html`
      <div class="col gap-s"><span class="eyebrow">Attachments</span>
        <div class="chips">${t.attachments.map((a, i) => html`<span class="chip" key=${i}><${Icon} name="file" size=${14} />${a}</span>`)}
          ${upd && !isCloud() && html`<label class="chip" style="cursor:pointer"><${Icon} name="upload" size=${14} />Attach a file<input type="file" hidden onChange=${(e) => { const f = e.target.files[0]; if (f) { set({ attachments: [...t.attachments, f.name] }); toast('Attached by name only', true); } }} /></label>`}</div></div>
      <div class="col gap-s"><span class="eyebrow">Comments</span>
        ${t.comments.map((c) => html`<div class="row top" key=${c.id}><${Avatar} id=${c.userId} size="sm" /><div class="grow"><b class="small">${user(c.userId).name}</b> <span class="tiny muted">${ago(c.at)}</span><div>${c.text}</div></div></div>`)}
        ${upd && html`<form class="row" onSubmit=${(e) => { e.preventDefault(); if (comment.trim()) { commentTask(t.id, comment.trim()); setComment(''); } }}><input class="input" placeholder="Write a comment" value=${comment} onInput=${(e) => setComment(e.target.value)} /><button class="btn sm" aria-label="Send"><${Icon} name="send" size=${15} /></button></form>`}</div>`}
  <//>`;
}

function Board({ tasks, onOpen }) {
  const [over, setOver] = useState(null);
  return html`<div class="board">${TASK_STATUS.map((s) => { const col = tasks.filter((t) => t.status === s.id); return html`
    <div key=${s.id} class=${cx('lane', over === s.id && 'over')} onDragOver=${(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave=${() => setOver(null)}
      onDrop=${(e) => { e.preventDefault(); setOver(null); const t = taskById(e.dataTransfer.getData('text/plain')); if (t && canUpdateTask(t) && t.status !== s.id) updateTask(t.id, { status: s.id }); }}>
      <div class="row between" style="padding:2px 4px"><${StatusPill} list=${TASK_STATUS} id=${s.id} /><span class="small muted num">${col.length}</span></div>
      ${col.map((t) => { const c = t.committeeId && committee(t.committeeId); return html`
        <div key=${t.id} class=${cx('tcard', c && 'c-' + c.tone)} role="button" tabindex="0" draggable=${canUpdateTask(t)} onDragStart=${(e) => e.dataTransfer.setData('text/plain', t.id)} onClick=${() => onOpen(t.id)} onKeyDown=${(e) => e.key === 'Enter' && onOpen(t.id)}>
          <b>${t.title}</b>
          <div class="row wrap gap-s"><${TeamTag} id=${t.committeeId} />${t.priority === 'high' && html`<${Pill} tone="coral">High<//>`}<${Waiting} t=${t} /></div>
          ${t.subtasks.length > 0 && html`<${Bar} value=${progress(t.subtasks.map((x) => ({ status: x.done ? 'done' : '' })))} />`}
          <div class="row between"><${Due} t=${t} /><span class="row gap-s">${t.comments.length > 0 && html`<span class="tiny muted row" style="gap:3px"><${Icon} name="message" size=${13} />${t.comments.length}</span>`}${t.assigneeId && html`<${Avatar} id=${t.assigneeId} size="sm" />`}</span></div>
          <${StatusSelect} t=${t} />
        </div>`; })}
      ${!col.length && html`<div class="tiny muted" style="text-align:center;padding:14px 0">Nothing here</div>`}
    </div>`; })}</div>`;
}

function Calendar({ ev, tasks, onOpen }) {
  const [offset, setOffset] = useState(0);
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + offset);
  const first = new Date(base); first.setDate(1 - ((base.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  return html`<div class="col">
    <div class="row between"><h3>${base.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h3>
      <div class="row gap-s"><button class="btn sm icon" aria-label="Previous month" onClick=${() => setOffset(offset - 1)}><${Icon} name="left" /></button><button class="btn sm" onClick=${() => setOffset(0)}>Today</button><button class="btn sm icon" aria-label="Next month" onClick=${() => setOffset(offset + 1)}><${Icon} name="right" /></button></div></div>
    <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => html`<div class="dow">${d}</div>`)}
      ${days.map((d) => { const k = iso(d); const list = tasks.filter((t) => t.due === k); return html`<div key=${k} class=${cx('day', d.getMonth() !== base.getMonth() && 'out', k === today() && 'today', k === ev.date && 'evday')}>
        <span class="num muted b">${d.getDate()}${k === ev.date ? ' ' + ev.cover.emoji : ''}</span>
        ${list.slice(0, 3).map((t) => html`<button key=${t.id} class=${cx('ev', 'c-' + (committee(t.committeeId)?.tone || 'grey'), t.status === 'done' && 'done-text')} title=${t.title} onClick=${() => onOpen(t.id)}>${t.title}</button>`)}
        ${list.length > 3 && html`<span class="tiny muted">+${list.length - 3} more</span>`}</div>`; })}</div>
    <span class="tiny muted">The highlighted day is the event itself.</span></div>`;
}

export function Tasks({ ev }) {
  const [view, setView] = useState(ev.taskView || 'list'); const [team, setTeam] = useState('all'); const [mine, setMine] = useState(false); const [open, setOpen] = useState(null);
  const all = visibleTasks(ev.id); const teams = committeesOf(ev.id); const restricted = !can(ev.id, 'viewTasks');
  const tasks = all.filter((t) => (team === 'all' || (team === 'none' ? !t.committeeId : t.committeeId === team)) && (!mine || t.assigneeId === meId()));
  const views = [{ id: 'board', label: 'Board', icon: 'board' }, { id: 'list', label: 'List', icon: 'list' }, ...(has(ev, 'calendar') ? [{ id: 'calendar', label: 'Calendar', icon: 'calendar' }] : [])];
  const groups = [['Open', tasks.filter((t) => t.status !== 'done').sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))], ['Completed', tasks.filter((t) => t.status === 'done')]];
  return html`
    <div class="sec-head"><div class="row wrap"><h2>Tasks</h2><span class="pill c-mint num">${progress(all)}% done</span></div>
      <div class="row wrap"><${Seg} value=${view} onChange=${setView} options=${views} />${canCreateTask(ev.id) && html`<button class="btn primary" onClick=${() => setOpen('new')}><${Icon} name="plus" />New task</button>`}</div></div>
    ${restricted && html`<div class="banner c-sky"><${Icon} name="lock" />You see only the tasks assigned to you in this event.</div>`}
    <div class="chips scroll"><button class=${cx('chip', mine && 'on')} onClick=${() => setMine(!mine)}>Assigned to me</button>
      <button class=${cx('chip', team === 'all' && 'on')} onClick=${() => setTeam('all')}>All teams</button>
      ${teams.map((c) => html`<button key=${c.id} class=${cx('chip', team === c.id && 'on')} onClick=${() => setTeam(c.id)}>${c.icon} ${c.name}</button>`)}
      <button class=${cx('chip', team === 'none' && 'on')} onClick=${() => setTeam('none')}>No team</button></div>
    ${!tasks.length ? html`<div class="card"><${Empty} emoji="✅" title="No tasks here yet">Add the first one to get things moving.<//></div>`
      : view === 'board' ? html`<${Board} tasks=${tasks} onOpen=${setOpen} />`
      : view === 'calendar' ? html`<${Calendar} ev=${ev} tasks=${tasks} onOpen=${setOpen} />`
      : groups.map(([label, list]) => list.length > 0 && html`<div class="card" key=${label}><div class="eyebrow">${label} · ${list.length}</div><div class="list">${list.map((t) => html`<${TaskRow} key=${t.id} t=${t} onOpen=${setOpen} />`)}</div></div>`)}
    ${open && html`<${TaskModal} taskId=${open === 'new' ? null : open} eventId=${ev.id} preset=${team !== 'all' && team !== 'none' ? { committeeId: team } : {}} onClose=${() => setOpen(null)} />`}`;
}
