-- The Dandori schema. Run it whole in the SQL Editor of the Supabase project.
-- The script is idempotent: running it again breaks nothing.

-- All tables are built the same way:
--   user_id     — the owner, checked by the RLS policies;
--   updated_at  — the time of the edit, set by the device: it decides conflicts,
--                 and an update carrying one older than the row's own is refused
--                 here, so last-write-wins does not come down to who arrives last;
--   synced_at   — the time the server saw the row, set here by a trigger: the pull
--                 cursor runs on it, because an edit made offline keeps an
--                 `updated_at` older than the cursor of a device that has been
--                 online all along and would never be asked for again;
--   deleted     — soft delete, otherwise a deletion made on an offline device
--                 never arrives anywhere.

create table if not exists public.workspaces (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',
  position    double precision not null default 0,
  -- Put every dated task of this workspace into Google Calendar, with one set of
  -- defaults: { "time": "10:00", "end": "11:00" | null, "calendar_id": ...,
  --             "color_id": ..., "reminders": [...] }
  gcal_sync   boolean not null default false,
  gcal        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists public.labels (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null default '',
  color         text not null default 'slate',
  position      double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false
);

create table if not exists public.tasks (
  id                  uuid primary key,
  user_id             uuid not null references auth.users (id) on delete cascade,
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  title               text not null default '',
  description         text not null default '',
  -- The date type, not timestamp: a task stands on a day, and the hours it may
  -- run are a frame beside that day rather than a part of it.
  start_date          date,
  due_date            date,
  -- The hours the task runs, HH:MM. An end is never written without a start:
  -- it is a length, and with no start there is nothing to measure it from.
  -- text rather than time, because a time column hands back 09:00:00 what was
  -- written as 09:00, and every pull would then read as an edit of a row
  -- nobody had touched.
  start_time          text,
  end_time            text,
  done                boolean not null default false,
  remind_days_before  integer,
  -- Keeps the task out of the reminder banner even when it is due today or
  -- already overdue. Separate from remind_days_before, which only controls
  -- the advance warning.
  muted               boolean not null default false,
  -- An attached note. Dropping the note only clears the link.
  note_id             uuid,
  position            double precision not null default 0,
  -- Labels live right inside the task: there is one user, a join table is redundant here.
  label_ids           jsonb not null default '[]'::jsonb,
  -- Custom fields of the card: [{ "name": "...", "value": "..." }]
  custom_fields       jsonb not null default '[]'::jsonb,
  -- The Google Calendar event mirroring this task, and how it is made:
  -- { "time": "10:00", "end": "11:00", "calendar_id": "primary",
  --   "color_id": null, "reminders": [{ "method": "popup", "minutes": 30 }] }
  -- `time` and `end` are the hours a task with no frame of its own is given:
  -- where the task has one, the event is made on that instead.
  gcal                jsonb,
  -- The calendar an event was actually put in; null when there is none. The one
  -- durable record that the event exists — a device that did not create it has
  -- no other way to know there is something to take away.
  gcal_placed         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted             boolean not null default false
);

create table if not exists public.notes (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  parent_id     uuid references public.notes (id) on delete cascade,
  kind          text not null check (kind in ('folder', 'file')),
  name          text not null default '',
  content       text not null default '',
  position      double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false
);

-- tasks is declared before notes, so this foreign key is attached afterwards.
-- Dropping a note only clears the link, it never takes the task with it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_note_id_fkey') then
    alter table public.tasks
      add constraint tasks_note_id_fkey
      foreign key (note_id) references public.notes (id) on delete set null;
  end if;
end $$;

-- `synced_at` is the server's own stamp: every write sets it, so the pull cursor
-- can order rows by the moment the server saw them.
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
    execute format(
      'create index if not exists %I on public.%I (user_id, synced_at)', t || '_synced_at_idx', t);
  end loop;
end $$;

-- The rest is the ordinary lookup by workspace.
create index if not exists tasks_workspace_idx on public.tasks (workspace_id, due_date);
create index if not exists notes_workspace_idx on public.notes (workspace_id, parent_id);

-- Last write wins, and the server is the judge of it. A device pushes its queue
-- whenever it can, so without this the winner was whoever arrived last: an edit
-- made offline at 10:05 overwrote the one made at 10:09 on the other device.
-- Equal stamps are accepted on purpose — a device rewrites a row of its own
-- without touching `updated_at` when all it records is where the calendar event
-- ended up.
create or replace function public.keep_newer() returns trigger
language plpgsql
as $$
begin
  -- Returning null abandons the row: nothing is written and `synced_at` is not
  -- moved either, so the row is not handed out again for nothing.
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

-- A deleted workspace takes its rows with it, including the ones another device
-- was adding at the same moment: they would otherwise stay live on the server
-- under a workspace that is gone — out of reach in the app, present in the export.
create or replace function public.follow_workspace_delete() returns trigger
language plpgsql
as $$
begin
  if new.deleted and not old.deleted then
    -- `now()`, not the workspace's own stamp: the delete is the latest thing
    -- known about these rows and has to outrank the edit each carries, or the
    -- device that made that edit would push it back as the newer one.
    update public.labels set deleted = true, updated_at = greatest(updated_at, now())
      where workspace_id = new.id and not deleted;
    update public.tasks set deleted = true, updated_at = greatest(updated_at, now())
      where workspace_id = new.id and not deleted;
    update public.notes set deleted = true, updated_at = greatest(updated_at, now())
      where workspace_id = new.id and not deleted;
  end if;
  return null;
end;
$$;

create or replace function public.stay_deleted_with_workspace() returns trigger
language plpgsql
as $$
begin
  -- The trigger above catches what is already on the server; this one catches
  -- what is still on the way.
  if not new.deleted and exists (
    select 1 from public.workspaces w where w.id = new.workspace_id and w.deleted
  ) then
    new.deleted = true;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  -- The names decide the order: triggers fire alphabetically, so an older write
  -- is thrown out before anything else looks at it, and `synced_at` is stamped
  -- last of all.
  foreach t in array array['workspaces', 'labels', 'tasks', 'notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_keep_newer', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.keep_newer()',
      t || '_keep_newer', t);
  end loop;

  foreach t in array array['labels', 'tasks', 'notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_stay_deleted', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.stay_deleted_with_workspace()',
      t || '_stay_deleted', t);
  end loop;
end $$;

drop trigger if exists workspaces_cascade_delete on public.workspaces;
create trigger workspaces_cascade_delete after update on public.workspaces
  for each row execute function public.follow_workspace_delete();

-- Access to your own rows only. The app talks with the anon key,
-- so all data protection rests on these policies.
--
-- A label, a task or a note also has to land in a workspace you own: the
-- policies used to check `user_id` alone and the foreign keys never look at who
-- owns what they point at, so anyone who learned a workspace id could put his
-- own rows inside it. Reading stays `user_id` alone — rows of yours are yours
-- whatever they point at, and a workspace that has not arrived yet must not
-- hide them.
do $$
declare
  t text;
begin
  foreach t in array array['workspaces', 'labels', 'tasks', 'notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
  end loop;

  execute
    'create policy own_rows on public.workspaces
       for all
       using (auth.uid() = user_id)
       with check (auth.uid() = user_id)';

  foreach t in array array['labels', 'tasks', 'notes'] loop
    execute format(
      'create policy own_rows on public.%I
         for all
         using (auth.uid() = user_id)
         with check (
           auth.uid() = user_id
           and exists (
             select 1 from public.workspaces w
              where w.id = workspace_id and w.user_id = auth.uid()))', t);
  end loop;
end $$;
