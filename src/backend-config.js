// Supabase project for this copy of Gather.
// Paste the project's anon (public) key below — Supabase dashboard: Project Settings -> API Keys.
// The anon or publishable key is meant to be public: it is shipped to every browser, and the database's
// row-level security (supabase/schema.sql) decides what each signed-in person can read and change.
// Never put the service_role or secret key here.
// While anonKey is empty the app runs as a local demo with no backend.
export const BACKEND = {
  url: 'https://bqofayrgxygsigbdugzu.supabase.co',
  anonKey: 'sb_publishable_Q_qdt_c-MeE9mIjvxbky_A_8GOQo0K0',
  // Where the app is published. There, invitation links use /i/<event>/<key> so WhatsApp and other apps
  // can show the event's own preview (netlify/functions/invite.mjs). Anywhere else they use #invite-….
  siteUrl: 'https://manthan-gather.netlify.app/',
};
