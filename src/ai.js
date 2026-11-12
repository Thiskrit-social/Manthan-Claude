// Model access for the planner. One function, `askJSON(prompt)`, over several free ways to reach a real model:
//   claude      the "ask Claude" capability of a claude.ai artifact page (no key; only exists inside that preview)
//   chrome      Chrome's built-in on-device model (no key; only in browsers that ship it)
//   gemini      Google Gemini API free tier          (your own key)
//   groq        Groq free tier, open models          (your own key)
//   openrouter  OpenRouter ":free" models            (your own key)
// Keys are kept in this browser's localStorage and sent only to the chosen provider. There is no server here,
// so a production build must move these calls behind a backend rather than ship a key to the client.
const KEY = 'gather.ai.v1';
export const PROVIDERS = {
  auto: { label: 'Automatic', hint: 'Use Claude or the on-device model when this browser offers one.' },
  claude: { label: 'Claude (built into this preview)', hint: 'Available when the app is opened as a claude.ai artifact. Asks for your permission once.' },
  chrome: { label: 'On-device model (Chrome built-in AI)', hint: 'Runs on your computer. Nothing is sent anywhere.' },
  gemini: { label: 'Google Gemini (free tier)', key: true, model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  groq: { label: 'Groq (free tier)', key: true, model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', url: 'https://api.groq.com/openai/v1/chat/completions' },
  openrouter: { label: 'OpenRouter (free models)', key: true, model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', url: 'https://openrouter.ai/api/v1/chat/completions' },
  rules: { label: 'Off (built-in rules only)', hint: 'No model is called.' },
};
export function aiSettings() { try { return { provider: 'auto', keys: {}, models: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { provider: 'auto', keys: {}, models: {} }; } }
export function saveAiSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* in-memory only */ } }

let samplePromise;
// The artifact runtime lives on the top page; the phone preview runs the app in a same-origin frame.
function claudeSample() {
  if (!samplePromise) samplePromise = (async () => { try { const c = window.claude || window.parent?.claude; return c?.use ? await c.use('sample') : null; } catch { return null; } })();
  return samplePromise;
}
async function chromeReady() { try { return typeof LanguageModel !== 'undefined' && (await LanguageModel.availability()) === 'available'; } catch { return false; } }

// Which provider would answer right now, or null when the planner should use its built-in rules.
export async function activeProvider() {
  const s = aiSettings(); const p = s.provider;
  if (p === 'rules') return null;
  if (p === 'claude' || p === 'auto') { if (await claudeSample()) return 'claude'; if (p === 'claude') return null; }
  if (p === 'chrome' || p === 'auto') return (await chromeReady()) ? 'chrome' : null;
  return PROVIDERS[p]?.key && s.keys[p] ? p : null;
}
export function parseJSON(text) {
  const t = String(text).replace(/```(?:json)?/gi, ''); const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The model did not return JSON.');
  return JSON.parse(t.slice(a, b + 1));
}
const fail = async (r) => { let m = ''; try { const j = await r.json(); m = j.error?.message || j.message || ''; } catch { /* no body */ } throw new Error(`${r.status} ${m || r.statusText}`.trim()); };

export async function askJSON(prompt) {
  const p = await activeProvider(); if (!p) throw new Error('No AI model is connected.');
  const s = aiSettings(); const model = s.models[p] || PROVIDERS[p].model; const ask = `${prompt}\n\nReply with one JSON object and nothing else.`;
  if (p === 'claude') { const sample = await claudeSample(); try { return await sample.json(ask, { cache: false }); } catch (e) { throw new Error(e?.code === 'not_granted' ? 'Permission to ask Claude was declined.' : e?.message || 'Claude did not answer.'); } }
  if (p === 'chrome') { const session = await LanguageModel.create(); try { return parseJSON(await session.prompt(ask)); } finally { session.destroy?.(); } }
  if (p === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.keys.gemini },
      body: JSON.stringify({ contents: [{ parts: [{ text: ask }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }) });
    if (!r.ok) await fail(r); const j = await r.json(); return parseJSON(j.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '');
  }
  const r = await fetch(PROVIDERS[p].url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.keys[p]}` },
    body: JSON.stringify({ model, temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'You are an event planning assistant. You always answer with a single JSON object.' }, { role: 'user', content: ask }] }) });
  if (!r.ok) await fail(r); const j = await r.json(); return parseJSON(j.choices?.[0]?.message?.content || '');
}
