// Updates and announcements feed, and the document repository.
import { html, useState } from '../lib.js';
import { FILE_FOLDERS } from '../config.js';
import { postsOf, postUpdate, commentUpdate, deleteUpdate, committeesOf, committee, membersOf, mediaOf, filesOf, addItem, updateItem, removeItem, myTeams, user, meId, roleIn, S } from '../store.js';
import { can, canSeePost, canSeeFile, isOwner, isOrganiser } from '../permissions.js';
import { Icon, Avatar, Pill, Field, Modal, Confirm, Empty, Switch, Sim, toast, Rich } from '../ui.js';
import { cx, ago } from '../utils.js';
import { Shot } from './gallery.js';

const ScopeTag = ({ p }) => { const c = p.committeeId && committee(p.committeeId);
  return p.scope === 'event' ? html`<${Pill} tone="mint"><${Icon} name="megaphone" size=${13} />Everyone<//>` : p.scope === 'internal' ? html`<${Pill} tone="butter"><${Icon} name="lock" size=${13} />Organisers only<//>` : html`<${Pill} tone=${c?.tone}><${Icon} name="lock" size=${13} />${c?.icon} ${c?.name} only<//>`; };

export function Post({ p, ev }) {
  const [text, setText] = useState(''); const [open, setOpen] = useState(p.comments.length > 0 && p.comments.length < 3);
  const media = p.mediaId && S().media.find((m) => m.id === p.mediaId);
  return html`<div class="card col"><div class="row top"><${Avatar} id=${p.userId} size="lg" /><div class="col grow" style="gap:1px"><div class="row wrap gap-s"><b>${user(p.userId).name}</b><${ScopeTag} p=${p} /></div><span class="tiny muted">${ago(p.at)}</span></div>
      ${(p.userId === meId() || isOwner(ev.id)) && html`<${Confirm} label="" onConfirm=${() => deleteUpdate(p.id)} />`}</div>
    <p><${Rich} text=${p.text} /></p>
    ${media && html`<div class=${'photo c-' + (media.tone || 'lav')} style="max-width:280px;cursor:default"><${Shot} m=${media} /><span class="cap">${media.caption}</span></div>`}
    <div><button class="btn ghost sm" onClick=${() => setOpen(!open)}><${Icon} name="message" size=${15} />${p.comments.length ? `${p.comments.length} ${p.comments.length === 1 ? 'comment' : 'comments'}` : 'Comment'}</button></div>
    ${open && html`<div class="col gap-s" style="padding-left:8px;border-left:3px solid var(--line)">
      ${p.comments.map((c) => html`<div class="row top" key=${c.id}><${Avatar} id=${c.userId} size="sm" /><div class="grow"><b class="small">${user(c.userId).name}</b> <span class="tiny muted">${ago(c.at)}</span><div><${Rich} text=${c.text} /></div></div></div>`)}
      <form class="row" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) { commentUpdate(p.id, text.trim()); setText(''); } }}><input class="input" placeholder="Add a comment" value=${text} onInput=${(e) => setText(e.target.value)} /><button class="btn sm" aria-label="Send comment"><${Icon} name="send" size=${15} /></button></form></div>`}
  </div>`;
}

export function Updates({ ev }) {
  const organiser = isOrganiser(ev.id) && can(ev.id, 'viewInternal'); const teams = myTeams(ev.id).concat(can(ev.id, 'manageTeams') ? committeesOf(ev.id).filter((c) => !myTeams(ev.id).includes(c)) : []);
  const scopes = [...(can(ev.id, 'postAnnouncements') ? [['event', 'Everyone at the event']] : []), ...(organiser ? [['internal', 'Organisers only']] : []), ...teams.map((c) => [c.id, `${c.icon} ${c.name} only`])];
  const [text, setText] = useState(''); const [scope, setScope] = useState(scopes[0]?.[0]); const [mediaId, setMediaId] = useState(null); const [picking, setPicking] = useState(false); const [f, setF] = useState('all');
  const posts = postsOf(ev.id).filter(canSeePost).filter((p) => f === 'all' || (f === 'event' ? p.scope === 'event' : f === 'internal' ? p.scope !== 'event' : p.committeeId === f));
  const names = membersOf(ev.id).filter((m) => m.role !== 'guest').map((m) => user(m.userId).name.replace(/^(Dr\.|Prof\.)\s*/, '').split(' ')[0]);
  const photos = mediaOf(ev.id).filter((m) => can(ev.id, m.gallery === 'memories' ? 'viewMemories' : 'viewOrganiserGallery')).slice(0, 12); const chosen = photos.find((m) => m.id === mediaId);
  const send = () => { if (!text.trim()) return toast('Write something first'); const isTeam = !['event', 'internal'].includes(scope);
    postUpdate(ev.id, { text: text.trim(), scope: isTeam ? 'team' : scope, committeeId: isTeam ? scope : null, mediaId }); setText(''); setMediaId(null); setPicking(false); toast(scope === 'event' ? 'Announcement posted to everyone' : 'Posted internally'); };
  return html`<div class="sec-head"><h2>Updates</h2></div>
    ${scopes.length > 0 && html`<div class="card col"><div class="row top"><${Avatar} id=${meId()} size="lg" /><textarea id="update-text" class="input" placeholder="Share an announcement or a progress update. Use @Name to mention someone." value=${text} onInput=${(e) => setText(e.target.value)}></textarea></div>
      ${chosen && html`<div class="row"><div class=${'photo c-' + (chosen.tone || 'lav')} style="width:72px;cursor:default"><${Shot} m=${chosen} /></div><span class="small grow">${chosen.caption}</span><button class="btn ghost sm" onClick=${() => setMediaId(null)}>Remove</button></div>`}
      ${picking && html`<div class="photos" style="grid-template-columns:repeat(auto-fill,minmax(72px,1fr))">${photos.map((m) => html`<button key=${m.id} class=${'photo c-' + (m.tone || 'lav')} style="aspect-ratio:1;grid-row:auto;min-height:0" aria-label=${m.caption} onClick=${() => { setMediaId(m.id); setPicking(false); }}><${Shot} m=${m} /></button>`)}${!photos.length && html`<span class="small muted">No gallery photos to attach yet.</span>`}</div>`}
      <div class="row wrap"><select class="input sm" aria-label="Who can see this" value=${scope} onChange=${(e) => setScope(e.target.value)}>${scopes.map(([id, label]) => html`<option value=${id}>${label}</option>`)}</select>
        <button class="btn sm" onClick=${() => setPicking(!picking)}><${Icon} name="image" size=${15} />Photo</button>
        <select class="input sm" aria-label="Mention someone" value="" onChange=${(e) => e.target.value && setText(`${text}${text && !text.endsWith(' ') ? ' ' : ''}@${e.target.value} `)}><option value="">@ Mention</option>${[...new Set(names)].sort().map((n) => html`<option value=${n}>${n}</option>`)}</select>
        <span class="grow"></span><button class="btn primary" onClick=${send}><${Icon} name="send" size=${15} />Post</button></div></div>`}
    ${organiser && html`<div class="chips scroll">${[['all', 'All'], ['event', 'Announcements'], ['internal', 'Internal'], ...teams.map((c) => [c.id, `${c.icon} ${c.name}`])].map(([id, label]) => html`<button key=${id} class=${cx('chip', f === id && 'on')} onClick=${() => setF(id)}>${label}</button>`)}</div>`}
    ${!posts.length ? html`<div class="card"><${Empty} emoji="📣" title="No updates yet">Announcements from the organisers appear here.<//></div>` : posts.map((p) => html`<${Post} key=${p.id} p=${p} ev=${ev} />`)}`;
}

const KIND = { pdf: ['PDF', 'coral'], sheet: ['Sheet', 'mint'], doc: ['Doc', 'sky'], image: ['Image', 'lav'], link: ['Link', 'butter'], other: ['File', 'grey'] };
const kindOf = (name) => (/\.pdf$/i.test(name) ? 'pdf' : /\.(xlsx?|csv)$/i.test(name) ? 'sheet' : /\.(docx?|txt|md)$/i.test(name) ? 'doc' : /\.(png|jpe?g|gif|webp)$/i.test(name) ? 'image' : 'other');

function FileModal({ ev, onClose, folder }) {
  const [d, setD] = useState({ name: '', folder: folder && folder !== 'All' ? folder : 'General', url: '', size: '', confidential: false, vendorShared: false, committeeId: null, isLink: false });
  const save = () => { if (!d.name.trim()) return toast('Choose a file or name the link'); if (d.isLink && !/^https?:\/\//.test(d.url)) return toast('Links need to start with https://');
    const { isLink, ...rest } = d; addItem('files', ev.id, { ...rest, kind: isLink ? 'link' : kindOf(d.name) }, `added “${d.name}” to files`); toast('Added to files', !isLink); onClose(); };
  return html`<${Modal} title="Add a document" eyebrow=${ev.name} onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Add</button>`}>
    <div class="row"><${Switch} on=${d.isLink} label="This is a link" onChange=${(v) => setD({ ...d, isLink: v })} /><span class="b">This is a link, not a file</span></div>
    ${d.isLink ? html`<div class="form-grid"><${Field} label="Title"><input class="input" value=${d.name} onInput=${(e) => setD({ ...d, name: e.target.value })} /><//><${Field} label="Address"><input class="input" type="url" placeholder="https://" value=${d.url} onInput=${(e) => setD({ ...d, url: e.target.value })} /><//></div>`
      : html`<div class="row wrap"><label class="btn" style="cursor:pointer"><${Icon} name="upload" />Choose file<input type="file" hidden onChange=${(e) => { const f = e.target.files[0]; if (f) setD({ ...d, name: f.name, size: f.size > 1e6 ? (f.size / 1e6).toFixed(1) + ' MB' : Math.ceil(f.size / 1e3) + ' KB' }); }} /></label>
        <input class="input grow" placeholder="or type a file name, e.g. Venue map.pdf" value=${d.name} onInput=${(e) => setD({ ...d, name: e.target.value })} /></div><p class="small muted"><${Sim}>Name only<//> The prototype records the file’s name and size. Nothing is uploaded.</p>`}
    <div class="form-grid"><${Field} label="Folder"><select class="input" value=${d.folder} onChange=${(e) => setD({ ...d, folder: e.target.value })}>${FILE_FOLDERS.map((x) => html`<option>${x}</option>`)}</select><//>
      <${Field} label="Team"><select class="input" value=${d.committeeId || ''} onChange=${(e) => setD({ ...d, committeeId: e.target.value || null })}><option value="">Whole event</option>${committeesOf(ev.id).map((c) => html`<option value=${c.id}>${c.icon} ${c.name}</option>`)}</select><//></div>
    <div class="row"><${Switch} on=${d.confidential} label="Confidential" onChange=${(v) => setD({ ...d, confidential: v })} /><span><b>Confidential</b> <span class="small muted">Only roles allowed to open contracts can see it.</span></span></div>
    <div class="row"><${Switch} on=${d.vendorShared} label="Share with vendors" onChange=${(v) => setD({ ...d, vendorShared: v })} /><span><b>Share with vendors</b></span></div>
  <//>`;
}

export function Files({ ev }) {
  const [folder, setFolder] = useState('All'); const [add, setAdd] = useState(false);
  const all = filesOf(ev.id).filter(canSeeFile); const hidden = filesOf(ev.id).length - all.length; const manage = can(ev.id, 'viewFiles') && roleIn(ev.id) !== 'vendor';
  const folders = ['All', ...FILE_FOLDERS.filter((f) => all.some((x) => x.folder === f))]; const list = all.filter((x) => folder === 'All' || x.folder === folder);
  return html`<div class="sec-head"><div class="row wrap"><h2>Files and documents</h2><span class="pill num">${all.length}</span></div>${manage && html`<button class="btn primary" onClick=${() => setAdd(true)}><${Icon} name="plus" />Add document</button>`}</div>
    ${hidden > 0 && html`<div class="banner c-butter"><${Icon} name="lock" />${hidden} confidential ${hidden === 1 ? 'file is' : 'files are'} hidden from your role.</div>`}
    <div class="chips scroll">${folders.map((f) => html`<button key=${f} class=${cx('chip', folder === f && 'on')} onClick=${() => setFolder(f)}><${Icon} name=${f === 'All' ? 'grid' : 'folder'} size=${14} />${f}<span class="num">${f === 'All' ? all.length : all.filter((x) => x.folder === f).length}</span></button>`)}</div>
    <div class="card">${!list.length ? html`<${Empty} emoji="🗂️" title="No documents here">Keep contracts, venue details and vendor information in one place.<//>` : html`<div class="list">${list.map((x) => { const [label, tone] = KIND[x.kind] || KIND.other; const c = x.committeeId && committee(x.committeeId); return html`<div class="row wrap" key=${x.id}>
      <span class=${'pill c-' + tone} style="width:52px;justify-content:center">${label}</span>
      <div class="col grow" style="gap:1px;min-width:160px">${x.kind === 'link' ? html`<a class="b" href=${x.url} target="_blank" rel="noopener">${x.name}</a>` : html`<b>${x.name}</b>`}<span class="tiny muted">${x.folder} · ${user(x.userId).name} · ${ago(x.at)}${x.size ? ' · ' + x.size : ''}</span></div>
      ${c && html`<${Pill} tone=${c.tone}>${c.icon} ${c.name}<//>`}${x.confidential && html`<${Pill} tone="coral"><${Icon} name="lock" size=${13} />Confidential<//>`}${x.vendorShared && html`<${Pill} tone="sky">Vendors<//>`}
      ${manage && can(ev.id, 'viewConfidential') && html`<${Switch} on=${x.confidential} label=${'Confidential: ' + x.name} onChange=${(v) => updateItem('files', x.id, { confidential: v })} /><${Confirm} label="" onConfirm=${() => removeItem('files', x.id)} />`}</div>`; })}</div>`}</div>
    ${add && html`<${FileModal} ev=${ev} folder=${folder} onClose=${() => setAdd(false)} />`}`;
}
