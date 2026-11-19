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
