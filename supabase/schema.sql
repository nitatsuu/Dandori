-- The Dandori schema. Run it whole in the SQL Editor of the Supabase project.
-- The script is idempotent: running it again breaks nothing.

-- All tables are built the same way:
--   user_id     — the owner, checked by the RLS policies;
--   updated_at  — for conflict resolution during sync;
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

-- Sync pulls rows by `updated_at`, the rest is the ordinary lookup by workspace.
create index if not exists labels_updated_idx on public.labels (user_id, updated_at);
create index if not exists tasks_updated_idx  on public.tasks  (user_id, updated_at);
create index if not exists notes_updated_idx  on public.notes  (user_id, updated_at);
create index if not exists workspaces_updated_idx on public.workspaces (user_id, updated_at);
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
