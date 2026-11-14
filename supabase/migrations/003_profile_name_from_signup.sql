-- New profiles take the name typed at sign-up. Before this, someone who had to confirm their email first
-- got a profile named after their email address, because the name was only passed on the sign-up request.
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
    if cardinality(others) > 0 then
      update memberships set user_id = keep where user_id = any(others);
      update invitations set user_id = keep where user_id = any(others);
      update committee_memberships set user_id = keep where user_id = any(others);
      update tasks set assignee_id = keep where assignee_id = any(others);
      update schedule_items set owner_id = keep where owner_id = any(others);
      update expenses set paid_by = keep where paid_by = any(others);
      update notifications set user_id = keep where user_id = any(others);
      delete from people where id = any(others);
      -- If both identities were in the same event, keep only the stronger role.
      delete from memberships a using memberships b
      where a.user_id = keep and b.user_id = keep and a.event_id = b.event_id and a.id <> b.id
        and (array_position(array['owner','manager','lead','member','vendor','guest'], a.role), a.id)
          > (array_position(array['owner','manager','lead','member','vendor','guest'], b.role), b.id);
    end if;
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

-- Repair profiles that were created that way.
update public.people p set name = trim(u.raw_user_meta_data ->> 'name')
from auth.users u
where u.id = p.auth_user_id and nullif(trim(u.raw_user_meta_data ->> 'name'), '') is not null
  and p.name = split_part(lower(u.email), '@', 1);
