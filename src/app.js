// Application shell: side navigation on desktop, top bar and tab bar on phones.
import { html, render, useState, useEffect } from './lib.js';
import { BRAND } from './config.js';
import { subscribe, me, eventsFor, unreadCount, tasksFor, switchUser, S, isCloud } from './store.js';
import { cloudConfig, getMode, setMode, session, startCloud, onStatus, syncStatus } from './backend.js';
import { AuthGate, Splash } from './views/auth.js';
import { PERSONAS } from './seed.js';
import { route, go, Icon, Avatar, Toasts, Modal, Sim, toast } from './ui.js';
import { cx } from './utils.js';
import { Home, Events, MyTasks, Inbox, Profile, Invite } from './views/home.js';
import { CreateEvent } from './views/create.js';
import { Workspace } from './views/workspace.js';

const NAV = [
  { id: 'home', label: 'Home', icon: 'home' }, { id: 'events', label: 'My Events', icon: 'calendar' },
  { id: 'mytasks', label: 'My Tasks', icon: 'tasks' }, { id: 'inbox', label: 'Notifications', icon: 'bell' }, { id: 'profile', label: 'Profile', icon: 'user' },
];

export function PersonaSwitcher({ onClose }) {
  return html`<${Modal} title="View the prototype as" eyebrow="Demo sign-in" onClose=${onClose}>
    <p class="small muted">There is one account system. Each person below has different roles in different events, so switching shows how the same workspace adapts. <${Sim}>No real sign-in<//></p>
    <div class="col gap-s">${PERSONAS.map((p) => { const u = S().users[p.id]; const on = p.id === me().id; return html`
      <button key=${p.id} class=${cx('pick', on && 'on')} style="flex-direction:row;align-items:center;gap:12px" onClick=${() => { switchUser(p.id); onClose(); go('home'); toast(`Now viewing as ${u.name}`); }}>
        <${Avatar} id=${p.id} size="lg" /><span class="col grow" style="gap:0"><b>${u.name}</b><span class="small muted">${p.note}</span></span>${on && html`<${Icon} name="check" />`}
      </button>`; })}</div>
  <//>`;
}

function SyncBadge() {
  const [st, setSt] = useState({ ...syncStatus });
  useEffect(() => onStatus((x) => setSt({ ...x })), []);
  const view = { saving: ['sky', 'Saving…'], error: ['coral', 'Couldn’t save'], offline: ['butter', 'Offline'] }[st.state] || ['mint', 'Saved to your account'];
  return html`<div class=${'sync c-' + view[0]} title=${st.message || ''} role="status"><i></i>${view[1]}</div>`;
}

function App() {
  const [, tick] = useState(0); const [r, setR] = useState(route()); const [who, setWho] = useState(false);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);
  useEffect(() => { const h = () => setR(route()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const u = me(); const unread = unreadCount(); const open = tasksFor().filter((t) => t.status !== 'done').length;
  const counts = { inbox: unread, mytasks: open };
  const active = r.name === 'event' || r.name === 'invite' ? 'events' : r.name;
  const mine = eventsFor();
  const view = r.name === 'event' ? html`<${Workspace} key=${r.eventId + u.id} eventId=${r.eventId} section=${r.section} />`
    : r.name === 'invite' ? html`<${Invite} eventId=${r.eventId} token=${r.token} />` : r.name === 'new' ? html`<${CreateEvent} />`
    : r.name === 'events' ? html`<${Events} />` : r.name === 'mytasks' ? html`<${MyTasks} />` : r.name === 'inbox' ? html`<${Inbox} />`
    : r.name === 'profile' ? html`<${Profile} onSwitch=${() => setWho(true)} />` : html`<${Home} />`;

  return html`<div class="app">
    <aside class="sidebar">
      <a class="brand" href="#home" style="text-decoration:none"><span class="brand-mark">${BRAND.mark}</span>${BRAND.name}</a>
      <button class="btn primary" onClick=${() => go('new')}><${Icon} name="plus" />Create event</button>
      <nav class="nav" aria-label="Main">${NAV.map((n) => html`<button key=${n.id} class=${cx('nav-item', active === n.id && 'on')} onClick=${() => go(n.id)}><${Icon} name=${n.icon} />${n.label}${counts[n.id] > 0 && html`<span class="count">${counts[n.id]}</span>`}</button>`)}</nav>
      <div class="col gap-s"><div class="eyebrow" style="padding:0 10px">Your events</div>
        <nav class="nav" aria-label="Events">${mine.map(({ event: e }) => html`<button key=${e.id} class=${cx('nav-item nav-ev', r.eventId === e.id && 'on')} onClick=${() => go(`e-${e.id}-overview`)}><span class=${'dot c-' + e.cover.tone}>${e.cover.emoji}</span><span class="clip">${e.name}</span></button>`)}</nav>
      </div>
      ${isCloud() && html`<${SyncBadge} />`}
      ${isCloud() ? html`<button class="who" onClick=${() => go('profile')} title="Your account"><${Avatar} id=${u.id} /><span class="col grow" style="gap:0"><b class="clip">${u.name}</b><span class="tiny muted clip">${u.email || 'Your account'}</span></span><${Icon} name="right" /></button>`
        : html`<button class="who" onClick=${() => setWho(true)} title="Switch demo persona"><${Avatar} id=${u.id} /><span class="col grow" style="gap:0"><b class="clip">${u.name}</b><span class="tiny muted">Switch demo persona</span></span><${Icon} name="swap" /></button>`}
    </aside>
    <div class="main">
      <header class="topbar"><a class="brand grow" href="#home" style="text-decoration:none;padding:0;font-size:1.15rem"><span class="brand-mark" style="width:28px;height:28px">${BRAND.mark}</span>${BRAND.name}</a>
        <button class="btn sm" aria-label="Profile" onClick=${() => go('profile')}><${Avatar} id=${u.id} size="sm" />${u.name.split(' ')[0]}</button></header>
      <main class="page">${!isCloud() && cloudConfig() && html`<div class="banner c-butter demo-banner" role="status"><span class="grow">You’re looking at the <b>demo</b>: Maya, Leo and the others are sample people, and nothing here is saved to an account.</span><button class="btn sm primary" onClick=${() => { setMode(null); location.hash = 'home'; location.reload(); }}>Sign in</button></div>`}${view}</main>
    </div>
    <nav class="tabbar" aria-label="Main">
      ${[NAV[0], NAV[1], null, NAV[2], NAV[3]].map((n) => (n ? html`<button key=${n.id} class=${cx('tab', active === n.id && 'on')} onClick=${() => go(n.id)}><${Icon} name=${n.icon} size=${22} />${n.label.replace('My ', '').replace('Notifications', 'Alerts')}${counts[n.id] > 0 && html`<span class="count">${counts[n.id]}</span>`}</button>`
        : html`<button key="new" class="tab" aria-label="Create event" onClick=${() => go('new')}><span class="tab-create"><${Icon} name="plus" size=${22} /></span></button>`))}
    </nav>
    ${who && html`<${PersonaSwitcher} onClose=${() => setWho(false)} />`}
    <${Toasts} />
  </div>`;
}

// Boot: with a Supabase project configured, people sign in and their data comes from the server.
// Without one (or after choosing the demo) the app runs on local sample data as before.
function Root() {
  const [phase, setPhase] = useState('boot'); const [error, setError] = useState('');
  const enter = async (opts = {}) => {
    setPhase('loading');
    try { await startCloud({ ...opts, onError: (m) => toast(m) }); setPhase('ready'); }
    catch (e) { setError(e.message); setPhase('auth'); }
  };
  useEffect(() => {
    if (!cloudConfig()) return setPhase('demo');
    // Someone who is signed in always gets their account, even if this tab was showing the demo.
    session().then((s) => { if (s) { setMode(null); return enter(); } setPhase(getMode() === 'demo' ? 'demo' : 'auth'); })
      .catch((e) => { if (getMode() === 'demo') return setPhase('demo'); setError(e.message); setPhase('auth'); });
  }, []);
  if (phase === 'boot' || phase === 'loading') return html`<${Splash} text=${phase === 'boot' ? 'Starting…' : 'Loading your events…'} />`;
  if (phase === 'auth') return html`<${AuthGate} onSignedIn=${enter} error=${error} />`;
  return html`<${App} />`;
}

render(html`<${Root} />`, document.getElementById('app'));
