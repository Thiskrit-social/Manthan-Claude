-- ---------------------------------------------------------------------------------------------
-- A livelier invitation page.
--   * Who's going: first names of guests who said yes (event feature 'guestList').
--   * Guest comments: a message wall on the invitation (event feature 'wall'), usable from a
--     personal link without an account. Hosts can delete any comment; people can delete their own.
--   * Chip in: events.extras.chipIn = { url, amount, note }: a payment link shown to guests.
--     Only https:// and upi:// links are accepted.
-- The invitation theme lives in events.cover.theme and needs no change here.
-- ---------------------------------------------------------------------------------------------
alter table public.events add column if not exists extras jsonb default '{}';  -- nullable: sample imports send no value
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_chip_in_link') then
    alter table public.events add constraint events_chip_in_link check (
      coalesce(extras -> 'chipIn' ->> 'url', '') = '' or ((extras -> 'chipIn' ->> 'url') ~* '^(https://|upi://)[^\s<>"'']{3,}$' and char_length(extras -> 'chipIn' ->> 'url') <= 500));
  end if;
end $$;

create table if not exists public.invite_wall (
  id text primary key default ('w' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  event_id text not null references public.events (id) on delete cascade,
  invitation_id text references public.invitations (id) on delete cascade,
  user_id text,
  author text not null check (char_length(author) between 1 and 60),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists invite_wall_event on public.invite_wall (event_id, created_at);
alter table public.invite_wall enable row level security;
drop policy if exists wall_read on public.invite_wall;
drop policy if exists wall_delete on public.invite_wall;
create policy wall_read on public.invite_wall for select to authenticated using (gather_private.is_member(event_id));
create policy wall_delete on public.invite_wall for delete to authenticated
  using (gather_private.can(event_id, 'manageGuests') or user_id = gather_private.me());
revoke all on public.invite_wall from anon, authenticated;
grant select, delete on public.invite_wall to authenticated;

-- The wall as one guest sees it (newest 100, oldest first), marking their own messages.
create or replace function gather_private.wall_list(eid text, my_inv text, my_user text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'author', w.author, 'body', w.body, 'at', w.created_at,
           'mine', (my_inv is not null and w.invitation_id = my_inv) or (my_user is not null and w.user_id = my_user)) order by w.created_at), '[]')
  from (select * from invite_wall where event_id = eid order by created_at desc limit 100) w
$$;

-- First names of guests who said yes, with how many plus-ones they bring.
create or replace function gather_private.going_list(eid text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', split_part(trim(name), ' ', 1), 'plus', coalesce((rsvp ->> 'plusOne')::boolean, false))
           order by rsvp ->> 'respondedAt' nulls last, name), '[]')
  from (select name, rsvp from invitations where event_id = eid and rsvp ->> 'status' = 'going' limit 200) i
$$;

-- Adds one message. Checks the event allows comments and a daily limit per writer, and tells the host.
create or replace function gather_private.wall_add(eid text, inv_id text, uid text, who text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare ev events; b text := trim(coalesce(p_body, '')); n int;
begin
  select * into ev from events where id = eid;
  if not found then raise exception 'This event no longer exists.'; end if;
  if not coalesce(ev.features ? 'wall', false) then raise exception 'Comments are turned off for this event.' using errcode = '42501'; end if;
  if b = '' then raise exception 'Write something first.'; end if;
  if char_length(b) > 500 then raise exception 'Keep it under 500 characters.'; end if;
  select count(*) into n from invite_wall where event_id = eid and created_at > now() - interval '1 day'
    and ((inv_id is not null and invitation_id = inv_id) or (uid is not null and user_id = uid));
  if n >= 20 then raise exception 'That’s a lot of messages today. Try again tomorrow.'; end if;
  insert into invite_wall (event_id, invitation_id, user_id, author, body)
  values (eid, inv_id, uid, left(coalesce(nullif(split_part(trim(who), ' ', 1), ''), 'Guest'), 60), b);
  if uid is distinct from ev.created_by then
    insert into notifications (id, user_id, event_id, text, link) values ('n' || substr(md5(random()::text), 1, 12), ev.created_by, eid,
      left(coalesce(nullif(split_part(trim(who), ' ', 1), ''), 'A guest') || ' wrote on ' || ev.name || ': ' || b, 200), 'e-' || eid || '-overview');
  end if;
end $$;
revoke all on function gather_private.wall_list(text, text, text), gather_private.going_list(text), gather_private.wall_add(text, text, text, text, text) from public, anon, authenticated;

create or replace function gather_private.token_invitation(eid text, p_token text) returns invitations
language plpgsql stable security definer set search_path = public as $$
declare inv invitations;
begin
  if p_token ~ '^[A-Za-z0-9]{16,64}$' then
    select i.* into inv from invitation_tokens t join invitations i on i.id = t.invitation_id where t.token = p_token and i.event_id = eid;
  end if;
  if inv.id is null then raise exception 'This invitation link doesn’t work any more. Ask the host to send it again.' using errcode = '42501'; end if;
  return inv;
end $$;
revoke all on function gather_private.token_invitation(text, text) from public, anon, authenticated;

-- From a personal link, without an account.
create or replace function public.guest_comment(eid text, p_token text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv invitations := gather_private.token_invitation(eid, p_token);
begin
  perform gather_private.wall_add(eid, inv.id, inv.user_id, inv.name, p_body);
  return gather_private.wall_list(eid, inv.id, null);
end $$;
create or replace function public.guest_uncomment(eid text, p_token text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv invitations := gather_private.token_invitation(eid, p_token);
begin
  delete from invite_wall where id = p_id and event_id = eid and invitation_id = inv.id;
  return gather_private.wall_list(eid, inv.id, null);
end $$;

-- Signed in: members of the event, or anyone with an invitation to it.
create or replace function public.post_comment(eid text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me_id text := gather_private.me(); inv_id text; who text;
begin
  if me_id is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select id into inv_id from invitations where event_id = eid and user_id = me_id limit 1;
  if inv_id is null and not gather_private.is_member(eid) then raise exception 'Only people invited to this event can write here.' using errcode = '42501'; end if;
  select name into who from people where id = me_id;
  perform gather_private.wall_add(eid, inv_id, me_id, who, p_body);
end $$;
create or replace function public.going_names(eid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me_id text := gather_private.me();
begin
  if not (gather_private.is_member(eid) or exists (select 1 from invitations where event_id = eid and user_id = me_id)) then return '[]'; end if;
  if not coalesce((select features ? 'guestList' from events where id = eid), false) and not gather_private.can(eid, 'viewGuests') then return '[]'; end if;
  return gather_private.going_list(eid);
end $$;

revoke all on function public.guest_comment(text, text, text), public.guest_uncomment(text, text, text), public.post_comment(text, text), public.going_names(text) from public;
grant execute on function public.guest_comment(text, text, text), public.guest_uncomment(text, text, text) to anon, authenticated;
revoke all on function public.post_comment(text, text), public.going_names(text) from anon;
grant execute on function public.post_comment(text, text), public.going_names(text) to authenticated;

-- The invitation page now also carries the going list, the comments and the chip-in link.
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
    'date', ev.date, 'start', ev.start_time, 'end', ev.end_time, 'location', ev.location, 'privacy', ev.privacy, 'currency', ev.currency,
    'hostName', (select name from people where id = ev.created_by),
    'guestNote', nullif(ev.guest_note, ''), 'guestNoteAt', ev.guest_note_at,
    'chipIn', case when coalesce(ev.extras -> 'chipIn' ->> 'url', '') = '' then null else ev.extras -> 'chipIn' end,
    'going', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'going'),
    'maybe', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'maybe'),
    'goingList', case when coalesce(ev.features ? 'guestList', false) then gather_private.going_list(eid) end,
    'wallOn', coalesce(ev.features ? 'wall', false),
    'wall', case when coalesce(ev.features ? 'wall', false) then gather_private.wall_list(eid, inv.id, null) end,
    'bring', case when inv.id is null then null else gather_private.bring_list(eid, inv.id) end,
    'guest', case when inv.id is null then null else jsonb_build_object(
      'name', inv.name, 'rsvp', inv.rsvp, 'plusOneAllowed', inv.plus_one_allowed and ev.features ? 'plusOnes') end);
end $$;
