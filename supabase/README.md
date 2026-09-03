# Supabase setup

1. Create a project on [supabase.com](https://supabase.com), pick a nearby region.
2. SQL Editor → paste `schema.sql` → Run.
3. Authentication → Providers → Email: leave it enabled,
   turn **Confirm email** off (there is one account, nobody to confirm it for).
4. Authentication → Users → Add user: create your own account by hand.
   There is no open sign-up in the app.
5. Project Settings → API: copy the `URL` and the `anon public` key
   into `.env.local`, following `.env.example`.

The `service_role` key is not needed by the app and never gets into the repository
under any circumstances: it bypasses RLS.
