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
