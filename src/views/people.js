// People and invitations: guest list, RSVP handling, event team and vendors.
import { html, useState, useEffect } from '../lib.js';
import { RSVP, ROLES, ROLE_ORDER, by } from '../config.js';
import { S, invitationsOf, invitationFor, rsvpStats, membersOf, addGuest, updateInvitation, setRsvp, respondToInvite, removeInvitation, toggleCheckIn, remind, addMember, setRole, removeMember, ensureUser, has, user, roleIn, myTeams, meId, me, isCloud } from '../store.js';
import { personalToken, emailSetup, sendInviteEmails } from '../backend.js';
import { eventLink, personalLinkFor, inviteText, inviteSubject, whatsappUrl, mailtoUrl, waNumber, validEmail } from '../invites.js';
import { can, isOwner } from '../permissions.js';
import { Icon, Avatar, Pill, RolePill, Seg, Field, Modal, Confirm, Switch, Empty, Sim, toast, copyText, Person, Tick } from '../ui.js';
import { cx, fmtTime, ago } from '../utils.js';

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
  const [d, setD] = useState(inv ? { name: inv.name, email: inv.email, phone: inv.phone || '', group: inv.group, plusOneAllowed: inv.plusOneAllowed, ...inv.rsvp } : { name: '', email: '', phone: '', group: '', plusOneAllowed: has(ev, 'plusOnes') });
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const save = () => {
    if (!d.name.trim()) return toast('Add a name first');
    if (d.email.trim() && !validEmail(d.email)) return toast('That email address doesn’t look right');
    if (inv) { updateInvitation(inv.id, { name: d.name, email: d.email.trim(), phone: d.phone.trim(), group: d.group, plusOneAllowed: d.plusOneAllowed }); setRsvp(inv.id, { status: d.status, plusOne: d.plusOne, plusOneName: d.plusOneName, dietary: d.dietary, arrival: d.arrival }); toast('Invitation updated'); }
    else { const id = addGuest(ev.id, { ...d, email: d.email.trim(), phone: d.phone.trim() }); toast(`${d.name} added to the guest list`); onClose(id); return; }
    onClose();
  };
  return html`<${Modal} title=${inv ? 'Edit invitation' : 'Add a guest'} eyebrow=${ev.name} onClose=${onClose}
    footer=${html`${inv && html`<${Confirm} label="Remove guest" onConfirm=${() => { removeInvitation(inv.id); onClose(); toast('Guest removed'); }} /><span class="grow"></span>`}<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>${inv ? 'Save' : 'Add guest'}</button>`}>
    <div class="form-grid"><${Field} label="Name"><input class="input" value=${d.name} onInput=${set('name')} placeholder="Full name" list="known-people" /><//>
      <${Field} label="Email"><input class="input" type="email" value=${d.email} onInput=${set('email')} placeholder="name@example.com" /><//>
      <${Field} label="WhatsApp number" hint="With the country code, e.g. +44 7700 900123"><input id="guest-phone" class="input" type="tel" value=${d.phone} onInput=${set('phone')} placeholder="+44 …" /><//>
      <${Field} label="Group or tag"><input class="input" value=${d.group} onInput=${set('group')} placeholder="e.g. Friend, Alumni" /><//></div>
    <datalist id="known-people">${Object.values(S().users).map((u) => html`<option value=${u.name}></option>`)}</datalist>
    ${has(ev, 'plusOnes') && html`<div class="row"><${Switch} on=${d.plusOneAllowed} label="Allow a plus-one" onChange=${(v) => setD({ ...d, plusOneAllowed: v })} /><span class="b">Allow a plus-one</span></div>`}
    ${inv ? html`<div class="eyebrow">Reply on their behalf</div><div class="form-grid">
        <${Field} label="RSVP"><select class="input" value=${d.status} onChange=${set('status')}>${RSVP.map((o) => html`<option value=${o.id}>${o.label}</option>`)}</select><//>
        <${Field} label="Arriving"><input class="input" type="time" value=${d.arrival} onInput=${set('arrival')} /><//>
        <${Field} label="Dietary"><input class="input" value=${d.dietary} onInput=${set('dietary')} /><//></div>
        ${d.plusOneAllowed && html`<div class="row"><${Switch} on=${d.plusOne} label="Bringing a plus-one" onChange=${(v) => setD({ ...d, plusOne: v })} /><span class="b">Bringing a plus-one</span>${d.plusOne && html`<input class="input" style="max-width:200px" placeholder="Name" value=${d.plusOneName} onInput=${set('plusOneName')} />`}</div>`}
        ${inv.rsvp.message && html`<div class="card flat small">“${inv.rsvp.message}”</div>`}`
      : html`<p class="small muted">The guest appears on your list straight away. Next you can send them their personal invitation by WhatsApp or email.</p>`}
  <//>`;
}

const sentLabel = (inv) => {
  const s = inv.sent || {}; const parts = [];
  if (s.email) parts.push(`Emailed ${ago(s.email)}`); if (s.emailApp) parts.push(`Email opened ${ago(s.emailApp)}`); if (s.whatsapp) parts.push(`WhatsApp opened ${ago(s.whatsapp)}`);
  return parts.join(' · ');
};
const markSent = (inv, how) => updateInvitation(inv.id, { sent: { ...(inv.sent || {}), [how]: new Date().toISOString() } });

// Sending one guest their invitation: WhatsApp or the host's email app with the message written
// (free, sent from the host's own account), or an automatic email when that is set up.
export function InviteSheet({ ev, inv, onClose }) {
  const kind = inv.rsvp.status === 'pending' && Object.keys(inv.sent || {}).length ? 'reminder' : 'invite';
  const [link, setLink] = useState(isCloud() ? null : eventLink(ev)); const [error, setError] = useState('');
  const [phone, setPhone] = useState(inv.phone || ''); const [email, setEmail] = useState(inv.email || '');
  const [auto, setAuto] = useState(false); const [busy, setBusy] = useState(false); const [text, setText] = useState('');
  const host = me()?.name;
  useEffect(() => { if (isCloud()) { personalToken(inv.id).then((t) => setLink(personalLinkFor(ev, t))).catch((e) => setError(e.message)); emailSetup().then(setAuto); } }, [inv.id]);
  useEffect(() => { if (link) setText(inviteText(ev, inv.name, link, { kind, host })); }, [link]);
  const saveContact = () => { const patch = {}; if (phone.trim() !== (inv.phone || '')) patch.phone = phone.trim(); if (email.trim() !== (inv.email || '') && (!email.trim() || validEmail(email))) patch.email = email.trim(); if (Object.keys(patch).length) updateInvitation(inv.id, patch); };
  const wa = waNumber(phone); const okEmail = validEmail(email);
  const sendAuto = async () => { saveContact(); setBusy(true); try { const r = await sendInviteEmails(ev.id, [inv.id], kind); toast(r.sent ? `Email sent to ${inv.name}` : `Couldn’t send: ${r.failed?.[0]?.error || 'unknown error'}`); if (r.sent) onClose(); } catch (e) { toast(e.message); } setBusy(false); };
  return html`<${Modal} title=${(kind === 'reminder' ? 'Remind ' : 'Invite ') + inv.name} eyebrow=${ev.name} onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Done</button>`}>
    ${error ? html`<div class="banner c-coral">${error}</div>` : !link ? html`<p class="muted">Preparing their personal link…</p>` : html`
      <${Field} label="Message" hint=${isCloud() ? 'The link is personal to this guest: it lets them reply even to an invite-only event.' : 'In the demo this is the event’s general link.'}>
        <textarea id="invite-text" class="input" style="min-height:96px" value=${text} onInput=${(e) => setText(e.target.value)}></textarea><//>
      <div class="form-grid">
        <${Field} label="WhatsApp number" hint=${phone && !wa ? 'Add the country code, e.g. +44, to open their chat directly.' : 'With the country code.'}><input id="invite-phone" class="input" type="tel" value=${phone} placeholder="+44 …" onInput=${(e) => setPhone(e.target.value)} onBlur=${saveContact} /><//>
        <${Field} label="Email"><input id="invite-email" class="input" type="email" value=${email} placeholder="name@example.com" onInput=${(e) => setEmail(e.target.value)} onBlur=${saveContact} /><//></div>
      <div class="grid g2">
        <a id="send-whatsapp" class="btn primary" href=${whatsappUrl(phone, text)} target="_blank" rel="noopener" onClick=${() => { saveContact(); markSent(inv, 'whatsapp'); }}><${Icon} name="message" />${wa ? 'Send on WhatsApp' : 'WhatsApp: choose the chat'}</a>
        ${auto && okEmail ? html`<button id="send-email-auto" class="btn primary" disabled=${busy} onClick=${sendAuto}><${Icon} name="send" />${busy ? 'Sending…' : 'Email it for me'}</button>`
          : html`<a id="send-email-app" class=${cx('btn', !okEmail && 'disabled')} href=${okEmail ? mailtoUrl(email, inviteSubject(ev, kind), text) : undefined} aria-disabled=${!okEmail} onClick=${(e) => { if (!okEmail) { e.preventDefault(); toast('Add their email address first'); return; } saveContact(); markSent(inv, 'emailApp'); }}><${Icon} name="send" />Open in my email app</a>`}
      </div>
      ${auto && okEmail && html`<a id="send-email-app" class="small" href=${mailtoUrl(email, inviteSubject(ev, kind), text)} onClick=${() => { saveContact(); markSent(inv, 'emailApp'); }}>Or write it from my own email app</a>`}
      <div class="row wrap"><button class="btn sm" onClick=${async () => toast((await copyText(text)) ? 'Message copied' : 'Copy isn’t available here')}><${Icon} name="link" size=${15} />Copy message</button>
        ${sentLabel(inv) && html`<span class="small muted">${sentLabel(inv)}</span>`}</div>
      <p class="tiny muted">WhatsApp and your email app open with the message ready: you press send, from your own account. ${auto ? 'Automatic emails come from Gather on your behalf, and replies go to you.' : ''}</p>`}
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
  const [q, setQ] = useState(''); const [f, setF] = useState('all'); const [page, setPage] = useState(0); const [edit, setEdit] = useState(null); const [send, setSend] = useState(null);
  const [auto, setAuto] = useState(false); const [bulk, setBulk] = useState(''); const [armed, setArmed] = useState(false);
  useEffect(() => { if (isCloud() && can(ev.id, 'manageGuests')) emailSetup().then(setAuto); }, []);
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
    ${manage && html`<div class="card col"><div class="row between wrap"><div class="col" style="gap:2px"><h3>Send invitations</h3><span class="small muted">${ev.privacy === 'private' ? 'Invite only: each guest needs their personal link. Use the send button next to a guest.' : 'Share the event link anywhere, or send each guest their personal link.'}</span></div>
      <div class="row wrap">${ev.privacy !== 'private' && html`<a id="share-whatsapp" class="btn soft c-mint" href=${whatsappUrl('', inviteText(ev, '', link, { host: me()?.name }))} target="_blank" rel="noopener"><${Icon} name="message" />Share on WhatsApp</a>
        <button class="btn soft c-lav" onClick=${async () => toast((await copyText(link)) ? 'Event link copied' : link)}><${Icon} name="link" />Copy event link</button>`}
        <button class="btn" onClick=${() => (location.hash = `invite-${ev.id}`)}>Preview</button></div></div>
      ${(() => { const fresh = all.filter((i) => validEmail(i.email) && !(i.sent || {}).email && i.rsvp.status === 'pending'); const chase = all.filter((i) => validEmail(i.email) && (i.sent || {}).email && i.rsvp.status === 'pending');
        const run = async (list, kind) => { setBulk(kind); setArmed(false); try { const r = await sendInviteEmails(ev.id, list.slice(0, 100).map((i) => i.id), kind); toast(`${r.sent} ${r.sent === 1 ? 'email' : 'emails'} sent${r.failed?.length ? `, ${r.failed.length} failed` : ''}`); } catch (e) { toast(e.message); } setBulk(''); };
        return auto ? html`<div class="row wrap"><button id="email-all" class="btn primary" disabled=${!fresh.length || !!bulk} onClick=${() => (armed ? run(fresh, 'invite') : setArmed(true))}><${Icon} name="send" />${bulk === 'invite' ? 'Sending…' : armed ? `Tap again to email ${fresh.length}` : `Email ${fresh.length} not yet invited`}</button>
            <button class="btn" disabled=${!chase.length || !!bulk} onClick=${() => run(chase, 'reminder')}><${Icon} name="bell" />${bulk === 'reminder' ? 'Sending…' : `Email a reminder to ${chase.length} waiting`}</button>
            <span class="tiny muted">Up to 100 a day per event. Guests without an email address: use their send button.</span></div>`
          : html`<div class="row wrap"><button class="btn" disabled=${!st.pending} onClick=${() => toast(`Reminder shown in the app for ${remind(ev.id)} guests`, true)}><${Icon} name="bell" />Remind ${st.pending} waiting in the app</button>
            ${isCloud() && html`<span class="tiny muted">Automatic emails aren’t set up yet. You can still send each invitation by WhatsApp or from your email app.</span>`}</div>`; })()}
      </div>`}
    <div class="card col">
      <div class="row wrap"><div class="row grow" style="min-width:200px"><${Icon} name="search" /><input id="guest-search" class="input" placeholder="Search guests, tags or dietary needs" value=${q} onInput=${(e) => { setQ(e.target.value); setPage(0); }} /></div>
        ${manage && html`<button class="btn primary" onClick=${() => setEdit('new')}><${Icon} name="plus" />Add guest</button>`}</div>
      <div class="chips scroll">${filters.map(([id, label, n]) => html`<button key=${id} class=${cx('chip', f === id && 'on')} onClick=${() => { setF(id); setPage(0); }}>${label} <span class="num">${n}</span></button>`)}</div>
      ${!shown.length ? html`<${Empty} emoji="💌" title="No guests match">Try another filter, or add someone new.<//>` : html`<div class="table-wrap"><table>
        <thead><tr><th>Guest</th><th>RSVP</th><th>Arriving</th><th>Dietary</th>${has(ev, 'plusOnes') && html`<th>Plus-one</th>`}${has(ev, 'checkIn') && html`<th>Checked in</th>`}${manage && html`<th></th>`}</tr></thead>
        <tbody>${shown.map((i) => html`<tr key=${i.id}>
          <td><span class="row gap-s"><${Avatar} id=${i.userId} name=${i.name} /><span class="col" style="gap:0"><b class="nowrap">${i.name}</b>${(i.group || i.rsvp.message) && html`<span class="tiny muted">${dense ? i.group : i.rsvp.message || i.group}</span>`}${manage && sentLabel(i) && html`<span class="tiny muted">${sentLabel(i)}</span>`}</span></span></td>
          <td>${manage ? html`<select class=${'input sm'} aria-label=${'RSVP for ' + i.name} value=${i.rsvp.status} onChange=${(e) => setRsvp(i.id, { status: e.target.value })}>${RSVP.map((o) => html`<option value=${o.id}>${o.label}</option>`)}</select>` : html`<${RsvpPill} status=${i.rsvp.status} />`}</td>
          <td class="num nowrap">${i.rsvp.arrival ? fmtTime(i.rsvp.arrival) : html`<span class="muted">–</span>`}</td>
          <td>${i.rsvp.dietary ? html`<${Pill} tone="butter">${i.rsvp.dietary}<//>` : html`<span class="muted">–</span>`}</td>
          ${has(ev, 'plusOnes') && html`<td class="nowrap">${i.rsvp.plusOne ? '+1 ' + (i.rsvp.plusOneName || '') : html`<span class="muted">${i.plusOneAllowed ? 'Allowed' : 'No'}</span>`}</td>`}
          ${has(ev, 'checkIn') && html`<td><${Tick} on=${i.checkedIn} disabled=${!manage} label=${'Check in ' + i.name} onClick=${() => toggleCheckIn(i.id)} /></td>`}
          ${manage && html`<td class="nowrap"><button class="btn ghost sm" aria-label=${'Send invitation to ' + i.name} title="Send invitation" onClick=${() => setSend(i.id)}><${Icon} name="send" size=${15} /></button><button class="btn ghost sm" aria-label=${'Edit ' + i.name} onClick=${() => setEdit(i.id)}><${Icon} name="edit" size=${15} /></button></td>`}
        </tr>`)}</tbody></table></div>`}
      ${pages > 1 && html`<div class="row between"><span class="small muted num">${page * per + 1}–${Math.min(list.length, page * per + per)} of ${list.length}</span><div class="row gap-s"><button class="btn sm" disabled=${page === 0} onClick=${() => setPage(page - 1)}>Previous</button><button class="btn sm" disabled=${page >= pages - 1} onClick=${() => setPage(page + 1)}>Next</button></div></div>`}
    </div>
    ${edit && html`<${GuestModal} ev=${ev} inv=${edit === 'new' ? null : all.find((i) => i.id === edit)} onClose=${(newId) => { setEdit(null); if (typeof newId === 'string') setSend(newId); }} />`}
    ${send && all.find((i) => i.id === send) && html`<${InviteSheet} ev=${ev} inv=${all.find((i) => i.id === send)} onClose=${() => setSend(null)} />`}`;
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
