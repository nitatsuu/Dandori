# Dandori

A personal planner for a single user: a board of days, a timeline and notes.
One address on the laptop and on the phone, works offline, installs to the home screen.

## Requirements

- Node 22+
- A Supabase account (the free plan is enough)
- A Cloudflare account — only for the deploy

## Supabase

Project setup, the schema and the RLS policies are described in [`supabase/README.md`](supabase/README.md).
Go through the steps there before running the app.

## Running locally

```sh
cp .env.example .env.local   # fill in the URL and the anon key from the Supabase dashboard
npm install
npm run dev
```

`.env.local` never gets into the repository: it is covered by `.gitignore`.
Without the environment variables the app does not start and says so explicitly.

## Build

```sh
npm run build     # type check + build into dist/
npm run preview   # local preview of the build, with a working service worker
```

The PWA icons sit in `public/` as ready files. They only need to be regenerated
from `public/favicon.svg` if the drawing itself changed:

```sh
npm run icons
```

## Deploy to Cloudflare Workers

1. Push the repository to GitHub.
2. Cloudflare Dashboard → Workers & Pages → connect the project to the GitHub repository.
3. Build settings:
   - Root directory: `/`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
4. In the same place, under **Environment variables (Build)**, add for Production
   and Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   The values come from Supabase → Project Settings → API. They are not in the
   repository and must not be: Vite inlines them into the bundle at build time,
   so these are build variables, not runtime ones.
5. Save and deploy. After that every push to the main branch deploys itself.

Serving the static files is described in `wrangler.jsonc`: the `assets` block gives out
the built `./dist`, and `not_found_handling: single-page-application` returns
`index.html` for any unknown path. There is no `public/_redirects` file any more —
`not_found_handling` does its job, and nothing has to be set up separately in the dashboard.

After changing the environment variables the deploy has to be repeated:
the old bundle was built with the old values.

## Installing on the phone

1. Open the app address in Chrome on Android (over HTTPS — Cloudflare gives it
   out of the box).
2. Browser menu → «Установить приложение» (Install app) or «Добавить на главный экран»
   (Add to Home screen).
3. Launch it from the home screen: there must be no address bar,
   the icon and the splash screen are dark, the app opens full screen.

If there is no «Установить приложение» item, the service worker did not register:
check that the address is https and reload the page.
