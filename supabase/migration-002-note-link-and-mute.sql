-- Run once in the Supabase SQL Editor, on top of an existing schema.sql database.
-- Safe to run twice: both statements are guarded by "if not exists".

-- A note attached to the task. Dropping the note only clears the link,
-- it must never take the task with it.
alter table public.tasks
  add column if not exists note_id uuid references public.notes (id) on delete set null;

-- Keeps the task out of the reminder banner even when it is due today or
-- already overdue. Separate from remind_days_before, which only controls the
-- advance warning.
alter table public.tasks
  add column if not exists muted boolean not null default false;
