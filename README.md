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

## What is real and what is simulated

Works for real, in this browser only: all state changes (saved to `localStorage`), photo upload
(downscaled and stored locally), the device camera where the browser grants access, copy-link.

Simulated and labelled as such in the UI: the planner when no AI model is connected (it uses built-in rules), sign-in, emails and reminders, file uploads (name and
size only), video storage, the camera when no device camera is available, cross-device sync.
There is no backend.

## Architecture

```
index.html        entry point
phone.html        phone prototype: the same app in a device frame
styles.css        design tokens (light + dark) and components
vendor/           Preact + htm (MIT), vendored so nothing is fetched or built
src/
  config.js       brand, categories, complexity presets, roles, capabilities, default permissions
  seed.js         sample data (plain records; app logic never refers to a sample event by id)
  store.js        normalised state, selectors and every mutation ("actions")
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
