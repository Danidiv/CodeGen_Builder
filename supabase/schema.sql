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


-- ---------------------------------------------------------------------------
-- Form submissions of published sites (contact form, newsletter, bookings...).
-- Visitors can only add rows through submit_form(); only the site owner can read or delete them.
-- Safe to run again.
-- ---------------------------------------------------------------------------
create table if not exists public.site_submissions (
  id         bigint generated always as identity primary key,
  site_id    text not null references public.published_sites (id) on delete cascade,
  form       text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists site_submissions_site_idx on public.site_submissions (site_id, created_at desc);

alter table public.site_submissions enable row level security;

drop policy if exists "Owners read submissions"   on public.site_submissions;
drop policy if exists "Owners delete submissions" on public.site_submissions;

create policy "Owners read submissions"
  on public.site_submissions for select
  using (exists (select 1 from public.published_sites s where s.id = site_id and s.user_id = auth.uid()));
create policy "Owners delete submissions"
  on public.site_submissions for delete
  using (exists (select 1 from public.published_sites s where s.id = site_id and s.user_id = auth.uid()));

create or replace function public.submit_form(p_site text, p_form text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form text := lower(left(trim(coalesce(p_form, '')), 40));
begin
  if v_form !~ '^[a-z0-9 _-]{1,40}$' then
    raise exception 'bad form name';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data = '{}'::jsonb then
    raise exception 'empty form';
  end if;
  if length(p_data::text) > 10000 or (select count(*) from jsonb_object_keys(p_data)) > 30 then
    raise exception 'form too big';
  end if;
  if not exists (
    select 1 from public.published_sites s
     where s.id = p_site
       and not exists (select 1 from public.blocked_projects b where b.project_id = s.project_id)
  ) then
    raise exception 'site not found';
  end if;
  -- spam protection per site: 10 per minute, 200 per hour, 5000 in total
  if (select count(*) from public.site_submissions where site_id = p_site and created_at > now() - interval '1 minute') >= 10
     or (select count(*) from public.site_submissions where site_id = p_site and created_at > now() - interval '1 hour') >= 200
     or (select count(*) from public.site_submissions where site_id = p_site) >= 5000 then
    raise exception 'too many submissions';
  end if;
  insert into public.site_submissions (site_id, form, data) values (p_site, v_form, p_data);
end;
$$;

revoke all on function public.submit_form(text, text, jsonb) from public;
grant execute on function public.submit_form(text, text, jsonb) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Saved data of published sites (todo items, notes, bookings, orders...).
-- Every visitor (browser) has a secret random key and can only read/change ITS OWN rows,
-- through the four functions below. The site owner can read and delete everything (Inbox > Data).
-- Safe to run again.
-- ---------------------------------------------------------------------------
create table if not exists public.site_records (
  id         uuid primary key default gen_random_uuid(),
  site_id    text not null references public.published_sites (id) on delete cascade,
  visitor    text not null,
  collection text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_records_lookup_idx on public.site_records (site_id, visitor, collection, created_at);
create index if not exists site_records_site_idx on public.site_records (site_id, created_at desc);

alter table public.site_records enable row level security;

drop policy if exists "Owners read records"   on public.site_records;
drop policy if exists "Owners delete records" on public.site_records;

create policy "Owners read records"
  on public.site_records for select
  using (exists (select 1 from public.published_sites s where s.id = site_id and s.user_id = auth.uid()));
create policy "Owners delete records"
  on public.site_records for delete
  using (exists (select 1 from public.published_sites s where s.id = site_id and s.user_id = auth.uid()));

-- Internal check used by the four functions (not callable from the browser).
create or replace function public.records_check(p_site text, p_visitor text, p_collection text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := lower(left(trim(coalesce(p_collection, '')), 40));
begin
  if p_visitor is null or p_visitor !~ '^[a-z0-9]{16,64}$' then
    raise exception 'bad visitor';
  end if;
  if v_col !~ '^[a-z0-9 _-]{1,40}$' then
    raise exception 'bad collection';
  end if;
  if not exists (
    select 1 from public.published_sites s
     where s.id = p_site
       and not exists (select 1 from public.blocked_projects b where b.project_id = s.project_id)
  ) then
    raise exception 'site not found';
  end if;
  return v_col;
end;
$$;
revoke all on function public.records_check(text, text, text) from public;

create or replace function public.data_list(p_site text, p_visitor text, p_collection text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := public.records_check(p_site, p_visitor, p_collection);
begin
  return coalesce((
    select json_agg(json_build_object('id', r.id, 'data', r.data, 'created_at', r.created_at) order by r.created_at, r.id)
      from (
        select * from public.site_records
         where site_id = p_site and visitor = p_visitor and collection = v_col
         order by created_at, id
         limit 500
      ) r
  ), '[]'::json);
end;
$$;

create or replace function public.data_add(p_site text, p_visitor text, p_collection text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := public.records_check(p_site, p_visitor, p_collection);
  v_row public.site_records;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad data';
  end if;
  if length(p_data::text) > 5000 or (select count(*) from jsonb_object_keys(p_data)) > 30 then
    raise exception 'data too big';
  end if;
  -- spam / storage protection: per site 60 per minute, 1000 per hour, 5000 rows in total; 200 rows per visitor and list
  if (select count(*) from public.site_records where site_id = p_site and created_at > now() - interval '1 minute') >= 60
     or (select count(*) from public.site_records where site_id = p_site and created_at > now() - interval '1 hour') >= 1000
     or (select count(*) from public.site_records where site_id = p_site) >= 5000 then
    raise exception 'too many requests';
  end if;
  if (select count(*) from public.site_records where site_id = p_site and visitor = p_visitor and collection = v_col) >= 200 then
    raise exception 'limit reached';
  end if;
  insert into public.site_records (site_id, visitor, collection, data)
  values (p_site, p_visitor, v_col, p_data)
  returning * into v_row;
  return json_build_object('id', v_row.id, 'data', v_row.data, 'created_at', v_row.created_at);
end;
$$;

create or replace function public.data_update(p_site text, p_visitor text, p_collection text, p_id uuid, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := public.records_check(p_site, p_visitor, p_collection);
  v_row public.site_records;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad data';
  end if;
  if (select count(*) from public.site_records where site_id = p_site and updated_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many requests';
  end if;
  update public.site_records
     set data = data || p_data, updated_at = now()
   where id = p_id and site_id = p_site and visitor = p_visitor and collection = v_col
   returning * into v_row;
  if not found then
    raise exception 'not found';
  end if;
  if length(v_row.data::text) > 5000 or (select count(*) from jsonb_object_keys(v_row.data)) > 30 then
    raise exception 'data too big';  -- the update is rolled back
  end if;
  return json_build_object('id', v_row.id, 'data', v_row.data, 'created_at', v_row.created_at);
end;
$$;

create or replace function public.data_remove(p_site text, p_visitor text, p_collection text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := public.records_check(p_site, p_visitor, p_collection);
begin
  delete from public.site_records
   where id = p_id and site_id = p_site and visitor = p_visitor and collection = v_col;
end;
$$;

revoke all on function public.data_list(text, text, text) from public;
revoke all on function public.data_add(text, text, text, jsonb) from public;
revoke all on function public.data_update(text, text, text, uuid, jsonb) from public;
revoke all on function public.data_remove(text, text, text, uuid) from public;
grant execute on function public.data_list(text, text, text) to anon, authenticated;
grant execute on function public.data_add(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.data_update(text, text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.data_remove(text, text, text, uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Accounts for the visitors of published sites (signup / login inside the generated apps).
-- These accounts are SEPARATE from your NEXA AI accounts. Passwords are stored hashed (bcrypt).
-- Visitors only use the functions below; nobody can read the tables directly.
-- Safe to run again.
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.site_users (
  id         uuid primary key default gen_random_uuid(),
  site_id    text not null references public.published_sites (id) on delete cascade,
  email      text not null,
  pass_hash  text not null,
  data_key   text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  unique (site_id, email)
);

create table if not exists public.site_sessions (
  token_hash text primary key,
  user_id    uuid not null references public.site_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);

create table if not exists public.site_login_fails (
  id      bigint generated always as identity primary key,
  site_id text not null,
  email   text not null,
  at      timestamptz not null default now()
);
create index if not exists site_login_fails_idx on public.site_login_fails (site_id, email, at);
create index if not exists site_login_fails_at_idx on public.site_login_fails (at);

alter table public.site_users       enable row level security;  -- no policies: only the functions below can use them
alter table public.site_sessions    enable row level security;
alter table public.site_login_fails enable row level security;

create or replace function public.site_is_open(p_site text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.published_sites s
     where s.id = p_site
       and not exists (select 1 from public.blocked_projects b where b.project_id = s.project_id)
  );
$$;
revoke all on function public.site_is_open(text) from public;

create or replace function public.user_signup(p_site text, p_email text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user  public.site_users;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.site_is_open(p_site) then
    raise exception 'site not found';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 120 then
    raise exception 'bad email';
  end if;
  if p_password is null or length(p_password) < 6 or length(p_password) > 72 then
    raise exception 'weak password';
  end if;
  -- protection: 30 new accounts per hour and 2000 accounts per site
  if (select count(*) from public.site_users where site_id = p_site and created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.site_users where site_id = p_site) >= 2000 then
    raise exception 'too many requests';
  end if;
  begin
    insert into public.site_users (site_id, email, pass_hash)
    values (p_site, v_email, crypt(p_password, gen_salt('bf', 8)))
    returning * into v_user;
  exception when unique_violation then
    raise exception 'email taken';
  end;
  delete from public.site_sessions where expires_at < now();
  insert into public.site_sessions (token_hash, user_id)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_user.id);
  return json_build_object('token', v_token, 'key', v_user.data_key, 'email', v_user.email);
end;
$$;

-- A wrong password is ANSWERED (not raised as an error), so the failed attempt is really stored.
create or replace function public.user_login(p_site text, p_email text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user  public.site_users;
  v_exists boolean;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.site_is_open(p_site) then
    raise exception 'site not found';
  end if;
  delete from public.site_login_fails where at < now() - interval '1 day';
  if (select count(*) from public.site_login_fails where site_id = p_site and email = left(v_email, 120) and at > now() - interval '15 minutes') >= 5 then
    raise exception 'locked';
  end if;
  if (select count(*) from public.site_login_fails where site_id = p_site and at > now() - interval '1 minute') >= 30 then
    raise exception 'too many requests';
  end if;

  select * into v_user from public.site_users where site_id = p_site and email = v_email;
  v_exists := found;   -- (PERFORM below would overwrite FOUND)
  if not v_exists then
    perform crypt(coalesce(p_password, ''), gen_salt('bf', 8));  -- same work as for a real account
  end if;
  if not v_exists or v_user.pass_hash <> crypt(coalesce(p_password, ''), v_user.pass_hash) then
    insert into public.site_login_fails (site_id, email) values (p_site, left(v_email, 120));
    return json_build_object('error', 'wrong login');
  end if;

  delete from public.site_login_fails where site_id = p_site and email = left(v_email, 120);
  delete from public.site_sessions where expires_at < now();
  insert into public.site_sessions (token_hash, user_id)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_user.id);
  return json_build_object('token', v_token, 'key', v_user.data_key, 'email', v_user.email);
end;
$$;

create or replace function public.user_me(p_site text, p_token text)
returns json
language sql
security definer
set search_path = public, extensions
stable
as $$
  select json_build_object('email', u.email, 'key', u.data_key)
    from public.site_sessions s
    join public.site_users u on u.id = s.user_id
   where s.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and s.expires_at > now()
     and u.site_id = p_site
     and public.site_is_open(p_site);
$$;

create or replace function public.user_logout(p_site text, p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.site_sessions
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- For the site owner (Inbox > Users): list and remove accounts. Password hashes are never returned.
create or replace function public.owner_site_users(p_site text)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (select 1 from public.published_sites s where s.id = p_site and s.user_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  return coalesce((
    select json_agg(json_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) order by u.created_at desc)
      from (select * from public.site_users where site_id = p_site order by created_at desc limit 500) u
  ), '[]'::json);
end;
$$;

create or replace function public.owner_delete_site_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.site_users;
begin
  select u.* into v_user
    from public.site_users u
    join public.published_sites s on s.id = u.site_id
   where u.id = p_user and s.user_id = auth.uid();
  if not found then
    raise exception 'not allowed';
  end if;
  delete from public.site_records where site_id = v_user.site_id and visitor = v_user.data_key;
  delete from public.site_users where id = v_user.id;   -- sessions go with it
end;
$$;

revoke all on function public.user_signup(text, text, text) from public;
revoke all on function public.user_login(text, text, text) from public;
revoke all on function public.user_me(text, text) from public;
revoke all on function public.user_logout(text, text) from public;
revoke all on function public.owner_site_users(text) from public;
revoke all on function public.owner_delete_site_user(uuid) from public;
grant execute on function public.user_signup(text, text, text) to anon, authenticated;
grant execute on function public.user_login(text, text, text) to anon, authenticated;
grant execute on function public.user_me(text, text) to anon, authenticated;
grant execute on function public.user_logout(text, text) to anon, authenticated;
grant execute on function public.owner_site_users(text) to authenticated;
grant execute on function public.owner_delete_site_user(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Custom link name for a published site: /s/my-coffee-shop instead of /s/3f9a1c7b2e.
-- The owner can change it (the table policy "Users update own published sites" already allows that);
-- the format and uniqueness are enforced here. Safe to run again.
-- ---------------------------------------------------------------------------
alter table public.published_sites add column if not exists slug text;

alter table public.published_sites drop constraint if exists published_sites_slug_format;
alter table public.published_sites add constraint published_sites_slug_format
  check (slug is null or (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '^[0-9a-f]{10}$' and slug !~ '--'));

create unique index if not exists published_sites_slug_idx on public.published_sites (slug) where slug is not null;

-- Visitors open a site by its slug OR its id; the answer now also contains the real id.
create or replace function public.get_published_site(p_id text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object('id', s.id, 'name', s.name, 'files', s.files)
    from public.published_sites s
   where (s.id = p_id or s.slug = lower(p_id))
     and not exists (select 1 from public.blocked_projects b where b.project_id = s.project_id)
   limit 1;
$$;

revoke all on function public.get_published_site(text) from public;
grant execute on function public.get_published_site(text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Admin dashboard + usage tracking. Safe to run again.
-- Needs the rest of schema.sql (including the custom link name part) to be run before.
-- Run: Supabase -> SQL Editor -> New query -> paste -> Run.
--
-- What it adds:
--   admin_users     who is allowed to open /admin (you)
--   user_settings   per user: plan, own daily limit, banned, note
--   events          counts of what people do (build, publish, download ...). NO prompt text.
--   admin_* functions used by the /admin page. Each one checks is_admin() first.
-- No service-role key is needed anywhere: everything runs as your own login.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admin_users enable row level security;   -- no policies: SQL editor only

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  plan        text not null default 'free' check (plan in ('free', 'pro')),
  daily_limit int check (daily_limit is null or daily_limit >= 0),  -- null = use the plan default
  banned      boolean not null default false,
  note        text,
  updated_at  timestamptz not null default now()
);
alter table public.user_settings enable row level security; -- no policies

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  kind       text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_kind_created_idx on public.events (kind, created_at desc);
create index if not exists events_user_created_idx on public.events (user_id, created_at desc);
alter table public.events enable row level security;        -- no policies

create table if not exists public.admin_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid,
  action     text not null,
  target     text,
  detail     text,
  created_at timestamptz not null default now()
);
alter table public.admin_log enable row level security;     -- no policies

-- Is the signed-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Tracking. Called by the app for the signed-in user; only known kinds are kept,
-- the extra info is small, and one user can write at most 400 events per day.
-- ---------------------------------------------------------------------------
create or replace function public.track_event(p_kind text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if p_kind not in ('build', 'build_fail', 'publish', 'unpublish', 'download', 'limit_hit', 'login', 'feedback') then
    return;
  end if;
  if length(coalesce(p_meta, '{}'::jsonb)::text) > 800 then
    p_meta := '{}'::jsonb;
  end if;
  if (select count(*) from public.events where user_id = uid and created_at > now() - interval '1 day') >= 400 then
    return;
  end if;
  insert into public.events (user_id, kind, meta) values (uid, p_kind, coalesce(p_meta, '{}'::jsonb));
end;
$$;

revoke all on function public.track_event(text, jsonb) from public, anon;
grant execute on function public.track_event(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Usage limit now knows plan, own limit and ban.
-- Effective limit = the user's own limit, else 300 for 'pro', else the p_limit from the server (DAILY_LIMIT).
-- Change the 300 below to your real Pro limit.
-- ---------------------------------------------------------------------------
create or replace function public.consume_usage(p_limit int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  today    date := (now() at time zone 'utc')::date;
  used     int;
  v_banned boolean;
  v_plan   text;
  v_lim    int;
  eff      int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select banned, plan, daily_limit into v_banned, v_plan, v_lim
    from public.user_settings where user_id = uid;
  eff := coalesce(v_lim, case when v_plan = 'pro' then 300 else p_limit end);

  if coalesce(v_banned, false) then
    select count into used from public.usage where user_id = uid and day = today;
    return json_build_object('allowed', false, 'banned', true, 'used', coalesce(used, 0), 'limit', eff);
  end if;

  insert into public.usage (user_id, day, count) values (uid, today, 0)
  on conflict (user_id, day) do nothing;

  update public.usage
     set count = count + 1
   where user_id = uid and day = today and (eff <= 0 or count < eff)
  returning count into used;

  if used is null then
    select count into used from public.usage where user_id = uid and day = today;
    return json_build_object('allowed', false, 'used', used, 'limit', eff);
  end if;
  return json_build_object('allowed', true, 'used', used, 'limit', eff);
end;
$$;

create or replace function public.get_usage(p_limit int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  used     int;
  v_banned boolean;
  v_plan   text;
  v_lim    int;
  eff      int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select banned, plan, daily_limit into v_banned, v_plan, v_lim
    from public.user_settings where user_id = uid;
  eff := coalesce(v_lim, case when v_plan = 'pro' then 300 else p_limit end);
  select count into used from public.usage
   where user_id = uid and day = (now() at time zone 'utc')::date;
  return json_build_object('allowed', not coalesce(v_banned, false), 'banned', coalesce(v_banned, false),
                           'used', coalesce(used, 0), 'limit', eff);
end;
$$;

revoke all on function public.consume_usage(int) from public, anon;
revoke all on function public.get_usage(int) from public, anon;
grant execute on function public.consume_usage(int) to authenticated;
grant execute on function public.get_usage(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin functions (every one refuses anybody who is not in admin_users)
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return json_build_object(
    'users_total',     (select count(*) from auth.users),
    'users_today',     (select count(*) from auth.users where (created_at at time zone 'utc')::date = today),
    'users_7d',        (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'activated',       (select count(distinct user_id) from public.usage where count > 0),
    'active_today',    (select count(distinct user_id) from public.usage where day = today and count > 0),
    'active_7d',       (select count(distinct user_id) from public.usage where day > today - 7 and count > 0),
    'returning',       (select count(*) from (select user_id from public.usage where count > 0
                                              group by user_id having count(*) >= 2) x),
    'requests_today',  (select coalesce(sum(count), 0) from public.usage where day = today),
    'requests_7d',     (select coalesce(sum(count), 0) from public.usage where day > today - 7),
    'requests_total',  (select coalesce(sum(count), 0) from public.usage),
    'builds_7d',       (select count(*) from public.events where kind = 'build' and created_at > now() - interval '7 days'),
    'build_fails_7d',  (select count(*) from public.events where kind = 'build_fail' and created_at > now() - interval '7 days'),
    'limit_hits_7d',   (select count(*) from public.events where kind = 'limit_hit' and created_at > now() - interval '7 days'),
    'sites_total',     (select count(*) from public.published_sites),
    'reports_total',   (select count(*) from public.site_reports),
    'pro_users',       (select count(*) from public.user_settings where plan = 'pro'),
    'banned_users',    (select count(*) from public.user_settings where banned)
  );
end;
$$;

create or replace function public.admin_daily(p_days int default 14)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  n     int  := greatest(1, least(coalesce(p_days, 14), 90));
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return (
    select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from (
      select d::date as day,
        (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date = d::date) as new_users,
        (select count(*) from public.usage x where x.day = d::date and x.count > 0) as active_users,
        (select coalesce(sum(x.count), 0) from public.usage x where x.day = d::date) as requests,
        (select count(*) from public.events e where e.kind = 'build'
            and (e.created_at at time zone 'utc')::date = d::date) as builds,
        (select count(*) from public.events e where e.kind = 'publish'
            and (e.created_at at time zone 'utc')::date = d::date) as publishes
      from generate_series(today - (n - 1), today, interval '1 day') d
    ) t
  );
end;
$$;

create or replace function public.admin_types(p_days int default 30)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select coalesce(nullif(meta ->> 'type', ''), 'other') as type, count(*) as n
        from public.events
       where kind = 'build' and coalesce(meta ->> 'type', '') <> 'edit'
         and created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
       group by 1 order by 2 desc limit 20
    ) t
  );
end;
$$;

create or replace function public.admin_features(p_days int default 30)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return json_build_object(
    'builds',    (select count(*) from public.events where kind = 'build' and created_at > since),
    'forms',     (select count(*) from public.events where kind = 'build' and created_at > since and meta ->> 'forms' = 'true'),
    'data',      (select count(*) from public.events where kind = 'build' and created_at > since and meta ->> 'data' = 'true'),
    'login',     (select count(*) from public.events where kind = 'build' and created_at > since and meta ->> 'auth' = 'true'),
    'reference', (select count(*) from public.events where kind = 'build' and created_at > since and meta ->> 'ref' = 'true'),
    'autofix',   (select count(*) from public.events where kind = 'build' and created_at > since and meta ->> 'fix' = 'true'),
    'failed',    (select count(*) from public.events where kind = 'build_fail' and created_at > since),
    'publishes', (select count(*) from public.events where kind = 'publish' and created_at > since),
    'downloads', (select count(*) from public.events where kind = 'download' and created_at > since),
    'limit_hits',(select count(*) from public.events where kind = 'limit_hit' and created_at > since),
    'feedback',  (select count(*) from public.events where kind = 'feedback' and created_at > since)
  );
end;
$$;

create or replace function public.admin_users_list(p_search text default '', p_limit int default 50, p_offset int default 0)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  q     text := lower(coalesce(trim(p_search), ''));
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select u.id, u.email, u.created_at,
        (select max(x.day) from public.usage x where x.user_id = u.id and x.count > 0) as last_active,
        (select coalesce(sum(x.count), 0) from public.usage x where x.user_id = u.id) as requests_total,
        (select coalesce(sum(x.count), 0) from public.usage x where x.user_id = u.id and x.day = today) as requests_today,
        (select count(*) from public.projects p where p.user_id = u.id) as projects,
        (select count(*) from public.published_sites s where s.user_id = u.id) as sites,
        coalesce(st.plan, 'free') as plan,
        st.daily_limit,
        coalesce(st.banned, false) as banned,
        st.note,
        exists (select 1 from public.admin_users a where a.user_id = u.id) as is_admin
      from auth.users u
      left join public.user_settings st on st.user_id = u.id
      where q = '' or position(q in lower(coalesce(u.email, ''))) > 0
      order by u.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(coalesce(p_offset, 0), 0)
    ) t
  );
end;
$$;

create or replace function public.admin_set_user(p_user uuid, p_plan text, p_limit int, p_banned boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_plan not in ('free', 'pro') then raise exception 'plan must be free or pro'; end if;
  if p_limit is not null and p_limit < 0 then raise exception 'limit cannot be negative'; end if;
  if p_banned and exists (select 1 from public.admin_users where user_id = p_user) then
    raise exception 'an admin cannot be banned';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user not found'; end if;

  insert into public.user_settings (user_id, plan, daily_limit, banned, note, updated_at)
  values (p_user, p_plan, p_limit, coalesce(p_banned, false), left(p_note, 500), now())
  on conflict (user_id) do update
    set plan = excluded.plan, daily_limit = excluded.daily_limit, banned = excluded.banned,
        note = excluded.note, updated_at = now();

  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'set_user', p_user::text,
          'plan=' || p_plan || ' limit=' || coalesce(p_limit::text, 'default') || ' banned=' || coalesce(p_banned, false)::text);
end;
$$;

create or replace function public.admin_sites(p_limit int default 100)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select s.id, s.slug, s.name, s.project_id, u.email, s.published_at,
        (select count(*) from public.site_reports r where r.site_id = s.id) as reports,
        exists (select 1 from public.blocked_projects b where b.project_id = s.project_id) as blocked
      from public.published_sites s
      left join auth.users u on u.id = s.user_id
      order by reports desc, s.published_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 300))
    ) t
  );
end;
$$;

create or replace function public.admin_reports(p_limit int default 50)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select r.id, r.site_id, r.reason, r.created_at
      from public.site_reports r
      order by r.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) t
  );
end;
$$;

-- Takes a site offline. p_block = true also stops that project from ever being published again.
create or replace function public.admin_unpublish(p_site text, p_block boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select project_id into pid from public.published_sites where id = p_site;
  if pid is null then raise exception 'site not found'; end if;
  if p_block then
    insert into public.blocked_projects (project_id, reason) values (pid, 'blocked by admin')
    on conflict (project_id) do nothing;
  end if;
  delete from public.published_sites where id = p_site;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), case when p_block then 'unpublish_block' else 'unpublish' end, p_site, null);
end;
$$;

create or replace function public.admin_clear_reports(p_site text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.site_reports where site_id = p_site;
  insert into public.admin_log (admin_id, action, target, detail) values (auth.uid(), 'clear_reports', p_site, null);
end;
$$;

create or replace function public.admin_log_list(p_limit int default 50)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select l.id, l.action, l.target, l.detail, l.created_at, u.email as admin_email
      from public.admin_log l left join auth.users u on u.id = l.admin_id
      order by l.id desc
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) t
  );
end;
$$;

-- Deletes a user for good: their projects, published sites (with forms, accounts, saved data),
-- usage and settings all go with them (every table cascades from auth.users).
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() then raise exception 'you cannot delete your own account here'; end if;
  if exists (select 1 from public.admin_users where user_id = p_user) then
    raise exception 'an admin cannot be deleted';
  end if;
  select email into v_email from auth.users where id = p_user;
  if not found then raise exception 'user not found'; end if;
  delete from auth.users where id = p_user;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'delete_user', p_user::text, v_email);
end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_daily(int) from public, anon;
revoke all on function public.admin_types(int) from public, anon;
revoke all on function public.admin_features(int) from public, anon;
revoke all on function public.admin_users_list(text, int, int) from public, anon;
revoke all on function public.admin_set_user(uuid, text, int, boolean, text) from public, anon;
revoke all on function public.admin_sites(int) from public, anon;
revoke all on function public.admin_reports(int) from public, anon;
revoke all on function public.admin_unpublish(text, boolean) from public, anon;
revoke all on function public.admin_clear_reports(text) from public, anon;
revoke all on function public.admin_log_list(int) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_daily(int) to authenticated;
grant execute on function public.admin_types(int) to authenticated;
grant execute on function public.admin_features(int) to authenticated;
grant execute on function public.admin_users_list(text, int, int) to authenticated;
grant execute on function public.admin_set_user(uuid, text, int, boolean, text) to authenticated;
grant execute on function public.admin_sites(int) to authenticated;
grant execute on function public.admin_reports(int) to authenticated;
grant execute on function public.admin_unpublish(text, boolean) to authenticated;
grant execute on function public.admin_clear_reports(text) to authenticated;
grant execute on function public.admin_log_list(int) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- LAST STEP (run separately, after putting YOUR login email inside the quotes):
--
--   insert into public.admin_users (user_id)
--   select id from auth.users where lower(email) = lower('PUT-YOUR-EMAIL-HERE')
--   on conflict do nothing;
--
-- Check:  select u.email from public.admin_users a join auth.users u on u.id = a.user_id;
-- ---------------------------------------------------------------------------
