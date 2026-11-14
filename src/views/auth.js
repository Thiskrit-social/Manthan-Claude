// Sign-in and sign-up for cloud mode, plus the way into the local demo.
import { html, useState } from '../lib.js';
import { BRAND } from '../config.js';
import { signIn, signUp, resetPassword, updatePassword, setMode, cloudConfig, saveCloudConfig } from '../backend.js';
import { Icon, Field, Seg } from '../ui.js';
import { cx } from '../utils.js';

export function Splash({ text = 'Loading your events…' }) {
  return html`<div class="auth-wrap"><div class="col" style="align-items:center;gap:14px"><span class="brand-mark" style="width:48px;height:48px;font-size:1.5rem">${BRAND.mark}</span><span class="muted">${text}</span></div></div>`;
}

export const LegalLinks = () => html`<a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>`;

// Shown after opening the link in a password-reset email: the person is signed in and chooses a new password.
export function SetPassword({ onDone }) {
  const [p, setP] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const submit = async (e) => { e.preventDefault(); if (busy) return; if (p.length < 6) return setMsg('Passwords need at least 6 characters.');
    setBusy(true); try { await updatePassword(p); onDone(true); } catch (err) { setMsg(err.message); setBusy(false); } };
  return html`<div class="auth-wrap"><div class="auth-card col gap-l">
    <div class="col" style="gap:6px;align-items:flex-start"><span class="brand" style="padding:0"><span class="brand-mark">${BRAND.mark}</span>${BRAND.name}</span><h2>Choose a new password</h2></div>
    <form class="col" onSubmit=${submit}><${Field} label="New password"><input id="new-password" class="input" type="password" autocomplete="new-password" autofocus value=${p} onInput=${(e) => setP(e.target.value)} /><//>
      ${msg && html`<div class="banner c-coral" role="status">${msg}</div>`}
      <button class="btn primary" disabled=${busy}>${busy ? 'Saving…' : 'Save and continue'}</button></form>
    <button class="btn ghost sm" onClick=${() => onDone(false)}>Skip for now</button>
  </div></div>`;
}

export function AuthGate({ onSignedIn, error }) {
  const [tab, setTab] = useState('in'); const [d, setD] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(error ? { tone: 'coral', text: error } : null);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); if (busy) return; setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(d.email)) return setMsg({ tone: 'coral', text: 'Enter a valid email address.' });
    if (tab === 'forgot') { setBusy(true); try { await resetPassword(d.email); setMsg({ tone: 'mint', text: 'Check your inbox for a link to set a new password.' }); } catch (err) { setMsg({ tone: 'coral', text: err.message }); } return setBusy(false); }
    if (d.password.length < 6) return setMsg({ tone: 'coral', text: 'Passwords need at least 6 characters.' });
    if (tab === 'up' && !d.name.trim()) return setMsg({ tone: 'coral', text: 'Add your name so hosts know who you are.' });
    setBusy(true);
    try {
      if (tab === 'in') { await signIn(d.email, d.password); await onSignedIn({}); }
      else { const r = await signUp(d.name.trim(), d.email, d.password);
        if (r.session) await onSignedIn({ name: d.name.trim() });
        else { setTab('in'); setMsg({ tone: 'mint', text: `Almost there. We sent a confirmation link to ${d.email}. Open it, then sign in here.` }); } }
    } catch (err) {
      setMsg({ tone: 'coral', text: /Invalid login/i.test(err.message) ? 'That email and password don’t match an account.' : /not confirmed/i.test(err.message) ? 'Confirm your email first: open the link we sent you, then sign in.' : err.message });
    }
    setBusy(false);
  };
  return html`<div class="auth-wrap"><div class="auth-card col gap-l">
    <div class="col" style="gap:6px;align-items:flex-start"><span class="brand" style="padding:0"><span class="brand-mark">${BRAND.mark}</span>${BRAND.name}</span><p class="muted">${BRAND.tagline}</p></div>
    ${tab !== 'forgot' ? html`<${Seg} value=${tab} onChange=${(v) => { setTab(v); setMsg(null); }} options=${[{ id: 'in', label: 'Sign in' }, { id: 'up', label: 'Create account' }]} />` : html`<h2>Reset your password</h2>`}
    <form class="col" onSubmit=${submit}>
      ${tab === 'up' && html`<${Field} label="Your name"><input id="auth-name" class="input" autocomplete="name" value=${d.name} onInput=${set('name')} /><//>`}
      <${Field} label="Email"><input id="auth-email" class="input" type="email" autocomplete="email" value=${d.email} onInput=${set('email')} /><//>
      ${tab !== 'forgot' && html`<${Field} label="Password"><input id="auth-password" class="input" type="password" autocomplete=${tab === 'up' ? 'new-password' : 'current-password'} value=${d.password} onInput=${set('password')} /><//>`}
      ${msg && html`<div class=${'banner c-' + msg.tone} role="status">${msg.text}</div>`}
      <button class="btn primary" disabled=${busy}>${busy ? 'Please wait…' : tab === 'in' ? 'Sign in' : tab === 'up' ? 'Create account' : 'Send reset link'}</button>
      ${tab === 'up' && html`<span class="tiny muted">By creating an account you agree to the <${LegalLinks} />.</span>`}
    </form>
    <div class="row between wrap small">${tab === 'forgot' ? html`<button class="btn ghost sm" onClick=${() => setTab('in')}><${Icon} name="left" size=${14} />Back to sign in</button>` : html`<button class="btn ghost sm" onClick=${() => { setTab('forgot'); setMsg(null); }}>Forgot password?</button>`}
      <button class="btn ghost sm" onClick=${() => { setMode('demo'); location.reload(); }}>Try the demo instead</button></div>
  </div></div>`;
}

// Lets a deployed copy be pointed at a Supabase project without editing code.
export function ConnectBackend() {
  const cur = cloudConfig(); const [d, setD] = useState({ url: cur?.url || 'https://bqofayrgxygsigbdugzu.supabase.co', anonKey: '' });
  const save = (e) => { e.preventDefault(); if (!/^https:\/\/.+/.test(d.url) || d.anonKey.trim().length < 20) return;
    saveCloudConfig({ url: d.url.trim(), anonKey: d.anonKey.trim() }); setMode(null); location.hash = 'home'; location.reload(); };
  return html`<form class="col" onSubmit=${save}>
    <div class="form-grid"><${Field} label="Project URL"><input id="cfg-url" class="input" value=${d.url} onInput=${(e) => setD({ ...d, url: e.target.value })} /><//>
      <${Field} label="Anon (public) key" hint="Supabase dashboard: Project Settings, API Keys. Never paste the service_role key."><input id="cfg-key" class="input" autocomplete="off" value=${d.anonKey} onInput=${(e) => setD({ ...d, anonKey: e.target.value })} /><//></div>
    <div><button class=${cx('btn primary')} disabled=${d.anonKey.trim().length < 20}>Connect and sign in</button></div></form>`;
}
