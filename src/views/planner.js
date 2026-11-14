// Planner: brief -> proposed plan -> review and apply -> ongoing co-pilot suggestions.
import { html, useState, useEffect } from '../lib.js';
import { COMPLEXITY } from '../config.js';
import { S, me, membersOf, committeesOf, tasksOf, user, postUpdate, plannerLog, isCloud } from '../store.js';
import { AREAS, defaultAreas, draftPlan, draftPlanAI, askCopilot, applyPlan, suggestions, statusSummary } from '../planner.js';
import { PROVIDERS, aiSettings, saveAiSettings, activeProvider, askJSON } from '../ai.js';
import { go, Icon, Avatar, Pill, Field, Switch, Empty, Sim, toast } from '../ui.js';
import { cx, fmtDate, ago, money } from '../utils.js';

// Which model (if any) is answering. `undefined` while checking, `null` when the planner is on built-in rules.
function useModel() {
  const [p, setP] = useState(undefined); const [n, setN] = useState(0);
  useEffect(() => { let live = true; activeProvider().then((v) => live && setP(v)); return () => { live = false; }; }, [n]);
  return [p, () => setN((x) => x + 1)];
}
const ModelTag = ({ model }) => (model ? html`<${Pill} tone="mint" dot>AI: ${PROVIDERS[model].label.replace(/ \(.*/, '')}<//>` : isCloud() ? null : html`<${Sim}>${model === undefined ? 'Checking for a model' : 'Built-in rules, no AI model'}<//>`);

function ModelSettings({ model, onChange }) {
  const [s, setS] = useState(aiSettings()); const [test, setTest] = useState(''); const def = PROVIDERS[s.provider];
  const save = (next) => { setS(next); saveAiSettings(next); setTest(''); onChange(); };
  const run = async () => { setTest('Asking the model…'); try { const r = await askJSON('Reply with {"ok":true,"greeting":"a five word hello to an event host"}'); setTest('It answered: ' + (r.greeting || 'ok')); } catch (e) { setTest('That did not work: ' + e.message); } onChange(); };
  return html`<div class="card col"><div class="row wrap"><h3 class="grow">AI model</h3><${ModelTag} model=${model} /></div>
    <p class="small muted">With a model connected, the planner writes the plan from your notes and answers free-form requests. Without one it falls back to built-in rules. Your event details, notes and the names of people involved are sent to the model you choose.</p>
    <div class="form-grid"><${Field} label="Use" hint=${def.hint || ''}><select id="ai-provider" class="input" value=${s.provider} onChange=${(e) => save({ ...s, provider: e.target.value })}>${Object.entries(PROVIDERS).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select><//>
      ${def.key && html`<${Field} label="API key" hint="Stored in this browser only."><input id="ai-key" class="input" type="password" autocomplete="off" placeholder="Paste your key" value=${s.keys[s.provider] || ''} onInput=${(e) => save({ ...s, keys: { ...s.keys, [s.provider]: e.target.value.trim() } })} /><//>
        <${Field} label="Model" hint="Change this if the provider has renamed its free model."><input id="ai-model" class="input" value=${s.models[s.provider] || def.model} onInput=${(e) => save({ ...s, models: { ...s.models, [s.provider]: e.target.value.trim() } })} /><//>`}</div>
    ${def.key && html`<span class="small muted">Get a free key at <a href=${def.keyUrl} target="_blank" rel="noopener">${def.keyUrl.replace('https://', '')}</a>. Free tiers have daily limits.</span>`}
    ${!model && s.provider !== 'rules' && !def.key && html`<div class="banner c-butter">No model is available here with this choice. ${s.provider === 'chrome' ? 'This browser does not offer a built-in model.' : 'Open the app from its claude.ai preview link to use Claude, or choose a provider and add a free key.'}</div>`}
    <div class="row wrap"><button class="btn" disabled=${!model} onClick=${run}>Test the connection</button>${test && html`<span class="small" id="ai-test">${test}</span>`}</div></div>`;
}

function PeopleInput({ label, hint, value, onChange, exclude = [] }) {
  const [text, setText] = useState('');
  const add = (raw) => { const names = raw.split(/[,\n]/).map((n) => n.trim()).filter(Boolean); if (names.length) onChange([...new Set([...value, ...names])]); setText(''); };
  const known = Object.values(S().users).map((u) => u.name).filter((n) => n !== me().name && !value.includes(n) && !exclude.includes(n)).slice(0, 8);
  return html`<div class="col gap-s"><span class="eyebrow">${label}</span>${hint && html`<span class="small muted">${hint}</span>`}
    <div class="row"><input class="input" placeholder="Type names, separated by commas" value=${text} onInput=${(e) => setText(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && (e.preventDefault(), add(text))} /><button class="btn sm" onClick=${() => add(text)}>Add</button></div>
    ${value.length > 0 && html`<div class="chips">${value.map((n) => html`<span class="chip on" key=${n}>${n}<button aria-label=${'Remove ' + n} onClick=${() => onChange(value.filter((x) => x !== n))}><${Icon} name="x" size=${13} /></button></span>`)}</div>`}
    ${known.length > 0 && html`<div class="chips">${known.map((n) => html`<button class="chip" key=${n} onClick=${() => onChange([...value, n])}>+ ${n}</button>`)}</div>`}</div>`;
}

function Brief({ ev, brief, setBrief, onDraft, busy, model }) {
  const set = (k, v) => setBrief({ ...brief, [k]: v });
  return html`<div class="card col gap-l">
    <div class="col gap-s"><h3>Tell me a little about ${ev.name}</h3><p class="small muted">I already know the date, time, place and size. Add what you can and I’ll draft teams, hand-offs, tasks, a schedule and invitations for you to review. Nothing changes until you approve it.</p></div>
    <${Field} label="Anything I should know?" hint="For example: rooftop, mostly vegetarian, it’s a surprise, music off by 11."><textarea id="planner-notes" class="input" value=${brief.notes} onInput=${(e) => set('notes', e.target.value)} placeholder="The vibe, constraints, must-haves"></textarea><//>
    <div class="col gap-s"><span class="eyebrow">What needs organising</span><div class="chips">${Object.entries(AREAS).map(([k, a]) => html`<button key=${k} class=${cx('chip', brief.areas.includes(k) && 'on')} aria-pressed=${brief.areas.includes(k)} onClick=${() => set('areas', brief.areas.includes(k) ? brief.areas.filter((x) => x !== k) : [...brief.areas, k])}>${a.icon} ${a.name}</button>`)}</div></div>
    <${Field} label=${`Total budget (${ev.currency})`} hint="Leave empty to skip budgeting."><input id="planner-budget" class="input" type="number" min="0" style="max-width:220px" value=${brief.budget} onInput=${(e) => set('budget', e.target.value)} /><//>
    <${PeopleInput} label="Who is helping you organise?" hint="I’ll make them team leads and members and hand tasks to them." value=${brief.helpers} onChange=${(v) => set('helpers', v)} exclude=${brief.guests} />
    <${PeopleInput} label="Who else should be invited?" hint="Helpers are invited automatically." value=${brief.guests} onChange=${(v) => set('guests', v)} exclude=${brief.helpers} />
    <div class="row between wrap"><${ModelTag} model=${model} /><button class="btn primary" disabled=${!brief.areas.length || busy} onClick=${onDraft}><${Icon} name="sparkle" />${busy ? 'Thinking…' : 'Draft my plan'}</button></div>
  </div>`;
}

function Review({ ev, plan, setPlan, onBack, onApply }) {
  const word = COMPLEXITY[ev.complexity].teamWord.toLowerCase(); const flip = (k) => setPlan({ ...plan, on: { ...plan.on, [k]: !plan.on[k] } });
  const active = plan.teams.filter((t) => t.on); const nTasks = active.reduce((n, t) => n + t.tasks.length, 0) + (plan.on.core ? plan.core.length : 0);
  const Row = ({ k, title, sub, children }) => html`<div class="card col"><div class="row"><div class="col grow" style="gap:1px"><h3>${title}</h3><span class="small muted">${sub}</span></div><${Switch} on=${plan.on[k]} label=${title} onChange=${() => flip(k)} /></div>${plan.on[k] && children}</div>`;
  return html`<div class="col gap-l">
    <div class="card tint c-lav col"><div class="row wrap"><h3 class="grow">Here’s my proposed plan</h3>${plan.ai ? html`<${Pill} tone="mint" dot>Written by the AI model<//>` : html`<${Sim}>Built-in rules<//>`}</div>
      ${plan.fallback && html`<div class="banner c-butter">The model could not be reached (${plan.fallback}), so this draft uses the built-in rules.</div>`}
      <p style="color:var(--ci)">${active.length} ${word}s, ${nTasks} tasks, ${plan.on.schedule ? plan.schedule.length : 0} schedule items and ${plan.on.guests ? plan.guests.length : 0} invitations. Switch off anything you don’t want, then apply.</p>
      ${plan.noticed.length > 0 && html`<span class="small" style="color:var(--ci)">Picked up from your notes: ${plan.noticed.join(', ')}.</span>`}</div>
    <div class="col"><h3>${COMPLEXITY[ev.complexity].teamWord}s and hand-offs</h3><div class="grid g2">${plan.teams.map((t, i) => html`<div class=${cx('card col', 'c-' + t.tone)} key=${t.key} style=${t.on ? '' : 'opacity:.5'}>
      <div class="row"><span style="font-size:1.4rem">${t.icon}</span><div class="col grow" style="gap:0"><b>${t.name} ${t.existingId && html`<${Pill}>Already exists<//>`}</b><span class="small muted">${t.lead ? 'Lead: ' + t.lead : 'No lead yet, tasks stay with you'}${t.members.length ? ' · with ' + t.members.join(', ') : ''}</span></div>
        <${Switch} on=${t.on} label=${'Include ' + t.name} onChange=${() => setPlan({ ...plan, teams: plan.teams.map((x, n) => (n === i ? { ...x, on: !x.on } : x)) })} /></div>
      ${t.on && html`<div class="col gap-s">${t.tasks.map((k) => html`<div class="row small" key=${k.title}><span class="grow">${k.title}${k.dep ? html` <span class="tiny muted">after “${k.dep}”</span>` : ''}</span><span class="muted nowrap">${k.assignee.split(' ')[0]} · ${fmtDate(k.due, { day: 'numeric', month: 'short' })}</span></div>`)}
        ${!t.tasks.length && html`<span class="small muted">Its tasks are already in place.</span>`}${plan.on.budget && t.budget > 0 && html`<span class="small b">Budget ${money(t.budget, ev.currency)}</span>`}</div>`}</div>`)}</div></div>
    <${Row} k="core" title="Your own checklist" sub=${`${plan.core.length} tasks that stay with you`}>${plan.core.map((k) => html`<div class="row small" key=${k.title}><span class="grow">${k.title}</span><span class="muted nowrap">${fmtDate(k.due, { day: 'numeric', month: 'short' })}</span></div>`)}<//>
    ${plan.schedule.length > 0 && html`<${Row} k="schedule" title="Run of the day" sub="Drafted from your start and end times">${plan.schedule.map((x) => html`<div class="row small" key=${x.title}><b class="num" style="width:64px">${x.start}</b><span class="grow">${x.title}</span><span class="muted">${x.owner.split(' ')[0]}</span></div>`)}<//>`}
    ${plan.budget > 0 && html`<${Row} k="budget" title=${`Budget of ${money(plan.budget, ev.currency)}`} sub=${`Split across teams by typical spend, with ${money(plan.reserve, ev.currency)} held back for surprises`} />`}
    ${plan.guests.length > 0 && html`<${Row} k="guests" title=${`Invite ${plan.guests.length} people`} sub="They appear on the guest list as waiting for a reply"><div class="chips">${plan.guests.map((n) => html`<span class="chip" key=${n}>${n}</span>`)}</div><span class="small muted"><${Sim}>No email is sent<//> People with an account here get an in-app invitation.</span><//>`}
    <${Row} k="welcome" title="Welcome announcement" sub="Posted to everyone at the event"><textarea class="input" value=${plan.welcome} onInput=${(e) => setPlan({ ...plan, welcome: e.target.value })}></textarea><//>
    <div class="row between wrap"><button class="btn" onClick=${onBack}><${Icon} name="left" />Change the brief</button><button class="btn primary" onClick=${onApply}><${Icon} name="check" />Apply this plan</button></div>
  </div>`;
}

function Copilot({ ev, onReplan, model }) {
  const list = suggestions(ev); const log = ev.planner?.log || [];
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [answer, setAnswer] = useState(null);
  const ask = async (e) => { e.preventDefault(); if (!q.trim() || busy) return; setBusy(true); setAnswer(null);
    try { setAnswer({ q: q.trim(), ...(await askCopilot(ev, q.trim())), done: [] }); setQ(''); } catch (err) { setAnswer({ q: q.trim(), error: err.message }); } setBusy(false); };
  const doAction = (i) => { const a = answer.actions[i]; a.run(); setAnswer({ ...answer, done: [...answer.done, i] }); toast('Done', a.sim); };
  const act = (s) => { if (s.link) return go(s.link); toast(s.run(), s.sim); };
  return html`<div class="split">
    <div class="col gap-l">
      <div class="card col"><div class="row between wrap"><h3>What I’d do next</h3><span class="pill num">${list.length} ${list.length === 1 ? 'suggestion' : 'suggestions'}</span></div>
        ${!list.length ? html`<${Empty} emoji="🌤️" title="Everything is on track">I’ll flag unanswered invitations, unassigned or overdue tasks and budget problems as they come up.<//>`
          : html`<div class="list">${list.map((s) => html`<div class="row wrap top" key=${s.id}><span class=${'avatar lg c-' + s.tone} style="border-radius:14px">${s.emoji}</span>
            <div class="col grow" style="gap:1px;min-width:170px"><b>${s.title}</b><span class="small muted">${s.detail}</span></div><button class=${'btn soft c-' + s.tone} data-suggest=${s.id} onClick=${() => act(s)}>${s.cta}</button></div>`)}</div>`}</div>
      <div class="card col"><div class="row wrap"><h3 class="grow">Ask the planner</h3><${ModelTag} model=${model} /></div>
        ${model ? html`<form class="row" onSubmit=${ask}><input id="planner-ask" class="input" placeholder="e.g. Who is overloaded? Draft a reminder for people who haven’t replied." value=${q} onInput=${(e) => setQ(e.target.value)} /><button class="btn primary" disabled=${busy}>${busy ? 'Thinking…' : 'Ask'}</button></form>`
          : html`<p class="small muted">Connect an AI model below to ask questions in your own words. The shortcuts still work without one.</p>`}
        ${answer && html`<div class="card flat col"><span class="tiny muted">You asked: ${answer.q}</span>${answer.error ? html`<span style="color:var(--coral-ink)">The model could not answer: ${answer.error}</span>` : html`<p>${answer.reply}</p>
          ${answer.actions.length > 0 && html`<div class="col gap-s"><span class="eyebrow">Proposed actions, nothing happens until you approve</span>${answer.actions.map((a, i) => html`<div class="row" key=${i}><span class="grow small">${a.label}</span>${answer.done.includes(i) ? html`<${Pill} tone="mint">Done<//>` : html`<button class="btn sm" data-ai-action=${i} onClick=${() => doAction(i)}>Do it</button>`}</div>`)}</div>`}`}</div>`}
        <div class="chips">
        <button class="chip" onClick=${() => { postUpdate(ev.id, { scope: 'internal', text: statusSummary(ev) }); plannerLog(ev.id, 'Posted a status summary to the organisers.'); toast('Status summary posted to organisers'); }}>📝 Post a status summary to organisers</button>
        <button class="chip" onClick=${onReplan}>✨ Draft more of the plan</button>
        <button class="chip" onClick=${() => go(`e-${ev.id}-tasks`)}>✅ Review the tasks</button><button class="chip" onClick=${() => go(`e-${ev.id}-people`)}>💌 Review the guest list</button></div>
        <p class="small muted">${statusSummary(ev)}</p></div>
    </div>
    <div class="card col"><h3>What I’ve done</h3>${log.length ? log.slice(0, 12).map((l) => html`<div class="row top small" key=${l.id}><span class="avatar sm c-lav">✨</span><span class="grow">${l.text} <span class="tiny muted">${ago(l.at)}</span></span></div>`) : html`<p class="small muted">Actions I take for you are listed here, so you can always see what changed.</p>`}</div>
  </div>`;
}

export function Planner({ ev }) {
  const fresh = !ev.planner?.appliedAt && tasksOf(ev.id).length === 0;
  const [mode, setMode] = useState(fresh ? 'brief' : 'copilot'); const [plan, setPlan] = useState(null); const [busy, setBusy] = useState(false); const [model, recheck] = useModel(); const [showModel, setShowModel] = useState(false);
  const draft = async () => { let next; if (model) { setBusy(true); try { next = await draftPlanAI(ev, brief); } catch (e) { next = { ...draftPlan(ev, brief), fallback: e.message }; } setBusy(false); } else next = draftPlan(ev, brief);
    setPlan(next); setMode('review'); window.scrollTo(0, 0); };
  const [brief, setBrief] = useState(() => ({ notes: '', budget: ev.budget || '', areas: [...new Set([...defaultAreas(ev), ...Object.keys(AREAS).filter((k) => committeesOf(ev.id).some((c) => c.name.toLowerCase() === AREAS[k].name.toLowerCase()))])],
    helpers: membersOf(ev.id).filter((m) => ['manager', 'lead', 'member'].includes(m.role) && m.userId !== me().id).map((m) => user(m.userId).name), guests: [] }));
  return html`<div class="sec-head"><div class="col" style="gap:4px"><div class="row wrap"><h2>Planner</h2><${ModelTag} model=${model} /></div>
      <p class="muted small" style="max-width:62ch">Your co-pilot for this event. It drafts the plan, hands tasks to the right people and keeps RSVPs moving. You approve everything before it happens.</p></div>
      <div class="row wrap">${!isCloud() && html`<button class="btn" onClick=${() => setShowModel(!showModel)}><${Icon} name="sliders" />AI model</button>`}${mode === 'copilot' && html`<button class="btn" onClick=${() => setMode('brief')}><${Icon} name="sparkle" />New brief</button>`}</div></div>
    ${showModel && html`<${ModelSettings} model=${model} onChange=${recheck} />`}
    ${mode === 'brief' && html`<${Brief} ev=${ev} brief=${brief} setBrief=${setBrief} busy=${busy} model=${model} onDraft=${draft} />${!fresh && html`<div><button class="btn ghost" onClick=${() => setMode('copilot')}>Back to suggestions</button></div>`}`}
    ${mode === 'review' && plan && html`<${Review} ev=${ev} plan=${plan} setPlan=${setPlan} onBack=${() => setMode('brief')} onApply=${() => { const m = applyPlan(ev, plan); setMode('copilot'); window.scrollTo(0, 0); toast(`Plan applied: ${m.tasks} tasks, ${m.handoffs} handed off`); }} />`}
    ${mode === 'copilot' && html`<${Copilot} ev=${ev} model=${model} onReplan=${() => setMode('brief')} />`}`;
}

// Compact prompt shown on the event overview.
export function PlannerNudge({ ev }) {
  const n = suggestions(ev).length; const fresh = !ev.planner?.appliedAt && tasksOf(ev.id).length === 0;
  if (!fresh && !n) return null;
  return html`<button class="banner c-lav" style="width:100%;text-align:left" onClick=${() => go(`e-${ev.id}-planner`)}><span style="font-size:1.2rem">✨</span><span class="grow">${fresh ? 'Let the planner draft teams, tasks and invitations for this event.' : `The planner has ${n} ${n === 1 ? 'suggestion' : 'suggestions'} for this event.`}</span><span class="row gap-s">Open planner<${Icon} name="right" size=${15} /></span></button>`;
}
