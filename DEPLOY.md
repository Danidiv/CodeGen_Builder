# Deploy to Vercel (step by step)

## 0. Before you start
- Run `npm run build` once on your computer. If it fails, fix that first (send me the error).
- `.env.local` is in `.gitignore`, so your keys are NOT uploaded to GitHub. Check with `git status`: `.env.local` must not be listed.

## 1. Put the project on GitHub
1. github.com -> New repository -> name `codegen-app` -> **Private** -> Create (no README).
2. In the project folder:
   ```
   git init
   git add .
   git commit -m "first version"
   git branch -M main
   git remote add origin https://github.com/YOUR_NAME/codegen-app.git
   git push -u origin main
   ```

## 2. Import in Vercel
1. vercel.com -> sign in with GitHub -> Add New -> Project -> pick `codegen-app` -> Import.
2. Framework: Next.js (detected automatically). Do not press Deploy yet.

## 3. Environment variables (Settings -> Environment Variables, before the first deploy)
| Name | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | your Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | the publishable / anon key (never the secret key) |
| LLM_PROVIDER | `openrouter` (or `anthropic`). NOT `lmstudio`: Vercel cannot reach your computer |
| OPENROUTER_API_KEY | your NEW key |
| OPENROUTER_MODEL | e.g. `anthropic/claude-sonnet-4.5` |
| OPENROUTER_MAX_TOKENS | `8000` |
| DAILY_LIMIT | `30` |
| OPENROUTER_SITE_URL | your Vercel URL, once you know it (optional) |

Then press **Deploy**. After 1-2 minutes you get a URL like `https://codegen-app-xxxx.vercel.app`.

## 4. Tell Supabase about the new URL (otherwise login/email links fail)
Supabase -> Authentication -> URL Configuration:
- **Site URL**: your Vercel URL
- **Redirect URLs**: add `https://YOUR-URL.vercel.app/**` (and keep `http://localhost:3000/**` for local work)

## 5. Test online
1. Open the URL, sign up / sign in.
2. Create a project, send a message, check the "Today: x/30" counter.
3. Reload the page: the project must still be there.

## Problems
- **Answer cut off / 504 after some seconds**: the host stopped the request (time limit of your Vercel plan). Use a faster model or ask for smaller pieces.
- **"Please sign in first" right after login**: the Supabase URL/key variables are missing or wrong in Vercel. Fix them and press Redeploy.
- **Changed a variable?** Variables only apply to the NEXT deploy: Deployments -> ... -> Redeploy.
- **Update the app later**: replace the files, then `git add . && git commit -m "update" && git push`. Vercel deploys by itself.
