-- Run once in the Supabase SQL Editor, on top of an existing schema.sql database.
-- Safe to run twice: every statement is guarded or replaced.
--
-- Why this exists.
--
-- Pulling used to ask for rows with `updated_at` newer than the last pull, and
-- `updated_at` is written by the device that made the edit. An edit made offline
-- keeps the time it was made, not the time it reached the server: edit on the
-- phone at 10:00, come back online at 11:00, and the laptop — whose cursor moved
-- to 10:05 long ago — never asks for anything that old again. The edit is on the
-- server and invisible to the other device for good.
--
-- `synced_at` is set by the server every time a row is written, so it orders rows
-- by when the server saw them, which is exactly what a pull cursor needs.
-- `updated_at` stays what it was and still decides conflicts: last write wins by
-- the time of the edit, not by the time it happened to arrive.

create or replace function public.touch_synced_at() returns trigger
language plpgsql
as $$
begin
  new.synced_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['workspaces', 'labels', 'tasks', 'notes'] loop
    execute format(
      'alter table public.%I add column if not exists synced_at timestamptz not null default now()', t);

    execute format('drop trigger if exists %I on public.%I', t || '_synced_at', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.touch_synced_at()',
      t || '_synced_at', t);

    -- The pull asks for one user's rows newer than a cursor.
    execute format(
      'create index if not exists %I on public.%I (user_id, synced_at)', t || '_synced_at_idx', t);
  end loop;
end;
$$;
