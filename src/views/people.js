// People and invitations: guest list, RSVP handling, event team and vendors.
import { html, useState } from '../lib.js';
import { RSVP, ROLES, ROLE_ORDER, by } from '../config.js';
import { S, invitationsOf, invitationFor, rsvpStats, membersOf, addGuest, updateInvitation, setRsvp, respondToInvite, removeInvitation, toggleCheckIn, remind, addMember, setRole, removeMember, ensureUser, has, user, roleIn, myTeams, meId } from '../store.js';
import { can, isOwner } from '../permissions.js';
import { Icon, Avatar, Pill, RolePill, Seg, Field, Modal, Confirm, Switch, Empty, Sim, toast, copyText, Person, Tick } from '../ui.js';
import { cx, fmtTime } from '../utils.js';

const RsvpPill = ({ status }) => { const o = by(RSVP, status); return html`<${Pill} tone=${o.tone} dot>${o.label}<//>`; };

// The guest's own reply. Used on the invitation page and at the top of a guest's workspace.
export function RsvpCard({ ev, compact }) {
  const inv = invitationFor(ev.id); const r = inv?.rsvp || { status: 'pending' };
  const [d, setD] = useState({ plusOne: !!r.plusOne, plusOneName: r.plusOneName || '', dietary: r.dietary || '', arrival: r.arrival || '', message: r.message || '' });
  const [editing, setEditing] = useState(r.status === 'pending');
  const plusOk = has(ev, 'plusOnes') && (inv ? inv.plusOneAllowed : true);
  const answer = (status) => { respondToInvite(ev.id, { status, ...(status === 'declined' ? { plusOne: false } : {}) }); setEditing(status !== 'declined'); toast(status === 'going' ? 'You’re going! 🎉' : status === 'maybe' ? 'Marked as maybe' : 'Sorry you can’t make it'); };
  const save = () => { respondToInvite(ev.id, { status: r.status === 'pending' ? 'going' : r.status, ...d }); setEditing(false); toast('RSVP details saved'); };
  return html`<div class=${cx('card', 'col', r.status === 'pending' && 'tint c-butter')}>
    <div class="row between wrap"><div><div class="eyebrow">Your RSVP</div><h3>${r.status === 'pending' ? 'Can you make it?' : r.status === 'going' ? 'You’re going 🎉' : r.status === 'maybe' ? 'You said maybe' : 'You can’t make it'}</h3></div>
      ${r.status !== 'pending' && !editing && html`<button class="btn sm" onClick=${() => setEditing(true)}><${Icon} name="edit" size=${15} />Change</button>`}</div>
    ${(editing || r.status === 'pending') && html`<div class="row wrap">${RSVP.slice(0, 3).map((o) => html`<button key=${o.id} class=${cx('btn', r.status === o.id ? 'primary' : '')} onClick=${() => answer(o.id)}>${o.emoji} ${o.label}</button>`)}</div>`}
    ${editing && r.status !== 'declined' && r.status !== 'pending' && html`
      <div class="form-grid">
        <${Field} label="Arriving around"><input class="input" type="time" value=${d.arrival} onInput=${(e) => setD({ ...d, arrival: e.target.value })} /><//>
        <${Field} label="Dietary requirements"><input class="input" placeholder="e.g. vegetarian, nut allergy" value=${d.dietary} onInput=${(e) => setD({ ...d, dietary: e.target.value })} /><//>
      </div>
      ${plusOk && html`<div class="row"><${Switch} on=${d.plusOne} label="Bring a plus-one" onChange=${(v) => setD({ ...d, plusOne: v })} /><span class="b">Bring a plus-one</span>${d.plusOne && html`<input class="input" style="max-width:220px" placeholder="Their name" value=${d.plusOneName} onInput=${(e) => setD({ ...d, plusOneName: e.target.value })} />`}</div>`}
      <${Field} label="Message to the host"><textarea class="input" style="min-height:56px" placeholder="Say hello" value=${d.message} onInput=${(e) => setD({ ...d, message: e.target.value })}></textarea><//>
      <div><button class="btn primary" onClick=${save}>Save details</button></div>`}
    ${!editing && r.status !== 'pending' && !compact && html`<div class="row wrap small muted">${r.arrival && html`<span>Arriving ${fmtTime(r.arrival)}</span>`}${r.plusOne && html`<span>+1 ${r.plusOneName}</span>`}${r.dietary && html`<span>${r.dietary}</span>`}${r.message && html`<span>“${r.message}”</span>`}</div>`}
  </div>`;
}

function GuestModal({ ev, inv, onClose }) {
  const [d, setD] = useState(inv ? { name: inv.name, email: inv.email, group: inv.group, plusOneAllowed: inv.plusOneAllowed, ...inv.rsvp } : { name: '', email: '', group: '', plusOneAllowed: has(ev, 'plusOnes') });
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const save = () => {
    if (!d.name.trim()) return toast('Add a name first');
    if (inv) { updateInvitation(inv.id, { name: d.name, email: d.email, group: d.group, plusOneAllowed: d.plusOneAllowed }); setRsvp(inv.id, { status: d.status, plusOne: d.plusOne, plusOneName: d.plusOneName, dietary: d.dietary, arrival: d.arrival }); toast('Invitation updated'); }
    else { addGuest(ev.id, d); toast(`${d.name} added to the guest list`, true); }
    onClose();
  };
  return html`<${Modal} title=${inv ? 'Edit invitation' : 'Add a guest'} eyebrow=${ev.name} onClose=${onClose}
    footer=${html`${inv && html`<${Confirm} label="Remove guest" onConfirm=${() => { removeInvitation(inv.id); onClose(); toast('Guest removed'); }} /><span class="grow"></span>`}<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>${inv ? 'Save' : 'Add guest'}</button>`}>
    <div class="form-grid"><${Field} label="Name"><input class="input" value=${d.name} onInput=${set('name')} placeholder="Full name" list="known-people" /><//>
      <${Field} label="Email"><input class="input" type="email" value=${d.email} onInput=${set('email')} placeholder="name@example.com" /><//>
      <${Field} label="Group or tag"><input class="input" value=${d.group} onInput=${set('group')} placeholder="e.g. Friend, Alumni" /><//></div>
    <datalist id="known-people">${Object.values(S().users).map((u) => html`<option value=${u.name}></option>`)}</datalist>
    ${has(ev, 'plusOnes') && html`<div class="row"><${Switch} on=${d.plusOneAllowed} label="Allow a plus-one" onChange=${(v) => setD({ ...d, plusOneAllowed: v })} /><span class="b">Allow a plus-one</span></div>`}
    ${inv ? html`<div class="eyebrow">Reply on their behalf</div><div class="form-grid">
        <${Field} label="RSVP"><select class="input" value=${d.status} onChange=${set('status')}>${RSVP.map((o) => html`<option value=${o.id}>${o.label}</option>`)}</select><//>
        <${Field} label="Arriving"><input class="input" type="time" value=${d.arrival} onInput=${set('arrival')} /><//>
        <${Field} label="Dietary"><input class="input" value=${d.dietary} onInput=${set('dietary')} /><//></div>
        ${d.plusOneAllowed && html`<div class="row"><${Switch} on=${d.plusOne} label="Bringing a plus-one" onChange=${(v) => setD({ ...d, plusOne: v })} /><span class="b">Bringing a plus-one</span>${d.plusOne && html`<input class="input" style="max-width:200px" placeholder="Name" value=${d.plusOneName} onInput=${set('plusOneName')} />`}</div>`}
        ${inv.rsvp.message && html`<div class="card flat small">“${inv.rsvp.message}”</div>`}`
      : html`<p class="small muted">The guest appears on your list straight away. <${Sim}>No email is sent<//> Share the invitation link so they can reply themselves.</p>`}
  <//>`;
}

function MemberModal({ ev, onClose }) {
  const [name, setName] = useState(''); const [role, setRoleV] = useState('member'); const [company, setCompany] = useState('');
  const save = () => { if (!name.trim()) return toast('Add a name first'); const id = ensureUser(name); addMember(ev.id, id, role, role === 'vendor' ? { company, service: '' } : {}); toast(`${name} added as ${ROLES[role].label.toLowerCase()}`, true); onClose(); };
  return html`<${Modal} title="Add to the event team" eyebrow=${ev.name} onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Add person</button>`}>
    <${Field} label="Name"><input class="input" value=${name} list="known-people2" onInput=${(e) => setName(e.target.value)} placeholder="Pick someone or type a new name" /><//>
    <datalist id="known-people2">${Object.values(S().users).map((u) => html`<option value=${u.name}></option>`)}</datalist>
    <${Field} label="Role" hint=${ROLES[role].blurb}><select class="input" value=${role} onChange=${(e) => setRoleV(e.target.value)}>${ROLE_ORDER.filter((r) => r !== 'owner' && r !== 'guest' && (r !== 'vendor' || has(ev, 'vendors'))).map((r) => html`<option value=${r}>${ROLES[r].label}</option>`)}</select><//>
    ${role === 'vendor' && html`<${Field} label="Company"><input class="input" value=${company} onInput=${(e) => setCompany(e.target.value)} /><//>`}
  <//>`;
}

function Guests({ ev }) {
  const [q, setQ] = useState(''); const [f, setF] = useState('all'); const [page, setPage] = useState(0); const [edit, setEdit] = useState(null);
  const manage = can(ev.id, 'manageGuests'); const st = rsvpStats(ev.id); const dense = ev.complexity !== 'simple'; const per = dense ? 20 : 50;
  const all = invitationsOf(ev.id); const rank = { going: 0, maybe: 1, pending: 2, declined: 3 };
  const list = all.filter((i) => (f === 'all' || (f === 'in' ? i.checkedIn : i.rsvp.status === f)) && (i.name + ' ' + i.group + ' ' + i.rsvp.dietary).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => rank[a.rsvp.status] - rank[b.rsvp.status] || (a.rsvp.arrival || '99').localeCompare(b.rsvp.arrival || '99'));
  const pages = Math.ceil(list.length / per); const shown = list.slice(page * per, page * per + per);
  const link = `${location.href.split('#')[0]}#invite-${ev.id}`;
  const filters = [['all', 'All', st.invited], ['going', 'Going', st.going], ['maybe', 'Maybe', st.maybe], ['pending', 'No reply', st.pending], ['declined', "Can't go", st.declined], ...(has(ev, 'checkIn') ? [['in', 'Checked in', st.checkedIn]] : [])];
  return html`
    <div class="grid g4">
      <div class="card tint c-mint stat"><span class="v">${st.going}</span><span class="k">Going${st.headcount > st.going ? ` · ${st.headcount} with plus-ones` : ''}</span></div>
      <div class="card tint c-butter stat"><span class="v">${st.maybe}</span><span class="k">Maybe</span></div>
      <div class="card tint c-grey stat"><span class="v">${st.pending}</span><span class="k">Waiting for a reply</span></div>
      <div class="card tint c-coral stat"><span class="v">${st.declined}</span><span class="k">Can’t go</span></div>
    </div>
    ${manage && html`<div class="card col"><div class="row between wrap"><div class="col" style="gap:2px"><h3>Invitation link</h3><span class="small muted">Anyone who opens it can RSVP, add a plus-one and tell you what they eat.</span></div>
      <div class="row wrap"><button class="btn" onClick=${() => (location.hash = `invite-${ev.id}`)}>Preview</button>
        <button class="btn soft c-lav" onClick=${async () => toast((await copyText(link)) ? 'Invitation link copied' : link)}><${Icon} name="link" />Copy link</button>
        <button class="btn" disabled=${!st.pending} onClick=${() => toast(`Reminder logged for ${remind(ev.id)} guests`, true)}><${Icon} name="bell" />Remind ${st.pending} waiting</button></div></div></div>`}
    <div class="card col">
      <div class="row wrap"><div class="row grow" style="min-width:200px"><${Icon} name="search" /><input id="guest-search" class="input" placeholder="Search guests, tags or dietary needs" value=${q} onInput=${(e) => { setQ(e.target.value); setPage(0); }} /></div>
        ${manage && html`<button class="btn primary" onClick=${() => setEdit('new')}><${Icon} name="plus" />Add guest</button>`}</div>
      <div class="chips scroll">${filters.map(([id, label, n]) => html`<button key=${id} class=${cx('chip', f === id && 'on')} onClick=${() => { setF(id); setPage(0); }}>${label} <span class="num">${n}</span></button>`)}</div>
      ${!shown.length ? html`<${Empty} emoji="💌" title="No guests match">Try another filter, or add someone new.<//>` : html`<div class="table-wrap"><table>
        <thead><tr><th>Guest</th><th>RSVP</th><th>Arriving</th><th>Dietary</th>${has(ev, 'plusOnes') && html`<th>Plus-one</th>`}${has(ev, 'checkIn') && html`<th>Checked in</th>`}${manage && html`<th></th>`}</tr></thead>
        <tbody>${shown.map((i) => html`<tr key=${i.id}>
          <td><span class="row gap-s"><${Avatar} id=${i.userId} name=${i.name} /><span class="col" style="gap:0"><b class="nowrap">${i.name}</b>${(i.group || i.rsvp.message) && html`<span class="tiny muted">${dense ? i.group : i.rsvp.message || i.group}</span>`}</span></span></td>
          <td>${manage ? html`<select class=${'input sm'} aria-label=${'RSVP for ' + i.name} value=${i.rsvp.status} onChange=${(e) => setRsvp(i.id, { status: e.target.value })}>${RSVP.map((o) => html`<option value=${o.id}>${o.label}</option>`)}</select>` : html`<${RsvpPill} status=${i.rsvp.status} />`}</td>
          <td class="num nowrap">${i.rsvp.arrival ? fmtTime(i.rsvp.arrival) : html`<span class="muted">–</span>`}</td>
          <td>${i.rsvp.dietary ? html`<${Pill} tone="butter">${i.rsvp.dietary}<//>` : html`<span class="muted">–</span>`}</td>
          ${has(ev, 'plusOnes') && html`<td class="nowrap">${i.rsvp.plusOne ? '+1 ' + (i.rsvp.plusOneName || '') : html`<span class="muted">${i.plusOneAllowed ? 'Allowed' : 'No'}</span>`}</td>`}
          ${has(ev, 'checkIn') && html`<td><${Tick} on=${i.checkedIn} disabled=${!manage} label=${'Check in ' + i.name} onClick=${() => toggleCheckIn(i.id)} /></td>`}
          ${manage && html`<td class="nowrap">${i.rsvp.status === 'pending' && html`<button class="btn ghost sm" title="Send reminder" onClick=${() => { remind(ev.id, i.id); toast(`Reminder logged for ${i.name}`, true); }}><${Icon} name="bell" size=${15} />${i.reminders > 0 ? i.reminders : ''}</button>`}<button class="btn ghost sm" aria-label=${'Edit ' + i.name} onClick=${() => setEdit(i.id)}><${Icon} name="edit" size=${15} /></button></td>`}
        </tr>`)}</tbody></table></div>`}
      ${pages > 1 && html`<div class="row between"><span class="small muted num">${page * per + 1}–${Math.min(list.length, page * per + per)} of ${list.length}</span><div class="row gap-s"><button class="btn sm" disabled=${page === 0} onClick=${() => setPage(page - 1)}>Previous</button><button class="btn sm" disabled=${page >= pages - 1} onClick=${() => setPage(page + 1)}>Next</button></div></div>`}
    </div>
    ${edit && html`<${GuestModal} ev=${ev} inv=${edit === 'new' ? null : all.find((i) => i.id === edit)} onClose=${() => setEdit(null)} />`}`;
}

function Team({ ev, vendors }) {
  const [add, setAdd] = useState(false); const owner = isOwner(ev.id);
  const list = membersOf(ev.id).filter((m) => (vendors ? m.role === 'vendor' : !['guest', 'vendor'].includes(m.role))).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return html`<div class="card col">
    <div class="row between wrap"><div class="col" style="gap:2px"><h3>${vendors ? 'Vendors' : 'Event team'}</h3><span class="small muted">${vendors ? 'Suppliers see only the tasks and files shared with them.' : 'Roles decide what each person can see and change in this event only.'}</span></div>
      ${(owner || can(ev.id, 'manageTeams')) && html`<button class="btn primary" onClick=${() => setAdd(true)}><${Icon} name="plus" />Add person</button>`}</div>
    ${!list.length ? html`<${Empty} emoji="🧑‍🤝‍🧑" title="Nobody here yet">Add people to share the work.<//>` : html`<div class="list">${list.map((m) => html`<div class="row wrap" key=${m.id}>
      <div class="grow" style="min-width:180px"><${Person} id=${m.userId} sub=${vendors ? `${m.company || ''}${m.service ? ' · ' + m.service : ''}` : myTeams(ev.id, m.userId).map((c) => c.icon + ' ' + c.name).join('  ') || user(m.userId).email} /></div>
      ${vendors && m.phone && html`<span class="small muted num">${m.phone}</span>`}
      ${owner && m.role !== 'owner' ? html`<select class="input sm" aria-label="Role" value=${m.role} onChange=${(e) => { setRole(m.id, e.target.value); toast('Role updated'); }}>${ROLE_ORDER.filter((r) => r !== 'owner').map((r) => html`<option value=${r}>${ROLES[r].label}</option>`)}</select><${Confirm} label="" onConfirm=${() => removeMember(m.id)} />` : html`<${RolePill} role=${m.role} />`}
    </div>`)}</div>`}
    ${add && html`<${MemberModal} ev=${ev} onClose=${() => setAdd(false)} />`}</div>`;
}

export function People({ ev }) {
  const [tab, setTab] = useState('guests'); const st = rsvpStats(ev.id); const ms = membersOf(ev.id);
  const tabs = [{ id: 'guests', label: 'Guests', count: st.invited }, { id: 'team', label: 'Team', count: ms.filter((m) => !['guest', 'vendor'].includes(m.role)).length },
    ...(has(ev, 'vendors') && can(ev.id, 'manageGuests') ? [{ id: 'vendors', label: 'Vendors', count: ms.filter((m) => m.role === 'vendor').length }] : [])];
  return html`<div class="sec-head"><h2>People and invitations</h2><${Seg} value=${tab} onChange=${setTab} options=${tabs} /></div>
    ${invitationFor(ev.id) && roleIn(ev.id) !== 'owner' && tab === 'guests' && html`<${RsvpCard} ev=${ev} compact />`}
    ${tab === 'guests' ? html`<${Guests} ev=${ev} />` : html`<${Team} ev=${ev} vendors=${tab === 'vendors'} key=${tab} />`}`;
}
