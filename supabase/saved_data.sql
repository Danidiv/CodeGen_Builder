-- Saved data for published sites (backend step 2). Paste this WHOLE file into the Supabase SQL Editor and press Run.
-- It only needs the tables of the main schema.sql (projects, published_sites, blocked_projects) that you already have.
-- Safe to run again. At the end it prints a check line; afterwards run:  notify pgrst, 'reload schema';

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


notify pgrst, 'reload schema';

-- Check: this must show "table: site_records" and "function: data_add" (not empty).
select to_regclass('public.site_records')::text as "table", to_regprocedure('public.data_add(text,text,text,jsonb)')::text as "function";
