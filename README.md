# NEXA AI (Month 1 starter)

A minimal "Lovable-style" app builder: describe an app in chat, Claude writes the React code, and you see a live preview.

## Run it

```bash
npm install
cp .env.example .env.local   # then put your ANTHROPIC_API_KEY inside
npm run dev
```

Open http://localhost:3000 and type something like "a todo app with a dark theme".

## Supabase setup (login + projects saved in the cloud)

Optional. Without it the app runs in "local mode" (no login, project kept in this browser only).

1. In your Supabase project open **SQL Editor -> New query**, paste the whole file `supabase/schema.sql` and press **Run**. This creates the `projects` table and the security rules (each user sees only their own projects).
2. Open **Project Settings -> API** and copy the project URL and the public **anon** (or **publishable**) key.
3. Put them in `.env.local` (see `.env.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```
   Never use the `service_role` / secret key here.
4. For quick testing you can switch off **Confirm email** in the Supabase Authentication settings (Email provider). Otherwise new users must click the link in the confirmation email before they can sign in.
5. Restart `npm run dev`.

What you get: sign up / sign in, a project switcher (+ New, Delete), automatic saving to the database, and the AI endpoint only answers signed-in users, so strangers cannot spend your AI budget. A project that was saved in this browser before is imported automatically on your first login.

## How it works

1. `components/Chat.tsx` collects the prompt.
2. `app/page.tsx` sends the chat history and the current project files to `/api/generate`.
3. `app/api/generate/route.ts` calls Claude and streams the answer back.
4. Claude answers with `<file path="/App.tsx">...</file>` blocks (see `lib/prompts.ts`).
5. `lib/parseFiles.ts` parses the stream chunk by chunk and updates the files.
6. `components/Preview.tsx` runs the files live with Sandpack (Preview and Code tabs). The Code tab uses the Monaco editor (`components/CodeEditor.tsx`, loaded from the jsDelivr CDN on first use; if it cannot load, the old Sandpack editor is shown). Run `npm install` once after updating, because `@monaco-editor/react` is a new package.

Follow-up messages ("make the button bigger") work because the current files are sent with each request and Claude only returns the files it changes.

## Project structure

```
app/
  api/generate/route.ts   Claude streaming endpoint
  layout.tsx, page.tsx    main screen (chat + preview)
  globals.css
components/
  Chat.tsx                chat box
  Preview.tsx             Sandpack preview + code view
lib/
  prompts.ts              SYSTEM_PROMPT and starter files
  parseFiles.ts           streaming <file> parser
  edits.ts                <edit> find/replace patches
  interpret.ts            checks a model answer (files, edits, problems)
  validate.ts             import and content checks
```

## Features

- **Undo / Redo / History:** a snapshot is saved after every AI change (last 20). Click History to jump to any version.
- **Download ZIP:** exports the project as a runnable Vite app (`npm install && npm run dev`).
- **Auto-fix:** when the preview shows an error after the AI finished, the error is sent back to the model automatically (max 2 tries in a row). Turn it off with the Auto-fix checkbox. The red "Fix with AI" button always works manually.
- **Answer checking and auto-retry:** the app checks every model answer (tool-calls instead of code, cut-off files, files that lost most of their content, `<think>` text). If the answer looks broken it is not applied; the model is asked once more and told what was wrong. If it fails again, nothing is changed and the chat says so.
- **Stop and Try again:** while the AI is working the Send button turns into a red **Stop** button (or press Esc). Stopping cancels the AI request too and changes nothing in your project. After a stop, an error or an answer that changed nothing, a **Try again** button appears under the message and sends the same request again.
- **Small edits as patches:** for changes like a title, a paragraph or a colour the model may answer with `<edit>` blocks (`<find>` the old text, `<replace>` with the new text) instead of rewriting the whole file. The app checks that the old text really exists (it forgives wrong indentation) and applies the patch; if it does not match, the answer is rejected and the model is asked again for full files. Answers that return the same code unchanged are rejected too.
- **Dark mode:** Tailwind in the preview uses class-based dark mode (`darkMode: "class"`, set in `/index.tsx`), so a toggle that adds the `dark` class and uses `dark:` classes works.
- **Preview repaint:** after a build finishes the preview is briefly hidden and shown again automatically (the same thing that switching to the Code tab and back did by hand). There is also a **Reload preview** button.
- **Slow or cut-off answers (local models):** the chat shows how long the answer has been running and, for models that "think" first, how much thinking has happened. If the model runs out of space (its context length is too small) the app notices, and asks again for a much shorter version (or, on an existing project, for small `<edit>` patches). If that fails too, nothing is changed and the chat tells you to raise **Context Length** in LM Studio (16384 or more). Setting `LMSTUDIO_NO_THINK=true` in `.env.local` adds `/no_think` to each request, which makes Qwen3-style models answer much faster.
- **Auto-save:** project, chat and history are kept in this browser (localStorage).
- **Providers:** OpenRouter (many models, one key), Claude API directly, or a local LM Studio model. Switch with `LLM_PROVIDER` in `.env.local` (see `.env.example`) and restart `npm run dev`.

## Next steps

- Deploy to Vercel
- Backend for generated apps: forms (`submitForm`), saved data (`db("tasks")`) and visitor accounts (`auth`) are done
- Done already: usage limits (`DAILY_LIMIT`, run `supabase/schema.sql` again once), templates, Code tab edits are saved

## Notes

- Model is set with `ANTHROPIC_MODEL` in `.env.local`. Change it to any Claude model you have access to.
- Never expose your API key in the browser. It is only used in the server route.

## Preview start-up

The preview runs on CodeSandbox's bundler, so your browser must reach `*.codesandbox.io`.
It updates after the AI finishes answering. If it takes longer than 15 s, a panel shows the
connection check result; VPN / ad-blockers / Brave Shields are the usual cause. Use "Reload preview" to retry.

## Templates

`lib/templates.ts` holds 6 ready-made sites (e-commerce, business, blog, portfolio, e-learning, SaaS).
They show up in the chat of an empty project. A message that asks for 3+ different site types at once
is not sent to the AI; the chat offers the templates instead. Add a template = add one more entry to `TEMPLATES`.

## Design quality and styles

- `lib/prompts.ts` has a DESIGN QUALITY block (one accent colour, 5+ sections, spacing, responsive, realistic text).
- `lib/styles.ts`: the style chips above the chat box (Minimal, Dark neon, Warm, Bold, Corporate). The chosen style
  is sent with each request and added to the prompt as `DESIGN STYLE:`. Add a style = add one entry to `STYLES`.

## Attachments (text files and reference images)

The 📎 button in the chat (or pasting an image with Ctrl+V) attaches up to 3 text files (.txt, .md, .json, .csv...)
and up to 3 images. Images are shrunk to 1024 px JPEG in the browser. Text files are added to the prompt as content;
images are sent to the model as a visual reference. The model must support images (e.g. `anthropic/claude-sonnet-4.5`
on OpenRouter, or a vision model in LM Studio); otherwise the chat says so. Limits are checked again on the server
(`lib/attachments.ts`). Images are not stored in the project, only their names appear in the chat.

## Publish site (public link)

Cloud mode only. In the left panel, "Publish site" saves the files of the current project into `published_sites`
and gives a public link `/s/<id>` (works without login). "Update" publishes the current version to the same link;
"Unpublish" removes it. Visitors can only fetch ONE site by id (function `get_published_site`), there is no list of all sites.
The site runs in the Sandpack iframe (CodeSandbox origin), not on your own domain. Run `supabase/schema.sql` again once.

## Safety and moderation

- Visitors can press **Report** on any public site (stored in `site_reports`).
- Sites with a password field or a card security code (CVV) field cannot be published (`lib/publishRules.ts`); phishing pages usually look like that.
- You decide what to take down: run the queries in `supabase/moderation.sql` by hand in the Supabase SQL Editor
  (list reports, look at the site's code, block the project, undo a block). A blocked project disappears from its link and cannot be published again.
- Run `supabase/schema.sql` again once to create the new tables and functions.

## Chat vs build

`lib/intent.ts` decides what a message is: greetings and thanks ("hi", "thanks") get a free canned answer, questions
("how do I publish?") get a short chat answer from the AI (`mode: "chat"`, no code, project untouched), and everything with
build words or app words ("build", "add", "banao", "landing page", "dark mode") builds as before. Messages with files and
fix requests always build. Add words to the lists in `lib/intent.ts` if a message is classified wrongly.

## Matching photos

The AI cannot know photo URLs, so it writes placeholders such as `src="image:espresso coffee cup cafe"` (optional `|portrait` or `|square`).
After every answer (and when a template is loaded) the app asks `/api/images` for photos for those keywords (Pexels, `PEXELS_API_KEY`)
and replaces each placeholder with a real URL, so the saved code, the published site and the ZIP contain normal image links.
If there is no key or no result, neutral placeholder photos are used, so nothing breaks.
Pexels asks for a visible link to Pexels: `/index.tsx` adds a small "Photos from Pexels" badge automatically while Pexels photos are on the page.
Pexels allows 200 requests per hour; answers are cached on the server for 6 hours.
Unsplash (`UNSPLASH_ACCESS_KEY`) works as a second source: photos are used directly, the photographer and Unsplash are credited in the
same badge, and each used photo is reported to Unsplash's download endpoint (their rule). Demo mode = 50 requests per hour.
Pixabay is not supported on purpose: its rules forbid permanent hotlinking of its image URLs (images must be downloaded and hosted by you).

## Saved data for generated apps (backend step 2)

Generated apps can keep data with `import { db } from "./nexa"` (`list`, `add`, `update`, `remove`).
On a published site the data is stored in the `site_records` table through four database functions
(`data_list`, `data_add`, `data_update`, `data_remove`); every visitor's browser has a secret random key and only
sees its own items. Limits: 5000 characters and 30 fields per item, 200 items per visitor and list, 5000 items per site,
60 writes per minute per site. In the preview inside NEXA AI the data stays in the browser (test mode). The owner
sees and can delete everything under Inbox > Saved data. Run `supabase/schema.sql` again once, then `notify pgrst, 'reload schema';`.
Unpublishing a site deletes its form messages and saved data.

## Visitor accounts (backend step 3)

Generated apps can have real sign up / login with `import { auth } from "./nexa"` (`me`, `signUp`, `signIn`, `signOut`).
Accounts live in `site_users` (bcrypt hashes), separate from your NEXA AI accounts, and are only reachable through database
functions (`user_signup`, `user_login`, `user_me`, `user_logout`); 5 wrong passwords lock an email for 15 minutes.
A logged-in user's `db()` items are tied to the account (a private data key), so they follow the user to other devices.
Not there yet: email verification and password reset (no email system). Owner: Inbox > Users lists and deletes accounts.
Run `supabase/visitor_login.sql` once (after `saved_data.sql`), then `notify pgrst, 'reload schema';`.
In the preview inside NEXA AI, accounts are test accounts kept in the NEXA AI page (plain text, never use real passwords there).

## Custom link name

After publishing, the Publish menu has a "Link name" field: `/s/my-coffee-shop` instead of `/s/3f9a1c7b2e`
(3-40 letters, numbers, single hyphens; unique across all sites). Needs `supabase/site_slug.sql` once. The old id link keeps working.


## Admin dashboard (`/admin`)

Only people listed in `admin_users` can open it. Everything runs through database functions that check `is_admin()`, so no service-role key is needed.

1. Run `supabase/admin.sql` in the Supabase SQL Editor (it is also the end of `schema.sql`).
2. Make yourself admin (put your login email inside the quotes, run once):

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('PUT-YOUR-EMAIL-HERE')
on conflict do nothing;
```

3. Sign out and in again. The avatar menu now has **Admin dashboard**.

What it shows: users, who came back, requests, builds, kinds of sites and used features, live sites and reports. You can set a user's plan or own daily limit, ban a user, take a site offline (optionally block the project), and read the admin log.

Tracking saves only what happened (build, publish, download, login, limit reached) and yes/no flags (forms, saved data, login, reference URL). It never saves the text people write. Pro plan default limit is 300 per day: change the `300` inside `consume_usage` and `get_usage` in `admin.sql`.

### Feedback and "would you pay?"

- Avatar menu, **Send feedback**: a small form (Idea / Problem / Other). Messages appear in `/admin`, tab **Feedback**, where you can mark them done.
- When a user uses up the daily requests, the top of the chat asks once a day what they would pay ($5, $10, $20 per month, or no). The answers are counted in `/admin`, tab **Feedback**. Both need `supabase/admin.sql` to be run again (safe).


## Forgot password

The login form has **Forgot password?**. It uses Supabase's own email, so no other service is needed. Once in Supabase:
Authentication -> URL Configuration: set **Site URL** to your live address (for example `https://your-app.vercel.app`) and add the same address (and `http://localhost:3000` for testing) under **Redirect URLs**. Without this the email link does not come back to your app.
The free Supabase email service sends only a few emails per hour. If many people need emails, set up your own SMTP later (Authentication -> SMTP Settings).
