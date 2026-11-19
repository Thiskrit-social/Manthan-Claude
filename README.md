# Gather — event management prototype

An interactive, high-fidelity prototype of an event platform where **every event is its own workspace**.
One account, many roles: the same person can host a house party, manage a university event, lead a
conference team and be a guest at a wedding. "Gather" is a placeholder name; change it in `src/config.js`.

The repository is self-contained: static files, no build step, no backend.

## Run it

No build step and no dependencies to install. Serve the repository root with any static server:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765 for the desktop view, or http://localhost:8765/phone.html for the phone
prototype: the same app running at phone size inside a device frame, with shortcuts to each screen.
On a real phone `phone.html` drops the frame and runs full screen. (Opening `index.html` straight from disk will not work, because
browsers block ES modules on `file://`.)

## What to try

Use **Switch demo persona** (sidebar, or Profile on a phone) to see the same events through different roles.

| Persona | Role | Shows |
|---|---|---|
| Maya Chen | Owner of the party, manager of Future Connect, team lead, guest | Dashboard across five events |
| Leo Martins | Committee member in both demo events | Assigned tasks, limited editing |
| Daniel Okafor | Team lead (Music, Sponsorship) | Managing one team |
| Ava Thompson | Guest who has not replied | RSVP, memories gallery, volunteering |
| Sam Rivera | Vendor | Only assigned tasks and shared files |

Two fully populated events demonstrate the adaptive workspace:

- **Saturday House Party** — Simple workspace, 15 guests, four committees.
- **Future Connect 2026** — Organised workspace with large-event tools switched on: 312 invitations,
  six teams in three departments, task dependencies, vendors, a document library.

Profile → **Reset demo data** restores the starting state.

## The planner (co-pilot)

Every workspace has a **Planner** tab for owners and managers, and a new event opens on it. Give it a short
brief (notes, what needs organising, budget, who is helping, who to invite) and it drafts teams with leads,
hands tasks to people with due dates, a run of the day, a budget split, invitations and a welcome post.
You review and switch off anything before applying. Afterwards it suggests next steps from the live event:
chase RSVPs, hand off unassigned tasks, nudge overdue owners, brief the food team on dietary needs.

### Connecting a real model

Open **Planner → AI model**. With a model connected, the plan is written from your notes and you can ask
for things in your own words; the model's proposals are validated and you approve every action. With no
model, the planner falls back to its built-in rules and says so.

| Option | Cost | Needs |
|---|---|---|
| Claude | Included with the claude.ai preview | Opening the app from its claude.ai artifact link |
| On-device model | Free | A Chrome build that ships the built-in Prompt API |
| Google Gemini | Free tier | Your own API key from aistudio.google.com |
| Groq | Free tier | Your own API key from console.groq.com |
| OpenRouter | Free models | Your own API key from openrouter.ai |

Keys are stored in this browser's `localStorage` and sent only to the provider you chose. Event details,
notes and names of the people involved are included in the prompt. Default model names are in
`src/ai.js` and editable in the UI, since providers rename their free models. There is no server in this
prototype: a production build should make these calls from a backend so no key reaches the client.

`src/ai.js` is the provider layer (`askJSON`). `src/planner.js` holds the rule-based `draftPlan` and
`suggestions`, and the model-backed `draftPlanAI` and `askCopilot`.

## Backend (Supabase)

Gather runs in two modes:

- **Demo** (no backend): sample data in this browser, with a persona switcher. This is what you get while
  `src/backend-config.js` has no key.
- **Cloud**: real accounts and shared data in a Supabase project. People sign up with email and password,
  and each person sees the events they belong to, according to their role.

### Setting it up

1. In the Supabase dashboard open **SQL Editor**, paste the whole of `supabase/schema.sql` and run it.
   It creates the tables, the security rules, a private `media` bucket for photos, and the functions the
   app calls. It is safe to run again after updates. A database set up with an earlier version can
   instead run the files in `supabase/migrations/` that it has not run yet.
2. Put the project's **anon (public)** or **publishable** key in `src/backend-config.js`
   (Project Settings → API Keys). Never use the `service_role` or secret key in the app.
3. Host the site (see below), then in Supabase go to **Authentication → URL Configuration** and set the
   **Site URL** to your site's address, so confirmation and password-reset emails link back to it.
4. Optional: Supabase's built-in email sender is rate-limited. For more than a handful of sign-ups a day,
   add your own SMTP provider under **Authentication → Emails**, or turn off "Confirm email" while testing.

A copy without a key in the file can also be connected from **Profile → Connect a backend**; that setting
is stored in the visitor's browser only.

### How the app talks to it

The screens still read and change the same in-memory store as in the demo. In cloud mode,
`src/backend.js` loads everything the signed-in person is allowed to see, and after each change sends
only the rows that were added, changed or removed. If the database refuses a change, the app says so
and reloads the saved version. It also refreshes every 30 seconds and when the window regains focus, so
people see each other's changes.

Who can see and change what is enforced by row-level security in `supabase/schema.sql`, using each event's
own role and permission matrix. Budgets live in separate tables so guests never receive them; guests can
change only their own RSVP; assignees can update progress but not task details; vendors see only what
is shared with them; photos are in a private bucket with the same gallery rules.

### Invitations by WhatsApp and email

Each guest gets a **personal invitation link** (`#invite-<event>-<token>`). It works for invite-only
events, greets the guest by name, and when they sign up it becomes theirs, along with any team or tasks
the host already gave that name. The plain event link (`#invite-<event>`) works for events set to
"Anyone with the link". Adding a guest with an email address also links them automatically when they
sign up with that address.

The send button next to each guest offers:

- **WhatsApp**: opens WhatsApp with the message and link written, in that guest's chat if their number
  has a country code. The host presses send. Free; WhatsApp's own API charges for business-sent
  invitations, so the app doesn't use it.
- **Email from your own app**: opens the host's email app with the message written. Free.
- **Email it for me** (once set up): Gather sends it, from a verified sender, with replies going to the
  host. The guest list can also email everyone not yet invited, and remind those still waiting.

Automatic email uses the Edge Function in `supabase/functions/send-invites` and Brevo's free plan
(300 emails a day). Set it up once:

1. Create a free Brevo account, verify the address you want to send from (Senders), and create an API key
   (SMTP & API → API keys).
2. In Supabase, **Edge Functions → Secrets**: add `BREVO_API_KEY` and `SENDER_EMAIL`. Optionally `APP_URL`
   if the site isn't at `https://manthan-gather.netlify.app/`.
3. Deploy the function with JWT verification turned off (`supabase functions deploy send-invites --no-verify-jwt`);
   it checks the signed-in person through the database instead.

The database decides who may send: only people who can manage guests for that event, at most 100
emails per event per day.

### Testing the database rules

`supabase/tests/rls_test.py` signs in as an owner, manager, team lead, member, guest, vendor and an
outsider and checks 79 rules against a local Postgres. To run it (PostgreSQL 16 and `psycopg2`):

```bash
createdb gather && psql -d gather -f supabase/tests/supabase_stub.sql && psql -d gather -f supabase/schema.sql
node -e "import('./src/config.js').then(c=>console.log(JSON.stringify({organised:c.defaultPermissions('organised'),simple:c.defaultPermissions('simple')})))" > /tmp/perms.json
python3 supabase/tests/rls_test.py /tmp/perms.json
```

(`supabase_stub.sql` starts with `drop database`/`create database gather`; skip those two lines if you
created the database yourself.)

## Hosting

Supabase is the backend only; the site itself is static files and needs a static host. Free options that
deploy from a private GitHub repository: Netlify, Vercel or Cloudflare Pages. Import this repository, leave
the build command empty and publish the repository root (`netlify.toml` already says so). Any push to
`main` then redeploys.

The claude.ai preview links cannot reach Supabase (their sandbox blocks outside connections), so they
always run the demo.

## What is real and what is simulated

In cloud mode, real: accounts, shared data across people and devices, roles and permissions enforced by
the database, invitation links, photo upload to private storage, the device camera where the browser
grants access, copy-link.

In demo mode, everything is saved in this browser only and sign-in is a persona switcher.

Simulated and labelled as such in the UI, in both modes: emails and reminders (people see them in the
app's notifications instead), document uploads (name and size only), video storage, the camera when no
device camera is available, and the planner when no AI model is connected (it uses built-in rules).

## Architecture

```
index.html        entry point
supabase/         schema.sql (tables, security rules, storage, functions) and tests/
phone.html        phone prototype: the same app in a device frame
styles.css        design tokens (light + dark) and components
vendor/           Preact + htm (MIT), vendored so nothing is fetched or built
src/
  config.js       brand, categories, complexity presets, roles, capabilities, default permissions
  seed.js         sample data (plain records; app logic never refers to a sample event by id)
  store.js        normalised state, selectors and every mutation ("actions")
  backend.js      cloud mode: Supabase sign-in, loading, and syncing changes
  backend-config.js  your Supabase project URL and public key
  permissions.js  role and capability checks, scoped per event
  ai.js           model providers for the planner (Claude, on-device, Gemini, Groq, OpenRouter)
  planner.js      planner engine: built-in rules plus the model-backed plan and co-pilot
  ui.js           shared components, icons, hash router
  app.js          application shell and navigation
  views/          home (dashboard, My Events, My Tasks, notifications, profile, invitation),
                  create, workspace (overview, setup), people, teams, tasks, plan (schedule, budget),
                  gallery, feed (updates, files)
```

Entities in the store: `users`, `events`, `memberships` (EventMembership), `invitations` (Invitation
with its RSVP), `committees`, `committeeMemberships`, `tasks` (with subtasks, checklist, dependencies),
`scheduleItems`, `expenses`, `media`, `announcements`, `files`, `notifications`, `activity`.
Permissions live on each event as a role × capability matrix the owner can edit.

How the workspace adapts: an event stores `complexity`, `modules` (which sections exist) and
`features` (optional tools such as dependencies or check-in). A complexity preset only sets the
starting values; the owner can switch on anything later in Setup without creating a new event.

Moving to production: views only read through selectors and write through the actions in
`store.js`, so that file is the seam to replace with API calls. The entity shapes map directly
onto tables or Dart models if the product is rebuilt in Flutter.

## Launch basics

- **Real accounts see only finished features.** The Files section, video, the stand-in camera, file-name-only attachments and the AI key settings stay in the demo (where they are labelled) and are hidden once someone signs in. With a real account the planner uses built-in rules or the browser's on-device model, never an outside AI service.
- **Password reset** finishes in the app: the emailed link opens a "Choose a new password" screen. Expired links explain themselves on the sign-in screen.
- **Templates and welcome.** `TEMPLATES` in `src/config.js` fill in the create form; a new account sees a three-step welcome.
- **Feedback and error reports** go to the write-only `feedback` table (Supabase dashboard, Table editor, `feedback`). Unexpected errors are reported automatically, at most five per visit.
- **Delete account** is on the Profile screen and calls `delete_my_account()` (migration `005_feedback_and_account_deletion.sql`).
- **Legal pages:** `terms.html` and `privacy.html` are plain-language drafts. Add the operator's name and a contact address, and have them checked, before growing beyond a beta.
- **Link preview:** `og.png` and the tags in `index.html`. If the site moves to its own domain, update the `og:image` address.

## Replying without an account

A guest's personal link (`#invite-<event>-<token>`) opens the event page directly, with no sign-in. The guest answers Going, Maybe or Can't go, can add arrival time, dietary needs, a plus-one (if the host allows one) and a message, and gets add-to-calendar links. They can reopen the same link to change their answer. The host sees the reply in the guest list and gets a notification.

The database functions `guest_invite` and `guest_rsvp` (migration `006_reply_without_account.sql`) are the only things a token alone can reach: one event, and only the reply fields of that one invitation. An invite-only event opened without a valid token shows nothing. An event open to "anyone with the link" can be viewed without signing in, but replying from the shared (non-personal) link needs an account, so the host knows who answered. If the guest later creates an account from the link, the invitation becomes theirs.

## Headcount, note to guests and the bring list

On an event's People tab, people who manage guests get:

- **Headcount for the day:** guests coming plus their plus-ones, maybes, no replies, and food needs grouped across everyone coming. Share it on WhatsApp, copy it, or download the guest list as a spreadsheet (CSV, opens in Excel or Google Sheets).
- **Note to guests:** a short update shown at the top of every invitation page and the event overview. Share it on WhatsApp, or email it to everyone going or maybe (when automatic email is set up). Guests with an account also get a notification.
- **Who's bringing what:** a list of things guests can bring, with one-tap ideas for the type of event. Guests take an item from their invitation link (no account needed) or in the app; at most five per guest, and nobody can take an item someone else has. Hosts can assign items themselves.

Database: migration `007_bring_list_and_guest_note.sql`. The automatic email function gained an `update` message type, so redeploy `supabase/functions/send-invites` after pulling.

## Invitation themes, who's going, comments and chip-in

- **Themes:** seven looks for the invitation page (Classic, Disco, Garden, Birthday, Festival lights, Midnight, Minimal), stored as `cover.theme`. Picked when creating an event (templates choose one) or on the People tab under "Invitation page". Saying Going sets off confetti, unless the device asks for reduced motion.
- **Who's going:** first names of guests who said yes, with plus-ones counted. Event feature `guestList`.
- **Comments:** a message wall on the invitation, usable from a personal link without an account (`guest_comment`, `guest_uncomment`) or signed in (`post_comment`). At most 20 a day per guest; the host is notified and can delete any comment. Event feature `wall`.
- **Chip in:** `events.extras.chipIn = { url, amount, note }`, shown as a Pay button once a guest has replied Going or Maybe. Only `https://` and `upi://` links are accepted. Money goes directly through that service; Gather never handles it.

New Simple events start with the going list and comments on; Organised events with comments on. Both can be switched in the People tab or Setup → Extra tools. Database: migration `008_invite_social_and_chip_in.sql`.

## Link previews in WhatsApp

On the published site, invitation links look like `/i/<event>` (shared link) and `/i/<event>/<key>` (a guest's personal link). `netlify/functions/invite.mjs` answers them:

- **Preview robots** (WhatsApp, iMessage, Telegram, Slack, Facebook, X, Discord…) get a small page with the event's title, "Hi Ravi! Priya invites you. Sat 12 Dec, 7:30pm · 14 Park Road. Tap to reply." and a picture: the event's uploaded cover photo, or the image for its theme (`og/theme-*.jpg`).
- **People** are redirected straight to `/#invite-…`, the invitation page.
- Details come from `guest_invite` with the public key, so an invite-only event shows only "You're invited" without a valid personal link. Pages are marked `noindex`. If the database is slow, the generic preview is returned after about 3.5 seconds.

Links made anywhere other than `siteUrl` (in `src/backend-config.js`), such as a local copy, keep the `#invite-…` form. Emails keep the `#invite-…` form too. WhatsApp caches previews, so a link already shared shows its old preview.
