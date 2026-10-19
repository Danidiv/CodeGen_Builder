-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again (it drops and recreates the policies and trigger).

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled project',
  -- everything about the project: { files, messages, versions, active }
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

-- Row Level Security: every user can only see and change their OWN projects.
-- This is what makes it safe to use the public "anon" key in the browser.
alter table public.projects enable row level security;

drop policy if exists "Users read own projects"   on public.projects;
drop policy if exists "Users insert own projects" on public.projects;
drop policy if exists "Users update own projects" on public.projects;
drop policy if exists "Users delete own projects" on public.projects;

create policy "Users read own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users update own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily usage limit per user (counts AI requests). Safe to run again.
-- ---------------------------------------------------------------------------
create table if not exists public.usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

-- No policies on purpose: nobody can read or change this table directly.
-- It is only reachable through the two functions below.
alter table public.usage enable row level security;

-- Counts one AI request for the signed-in user. The limit check and the +1 happen
-- in ONE statement, so two requests at the same moment cannot both slip through.
-- p_limit <= 0 means "no limit" (still counted). The day changes at 00:00 UTC.
create or replace function public.consume_usage(p_limit int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  used  int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  insert into public.usage (user_id, day, count) values (uid, today, 0)
  on conflict (user_id, day) do nothing;

  update public.usage
     set count = count + 1
   where user_id = uid and day = today and (p_limit <= 0 or count < p_limit)
  returning count into used;

  if used is null then
    select count into used from public.usage where user_id = uid and day = today;
    return json_build_object('allowed', false, 'used', used, 'limit', p_limit);
  end if;
  return json_build_object('allowed', true, 'used', used, 'limit', p_limit);
end;
$$;

-- Only reads today's number (for the counter in the UI).
create or replace function public.get_usage(p_limit int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  used int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select count into used from public.usage
   where user_id = uid and day = (now() at time zone 'utc')::date;
  return json_build_object('allowed', true, 'used', coalesce(used, 0), 'limit', p_limit);
end;
$$;

revoke all on function public.consume_usage(int) from public, anon;
revoke all on function public.get_usage(int) from public, anon;
grant execute on function public.consume_usage(int) to authenticated;
grant execute on function public.get_usage(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Published sites: a public link /s/<id> that shows the site of a project.
-- Safe to run again.
-- ---------------------------------------------------------------------------
create table if not exists public.published_sites (
  id           text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  project_id   uuid not null unique references public.projects (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null default 'My site',
  files        jsonb not null,
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.published_sites enable row level security;

drop policy if exists "Users read own published sites"   on public.published_sites;
drop policy if exists "Users insert own published sites" on public.published_sites;
drop policy if exists "Users update own published sites" on public.published_sites;
drop policy if exists "Users delete own published sites" on public.published_sites;

-- The owner manages the site. Visitors do NOT get a table policy: they can only
-- fetch ONE site by its id through get_published_site() below, so nobody can list all sites.
create policy "Users read own published sites"
  on public.published_sites for select using (auth.uid() = user_id);
create policy "Users insert own published sites"
  on public.published_sites for insert with check (auth.uid() = user_id);
create policy "Users update own published sites"
  on public.published_sites for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own published sites"
  on public.published_sites for delete using (auth.uid() = user_id);

create or replace function public.get_published_site(p_id text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object('name', name, 'files', files)
    from public.published_sites
   where id = p_id;
$$;

revoke all on function public.get_published_site(text) from public;
grant execute on function public.get_published_site(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Safety: reports from visitors + blocking of projects (see supabase/moderation.sql).
-- Safe to run again.
-- ---------------------------------------------------------------------------
create table if not exists public.blocked_projects (
  project_id uuid primary key,
  reason     text,
  created_at timestamptz not null default now()
);
alter table public.blocked_projects enable row level security; -- no policies: only you (dashboard / SQL editor) can use it

create table if not exists public.site_reports (
  id         bigint generated always as identity primary key,
  site_id    text not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
alter table public.site_reports enable row level security;     -- no policies: visitors can only use report_site()

create or replace function public.report_site(p_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'please choose a reason';
  end if;
  if not exists (select 1 from public.published_sites where id = p_id) then
    raise exception 'site not found';
  end if;
  -- at most 100 reports per site are stored (protects against spam)
  if (select count(*) from public.site_reports where site_id = p_id) >= 100 then
    return;
  end if;
  insert into public.site_reports (site_id, reason) values (p_id, left(p_reason, 500));
end;
$$;

revoke all on function public.report_site(text, text) from public;
grant execute on function public.report_site(text, text) to anon, authenticated;

-- Blocked projects are not shown to visitors any more.
create or replace function public.get_published_site(p_id text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object('name', s.name, 'files', s.files)
    from public.published_sites s
   where s.id = p_id
     and not exists (select 1 from public.blocked_projects b where b.project_id = s.project_id);
$$;

revoke all on function public.get_published_site(text) from public;
grant execute on function public.get_published_site(text) to anon, authenticated;

-- A blocked project cannot be published again (not even under a new link).
create or replace function public.refuse_blocked_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.blocked_projects b where b.project_id = new.project_id) then
    raise exception 'This project was blocked by moderation and cannot be published.';
  end if;
  return new;
end;
$$;

drop trigger if exists published_sites_refuse_blocked on public.published_sites;
create trigger published_sites_refuse_blocked
  before insert or update on public.published_sites
  for each row execute function public.refuse_blocked_publish();
