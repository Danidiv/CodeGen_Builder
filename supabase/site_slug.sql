-- Custom link names for published sites (/s/my-site). Paste this WHOLE file into the Supabase SQL Editor and press Run.
-- Needs the main schema (published_sites). Safe to run again.

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

notify pgrst, 'reload schema';

-- Check: must show "slug" as a column.
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'published_sites' and column_name = 'slug';
