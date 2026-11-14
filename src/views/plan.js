// Schedule (event timeline) and Budget.
import { html, useState } from '../lib.js';
import { scheduleOf, budgetOf, expensesOf, committeesOf, committee, membersOf, addItem, updateItem, removeItem, updateEvent, user, meId, isCloud } from '../store.js';
import { can, canAddExpense, leadsTeam } from '../permissions.js';
import { Icon, Avatar, Pill, Field, Modal, Confirm, Empty, UserSelect, Checklist, toast, Sim } from '../ui.js';
import { cx, fmtDate, fmtTime, money, pct, today } from '../utils.js';

function ActivityModal({ ev, item, onClose }) {
  const [d, setD] = useState(item ? { ...item } : { title: '', date: ev.date, start: ev.start, end: '', location: '', description: '', ownerId: null, checklist: [], reminder: 0 });
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value }); const ids = membersOf(ev.id).filter((m) => m.role !== 'guest').map((m) => m.userId);
  const save = () => { if (!d.title.trim()) return toast('Name the activity first'); const { id, eventId, userId, at, ...rest } = d; rest.reminder = +rest.reminder;
    if (item) updateItem('scheduleItems', item.id, rest); else addItem('scheduleItems', ev.id, rest, `added “${d.title}” to the schedule`); toast(item ? 'Activity updated' : 'Added to the schedule'); onClose(); };
  return html`<${Modal} title=${item ? 'Edit activity' : 'Add an activity'} eyebrow=${ev.name} onClose=${onClose}
    footer=${html`${item && html`<${Confirm} onConfirm=${() => { removeItem('scheduleItems', item.id); onClose(); }} /><span class="grow"></span>`}<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>${item ? 'Save' : 'Add activity'}</button>`}>
    <${Field} label="Activity"><input class="input" value=${d.title} placeholder="e.g. Welcome drinks" onInput=${set('title')} /><//>
    <div class="form-grid"><${Field} label="Date"><input class="input" type="date" value=${d.date} onInput=${set('date')} /><//>
      <${Field} label="Starts"><input class="input" type="time" value=${d.start} onInput=${set('start')} /><//><${Field} label="Ends"><input class="input" type="time" value=${d.end} onInput=${set('end')} /><//>
      <${Field} label="Location"><input class="input" value=${d.location} onInput=${set('location')} /><//>
      <${Field} label="Responsible"><${UserSelect} value=${d.ownerId} ids=${ids} onChange=${(v) => setD({ ...d, ownerId: v })} /><//>
      <${Field} label="Reminder" hint="Shown in the app only."><select class="input" value=${d.reminder} onChange=${set('reminder')}><option value="0">None</option><option value="10">10 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option></select><//></div>
    <${Field} label="Description"><textarea class="input" style="min-height:56px" value=${d.description} onInput=${set('description')}></textarea><//>
    <div class="col gap-s"><span class="eyebrow">Checklist</span><${Checklist} items=${d.checklist} onChange=${(v) => setD({ ...d, checklist: v })} /></div>
  <//>`;
}

export function Schedule({ ev }) {
  const [open, setOpen] = useState(null); const items = scheduleOf(ev.id); const manage = can(ev.id, 'manageSchedule');
  const days = [...new Set(items.map((i) => i.date))]; const tones = ['lav', 'coral', 'mint', 'butter', 'sky'];
  return html`<div class="sec-head"><div class="row wrap"><h2>Schedule</h2><span class="pill num">${items.length} activities</span></div>${manage && html`<button class="btn primary" onClick=${() => setOpen('new')}><${Icon} name="plus" />Add activity</button>`}</div>
    ${!items.length ? html`<div class="card"><${Empty} emoji="🕰️" title="The timeline is empty">Add what happens and when, from set-up to the last song.<//></div>`
      : days.map((day) => html`<div class="col" key=${day}><div class="row"><h3>${fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>${day === ev.date ? html`<${Pill} tone="butter">Event day<//>` : day < ev.date && html`<${Pill}>Before the event<//>`}</div>
        <div class="tl">${items.filter((i) => i.date === day).map((i, n) => { const done = i.checklist.filter((c) => c.done).length; return html`
          <div class=${'tl-item c-' + tones[n % 5]} key=${i.id}><span class="tl-time">${fmtTime(i.start)}</span>
            <div class=${cx('card col gap-s', manage && 'click')} onClick=${() => manage && setOpen(i.id)}>
              <div class="row between top"><h3>${i.title}</h3>${i.ownerId && html`<${Avatar} id=${i.ownerId} size="sm" />`}</div>
              <div class="row wrap small muted"><span class="row gap-s"><${Icon} name="clock" size=${14} />${fmtTime(i.start)}${i.end ? '–' + fmtTime(i.end) : ''}</span>${i.location && html`<span class="row gap-s"><${Icon} name="pin" size=${14} />${i.location}</span>`}
                ${i.ownerId && html`<span>${user(i.ownerId).name}</span>`}${i.reminder > 0 && html`<span class="row gap-s"><${Icon} name="bell" size=${14} />${i.reminder} min before</span>`}</div>
              ${i.description && html`<p class="small">${i.description}</p>`}
              ${i.checklist.length > 0 && html`<div onClick=${(e) => e.stopPropagation()}><${Checklist} items=${i.checklist} canEdit=${false} canToggle=${manage || i.ownerId === meId()} onChange=${(v) => updateItem('scheduleItems', i.id, { checklist: v })} /><span class="tiny muted num">${done} of ${i.checklist.length} ready</span></div>`}
            </div></div>`; })}</div></div>`)}
    ${open && html`<${ActivityModal} ev=${ev} item=${open === 'new' ? null : items.find((i) => i.id === open)} onClose=${() => setOpen(null)} />`}`;
}

function ExpenseModal({ ev, item, onClose }) {
  const all = can(ev.id, 'manageBudget'); const teams = committeesOf(ev.id).filter((c) => all || leadsTeam(c.id));
  const [d, setD] = useState(item ? { ...item } : { title: '', description: '', amount: '', status: 'planned', committeeId: all ? null : teams[0]?.id || null, paidBy: null, date: today(), receipt: '' });
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value }); const ids = membersOf(ev.id).filter((m) => m.role !== 'guest').map((m) => m.userId);
  const save = () => { if (!d.title.trim() || !(+d.amount > 0)) return toast('Add a description and an amount'); const { id, eventId, userId, at, ...rest } = d; rest.amount = +rest.amount;
    if (item) updateItem('expenses', item.id, rest); else addItem('expenses', ev.id, rest, `recorded an expense: ${d.title}`); toast(item ? 'Expense updated' : 'Expense recorded'); onClose(); };
  return html`<${Modal} title=${item ? 'Edit expense' : 'Record an expense'} eyebrow=${ev.name} onClose=${onClose}
    footer=${html`${item && html`<${Confirm} onConfirm=${() => { removeItem('expenses', item.id); onClose(); }} /><span class="grow"></span>`}<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>${item ? 'Save' : 'Record expense'}</button>`}>
    <${Field} label="What was it for?"><input class="input" value=${d.title} placeholder="e.g. Pizza order" onInput=${set('title')} /><//>
    <div class="form-grid"><${Field} label=${`Amount (${ev.currency})`}><input class="input" type="number" min="0" step="0.01" value=${d.amount} onInput=${set('amount')} /><//>
      <${Field} label="Status"><select class="input" value=${d.status} onChange=${set('status')}><option value="planned">Planned</option><option value="paid">Paid</option></select><//>
      <${Field} label="Team"><select class="input" value=${d.committeeId || ''} onChange=${(e) => setD({ ...d, committeeId: e.target.value || null })}>${all && html`<option value="">General</option>`}${teams.map((c) => html`<option value=${c.id}>${c.icon} ${c.name}</option>`)}</select><//>
      <${Field} label="Date"><input class="input" type="date" value=${d.date} onInput=${set('date')} /><//>
      <${Field} label="Paid by"><${UserSelect} value=${d.paidBy} ids=${ids} placeholder="Nobody yet" onChange=${(v) => setD({ ...d, paidBy: v })} /><//></div>
    <${Field} label="Notes"><textarea class="input" style="min-height:56px" value=${d.description} onInput=${set('description')}></textarea><//>
    ${!isCloud() && html`<div class="row wrap"><label class="btn" style="cursor:pointer"><${Icon} name="upload" />${d.receipt ? 'Replace receipt' : 'Attach receipt'}<input type="file" hidden accept="image/*,.pdf" onChange=${(e) => e.target.files[0] && setD({ ...d, receipt: e.target.files[0].name })} /></label>
      ${d.receipt && html`<span class="chip"><${Icon} name="file" size=${14} />${d.receipt}</span>`}<${Sim}>File name only<//></div>`}
  <//>`;
}

export function Budget({ ev }) {
  const [open, setOpen] = useState(null); const [team, setTeam] = useState('all'); const [editTotal, setEditTotal] = useState(false);
  const b = budgetOf(ev.id); const xs = expensesOf(ev.id); const manage = can(ev.id, 'manageBudget'); const m = (n) => money(n, ev.currency);
  const list = xs.filter((x) => team === 'all' || (team === 'none' ? !x.committeeId : x.committeeId === team)).sort((a, c) => (c.date || '').localeCompare(a.date || ''));
  const over = b.planned > b.total && b.total > 0; const rows = [...b.teams, ...(b.unassigned.planned ? [{ committee: { id: 'none', name: 'General', icon: '🧾', tone: 'grey' }, allocated: 0, ...b.unassigned }] : [])];
  return html`<div class="sec-head"><h2>Budget</h2>${canAddExpense(ev.id) && html`<button class="btn primary" onClick=${() => setOpen('new')}><${Icon} name="plus" />Record expense</button>`}</div>
    ${!b.total && !xs.length && manage && html`<div class="banner c-butter">💡 Set a total budget to start tracking. <button class="btn sm" onClick=${() => setEditTotal(true)}>Set budget</button></div>`}
    <div class="grid g4">
      <div class="card stat"><span class="k">Total budget</span>${editTotal ? html`<input class="input" type="number" autofocus value=${ev.budget} onBlur=${(e) => { updateEvent(ev.id, { budget: +e.target.value || 0 }); setEditTotal(false); }} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`
        : html`<span class="row"><span class="v">${m(b.total)}</span>${manage && html`<button class="btn ghost icon sm" aria-label="Edit total budget" onClick=${() => setEditTotal(true)}><${Icon} name="edit" size=${15} /></button>`}</span>`}</div>
      <div class=${cx('card stat', over && 'tint c-coral')}><span class="k">Planned spend</span><span class="v">${m(b.planned)}</span><span class="tiny muted">${pct(b.planned, b.total)}% of budget</span></div>
      <div class="card stat"><span class="k">Actually paid</span><span class="v">${m(b.actual)}</span><span class="tiny muted">${pct(b.actual, b.total)}% of budget</span></div>
      <div class="card tint c-mint stat"><span class="k">Remaining</span><span class="v">${m(b.remaining)}</span><span class="tiny" style="color:var(--ci)">${m(b.total - b.planned)} after planned spend</span></div>
    </div>
    <div class="card col"><h3>Where the money goes</h3>
      <div class="stackbar" role="img" aria-label="Planned spend by team">${rows.filter((r) => r.planned > 0).map((r) => html`<i key=${r.committee.id} class=${'c-' + r.committee.tone} style=${`flex:${r.planned}`} title=${`${r.committee.name}: ${m(r.planned)}`}></i>`)}</div>
      <div class="list">${rows.map((r) => { const base = Math.max(r.allocated, r.planned, 1); return html`<div class=${'col gap-s c-' + r.committee.tone} key=${r.committee.id}>
        <div class="row between wrap"><span class="b">${r.committee.icon} ${r.committee.name}</span><span class="small num"><b>${m(r.actual)}</b> paid · ${m(r.planned)} planned${r.allocated ? html` · ${m(r.allocated)} allocated` : ''}${r.allocated > 0 && r.planned > r.allocated && html` <${Pill} tone="coral">Over by ${m(r.planned - r.allocated)}<//>`}</span></div>
        <div class="budget-bar"><i class="planned" style=${`width:${(r.planned / base) * 100}%`}></i><i class="actual" style=${`width:${(r.actual / base) * 100}%`}></i></div></div>`; })}</div>
      <span class="tiny muted">Solid is paid, pale is planned. Each bar is scaled to that team’s allocation.</span></div>
    <div class="card col"><div class="row between wrap"><h3>Expenses</h3><select class="input sm" aria-label="Filter by team" value=${team} onChange=${(e) => setTeam(e.target.value)}><option value="all">All teams</option>${b.teams.map((r) => html`<option value=${r.committee.id}>${r.committee.name}</option>`)}<option value="none">General</option></select></div>
      ${!list.length ? html`<${Empty} emoji="🧾" title="No expenses yet">Record what you plan to spend and what has been paid.<//>` : html`<div class="table-wrap"><table><thead><tr><th>Expense</th><th>Team</th><th>Paid by</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${list.map((x) => { const c = x.committeeId && committee(x.committeeId); const editable = manage || (c && leadsTeam(c.id)); return html`<tr key=${x.id} style=${editable ? 'cursor:pointer' : ''} onClick=${() => editable && setOpen(x.id)}>
          <td><b>${x.title}</b>${x.description && html`<div class="tiny muted">${x.description}</div>`}${x.receipt && html`<div class="tiny muted row gap-s"><${Icon} name="file" size=${12} />${x.receipt}</div>`}</td>
          <td>${c ? html`<${Pill} tone=${c.tone}>${c.icon} ${c.name}<//>` : html`<span class="muted">General</span>`}</td><td class="nowrap">${x.paidBy ? user(x.paidBy).name : html`<span class="muted">–</span>`}</td>
          <td><${Pill} tone=${x.status === 'paid' ? 'mint' : 'butter'} dot>${x.status === 'paid' ? 'Paid' : 'Planned'}<//></td><td class="num b" style="text-align:right">${m(x.amount)}</td></tr>`; })}</tbody></table></div>`}</div>
    ${open && html`<${ExpenseModal} ev=${ev} item=${open === 'new' ? null : xs.find((x) => x.id === open)} onClose=${() => setOpen(null)} />`}`;
}
