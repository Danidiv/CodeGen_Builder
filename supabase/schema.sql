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
