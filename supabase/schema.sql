-- Схема Dandori. Выполнить целиком в SQL Editor проекта Supabase.
-- Скрипт идемпотентный: повторный запуск ничего не ломает.

-- Все таблицы устроены одинаково:
--   user_id     — владелец, проверяется политиками RLS;
--   updated_at  — для разрешения конфликтов при синхронизации;
--   deleted     — мягкое удаление, иначе удаление на офлайн-устройстве не доедет.

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
  -- Тип date, а не timestamp: времени суток в приложении нет и не будет.
  start_date          date,
  due_date            date,
  done                boolean not null default false,
  remind_days_before  integer,
  position            double precision not null default 0,
  -- Метки лежат прямо в задаче: пользователь один, join-таблица тут лишняя.
  label_ids           jsonb not null default '[]'::jsonb,
  -- Произвольные поля карточки: [{ "name": "...", "value": "..." }]
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

-- Синхронизация тянет строки по `updated_at`, остальное — обычная выборка по воркспейсу.
create index if not exists labels_updated_idx on public.labels (user_id, updated_at);
create index if not exists tasks_updated_idx  on public.tasks  (user_id, updated_at);
create index if not exists notes_updated_idx  on public.notes  (user_id, updated_at);
create index if not exists workspaces_updated_idx on public.workspaces (user_id, updated_at);
create index if not exists tasks_workspace_idx on public.tasks (workspace_id, due_date);
create index if not exists notes_workspace_idx on public.notes (workspace_id, parent_id);

-- Доступ только к своим строкам. Приложение ходит с анонимным ключом,
-- поэтому вся защита данных держится на этих политиках.
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
