// Event gallery and camera. Two galleries per event: organiser (behind the scenes) and memories (everyone's photos).
import { html, useState, useEffect, useRef } from '../lib.js';
import { ROLES, CAPS } from '../config.js';
import { mediaOf, addItem, updateItem, removeItem, setPermission, user, meId, isCloud } from '../store.js';
import { can, isOwner } from '../permissions.js';
import { Icon, Avatar, Seg, Field, Modal, Confirm, Empty, Switch, Sim, toast, copyText } from '../ui.js';
import { cx, ago, readImage } from '../utils.js';

const GALLERIES = { organiser: { label: 'Organiser gallery', blurb: 'Behind the scenes and preparation.', view: 'viewOrganiserGallery', add: 'addOrganiserGallery' },
  memories: { label: 'Event memories', blurb: 'Photos shared by everyone who came.', view: 'viewMemories', add: 'addMemories' } };
const SCENES = [['🥳', 'coral'], ['🎉', 'lav'], ['🍰', 'butter'], ['🕺', 'sky'], ['🌿', 'mint'], ['🥂', 'butter'], ['🎶', 'lav'], ['📸', 'sky']];

export const Shot = ({ m }) => (m.src ? html`<img src=${m.src} alt=${m.caption || 'Event photo'} />` : html`<span class="emo">${m.emoji || '📷'}</span>`);

// Role x capability switches. Used here for gallery access and in Setup for the full matrix.
export function PermTable({ ev, caps }) {
  const roles = ['manager', 'lead', 'member', 'guest', 'vendor']; const editable = isOwner(ev.id);
  return html`<div class="table-wrap"><table class="perm"><thead><tr><th>Permission</th>${roles.map((r) => html`<th>${ROLES[r].label}</th>`)}</tr></thead>
    <tbody>${CAPS.filter((c) => caps.includes(c.id)).map((c) => html`<tr key=${c.id}><td>${c.label}</td>${roles.map((r) => html`<td key=${r}><${Switch} on=${ev.permissions[r][c.id]} disabled=${!editable} label=${`${c.label} for ${ROLES[r].label}`} onChange=${(v) => { setPermission(ev.id, r, c.id, v); toast(`${ROLES[r].label}s ${v ? 'can now' : 'can no longer'} ${c.label.toLowerCase()}`); }} /></td>`)}</tr>`)}</tbody></table></div>`;
}

function CameraModal({ onShot, onClose }) {
  const video = useRef(); const [mode, setMode] = useState('starting'); const [scene, setScene] = useState(0); const [flash, setFlash] = useState(false);
  useEffect(() => { let stream; let dead = false;
    (async () => { try { if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (dead) return stream.getTracks().forEach((t) => t.stop()); video.current.srcObject = stream; await video.current.play(); setMode('live'); } catch { if (!dead) setMode('sim'); } })();
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()); }; }, []);
  const shoot = () => { setFlash(true); setTimeout(() => {
    if (mode === 'live') { const v = video.current; const c = document.createElement('canvas'); const k = Math.min(1, 720 / v.videoWidth); c.width = v.videoWidth * k; c.height = v.videoHeight * k; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); onShot({ src: c.toDataURL('image/jpeg', 0.8) }); }
    else onShot({ emoji: SCENES[scene][0], tone: SCENES[scene][1], simulated: true }); }, 160); };
  return html`<${Modal} title="Take a photo" onClose=${onClose}>
    <div class=${'viewfinder c-' + SCENES[scene][1]} style=${mode === 'sim' ? 'background:var(--cs)' : ''}>
      <video ref=${video} playsinline muted hidden=${mode !== 'live'}></video>
      ${mode === 'sim' && html`<span class="scene">${isCloud() ? '📷' : SCENES[scene][0]}</span>`}${mode === 'starting' && html`<span>Starting camera…</span>`}
      <span class="hud">${mode === 'sim' ? !isCloud() && html`<${Sim}>Simulated camera<//>` : mode === 'live' && html`<span class="pill c-coral"><i class="pdot"></i>Live</span>`}</span>
      ${flash && html`<div style="position:absolute;inset:0;background:#fff;animation:fade .3s reverse forwards"></div>`}
    </div>
    ${mode === 'sim' && html`<p class="small muted">${isCloud() ? 'The camera isn’t available here. Allow camera access in your browser, or close this and use Upload to add a photo from your device.' : 'This browser didn’t give the prototype a camera, so the viewfinder shows a stand-in scene. On a phone with camera access you get the live preview.'}</p>`}
    <div class="row" style="justify-content:center;gap:24px">${mode === 'sim' && !isCloud() && html`<button class="btn" onClick=${() => setScene((scene + 1) % SCENES.length)}><${Icon} name="swap" />Change scene</button>`}
      ${mode === 'sim' && isCloud() ? html`<button class="btn primary" onClick=${onClose}>Close</button>` : html`<button class="shutter" aria-label="Take photo" disabled=${mode === 'starting'} onClick=${shoot}></button>`}</div>
  <//>`;
}

function CaptionModal({ ev, shot, gallery, options, onClose }) {
  const [caption, setCaption] = useState(''); const [g, setG] = useState(gallery);
  const save = () => { addItem('media', ev.id, { gallery: g, type: shot.type || 'photo', caption: caption.trim(), ...shot }, `added a ${shot.type === 'video' ? 'video' : 'photo'} to ${g === 'memories' ? 'event memories' : 'the organiser gallery'}`); toast('Added to the gallery ✨'); onClose(); };
  return html`<${Modal} title="Add to gallery" eyebrow=${ev.name} onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Discard</button><button class="btn primary" onClick=${save}>Share</button>`}>
    <div class=${'viewfinder c-' + (shot.tone || 'lav')} style="background:var(--cs)">${shot.src ? html`<img src=${shot.src} alt="Preview" />` : html`<span class="emo" style="font-size:5rem">${shot.emoji}</span>`}
      ${(shot.simulated || shot.type === 'video') && html`<span class="hud"><${Sim}>${shot.type === 'video' ? 'Video placeholder' : 'Simulated photo'}<//></span>`}</div>
    ${shot.type === 'video' && html`<p class="small muted">“${shot.name}” is listed by name. The prototype doesn’t store video files.</p>`}
    <${Field} label="Caption"><input id="media-caption" class="input" value=${caption} placeholder="Say something about this moment" onInput=${(e) => setCaption(e.target.value)} /><//>
    ${options.length > 1 && html`<${Field} label="Share to"><select class="input" value=${g} onChange=${(e) => setG(e.target.value)}>${options.map((o) => html`<option value=${o}>${GALLERIES[o].label}</option>`)}</select><//>`}
  <//>`;
}

function Lightbox({ list, index, setIndex, onClose, canManage }) {
  const m = list[index];
  useEffect(() => { const k = (e) => { if (e.key === 'ArrowRight') setIndex(Math.min(list.length - 1, index + 1)); if (e.key === 'ArrowLeft') setIndex(Math.max(0, index - 1)); if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [index, list.length]);
  if (!m) return null;
  return html`<div class="scrim" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}><div class="lightbox" role="dialog" aria-label="Photo viewer">
    <div class=${'frame c-' + (m.tone || 'lav')}><${Shot} m=${m} />
      ${index > 0 && html`<button class="btn icon" style="position:absolute;left:10px;z-index:2" aria-label="Previous" onClick=${() => setIndex(index - 1)}><${Icon} name="left" /></button>`}
      ${index < list.length - 1 && html`<button class="btn icon" style="position:absolute;right:10px;z-index:2" aria-label="Next" onClick=${() => setIndex(index + 1)}><${Icon} name="right" /></button>`}
      <button class="btn icon" style="position:absolute;right:10px;top:10px;z-index:2" aria-label="Close" onClick=${onClose}><${Icon} name="x" /></button></div>
    <div class="col" style="padding:14px 18px 18px"><div class="row wrap"><${Avatar} id=${m.userId} /><div class="col grow" style="gap:0"><b>${m.caption || 'Untitled'}</b><span class="tiny muted">${user(m.userId).name} · ${ago(m.at)} · ${index + 1} of ${list.length}</span></div>
      ${(m.sample || m.simulated) && html`<${Sim}>Sample image<//>`}</div>
      <div class="row wrap"><button class="btn sm" onClick=${async () => toast((await copyText(`${m.caption || 'A memory'} — ${location.href}`)) ? 'Share text copied' : 'Copy is unavailable here', true)}><${Icon} name="send" size=${15} />Share memory</button>
        ${(canManage || m.userId === meId()) && html`<${Confirm} onConfirm=${() => { removeItem('media', m.id); list.length <= 1 ? onClose() : setIndex(Math.max(0, index - 1)); }} />`}</div></div>
  </div></div>`;
}

export function Gallery({ ev }) {
  const tabs = Object.keys(GALLERIES).filter((g) => can(ev.id, GALLERIES[g].view));
  const [tab, setTab] = useState(tabs.includes('memories') && !can(ev.id, 'addOrganiserGallery') ? 'memories' : tabs[0]); const [cam, setCam] = useState(false); const [shot, setShot] = useState(null); const [view, setView] = useState(null); const [access, setAccess] = useState(false);
  const cur = tabs.includes(tab) ? tab : tabs[0]; if (!cur) return html`<div class="card"><${Empty} emoji="🔒" title="The galleries are private">The host hasn’t shared them with you.<//></div>`;
  const g = GALLERIES[cur]; const list = mediaOf(ev.id, cur); const canAdd = can(ev.id, g.add); const addable = tabs.filter((t) => can(ev.id, GALLERIES[t].add));
  const pick = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.type.startsWith('video')) return isCloud() ? toast('Videos aren’t supported yet. Choose a photo.') : setShot({ type: 'video', emoji: '🎬', tone: 'sky', name: f.name });
    try { setShot({ src: await readImage(f) }); } catch { toast('That file could not be read as an image'); } };
  const sample = () => { const [emoji, tone] = SCENES[Math.floor(Math.random() * SCENES.length)]; setShot({ emoji, tone, simulated: true }); };
  return html`<div class="sec-head"><h2>Gallery</h2><div class="row wrap">${tabs.length > 1 && html`<${Seg} value=${cur} onChange=${setTab} options=${tabs.map((t) => ({ id: t, label: GALLERIES[t].label, count: mediaOf(ev.id, t).length }))} />`}
      ${isOwner(ev.id) && html`<button class="btn" onClick=${() => setAccess(!access)}><${Icon} name="lock" />Access</button>`}</div></div>
    ${access && html`<div class="card col"><h3>Who can see and add to each gallery</h3><${PermTable} ev=${ev} caps=${['viewOrganiserGallery', 'addOrganiserGallery', 'viewMemories', 'addMemories']} /></div>`}
    <div class=${cx('card tint col', cur === 'memories' ? 'c-coral' : 'c-lav')}><div class="row between wrap"><div class="col" style="gap:2px"><h3>${g.label}</h3><span class="small" style="color:var(--ci)">${g.blurb}</span></div>
      ${canAdd ? html`<div class="row wrap"><button class="btn primary" onClick=${() => setCam(true)}><${Icon} name="camera" />Take photo</button>
        <label class="btn" style="cursor:pointer"><${Icon} name="upload" />Upload<input id="media-upload" type="file" hidden accept=${isCloud() ? 'image/*' : 'image/*,video/*'} onChange=${pick} /></label>
        ${!isCloud() && html`<button class="btn" onClick=${sample} title="Adds a stand-in picture without choosing a file"><${Icon} name="sparkle" />Sample photo</button>`}</div>` : html`<span class="pill"><${Icon} name="lock" size=${13} />View only</span>`}</div></div>
    ${!list.length ? html`<div class="card"><${Empty} emoji="📷" title="No photos yet">${canAdd ? 'Be the first to add one.' : 'Check back after the event.'}<//></div>`
      : html`<div class="photos">${list.map((m, i) => html`<button key=${m.id} class=${'photo c-' + (m.tone || 'lav')} onClick=${() => setView(i)} aria-label=${m.caption || 'Open photo'}><${Shot} m=${m} />
        ${m.type === 'video' && html`<span class="badge pill c-sky"><${Icon} name="video" size=${13} />Video</span>`}${m.lost && html`<span class="badge pill">Image not stored</span>`}<span class="cap">${m.caption}<br /><span style="opacity:.8;font-weight:600">${user(m.userId).name.split(' ')[0]} · ${ago(m.at)}</span></span></button>`)}</div>`}
    ${cam && html`<${CameraModal} onClose=${() => setCam(false)} onShot=${(s) => { setCam(false); setShot(s); }} />`}
    ${shot && html`<${CaptionModal} ev=${ev} shot=${shot} gallery=${cur} options=${addable} onClose=${() => setShot(null)} />`}
    ${view != null && html`<${Lightbox} list=${list} index=${view} setIndex=${setView} onClose=${() => setView(null)} canManage=${isOwner(ev.id) || can(ev.id, 'manageTeams')} />`}`;
}
