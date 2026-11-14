-- Moves the permission-check helpers out of the public API.
-- Supabase exposes every function in the public schema at /rest/v1/rpc/<name>. These helpers are only
-- meant for row-level security policies, so they now live in a schema the API does not expose.
-- Policies keep working because they refer to functions by identity, not by name; function bodies
-- that call the helpers by name are rewritten below. Safe to run once on a database that ran the
-- first version of schema.sql. (A fresh install only needs schema.sql, which already includes this.)
create schema if not exists gather_private;
revoke all on schema gather_private from public, anon;
grant usage on schema gather_private to authenticated;

alter function public.me() set schema gather_private;
alter function public.my_role(text) set schema gather_private;
alter function public.is_member(text) set schema gather_private;
alter function public.is_creator(text) set schema gather_private;
alter function public.can(text, text) set schema gather_private;
alter function public.has_feature(text, text) set schema gather_private;
alter function public.committee_event(text) set schema gather_private;
alter function public.in_committee(text) set schema gather_private;
alter function public.leads_committee(text) set schema gather_private;
alter function public.leads_any(text) set schema gather_private;
alter function public.person_in_event(text, text) set schema gather_private;
alter function public.shares_event(text) set schema gather_private;
alter function public.can_view_gallery(text, text) set schema gather_private;
alter function public.can_add_gallery(text, text) set schema gather_private;

revoke all on all functions in schema gather_private from public, anon;
grant execute on all functions in schema gather_private to authenticated;

-- Rewrite every function body that calls a helper as public.<helper>(...).
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'gather_private') and p.prokind = 'f' loop
    def := pg_get_functiondef(f.oid);
    if def ~ 'public\.(me|my_role|is_member|is_creator|can|has_feature|committee_event|in_committee|leads_committee|leads_any|person_in_event|shares_event|can_view_gallery|can_add_gallery)\(' then
      execute regexp_replace(def, 'public\.(me|my_role|is_member|is_creator|can|has_feature|committee_event|in_committee|leads_committee|leads_any|person_in_event|shares_event|can_view_gallery|can_add_gallery)\(', 'gather_private.\1(', 'g');
    end if;
  end loop;
end $$;
