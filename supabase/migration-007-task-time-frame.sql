-- Run once in the Supabase SQL Editor, after migration-006-lww-and-ownership.sql.
-- Safe to run twice.
--
-- Why this exists.
--
-- A task may now carry the hours it runs: a start and an end, HH:MM. It is the
-- one clock the task has — the card shows it and the calendar event is made on
-- it — while the day the task stands on is still the date columns' business.
--
-- Nothing has to be written into the rows already there. A task with no frame
-- behaves exactly as it did: its event is made on the hours its terms carry.
--
-- schema.sql declares both columns, but `create table if not exists` does
-- nothing to a table that already exists, which is the whole of what this adds.

alter table public.tasks add column if not exists start_time text;
alter table public.tasks add column if not exists end_time text;
