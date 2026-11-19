-- Gather database schema for Supabase.
-- Run the whole file once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again after an update: tables are created only if missing, and functions,
-- triggers and policies are replaced.
--
-- Security model: every row belongs to an event. A person's role in that event (owner, manager, lead,
-- member, guest, vendor) and the event's own permission matrix decide what they can read and change,
-- enforced here in the database with row-level security. The app's screens apply the same rules,
-- but the database is the authority.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table if not exists public.people (
  id text primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  email text not null default '',
  tone text not null default 'lav',
  bio text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  name text not null,
  category text not null default 'other',
  description text not null default '',
  cover jsonb not null default '{}',
  date text not null,
  start_time text not null default '',
  end_time text not null default '',
  location text not null default '',
  expected integer not null default 0,
  privacy text not null default 'private' check (privacy in ('private', 'link', 'public')),
  complexity text not null default 'simple' check (complexity in ('simple', 'organised', 'large')),
  modules jsonb not null default '[]',
  features jsonb not null default '[]',
  task_view text not null default 'list',
  permissions jsonb not null default '{}',
  currency text not null default '£',
  created_by text not null,
  created_at timestamptz not null default now()
);

-- Confidential per-event data, kept apart so guests can read an event without seeing its budget.
create table if not exists public.event_private (
  event_id text primary key references public.events (id) on delete cascade,
  budget numeric not null default 0,
  planner jsonb not null default '{}'
);

create table if not exists public.memberships (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('owner', 'manager', 'lead', 'member', 'guest', 'vendor')),
  company text,
  service text,
  phone text
);
create index if not exists memberships_event_user on public.memberships (event_id, user_id);
create index if not exists memberships_user on public.memberships (user_id);

create table if not exists public.invitations (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  user_id text,
  name text not null,
  email text not null default '',
  guest_group text not null default '',
  plus_one_allowed boolean not null default false,
  invited_at timestamptz not null default now(),
  reminders integer not null default 0,
  checked_in boolean not null default false,
  rsvp jsonb not null default '{"status":"pending"}'
);
create index if not exists invitations_event on public.invitations (event_id);
create index if not exists invitations_user on public.invitations (user_id);

alter table public.invitations add column if not exists phone text not null default '';
alter table public.invitations add column if not exists sent jsonb not null default '{}';

-- Personal invitation links. Each guest gets their own token, so someone invited by WhatsApp or email
-- can join even an invite-only event. No policies: only the functions below read or write tokens.
create table if not exists public.invitation_tokens (
  invitation_id text primary key references public.invitations (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '')
);
alter table public.invitation_tokens enable row level security;

create table if not exists public.committees (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  name text not null,
  description text not null default '',
  icon text not null default '⭐',
  tone text not null default 'lav',
  status text not null default 'ontrack',
  team_group text not null default ''
);
create index if not exists committees_event on public.committees (event_id);

create table if not exists public.committee_budgets (
  committee_id text primary key references public.committees (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  amount numeric not null default 0
);

create table if not exists public.committee_memberships (
  id text primary key,
  committee_id text not null references public.committees (id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('lead', 'member'))
);
create index if not exists committee_memberships_committee on public.committee_memberships (committee_id);

create table if not exists public.tasks (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  committee_id text references public.committees (id) on delete set null,
  title text not null,
  description text not null default '',
  assignee_id text,
  due text not null default '',
  priority text not null default 'medium',
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  subtasks jsonb not null default '[]',
  checklist jsonb not null default '[]',
  depends_on jsonb not null default '[]',
  comments jsonb not null default '[]',
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists tasks_event on public.tasks (event_id);
create index if not exists tasks_assignee on public.tasks (assignee_id);

create table if not exists public.schedule_items (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  user_id text,
  at timestamptz,
  date text not null,
  start_time text not null default '',
  end_time text not null default '',
  title text not null,
  location text not null default '',
  owner_id text,
  description text not null default '',
  checklist jsonb not null default '[]',
  reminder integer not null default 0
);
create index if not exists schedule_items_event on public.schedule_items (event_id);

create table if not exists public.expenses (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  committee_id text references public.committees (id) on delete set null,
  title text not null,
  amount numeric not null default 0,
  status text not null default 'planned' check (status in ('planned', 'paid')),
  paid_by text,
  date text not null default '',
  description text not null default '',
  receipt text not null default '',
  user_id text,
  at timestamptz
);
create index if not exists expenses_event on public.expenses (event_id);

create table if not exists public.media (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  gallery text not null check (gallery in ('organiser', 'memories')),
  type text not null default 'photo',
  emoji text,
  tone text,
  caption text not null default '',
  name text,
  path text,
  user_id text not null,
  at timestamptz not null default now(),
  sample boolean not null default false,
  simulated boolean not null default false,
  lost boolean not null default false
);
create index if not exists media_event on public.media (event_id);

create table if not exists public.announcements (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  scope text not null check (scope in ('event', 'internal', 'team')),
  committee_id text references public.committees (id) on delete cascade,
  user_id text not null,
  text text not null,
  at timestamptz not null default now(),
  media_id text,
  comments jsonb not null default '[]'
);
create index if not exists announcements_event on public.announcements (event_id);

create table if not exists public.files (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  folder text not null default 'General',
  name text not null,
  kind text not null default 'other',
  size text not null default '',
  url text not null default '',
  user_id text,
  at timestamptz not null default now(),
  confidential boolean not null default false,
  vendor_shared boolean not null default false,
  committee_id text references public.committees (id) on delete set null
);
create index if not exists files_event on public.files (event_id);

create table if not exists public.notifications (
  id text primary key,
  user_id text not null,
  event_id text references public.events (id) on delete cascade,
  text text not null,
  link text not null default '',
  at timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists notifications_user on public.notifications (user_id);

create table if not exists public.activity (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  user_id text not null,
  text text not null,
  at timestamptz not null default now()
);
create index if not exists activity_event on public.activity (event_id);

-- ---------------------------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so policies can look up roles without recursing into RLS.
-- They live in their own schema, which Supabase's API does not expose, so they cannot be called
-- directly from outside; policies and the functions below use them.
-- ---------------------------------------------------------------------------------------------
create schema if not exists gather_private;
revoke all on schema gather_private from public, anon;
grant usage on schema gather_private to authenticated;
create or replace function gather_private.me() returns text
language sql stable security definer set search_path = public as $$
  select id from people where auth_user_id = auth.uid() limit 1
$$;

create or replace function gather_private.my_role(eid text) returns text
language sql stable security definer set search_path = public as $$
  select role from memberships where event_id = eid and user_id = gather_private.me()
  order by case role when 'owner' then 1 when 'manager' then 2 when 'lead' then 3 when 'member' then 4 when 'vendor' then 5 else 6 end
  limit 1
$$;

create or replace function gather_private.is_member(eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select gather_private.my_role(eid) is not null
$$;

create or replace function gather_private.is_creator(eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = eid and created_by = gather_private.me())
$$;

-- Mirrors can() in the app: owners can do everything; other roles read the event's permission matrix.
create or replace function gather_private.can(eid text, cap text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := gather_private.my_role(eid);
begin
  if r is null then return false; end if;
  if r = 'owner' then return true; end if;
  return coalesce((select (permissions -> r ->> cap)::boolean from events where id = eid), false);
end $$;

create or replace function gather_private.has_feature(eid text, feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select features ? feature from events where id = eid), false)
$$;

create or replace function gather_private.committee_event(cid text) returns text
language sql stable security definer set search_path = public as $$
  select event_id from committees where id = cid
$$;

create or replace function gather_private.in_committee(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from committee_memberships where committee_id = cid and user_id = gather_private.me())
$$;

create or replace function gather_private.leads_committee(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from committee_memberships where committee_id = cid and user_id = gather_private.me() and role = 'lead')
$$;

create or replace function gather_private.leads_any(eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from committee_memberships cm join committees c on c.id = cm.committee_id
                 where c.event_id = eid and cm.user_id = gather_private.me() and cm.role = 'lead')
$$;

-- Whether a person is part of an event (member or invited).
create or replace function gather_private.person_in_event(pid text, eid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where event_id = eid and user_id = pid)
      or exists (select 1 from invitations where event_id = eid and user_id = pid)
$$;

-- Whether the signed-in person shares at least one event with another person.
create or replace function gather_private.shares_event(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships mine
    where mine.user_id = gather_private.me()
      and (exists (select 1 from memberships o where o.event_id = mine.event_id and o.user_id = pid)
        or exists (select 1 from invitations i where i.event_id = mine.event_id and i.user_id = pid)))
$$;

create or replace function gather_private.can_view_gallery(eid text, gallery text) returns boolean
language sql stable security definer set search_path = public as $$
  select case gallery when 'organiser' then gather_private.can(eid, 'viewOrganiserGallery')
                      when 'memories' then gather_private.can(eid, 'viewMemories') else false end
$$;

create or replace function gather_private.can_add_gallery(eid text, gallery text) returns boolean
language sql stable security definer set search_path = public as $$
  select case gallery when 'organiser' then gather_private.can(eid, 'addOrganiserGallery')
                      when 'memories' then gather_private.can(eid, 'addMemories') else false end
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['people','events','event_private','memberships','invitations','committees','committee_budgets',
    'committee_memberships','tasks','schedule_items','expenses','media','announcements','files','notifications','activity'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Start from a clean slate so re-running the file never leaves an old, looser policy behind.
    execute (select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), 'select 1')
             from pg_policies where schemaname = 'public' and tablename = t);
  end loop;
end $$;

-- people: yourself, people you added, and people who share an event with you.
create policy people_read on public.people for select to authenticated
  using (id = gather_private.me() or created_by = gather_private.me() or gather_private.shares_event(id));
create policy people_add on public.people for insert to authenticated
  with check (created_by = gather_private.me() and auth_user_id is null);
create policy people_edit on public.people for update to authenticated
  using (id = gather_private.me() or (created_by = gather_private.me() and auth_user_id is null));

-- events
create policy events_read on public.events for select to authenticated
  using (gather_private.is_member(id) or created_by = gather_private.me());
create policy events_add on public.events for insert to authenticated
  with check (created_by = gather_private.me());
create policy events_edit on public.events for update to authenticated
  using (gather_private.my_role(id) = 'owner') with check (gather_private.my_role(id) = 'owner');
create policy events_delete on public.events for delete to authenticated
  using (gather_private.my_role(id) = 'owner');

-- event_private: budget total and planner state.
create policy event_private_read on public.event_private for select to authenticated
  using (gather_private.can(event_id, 'viewBudget') or gather_private.can(event_id, 'manageTeams'));
create policy event_private_add on public.event_private for insert to authenticated
  with check (gather_private.my_role(event_id) = 'owner');
create policy event_private_edit on public.event_private for update to authenticated
  using (gather_private.can(event_id, 'manageBudget') or gather_private.can(event_id, 'manageTeams'));

-- memberships: who is in the event and with which role.
create policy memberships_read on public.memberships for select to authenticated
  using (gather_private.is_member(event_id) or user_id = gather_private.me());
create policy memberships_add on public.memberships for insert to authenticated
  with check (
    (role = 'owner' and user_id = gather_private.me() and gather_private.is_creator(event_id))
    or gather_private.my_role(event_id) = 'owner'
    or (role <> 'owner' and gather_private.can(event_id, 'manageTeams'))
    or (role = 'guest' and gather_private.can(event_id, 'manageGuests'))
    or (role in ('member', 'lead') and gather_private.leads_any(event_id)));
create policy memberships_edit on public.memberships for update to authenticated
  using (
    gather_private.my_role(event_id) = 'owner'
    or (role <> 'owner' and (gather_private.can(event_id, 'manageTeams') or gather_private.leads_any(event_id)))
    or (user_id = gather_private.me() and gather_private.has_feature(event_id, 'volunteering')))
  with check (
    gather_private.my_role(event_id) = 'owner'
    or (role <> 'owner' and gather_private.can(event_id, 'manageTeams'))
    or (role in ('member', 'lead') and gather_private.leads_any(event_id))
    or (user_id = gather_private.me() and role = 'member' and gather_private.has_feature(event_id, 'volunteering')));
create policy memberships_delete on public.memberships for delete to authenticated
  using (gather_private.my_role(event_id) = 'owner' or (role <> 'owner' and gather_private.can(event_id, 'manageTeams')));

-- invitations: the guest list. Guests always see their own invitation.
create policy invitations_read on public.invitations for select to authenticated
  using (gather_private.can(event_id, 'viewGuests') or gather_private.can(event_id, 'manageGuests') or user_id = gather_private.me());
create policy invitations_add on public.invitations for insert to authenticated
  with check (gather_private.can(event_id, 'manageGuests'));
create policy invitations_edit on public.invitations for update to authenticated
  using (gather_private.can(event_id, 'manageGuests') or user_id = gather_private.me());
create policy invitations_delete on public.invitations for delete to authenticated
  using (gather_private.can(event_id, 'manageGuests'));

-- committees (teams). Names are visible to the whole event; budgets live in committee_budgets.
create policy committees_read on public.committees for select to authenticated
  using (gather_private.is_member(event_id));
create policy committees_add on public.committees for insert to authenticated
  with check (gather_private.can(event_id, 'manageTeams'));
create policy committees_edit on public.committees for update to authenticated
  using (gather_private.can(event_id, 'manageTeams') or gather_private.leads_committee(id));
create policy committees_delete on public.committees for delete to authenticated
  using (gather_private.can(event_id, 'manageTeams'));

create policy committee_budgets_read on public.committee_budgets for select to authenticated
  using (gather_private.can(event_id, 'viewBudget'));
create policy committee_budgets_add on public.committee_budgets for insert to authenticated
  with check (gather_private.can(event_id, 'manageTeams') or gather_private.can(event_id, 'manageBudget'));
create policy committee_budgets_edit on public.committee_budgets for update to authenticated
  using (gather_private.can(event_id, 'manageTeams') or gather_private.can(event_id, 'manageBudget'));

create policy committee_memberships_read on public.committee_memberships for select to authenticated
  using (gather_private.is_member(gather_private.committee_event(committee_id)));
create policy committee_memberships_add on public.committee_memberships for insert to authenticated
  with check (
    gather_private.can(gather_private.committee_event(committee_id), 'manageTeams')
    or gather_private.leads_committee(committee_id)
    or (user_id = gather_private.me() and role = 'member' and gather_private.has_feature(gather_private.committee_event(committee_id), 'volunteering')));
create policy committee_memberships_edit on public.committee_memberships for update to authenticated
  using (gather_private.can(gather_private.committee_event(committee_id), 'manageTeams') or gather_private.leads_committee(committee_id));
create policy committee_memberships_delete on public.committee_memberships for delete to authenticated
  using (gather_private.can(gather_private.committee_event(committee_id), 'manageTeams') or gather_private.leads_committee(committee_id) or user_id = gather_private.me());

-- tasks: organisers with the permission and team leads manage; assignees update progress.
create policy tasks_read on public.tasks for select to authenticated
  using (gather_private.can(event_id, 'viewTasks') or assignee_id = gather_private.me() or gather_private.leads_committee(committee_id));
create policy tasks_add on public.tasks for insert to authenticated
  with check (gather_private.can(event_id, 'manageTasks') or gather_private.leads_committee(committee_id));
create policy tasks_edit on public.tasks for update to authenticated
  using (gather_private.can(event_id, 'manageTasks') or gather_private.leads_committee(committee_id) or assignee_id = gather_private.me());
create policy tasks_delete on public.tasks for delete to authenticated
  using (gather_private.can(event_id, 'manageTasks') or gather_private.leads_committee(committee_id));

-- schedule
create policy schedule_read on public.schedule_items for select to authenticated
  using (gather_private.is_member(event_id));
create policy schedule_add on public.schedule_items for insert to authenticated
  with check (gather_private.can(event_id, 'manageSchedule'));
create policy schedule_edit on public.schedule_items for update to authenticated
  using (gather_private.can(event_id, 'manageSchedule') or owner_id = gather_private.me());
create policy schedule_delete on public.schedule_items for delete to authenticated
  using (gather_private.can(event_id, 'manageSchedule'));

-- expenses: confidential.
create policy expenses_read on public.expenses for select to authenticated
  using (gather_private.can(event_id, 'viewBudget'));
create policy expenses_add on public.expenses for insert to authenticated
  with check (gather_private.can(event_id, 'manageBudget') or (gather_private.can(event_id, 'viewBudget') and gather_private.leads_committee(committee_id)));
create policy expenses_edit on public.expenses for update to authenticated
  using (gather_private.can(event_id, 'manageBudget') or (gather_private.can(event_id, 'viewBudget') and gather_private.leads_committee(committee_id)));
create policy expenses_delete on public.expenses for delete to authenticated
  using (gather_private.can(event_id, 'manageBudget') or (gather_private.can(event_id, 'viewBudget') and gather_private.leads_committee(committee_id)));

-- media: each gallery has its own view and contribute permissions.
create policy media_read on public.media for select to authenticated
  using (gather_private.can_view_gallery(event_id, gallery));
create policy media_add on public.media for insert to authenticated
  with check (user_id = gather_private.me() and gather_private.can_add_gallery(event_id, gallery));
create policy media_delete on public.media for delete to authenticated
  using (user_id = gather_private.me() or gather_private.my_role(event_id) = 'owner' or gather_private.can(event_id, 'manageTeams'));

-- announcements: event-wide posts for everyone; internal and team posts for organisers.
create policy announcements_read on public.announcements for select to authenticated
  using ((scope = 'event' and gather_private.is_member(event_id))
      or (scope = 'internal' and gather_private.can(event_id, 'viewInternal'))
      or (scope = 'team' and gather_private.can(event_id, 'viewInternal') and (gather_private.can(event_id, 'manageTeams') or gather_private.in_committee(committee_id))));
create policy announcements_add on public.announcements for insert to authenticated
  with check (user_id = gather_private.me() and (
       (scope = 'event' and gather_private.can(event_id, 'postAnnouncements'))
    or (scope = 'internal' and gather_private.can(event_id, 'viewInternal') and gather_private.my_role(event_id) in ('owner', 'manager', 'lead', 'member'))
    or (scope = 'team' and (gather_private.in_committee(committee_id) or gather_private.can(event_id, 'manageTeams')))));
-- Anyone who can read a post may comment on it; the trigger below stops them changing anything else.
create policy announcements_edit on public.announcements for update to authenticated
  using ((scope = 'event' and gather_private.is_member(event_id))
      or (scope = 'internal' and gather_private.can(event_id, 'viewInternal'))
      or (scope = 'team' and gather_private.can(event_id, 'viewInternal') and (gather_private.can(event_id, 'manageTeams') or gather_private.in_committee(committee_id))));
create policy announcements_delete on public.announcements for delete to authenticated
  using (user_id = gather_private.me() or gather_private.my_role(event_id) = 'owner');

-- files: vendors see only what is shared with them; contracts need viewConfidential.
create policy files_read on public.files for select to authenticated
  using ((gather_private.my_role(event_id) = 'vendor' and vendor_shared)
      or (gather_private.my_role(event_id) <> 'vendor' and gather_private.can(event_id, 'viewFiles') and (not confidential or gather_private.can(event_id, 'viewConfidential'))));
create policy files_add on public.files for insert to authenticated
  with check (gather_private.my_role(event_id) <> 'vendor' and gather_private.can(event_id, 'viewFiles') and (not confidential or gather_private.can(event_id, 'viewConfidential')));
create policy files_edit on public.files for update to authenticated
  using (gather_private.my_role(event_id) <> 'vendor' and gather_private.can(event_id, 'viewConfidential'));
create policy files_delete on public.files for delete to authenticated
  using (gather_private.my_role(event_id) <> 'vendor' and gather_private.can(event_id, 'viewConfidential'));

-- notifications: only your own. Members may notify other people in the same event.
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = gather_private.me());
create policy notifications_add on public.notifications for insert to authenticated
  with check (event_id is not null and gather_private.is_member(event_id) and gather_private.person_in_event(user_id, event_id));
create policy notifications_edit on public.notifications for update to authenticated
  using (user_id = gather_private.me());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = gather_private.me());

-- activity log
create policy activity_read on public.activity for select to authenticated
  using (gather_private.can(event_id, 'viewInternal'));
create policy activity_add on public.activity for insert to authenticated
  with check (user_id = gather_private.me() and gather_private.is_member(event_id));

-- ---------------------------------------------------------------------------------------------
-- Field guards: some people may change only part of a row.
-- ---------------------------------------------------------------------------------------------
create or replace function public.guard_people() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.auth_user_id is distinct from old.auth_user_id and current_user in ('authenticated', 'anon') then
    raise exception 'An account link cannot be changed from the app.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_people on public.people;
create trigger guard_people before update on public.people for each row execute function public.guard_people();

create or replace function public.guard_tasks() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Only requests from the app are limited; the trusted functions below run as the database owner.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if gather_private.can(old.event_id, 'manageTasks') or gather_private.leads_committee(old.committee_id) then return new; end if;
  if (new.event_id, new.title, new.description, new.committee_id, new.assignee_id, new.due, new.priority, new.depends_on)
     is distinct from (old.event_id, old.title, old.description, old.committee_id, old.assignee_id, old.due, old.priority, old.depends_on) then
    raise exception 'You can update progress on this task, but only organisers and the team lead can change its details.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_tasks on public.tasks;
create trigger guard_tasks before update on public.tasks for each row execute function public.guard_tasks();

create or replace function public.guard_invitations() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Only requests from the app are limited; the trusted functions below run as the database owner.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if gather_private.can(old.event_id, 'manageGuests') then return new; end if;
  if (new.event_id, new.user_id, new.name, new.email, new.phone, new.guest_group, new.plus_one_allowed, new.reminders, new.checked_in, new.sent)
     is distinct from (old.event_id, old.user_id, old.name, old.email, old.phone, old.guest_group, old.plus_one_allowed, old.reminders, old.checked_in, old.sent) then
    raise exception 'Guests can change only their own reply.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_invitations on public.invitations;
create trigger guard_invitations before update on public.invitations for each row execute function public.guard_invitations();

create or replace function public.guard_announcements() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Only requests from the app are limited; the trusted functions below run as the database owner.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if old.user_id = gather_private.me() or gather_private.my_role(old.event_id) = 'owner' then return new; end if;
  if (new.event_id, new.scope, new.committee_id, new.user_id, new.text, new.media_id)
     is distinct from (old.event_id, old.scope, old.committee_id, old.user_id, old.text, old.media_id) then
    raise exception 'You can comment on this post but not edit it.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_announcements on public.announcements;
create trigger guard_announcements before update on public.announcements for each row execute function public.guard_announcements();

create or replace function public.guard_schedule() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Only requests from the app are limited; the trusted functions below run as the database owner.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if gather_private.can(old.event_id, 'manageSchedule') then return new; end if;
  if (new.event_id, new.date, new.start_time, new.end_time, new.title, new.location, new.owner_id, new.description, new.reminder)
     is distinct from (old.event_id, old.date, old.start_time, old.end_time, old.title, old.location, old.owner_id, old.description, old.reminder) then
    raise exception 'You can tick off this activity''s checklist but not change it.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_schedule on public.schedule_items;
create trigger guard_schedule before update on public.schedule_items for each row execute function public.guard_schedule();

-- The owner's membership can only be changed by an owner.
create or replace function public.guard_memberships() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Only requests from the app are limited; the trusted functions below run as the database owner.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if old.role = 'owner' and new.role <> 'owner' and coalesce(gather_private.my_role(old.event_id), '') <> 'owner' then
    raise exception 'Only an owner can change an owner''s role.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_memberships on public.memberships;
create trigger guard_memberships before update on public.memberships for each row execute function public.guard_memberships();

-- ---------------------------------------------------------------------------------------------
-- Functions the app calls directly
-- ---------------------------------------------------------------------------------------------

-- Folds a placeholder person (someone added by name or email before they had an account) into a
-- real account, carrying over their roles, invitations, teams and tasks.
create or replace function gather_private.merge_person(from_id text, into_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if from_id is null or into_id is null or from_id = into_id then return; end if;
  if exists (select 1 from people where id = from_id and auth_user_id is not null) then return; end if;
  update memberships set user_id = into_id where user_id = from_id;
  update invitations set user_id = into_id where user_id = from_id;
  update committee_memberships set user_id = into_id where user_id = from_id;
  update tasks set assignee_id = into_id where assignee_id = from_id;
  update schedule_items set owner_id = into_id where owner_id = from_id;
  update expenses set paid_by = into_id where paid_by = from_id;
  update notifications set user_id = into_id where user_id = from_id;
  delete from people where id = from_id;
  -- Where both identities were in the same event or team, keep one: the stronger role, or the answered invitation.
  delete from memberships a using memberships b
  where a.user_id = into_id and b.user_id = into_id and a.event_id = b.event_id and a.id <> b.id
    and (array_position(array['owner','manager','lead','member','vendor','guest'], a.role), a.id)
      > (array_position(array['owner','manager','lead','member','vendor','guest'], b.role), b.id);
  delete from committee_memberships a using committee_memberships b
  where a.user_id = into_id and b.user_id = into_id and a.committee_id = b.committee_id and a.id <> b.id
    and ((a.role = 'member' and b.role = 'lead') or (a.role = b.role and a.id > b.id));
  delete from invitations a using invitations b
  where a.user_id = into_id and b.user_id = into_id and a.event_id = b.event_id and a.id <> b.id
    and ((a.rsvp ->> 'status' = 'pending' and b.rsvp ->> 'status' <> 'pending')
      or ((a.rsvp ->> 'status' = 'pending') = (b.rsvp ->> 'status' = 'pending') and a.id > b.id));
end $$;
revoke all on function gather_private.merge_person(text, text) from public, anon, authenticated;

-- Called after every sign-in. Returns the signed-in person's profile, creating it the first time.
-- Anyone who added this email address to an event before (as a placeholder person) is folded into
-- this profile, so invitations, roles and tasks given to that address are waiting for them.
create or replace function public.ensure_me(p_name text default null) returns public.people
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  my_email text;
  result public.people;
  keep text;
  others text[];
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select coalesce(lower(email), '') into my_email from auth.users where id = uid;
  select id into keep from people where auth_user_id = uid;
  if keep is null and my_email <> '' then
    select id into keep from people where auth_user_id is null and lower(email) = my_email order by created_at limit 1;
    if keep is not null then update people set auth_user_id = uid where id = keep; end if;
  end if;
  if keep is null then
    insert into people (id, auth_user_id, name, email, tone, created_by)
    values ('u' || replace(uid::text, '-', ''), uid,
            coalesce(nullif(trim(p_name), ''), nullif(trim((select raw_user_meta_data ->> 'name' from auth.users where id = uid)), ''),
                     nullif(split_part(my_email, '@', 1), ''), 'New user'), my_email,
            (array['lav','butter','coral','mint','sky'])[1 + floor(random() * 5)::int], null)
    returning id into keep;
  end if;

  if my_email <> '' then
    select coalesce(array_agg(id), '{}') into others from people where auth_user_id is null and lower(email) = my_email and id <> keep;
    for i in 1 .. cardinality(others) loop perform gather_private.merge_person(others[i], keep); end loop;
    -- Invitations sent to this address that were not linked to anyone yet.
    update invitations set user_id = keep where user_id is null and lower(email) = my_email;
  end if;
  insert into memberships (id, event_id, user_id, role)
    select 'm' || substr(md5(random()::text || i.event_id), 1, 12), i.event_id, keep, 'guest'
    from (select distinct event_id from invitations where user_id = keep) i
    where not exists (select 1 from memberships m where m.event_id = i.event_id and m.user_id = keep);

  select * into result from people where id = keep;
  return result;
end $$;

-- What someone opening an invitation link may see before they are part of the event.
-- A personal link (with p_token) works for invite-only events too.
drop function if exists public.invite_preview(text);
create or replace function public.invite_preview(eid text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ev events; me_id text := gather_private.me(); tok_name text;
begin
  if auth.uid() is null then return null; end if;
  select * into ev from events where id = eid;
  if not found then return null; end if;
  if p_token is not null then
    select i.name into tok_name from invitation_tokens t join invitations i on i.id = t.invitation_id where t.token = p_token and i.event_id = eid;
  end if;
  if ev.privacy = 'private' and tok_name is null and not gather_private.is_member(eid)
     and not exists (select 1 from invitations where event_id = eid and user_id = me_id) then
    return jsonb_build_object('id', ev.id, 'private', true);
  end if;
  return jsonb_build_object(
    'id', ev.id, 'name', ev.name, 'category', ev.category, 'description', ev.description, 'cover', ev.cover,
    'date', ev.date, 'start', ev.start_time, 'end', ev.end_time, 'location', ev.location, 'privacy', ev.privacy,
    'complexity', ev.complexity, 'features', ev.features, 'createdBy', ev.created_by, 'guestName', tok_name,
    'hostName', (select name from people where id = ev.created_by),
    'going', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'going'),
    'maybe', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'maybe'));
end $$;

-- RSVP from an invitation link. Joins the event as a guest if needed. With a personal link, the
-- invitation becomes this person's, and anything the host already gave that name (a team, tasks) follows.
drop function if exists public.respond_to_invite(text, jsonb);
create or replace function public.respond_to_invite(eid text, p_rsvp jsonb, p_token text default null) returns void
language plpgsql security definer set search_path = public as $$
declare ev events; me_id text := gather_private.me(); inv invitations; tok_inv invitations; who people; status text := p_rsvp ->> 'status';
begin
  if me_id is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if status is not null and status not in ('going', 'maybe', 'declined', 'pending') then raise exception 'Unknown reply.'; end if;
  select * into ev from events where id = eid;
  if not found then raise exception 'This event no longer exists.'; end if;
  if p_token is not null then
    select i.* into tok_inv from invitation_tokens t join invitations i on i.id = t.invitation_id where t.token = p_token and i.event_id = eid;
    if tok_inv.id is not null then
      if tok_inv.user_id is null then update invitations set user_id = me_id where id = tok_inv.id;
      elsif tok_inv.user_id <> me_id then perform gather_private.merge_person(tok_inv.user_id, me_id);
      end if;
    end if;
  end if;
  select * into inv from invitations where event_id = eid and user_id = me_id limit 1;
  if not found and ev.privacy = 'private' and not gather_private.is_member(eid) then
    raise exception 'This event is invite only. Ask the host for your personal invitation link.' using errcode = '42501';
  end if;
  select * into who from people where id = me_id;
  if not exists (select 1 from memberships where event_id = eid and user_id = me_id) then
    insert into memberships (id, event_id, user_id, role) values ('m' || substr(md5(random()::text), 1, 12), eid, me_id, 'guest');
  end if;
  if inv.id is null then
    insert into invitations (id, event_id, user_id, name, email, guest_group, plus_one_allowed)
    values ('i' || substr(md5(random()::text), 1, 12), eid, me_id, who.name, who.email, 'Via link', ev.features ? 'plusOnes')
    returning * into inv;
  end if;
  -- Only the reply fields a guest controls are accepted.
  update invitations set rsvp = rsvp || jsonb_strip_nulls(jsonb_build_object(
      'status', status, 'plusOne', p_rsvp -> 'plusOne', 'plusOneName', p_rsvp -> 'plusOneName', 'dietary', p_rsvp -> 'dietary',
      'arrival', p_rsvp -> 'arrival', 'message', p_rsvp -> 'message')) || jsonb_build_object('respondedAt', now())
  where id = inv.id;
  if status is not null and status is distinct from (inv.rsvp ->> 'status') then
    insert into activity (id, event_id, user_id, text) values ('ac' || substr(md5(random()::text), 1, 12), eid, me_id,
      'RSVP''d “' || case status when 'declined' then 'can''t go' else status end || '”');
    if ev.created_by <> me_id then
      insert into notifications (id, user_id, event_id, text, link) values ('n' || substr(md5(random()::text), 1, 12), ev.created_by, eid,
        who.name || ' replied “' || case status when 'declined' then 'can''t go' else status end || '” to ' || ev.name, 'e-' || eid || '-people');
    end if;
  end if;
end $$;

-- The personal link token for one guest, for people who manage guests.
create or replace function public.invite_link(p_invitation text) returns text
language plpgsql security definer set search_path = public as $$
declare eid text; tok text;
begin
  select event_id into eid from invitations where id = p_invitation;
  if eid is null then raise exception 'That invitation no longer exists.'; end if;
  if not gather_private.can(eid, 'manageGuests') then raise exception 'Only people who manage guests can send invitations.' using errcode = '42501'; end if;
  insert into invitation_tokens (invitation_id) values (p_invitation) on conflict (invitation_id) do nothing;
  select token into tok from invitation_tokens where invitation_id = p_invitation;
  return tok;
end $$;

-- Used by the send-invites Edge Function: checks the caller may manage guests, records the send, and
-- returns what each email needs. At most 100 guests per event per day.
create or replace function public.prepare_invite_emails(eid text, p_ids text[], p_kind text default 'invite') returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev events; host people; recent int; out jsonb;
begin
  if not gather_private.can(eid, 'manageGuests') then raise exception 'Only people who manage guests can send invitations.' using errcode = '42501'; end if;
  if p_kind not in ('invite', 'reminder') then raise exception 'Unknown message type.'; end if;
  select * into ev from events where id = eid;
  select * into host from people where id = gather_private.me();
  select count(*) into recent from invitations where event_id = eid and sent ? 'email' and (sent ->> 'email')::timestamptz > now() - interval '1 day';
  if recent + coalesce(cardinality(p_ids), 0) > 100 then
    raise exception 'You can email up to 100 guests a day for one event. Send the rest tomorrow, or from your own email app.';
  end if;
  insert into invitation_tokens (invitation_id) select id from invitations where event_id = eid and id = any(p_ids) on conflict do nothing;
  with picked as (
    update invitations i set sent = i.sent || jsonb_build_object('email', now()),
                             reminders = i.reminders + case when p_kind = 'reminder' then 1 else 0 end
    where i.event_id = eid and i.id = any(p_ids) and i.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    returning i.id, i.name, i.email)
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'token', t.token)), '[]') into out
  from picked p join invitation_tokens t on t.invitation_id = p.id;
  return jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'date', ev.date, 'start', ev.start_time, 'end', ev.end_time, 'location', ev.location, 'description', ev.description),
    'host', jsonb_build_object('name', host.name, 'email', host.email), 'kind', p_kind, 'recipients', out);
end $$;

revoke all on function public.invite_preview(text, text), public.respond_to_invite(text, jsonb, text), public.invite_link(text), public.prepare_invite_emails(text, text[], text) from public, anon;
grant execute on function public.invite_preview(text, text), public.respond_to_invite(text, jsonb, text), public.invite_link(text), public.prepare_invite_emails(text, text[], text) to authenticated;

-- Copies sample events into the signed-in account in one go. Every event in the payload is created
-- with the caller as owner; rows may only point at events and people that are in the same payload.
create or replace function public.import_events(payload jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare me_id text := gather_private.me(); ev_ids text[]; people_ids text[]; com_ids text[];
begin
  if me_id is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select coalesce(array_agg(x ->> 'id'), '{}') into ev_ids from jsonb_array_elements(payload -> 'events') x;
  select coalesce(array_agg(x ->> 'id'), '{}') into people_ids from jsonb_array_elements(coalesce(payload -> 'people', '[]')) x;
  select coalesce(array_agg(x ->> 'id'), '{}') into com_ids from jsonb_array_elements(coalesce(payload -> 'committees', '[]')) x;
  if cardinality(ev_ids) = 0 or cardinality(ev_ids) > 10 then raise exception 'Import between 1 and 10 events.'; end if;
  if exists (select 1 from events where id = any(ev_ids)) or exists (select 1 from people where id = any(people_ids)) then
    raise exception 'Those records already exist.';
  end if;
  people_ids := people_ids || me_id;
  -- Every row must belong to an imported event, and every person it names must be imported or be the caller.
  if exists (select 1 from jsonb_array_elements(payload -> 'events') x where x ->> 'created_by' <> me_id)
     or exists (select 1 from jsonb_each(payload - 'people' - 'events' - 'committee_memberships') t, jsonb_array_elements(t.value) r
                where not (r ->> 'event_id' = any(ev_ids))
                   or (r ? 'user_id' and r ->> 'user_id' is not null and not (r ->> 'user_id' = any(people_ids))))
     or exists (select 1 from jsonb_array_elements(coalesce(payload -> 'committee_memberships', '[]')) r
                where not (r ->> 'committee_id' = any(com_ids)) or not (r ->> 'user_id' = any(people_ids)))
     or exists (select 1 from jsonb_object_keys(payload) k where k not in ('people','events','event_private','memberships','invitations',
                'committees','committee_budgets','committee_memberships','tasks','schedule_items','expenses','media','announcements','files','activity'))
  then raise exception 'The import contains rows that point outside it.'; end if;

  -- Sample people become placeholders owned by the importer; they are never linked to an account.
  insert into people (id, name, email, tone, bio, created_by)
    select x.id, x.name, '', coalesce(x.tone, 'lav'), coalesce(x.bio, ''), me_id
    from jsonb_to_recordset(coalesce(payload -> 'people', '[]')) as x(id text, name text, tone text, bio text)
    where x.id <> me_id;
  insert into events select * from jsonb_populate_recordset(null::events, payload -> 'events');
  insert into event_private select * from jsonb_populate_recordset(null::event_private, coalesce(payload -> 'event_private', '[]'));
  insert into memberships select * from jsonb_populate_recordset(null::memberships, coalesce(payload -> 'memberships', '[]'));
  -- The importer owns every imported event, whatever the payload said.
  delete from memberships where event_id = any(ev_ids) and user_id = me_id;
  update memberships set role = 'manager' where event_id = any(ev_ids) and role = 'owner';
  insert into memberships (id, event_id, user_id, role) select 'm' || substr(md5(random()::text || e), 1, 12), e, me_id, 'owner' from unnest(ev_ids) e;
  insert into invitations select * from jsonb_populate_recordset(null::invitations, coalesce(payload -> 'invitations', '[]'));
  insert into committees select * from jsonb_populate_recordset(null::committees, coalesce(payload -> 'committees', '[]'));
  insert into committee_budgets select * from jsonb_populate_recordset(null::committee_budgets, coalesce(payload -> 'committee_budgets', '[]'));
  insert into committee_memberships select * from jsonb_populate_recordset(null::committee_memberships, coalesce(payload -> 'committee_memberships', '[]'));
  insert into tasks select * from jsonb_populate_recordset(null::tasks, coalesce(payload -> 'tasks', '[]'));
  insert into schedule_items select * from jsonb_populate_recordset(null::schedule_items, coalesce(payload -> 'schedule_items', '[]'));
  insert into expenses select * from jsonb_populate_recordset(null::expenses, coalesce(payload -> 'expenses', '[]'));
  insert into media select * from jsonb_populate_recordset(null::media, coalesce(payload -> 'media', '[]'));
  insert into announcements select * from jsonb_populate_recordset(null::announcements, coalesce(payload -> 'announcements', '[]'));
  insert into files select * from jsonb_populate_recordset(null::files, coalesce(payload -> 'files', '[]'));
  insert into activity select * from jsonb_populate_recordset(null::activity, coalesce(payload -> 'activity', '[]'));
  return cardinality(ev_ids);
end $$;

revoke all on all functions in schema gather_private from public, anon;
grant execute on all functions in schema gather_private to authenticated;
revoke all on function public.ensure_me(text), public.import_events(jsonb) from public, anon;
grant execute on function public.ensure_me(text), public.import_events(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Feedback and error reports from signed-in people. Write-only from the app: there is no read
-- policy, so only the project owner sees them (Supabase dashboard -> Table editor -> feedback).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null default auth.uid(),
  kind text not null default 'feedback' check (kind in ('feedback', 'error')),
  message text not null check (char_length(message) between 1 and 4000),
  page text not null default '' check (char_length(page) <= 300),
  device text not null default '' check (char_length(device) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_time on public.feedback (auth_user_id, created_at);
alter table public.feedback enable row level security;
drop policy if exists feedback_add on public.feedback;
create policy feedback_add on public.feedback for insert to authenticated with check (auth_user_id = auth.uid());
revoke all on public.feedback from anon, authenticated;
grant insert (kind, message, page, device) on public.feedback to authenticated;

-- At most 40 rows a day per person, so a looping error or a script cannot fill the table.
create or replace function gather_private.feedback_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from feedback where auth_user_id = new.auth_user_id and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Thanks, we have plenty from you today. Try again tomorrow.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists feedback_cap on public.feedback;
create trigger feedback_cap before insert on public.feedback for each row execute function gather_private.feedback_cap();
revoke all on function gather_private.feedback_cap() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Delete my account. Removes the caller's sign-in, profile, the events they own (with everything
-- in them), their place in other people's events, their photos and their notifications. Tasks and
-- costs they were named on in other people's events stay, with nobody assigned.
-- The app removes the stored photo files first; this function removes the rows.
-- ---------------------------------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me_id text;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select id into me_id from people where auth_user_id = uid;
  if me_id is not null then
    delete from events where id in (select event_id from memberships where user_id = me_id and role = 'owner');
    delete from committee_memberships where user_id = me_id;
    delete from memberships where user_id = me_id;
    delete from invitations where user_id = me_id;
    delete from media where user_id = me_id;
    delete from notifications where user_id = me_id;
    update tasks set assignee_id = null where assignee_id = me_id;
    update schedule_items set owner_id = null where owner_id = me_id;
    update expenses set paid_by = null where paid_by = me_id;
    -- Placeholder people this person added (guests without an account) who are no longer in any event.
    delete from people p where p.created_by = me_id and p.auth_user_id is null
      and not exists (select 1 from memberships m where m.user_id = p.id)
      and not exists (select 1 from invitations i where i.user_id = p.id);
    delete from people where id = me_id;
  end if;
  delete from feedback where auth_user_id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reply without an account. A personal invitation link (#invite-<event>-<token>) is enough to see
-- the event and answer: the token is the guest's key, like a private link in an email. Nobody has
-- to sign up or sign in. These two functions are the only way in with a token alone; they show one
-- event and change only the reply fields of the one invitation the token belongs to.
-- ---------------------------------------------------------------------------------------------

-- The invitation page. With a valid personal token: the event and that guest's own reply.
-- Without one: the event only when it is open to anyone with the link (or public); an invite-only
-- event says so and shows nothing else.
create or replace function public.guest_invite(eid text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ev events; inv invitations;
begin
  select * into ev from events where id = eid;
  if not found then return null; end if;
  if p_token ~ '^[A-Za-z0-9]{16,64}$' then
    select i.* into inv from invitation_tokens t join invitations i on i.id = t.invitation_id
    where t.token = p_token and i.event_id = eid;
  end if;
  if inv.id is null and ev.privacy = 'private' then
    return jsonb_build_object('id', ev.id, 'private', true);
  end if;
  return jsonb_build_object(
    'id', ev.id, 'name', ev.name, 'category', ev.category, 'description', ev.description, 'cover', ev.cover,
    'date', ev.date, 'start', ev.start_time, 'end', ev.end_time, 'location', ev.location, 'privacy', ev.privacy,
    'hostName', (select name from people where id = ev.created_by),
    'going', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'going'),
    'maybe', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'maybe'),
    'guest', case when inv.id is null then null else jsonb_build_object(
      'name', inv.name, 'rsvp', inv.rsvp, 'plusOneAllowed', inv.plus_one_allowed and ev.features ? 'plusOnes') end);
end $$;

-- Answer with a personal token. Accepts only the reply fields, trimmed to sensible lengths, and
-- tells the host. Returns the saved reply.
create or replace function public.guest_rsvp(eid text, p_token text, p_rsvp jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev events; inv invitations; status text := p_rsvp ->> 'status'; was text; plus boolean; clean jsonb;
begin
  if status is not null and status not in ('going', 'maybe', 'declined') then raise exception 'Unknown reply.'; end if;
  select * into ev from events where id = eid;
  if not found then raise exception 'This event no longer exists.'; end if;
  if p_token ~ '^[A-Za-z0-9]{16,64}$' then
    select i.* into inv from invitation_tokens t join invitations i on i.id = t.invitation_id
    where t.token = p_token and i.event_id = eid;
  end if;
  if inv.id is null then
    raise exception 'This invitation link doesn’t work any more. Ask the host to send it again.' using errcode = '42501';
  end if;
  was := inv.rsvp ->> 'status';
  plus := case when p_rsvp ? 'plusOne' then (p_rsvp ->> 'plusOne') = 'true' and inv.plus_one_allowed and ev.features ? 'plusOnes' end;
  if status = 'declined' then plus := false; end if;
  clean := jsonb_strip_nulls(jsonb_build_object(
    'status', status,
    'plusOne', plus,
    'plusOneName', case when plus then left(p_rsvp ->> 'plusOneName', 120) when plus is false then '' end,
    'dietary', left(p_rsvp ->> 'dietary', 300),
    'arrival', case when (p_rsvp ->> 'arrival') ~ '^\d{1,2}:\d{2}$' or (p_rsvp ->> 'arrival') = '' then p_rsvp ->> 'arrival' end,
    'message', left(p_rsvp ->> 'message', 1000)));
  update invitations set rsvp = rsvp || clean || jsonb_build_object('respondedAt', now())
  where id = inv.id returning * into inv;
  if status is not null and status is distinct from was then
    if inv.user_id is not null then
      insert into activity (id, event_id, user_id, text) values ('ac' || substr(md5(random()::text), 1, 12), eid, inv.user_id,
        'RSVP''d “' || case status when 'declined' then 'can''t go' else status end || '”');
    end if;
    if inv.user_id is distinct from ev.created_by then
      insert into notifications (id, user_id, event_id, text, link) values ('n' || substr(md5(random()::text), 1, 12), ev.created_by, eid,
        inv.name || ' replied “' || case status when 'declined' then 'can''t go' else status end || '” to ' || ev.name, 'e-' || eid || '-people');
    end if;
  end if;
  return inv.rsvp;
end $$;

revoke all on function public.guest_invite(text, text), public.guest_rsvp(text, text, jsonb) from public;
grant execute on function public.guest_invite(text, text), public.guest_rsvp(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Photo storage: a private bucket. Paths are <event id>/<gallery>/<file>, and the same gallery
-- permissions as the media table decide who can read and upload.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;

drop policy if exists gather_media_read on storage.objects;
drop policy if exists gather_media_add on storage.objects;
drop policy if exists gather_media_delete on storage.objects;
create policy gather_media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and gather_private.can_view_gallery((storage.foldername(name))[1], (storage.foldername(name))[2]));
create policy gather_media_add on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and gather_private.can_add_gallery((storage.foldername(name))[1], (storage.foldername(name))[2]));
create policy gather_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (owner = auth.uid() or gather_private.my_role((storage.foldername(name))[1]) = 'owner'));
