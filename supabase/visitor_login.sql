-- Visitor accounts for published sites (backend step 3). Paste this WHOLE file into the Supabase SQL Editor and press Run.
-- Needs saved_data.sql (or the main schema.sql) to have been run before. Safe to run again.

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

notify pgrst, 'reload schema';

-- Check: this must show "table: site_users" and "function: user_login" (not empty).
select to_regclass('public.site_users')::text as "table", to_regprocedure('public.user_login(text,text,text)')::text as "function";
