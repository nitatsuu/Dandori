-- The Dandori schema. Run it whole in the SQL Editor of the Supabase project.
-- The script is idempotent: running it again breaks nothing.

-- All tables are built the same way:
--   user_id     — the owner, checked by the RLS policies;
--   updated_at  — the time of the edit, set by the device: it decides conflicts;
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
  -- The date type, not timestamp: the app has no time of day and never will.
  start_date          date,
  due_date            date,
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

-- Access to your own rows only. The app talks with the anon key,
-- so all data protection rests on these policies.
do $$
declare
  t text;
begin
  foreach t in array array['workspaces', 'labels', 'tasks', 'notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I
         for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);
  end loop;
end $$;
