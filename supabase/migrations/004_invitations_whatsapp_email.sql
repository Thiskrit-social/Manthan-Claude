-- Personal invitation links (WhatsApp and email), guest phone numbers, and automatic invitation emails.
-- Safe to run once on a database that has migrations up to 003.

alter table public.invitations add column if not exists phone text not null default '';
alter table public.invitations add column if not exists sent jsonb not null default '{}';

-- Personal invitation links. Each guest gets their own token, so someone invited by WhatsApp or email
-- can join even an invite-only event. No policies: only the functions below read or write tokens.
create table if not exists public.invitation_tokens (
  invitation_id text primary key references public.invitations (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '')
);
alter table public.invitation_tokens enable row level security;

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
