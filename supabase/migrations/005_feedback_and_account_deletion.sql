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
