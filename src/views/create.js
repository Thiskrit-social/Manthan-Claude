// Multi-step event creation. Finishing it generates the event's workspace from the chosen size preset.
import { html, useState } from '../lib.js';
import { CATEGORIES, COMPLEXITY, PRIVACY, TONES, SECTIONS, FEATURES, TEMPLATES, category, suggestComplexity } from '../config.js';
import { ThemePicker } from './invite-look.js';
import { createEvent, isCloud } from '../store.js';
import { go, Icon, Field, Cover, Pill, toast } from '../ui.js';
import { cx, addDays, fmtLong, fmtTime, readImage } from '../utils.js';

const STEPS = ['The basics', 'When and where', 'Look and privacy', 'Workspace size'];
const EMOJI = ['🎉', '🪩', '🎂', '🍝', '💐', '🎓', '🤝', '🎤', '🎪', '🏕️', '🎬', '🌮', '🍾', '🏖️', '🎃', '🎄'];

export function CreateEvent() {
  const [step, setStep] = useState(0); const [touched, setTouched] = useState(false); const [withTeams, setWithTeams] = useState(true);
  const [d, setD] = useState({ name: '', category: 'houseparty', description: '', date: addDays(14), start: '19:00', end: '23:00', location: '', expected: 15, privacy: 'private', complexity: 'simple', cover: { tone: 'lav', emoji: '🪩' } });
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value }); const suggested = suggestComplexity(+d.expected); const preset = COMPLEXITY[d.complexity];
  const [tpl, setTpl] = useState(null);
  // A template fills in the usual details for that kind of event. The name and anything already typed stay.
  const useTemplate = (t) => { setTpl(t.id); setTouched(false); setD({ ...d, category: t.category, description: t.description, start: t.start, end: t.end, expected: t.expected, privacy: t.privacy || 'private',
    complexity: suggestComplexity(t.expected), cover: d.cover.image ? { ...d.cover, theme: t.theme } : { tone: t.tone, emoji: t.emoji, theme: t.theme } }); toast(`${t.label} template applied. Change anything you like.`); };
  const pickCategory = (c) => setD({ ...d, category: c.id, cover: d.cover.image ? d.cover : { tone: c.tone, emoji: c.emoji, theme: d.cover.theme } });
  const next = () => { if (step === 0 && !d.name.trim()) return toast('Give your event a name'); if (step === 1 && !d.date) return toast('Pick a date');
    if (step === 1 && !touched) setD((x) => ({ ...x, complexity: suggestComplexity(+x.expected) })); setStep(step + 1); };
  const finish = () => { const id = createEvent(d, withTeams); toast(`${d.name} is ready 🎉`); go(`e-${id}-planner`); };
  return html`<div class="col gap-l" style="max-width:760px;margin:0 auto;width:100%">
    <div class="col gap-s"><div class="row between"><span class="eyebrow">Step ${step + 1} of ${STEPS.length}</span><button class="btn ghost sm" onClick=${() => go('home')}>Cancel</button></div><h1>${step === 0 ? 'What are you planning?' : STEPS[step]}</h1>
      <div class="steps">${STEPS.map((_, i) => html`<i key=${i} class=${cx(i <= step && 'on')}></i>`)}</div></div>
    ${step === 0 && html`<div class="card col gap-l">
      <div class="col gap-s"><span class="eyebrow">Start from a template (optional)</span><div class="chips">${TEMPLATES.map((t) => html`<button key=${t.id} id=${'tpl-' + t.id} class=${cx('chip', tpl === t.id && 'on')} aria-pressed=${tpl === t.id} onClick=${() => useTemplate(t)}>${t.emoji} ${t.label}</button>`)}</div></div>
      <${Field} label="Event name"><input id="event-name" class="input" style="font:700 1.2rem var(--display)" autofocus placeholder="e.g. Rooftop birthday" value=${d.name} onInput=${set('name')} /><//>
      <div class="col gap-s"><span class="eyebrow">Category</span><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr))">${CATEGORIES.map((c) => html`<button key=${c.id} class=${cx('pick center', d.category === c.id && 'on')} onClick=${() => pickCategory(c)}><span style="font-size:1.5rem">${c.emoji}</span>${c.label}</button>`)}</div></div>
      <${Field} label="Description"><textarea id="event-description" class="input" placeholder="Tell guests what to expect" value=${d.description} onInput=${set('description')}></textarea><//></div>`}
    ${step === 1 && html`<div class="card col gap-l"><div class="form-grid"><${Field} label="Date"><input id="event-date" class="input" type="date" value=${d.date} onInput=${set('date')} /><//>
        <${Field} label="Starts"><input class="input" type="time" value=${d.start} onInput=${set('start')} /><//><${Field} label="Ends"><input class="input" type="time" value=${d.end} onInput=${set('end')} /><//></div>
      <${Field} label="Location"><input id="event-location" class="input" placeholder="Address, venue or “my place”" value=${d.location} onInput=${set('location')} /><//>
      <${Field} label="Expected attendance" hint=${`About ${d.expected || 0} people suggests a ${COMPLEXITY[suggested].label.toLowerCase()} workspace. You choose on the last step.`}><input id="event-expected" class="input" type="number" min="1" value=${d.expected} onInput=${set('expected')} /><//>
      <div class="chips">${[8, 15, 40, 120, 300, 1000].map((n) => html`<button key=${n} class=${cx('chip', +d.expected === n && 'on')} onClick=${() => setD({ ...d, expected: n })}>${n}</button>`)}</div></div>`}
    ${step === 2 && html`<div class="card col gap-l"><${Cover} ev=${d} size="hero" />
      <div class="col gap-s"><span class="eyebrow">Cover</span><div class="row wrap">${TONES.map((t) => html`<button key=${t} aria-label=${t + ' cover'} class=${'c-' + t} style=${`width:36px;height:36px;border-radius:12px;background:var(--c);outline:${d.cover.tone === t && !d.cover.image ? '3px solid var(--ink)' : 'none'};outline-offset:2px`} onClick=${() => setD({ ...d, cover: { tone: t, emoji: d.cover.emoji || '🎉', theme: d.cover.theme } })}></button>`)}
        <label class="btn" style="cursor:pointer"><${Icon} name="upload" />Upload image<input type="file" hidden accept="image/*" onChange=${async (e) => { const f = e.target.files[0]; if (f) try { setD({ ...d, cover: { ...d.cover, image: await readImage(f, 1000) } }); } catch { toast('That image could not be read'); } }} /></label>
        ${d.cover.image && html`<button class="btn ghost" onClick=${() => setD({ ...d, cover: { tone: d.cover.tone, emoji: d.cover.emoji, theme: d.cover.theme } })}>Remove image</button>`}</div>
        <div class="chips">${EMOJI.map((e) => html`<button key=${e} class=${cx('chip', d.cover.emoji === e && !d.cover.image && 'on')} aria-label=${'Cover ' + e} onClick=${() => setD({ ...d, cover: { tone: d.cover.tone, emoji: e, theme: d.cover.theme } })}>${e}</button>`)}</div></div>
      <div class="col gap-s"><span class="eyebrow">Invitation theme</span><${ThemePicker} value=${d.cover.theme} onChange=${(t) => setD({ ...d, cover: { ...d.cover, theme: t } })} /></div>
      <div class="col gap-s"><span class="eyebrow">Who can see this event</span><div class="grid g3">${PRIVACY.map((p) => html`<button key=${p.id} class=${cx('pick', d.privacy === p.id && 'on')} onClick=${() => setD({ ...d, privacy: p.id })}><b>${p.label}</b><span class="small muted">${p.hint}</span></button>`)}</div></div></div>`}
    ${step === 3 && html`<div class="col gap-l">
      <div class="grid g3">${Object.entries(COMPLEXITY).map(([k, c]) => html`<button key=${k} class=${cx('pick', d.complexity === k && 'on')} onClick=${() => { setD({ ...d, complexity: k }); setTouched(true); }}>
        <div class="row between"><span style="font-size:1.7rem">${c.emoji}</span>${suggested === k && html`<${Pill} tone="mint">Suggested<//>`}</div><h3>${c.label} event</h3><span class="small muted">${c.blurb}</span></button>`)}</div>
      <div class=${'card tint col c-' + preset.tone}><h3>Your workspace starts with</h3>
        <div class="chips">${SECTIONS.filter((s) => preset.modules.includes(s.id) && !(isCloud() && s.id === 'files')).map((s) => html`<span class="chip" key=${s.id}><${Icon} name=${s.icon} size=${14} />${s.id === 'teams' ? preset.teamWord + 's' : s.label}</span>`)}</div>
        <div class="chips">${FEATURES.filter((f) => preset.features.includes(f.id)).map((f) => html`<span class="pill" key=${f.id}>+ ${f.label}</span>`)}</div>
        <span class="small" style="color:var(--ci)">You can switch on anything else later, without starting a new event.</span></div>
      <button class=${cx('pick', withTeams && 'on')} style="flex-direction:row;align-items:center;gap:12px" role="switch" aria-checked=${withTeams} onClick=${() => setWithTeams(!withTeams)}><span class=${cx('tick', withTeams && 'on')}><${Icon} name="check" /></span>
        <span class="col" style="gap:0"><b>Start with suggested ${preset.teamWord.toLowerCase()}s</b><span class="small muted">${preset.teams.slice(0, d.complexity === 'large' ? 8 : 4).map(([n, i]) => `${i} ${n}`).join('   ')}</span></span></button>
      <div class="card row wrap"><div style="width:120px;flex:none"><${Cover} ev=${d} size="sm" /></div><div class="col grow" style="gap:2px"><h3>${d.name}</h3><span class="small muted">${category(d.category).label} · ${fmtLong(d.date)} · ${fmtTime(d.start)} · about ${d.expected} people</span><span class="small muted">${d.location || 'Location to be confirmed'}</span></div></div></div>`}
    <div class="row between"><button class="btn" disabled=${step === 0} onClick=${() => setStep(step - 1)}><${Icon} name="left" />Back</button>
      ${step < 3 ? html`<button class="btn primary" onClick=${next}>Continue<${Icon} name="right" /></button>` : html`<button class="btn primary" onClick=${finish}><${Icon} name="sparkle" />Create event</button>`}</div>
  </div>`;
}
