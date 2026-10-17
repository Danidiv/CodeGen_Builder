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
