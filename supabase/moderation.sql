-- Moderation helpers. Run these by hand in the Supabase SQL Editor (never from the app).

-- 1) Which sites were reported most? (newest reports first, with how many reports each site has)
select r.site_id, count(*) as reports, max(r.created_at) as last_report,
       string_agg(distinct r.reason, ' | ') as reasons
  from public.site_reports r
 group by r.site_id
 order by last_report desc;

-- 2) Look at a reported site (replace SITE_ID). Check "files" for what it really contains.
-- select id, project_id, user_id, name, published_at, files from public.published_sites where id = 'SITE_ID';

-- 3) Take it down: block the PROJECT (the site disappears, and it cannot be published again).
-- insert into public.blocked_projects (project_id, reason)
--   select project_id, 'phishing' from public.published_sites where id = 'SITE_ID';

-- 4) Undo a block (replace PROJECT_ID).
-- delete from public.blocked_projects where project_id = 'PROJECT_ID';

-- 5) Remove all reports of a site after you looked at it.
-- delete from public.site_reports where site_id = 'SITE_ID';
