-- ---------------------------------------------------------------------------------------------
-- Note to guests and the bring list.
--   * events.guest_note: a short update from the host, shown at the top of every invitation page.
--   * bring_items: things guests can offer to bring. Hosts (anyone who manages guests) add and assign
--     them; a guest claims one from their personal link or, when signed in, from the app.
-- ---------------------------------------------------------------------------------------------
alter table public.events add column if not exists guest_note text default '';  -- nullable: sample imports send no value
alter table public.events add column if not exists guest_note_at timestamptz;

create table if not exists public.bring_items (
  id text primary key,
  event_id text not null references public.events (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  note text not null default '' check (char_length(note) <= 300),
  claimed_by text references public.invitations (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bring_items_event on public.bring_items (event_id);
alter table public.bring_items enable row level security;
drop policy if exists bring_read on public.bring_items;
drop policy if exists bring_add on public.bring_items;
drop policy if exists bring_edit on public.bring_items;
drop policy if exists bring_delete on public.bring_items;
create policy bring_read on public.bring_items for select to authenticated using (gather_private.is_member(event_id));
create policy bring_add on public.bring_items for insert to authenticated with check (gather_private.can(event_id, 'manageGuests'));
create policy bring_edit on public.bring_items for update to authenticated
  using (gather_private.can(event_id, 'manageGuests')) with check (gather_private.can(event_id, 'manageGuests'));
create policy bring_delete on public.bring_items for delete to authenticated using (gather_private.can(event_id, 'manageGuests'));
grant select, insert, update, delete on public.bring_items to authenticated;

-- The bring list as one guest sees it: first names only for items other people took.
create or replace function gather_private.bring_list(eid text, my_inv text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'note', b.note,
           'mine', b.claimed_by is not null and b.claimed_by = my_inv,
           'by', case when b.claimed_by is null then null else split_part(trim(i.name), ' ', 1) end)
         order by b.position, b.created_at), '[]')
  from bring_items b left join invitations i on i.id = b.claimed_by
  where b.event_id = eid
$$;
revoke all on function gather_private.bring_list(text, text) from public, anon, authenticated;

-- Claim or give back an item for one invitation. At most 5 items per guest; an item someone else
-- already took cannot be taken over.
create or replace function gather_private.claim_for(eid text, inv_id text, p_item text, p_claim boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n int; who text;
begin
  if not exists (select 1 from bring_items where id = p_item and event_id = eid) then raise exception 'That item is no longer on the list.'; end if;
  if p_claim then
    select count(*) into n from bring_items where event_id = eid and claimed_by = inv_id;
    if n >= 5 then raise exception 'That’s plenty, thank you! Give one back to take another.'; end if;
    update bring_items set claimed_by = inv_id where id = p_item and (claimed_by is null or claimed_by = inv_id);
    if not found then
      select split_part(trim(i.name), ' ', 1) into who from bring_items b join invitations i on i.id = b.claimed_by where b.id = p_item;
      raise exception '% is already bringing that.', coalesce(who, 'Someone');
    end if;
  else
    update bring_items set claimed_by = null where id = p_item and claimed_by = inv_id;
  end if;
end $$;
revoke all on function gather_private.claim_for(text, text, text, boolean) from public, anon, authenticated;

-- From a personal link, without an account.
create or replace function public.guest_claim(eid text, p_token text, p_item text, p_claim boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv_id text;
begin
  if p_token ~ '^[A-Za-z0-9]{16,64}$' then
    select i.id into inv_id from invitation_tokens t join invitations i on i.id = t.invitation_id where t.token = p_token and i.event_id = eid;
  end if;
  if inv_id is null then raise exception 'This invitation link doesn’t work any more. Ask the host to send it again.' using errcode = '42501'; end if;
  perform gather_private.claim_for(eid, inv_id, p_item, p_claim);
  return gather_private.bring_list(eid, inv_id);
end $$;

-- Signed in: the caller's own invitation to that event.
create or replace function public.claim_bring_item(p_item text, p_claim boolean) returns void
language plpgsql security definer set search_path = public as $$
declare eid text; inv_id text;
begin
  select event_id into eid from bring_items where id = p_item;
  if eid is null then raise exception 'That item is no longer on the list.'; end if;
  select id into inv_id from invitations where event_id = eid and user_id = gather_private.me() limit 1;
  if inv_id is null then raise exception 'Only invited guests can pick something to bring.' using errcode = '42501'; end if;
  perform gather_private.claim_for(eid, inv_id, p_item, p_claim);
end $$;

revoke all on function public.guest_claim(text, text, text, boolean), public.claim_bring_item(text, boolean) from public;
grant execute on function public.guest_claim(text, text, text, boolean) to anon, authenticated;
revoke all on function public.claim_bring_item(text, boolean) from anon;
grant execute on function public.claim_bring_item(text, boolean) to authenticated;

-- The invitation page now carries the note and the bring list.
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
    'guestNote', nullif(ev.guest_note, ''), 'guestNoteAt', ev.guest_note_at,
    'going', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'going'),
    'maybe', (select count(*) from invitations where event_id = eid and rsvp ->> 'status' = 'maybe'),
    'bring', case when inv.id is null then null else gather_private.bring_list(eid, inv.id) end,
    'guest', case when inv.id is null then null else jsonb_build_object(
      'name', inv.name, 'rsvp', inv.rsvp, 'plusOneAllowed', inv.plus_one_allowed and ev.features ? 'plusOnes') end);
end $$;

-- Invitation emails can now also carry the host's note ('update'), sent to chosen guests.
create or replace function public.prepare_invite_emails(eid text, p_ids text[], p_kind text default 'invite') returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev events; host people; recent int; out jsonb;
begin
  if not gather_private.can(eid, 'manageGuests') then raise exception 'Only people who manage guests can send invitations.' using errcode = '42501'; end if;
  if p_kind not in ('invite', 'reminder', 'update') then raise exception 'Unknown message type.'; end if;
  select * into ev from events where id = eid;
  if p_kind = 'update' and coalesce(ev.guest_note, '') = '' then raise exception 'Write the note first.'; end if;
  select * into host from people where id = gather_private.me();
  select count(*) into recent from invitations where event_id = eid and sent ? 'email' and (sent ->> 'email')::timestamptz > now() - interval '1 day';
  if recent + coalesce(cardinality(p_ids), 0) > 100 then
    raise exception 'You can email up to 100 guests a day for one event. Send the rest tomorrow, or from your own email app.';
  end if;
  insert into invitation_tokens (invitation_id) select id from invitations where event_id = eid and id = any(p_ids) on conflict do nothing;
  with picked as (
    update invitations i set sent = i.sent || jsonb_build_object('email', now()) || case when p_kind = 'update' then jsonb_build_object('update', now()) else '{}'::jsonb end,
                             reminders = i.reminders + case when p_kind = 'reminder' then 1 else 0 end
    where i.event_id = eid and i.id = any(p_ids) and i.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    returning i.id, i.name, i.email)
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'token', t.token)), '[]') into out
  from picked p join invitation_tokens t on t.invitation_id = p.id;
  return jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'date', ev.date, 'start', ev.start_time, 'end', ev.end_time, 'location', ev.location,
      'description', ev.description, 'note', ev.guest_note),
    'host', jsonb_build_object('name', host.name, 'email', host.email), 'kind', p_kind, 'recipients', out);
end $$;
