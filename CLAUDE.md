# Dandori

A personal planner for a single user. The laptop and the phone are equal.

**The main criterion of this project is minimalism.** If a feature is not described
in this file, it must not exist. Nothing "for the future", nothing "because that is
how it is usually done". An extra button is a failed requirement, not a bonus.

---

## Product decisions

Fixed after the interviews. Change only at the explicit request of the project owner.

### Workspaces

- Workspaces are created by the user, there can be any number of them.
  The two starting ones (work, university) are not hardcoded, they are ordinary rows
  in the database.
- Isolation is complete: own tasks, own labels, own notes. Nothing is shown together.
- Switching is one click from the header.
- A workspace can be renamed and deleted. Since it is arbitrary, a typo in the name
  needs some way to be fixed, otherwise it stays there forever.

### Board

- Columns are **days**, not statuses. Drag a card into another column and you change its date.
- Two range modes:
  - `14 дней` (14 days) — a sliding window, the first column is always «Сегодня» (today).
  - `Лента` (feed) — infinite scroll of days to the left and to the right, days load as you go.
    It has a «Сегодня» button that scrolls back to the current date; the 14-day window
    does not need one, today is always inside it.
- The third mode is `Месяц` (month): a plain monthly grid. This is the calendar from
  the requirements, there is no separate tab for it.
- The «Без даты» (no date) column is pinned on the left and does not scroll away.
  Dragging a card back into it clears the date.
- The «Просрочено» (overdue) column is the second pinned one, right after «Без даты».
  It shows unfinished tasks with a past deadline that are not visible in the window.
  It appears only when such tasks exist. A task keeps its real date, which is printed
  on the card; dragging it onto a day moves the deadline. You cannot drop a card into
  this column: it has no date of its own.
- The «14 дней» window starts from yesterday: otherwise yesterday's deadline would
  disappear from the board at midnight. In «Лента» and «Месяц» the past is reachable anyway.
- On the phone there are no pinned columns: the pinned area plus one day already fill
  the whole screen, the second one does not fit. «Без даты» and «Просрочено» become
  ordinary first columns of the feed, and the initial scroll position is today.
- A task with a far-off date stays on its own date, it does not "collapse" anywhere.
- «Сделано» (done) is a checkbox right on the card. The card fades and gets struck
  through, but stays on its day.

### Card

One schema for all workspaces. No per-workspace schemas.

- Title
- Description (markdown)
- Start date (optional)
- Deadline (optional)
- Labels
- Remind N days before
- «Не показывать в напоминаниях» (mute) — keeps the task out of the banner even when
  it is due today or overdue. Separate from the reminder select, which only controls
  the advance warning: a deadline tracker must show today and overdue by default,
  so opting out has to be explicit.
- Done (checkbox)
- An attached note, at most one. One-way: the task points at the note, the note knows
  nothing about the task. Deleting the note clears the link instead of leaving a dead
  one. "Открыть" switches to the notes tab, expands the tree down to it and selects it.
- Custom fields: a list of name–value pairs, added by the user when needed.
  Links, numbers, anything — they go here. There is no separate "link" field.
  The name is rendered as the field's label and the value gets an ordinary input,
  the way every other field on the card looks; clicking the label edits the name.

**Dates only, no time of day.** No "14:30", no time slots, no time blocking.

### Labels

- 5–10 predefined **colors**. The names are set by the user, they are not hardcoded.
- A label can be renamed, recolored and deleted — in the same list of labels
  in the task card, «Правка» (edit) mode. A deleted label is removed from all tasks.
- Labels are separate in every workspace.
- The label filter lives in the header and applies to all views at once.

### Timeline

- A separate tab. Horizontal bars along the dates.
- A bar runs from the start date to the deadline. If there is only one date — a dot/milestone.
- The main scenario: see all deadlines on one scale and understand where the jam is.
- The scale is never shorter than a month from today: with a couple of tasks it would
  otherwise take a third of the screen and look cut off.
- An axis is pinned along the bottom edge: one line across the full width, closed by
  an arrow, with ticks on Mondays and month boundaries and month names underneath.
  One dot per task at its deadline (its start date if it has no deadline), and a short
  callout joined to the dot by a lead. Callouts alternate above and below the axis and
  stack into a few levels when they crowd; when nothing fits the callout is dropped and
  the dot stays, still clickable. Clicking a dot or a callout opens the task.
  The axis lives inside the same scroller as the rows, so the two halves cannot drift
  apart. It shows deadlines, not spans — duration is what the rows above are for.
- On the phone it scrolls horizontally, on the laptop it fits entirely.

### Notes

- A sidebar with a tree of folders and files, feels like the file tree in VS Code.
- Markdown, edited right inside the app.
- The tree is separate in every workspace.

### Reminders

- Only a banner at the top inside the app: overdue / today / the next few days.
- The banner **can be dismissed** and does not come back during the current session.
  It shows up again the next time the app is opened.
- No push notifications. No integration with external calendars.

### Interface

- Two themes: dark and light, following the system setting plus a manual toggle.
- Density is compact.
- Horizontal overscroll is suppressed on the scrollers. A two-finger swipe over the
  board or the timeline was navigating the browser back, and nothing in a single-page
  app is reached by going back — the gesture only ever lost the user's place.
- Three tabs: `Доска` (board) · `Таймлайн` (timeline) · `Заметки` (notes).
- Sync status dot in the header: 7×7 px, visible only during an exchange, when offline
  or on error. The app writes to the local database and does not wait for the network,
  so without the dot a silently failed send would look like success.

### Data

- Supabase Postgres, access closed off by RLS policies on `user_id`.
- Login by email and password. There is one account.
- Offline: reading and editing. Local cache in IndexedDB, the queue of edits goes out
  once there is network.
- Conflict resolution is last-write-wins by `updated_at`.
- Export of all data to JSON. There is no import.

### PWA

- The same address on the laptop and on the phone, responsive layout.
- Manifest and service worker, installs to the Android home screen,
  opens without the address bar once installed.

---

## What must not exist

The list is closed. Any item from here, in the code or in the interface, is a bug.

- Collaboration: users, roles, invites, assignees, comments, mentions.
- Time tracking, estimates in hours, time reports, time of day in any form.
- Sprints, cycles, modules, epics, backlogs, story points.
- Automations, rules, webhooks, integrations with external services.
- AI features of any kind.
- Dashboards with metrics, productivity charts, statistics.
- Onboarding tours, empty states with illustrations, teaching hints.
- Push notifications.
- Configurable field schemas per workspace.
- Any indicators and counters except the sync status dot.

---

## Stack

| Layer | Choice |
|---|---|
| Build | Vite |
| UI | React + TypeScript |
| Styles | plain CSS + CSS variables, two themes as tokens |
| Drag & drop | `@dnd-kit` |
| Local cache | `dexie` (IndexedDB) |
| Backend | Supabase (Postgres + Auth + RLS) |
| Markdown | `marked` |
| PWA | `vite-plugin-pwa` |
| Hosting | Cloudflare Workers (static assets) |

The timeline, the monthly grid and the day feed are written by hand on CSS grid.
We do not pull in Gantt or calendar libraries: they all drag in time slots and hours,
and we only have dates.

A new dependency is added only if writing it by hand is noticeably more expensive.
Justify it in the commit message.

---

## Database schema

```
workspaces   id, user_id, name, position, created_at, updated_at, deleted
labels       id, user_id, workspace_id, name, color, position,
             created_at, updated_at, deleted
tasks        id, user_id, workspace_id, title, description,
             start_date, due_date, done, remind_days_before, position,
             label_ids jsonb [uuid], custom_fields jsonb [{name, value}],
             created_at, updated_at, deleted
notes        id, user_id, workspace_id, parent_id, kind (folder|file),
             name, content, position, created_at, updated_at, deleted
```

All tables are under RLS, bound to `auth.uid()`.

Dates use the `date` type, not `timestamp`. There is no time of day in the schema
and there never will be. The exception is the housekeeping `created_at` / `updated_at`:
they are never shown in the interface and are only needed for conflict resolution.

Labels are stored as a `label_ids` array in the task itself, there is no join table.
There is a single user, referential integrity buys nothing here
and makes sync twice as complicated.

Deletion is soft: `deleted = true`. Otherwise a deletion made on the phone would never
reach the laptop that was offline at that moment.

---

## Agent roles

The split is by layer. An agent does not touch files owned by others: if a change is
needed beyond its boundary, it describes it in the report and the coordinator decides
who makes it.

### `coordinator` — coordinator (main session)

Stands above everyone. **The only agent with the full project context:**
the history of the interviews with the owner, the product decisions and the reasons
they were made for, the state of all layers at once.

- Assigns tasks to the layer agents and accepts their reports.
- All questions from other agents go to it, not directly to the project owner
  and not to each other.
- Resolves disputes between layers and adjusts the file ownership boundaries.
- Decides what to do with the `reviewer` findings.
- The only one who talks to the project owner.
  A fork that cannot be resolved from this file is taken to the owner
  as questions with answer options, 2–4 at a time.
- Keeps `CLAUDE.md` up to date: any new decision by the owner lands here first,
  and only then in the code.

The layer agents do not have each other's context and must not make it up.
Not enough information — ask the coordinator.

### `data` — data and sync

Owns: `supabase/`, `src/db/`, `src/sync/`, `src/auth/`.

- Postgres schema, migrations, RLS policies.
- Supabase client, authentication, session.
- Dexie local cache, offline queue of edits, conflict resolution.
- Export to JSON.

### `ui` — interface

Owns: `src/views/`, `src/components/`, `src/styles/`.

- Board (three modes), timeline, notes, task card.
- Workspace switcher, label filter, reminder banner.
- Themes, density, behaviour on the phone.
- Takes data only through the API of the `data` layer, never goes to Supabase directly.

### `infra` — build and deploy

Owns: `vite.config.ts`, the manifest and the service worker, `wrangler.jsonc`, CI, `README.md`.

- Build configuration, PWA, deploy to Cloudflare Workers (static assets).
- Checking the install to the home screen.
- Secrets never end up in the repository under any circumstances.

### `reviewer` — review and minimalism control

Owns nothing, only reads.

Looks at every piece before it is committed. Two duties:

1. Code quality: correctness, dead code, duplication.
2. **Minimalism control.** Checks the diff against the "What must not exist" list
   and against the product decisions above. Any feature, button or field
   that is not in this file is a finding, not an improvement.

The verdict is short: a list of findings or "clean".
Anything debatable is decided by the project owner, not by an agent.

---

## Git

- Commits are authored by the project owner: `nitatsuu <nitatsuu@gmail.com>`.
- **No mentions of the assistant**: no `Co-Authored-By` trailer,
  no `Generated with` line, not in commits, not in the README, not in code comments.
  `.claude/settings.json` has `includeCoAuthoredBy: false`.
- Commit after every finished piece, not in one dump at the end.
- Messages are short and in one style: `<area>: <what was done>`.
  Areas: `board`, `timeline`, `notes`, `db`, `sync`, `auth`, `pwa`, `build`, `docs`.
- Keys and tokens never end up in the repository. Everything local goes into `.gitignore`.

---

## Definition of done

- Workspaces work and are fully isolated.
- All views — board (14 days / feed / month), timeline, notes — work
  on the same data.
- The data survives a page reload and is visible on the other device.
- A task is created, edited and deleted from the phone exactly as from the laptop.
- The app is deployed, installs to the home screen, opens at a single address
  from both devices.
- The interface contains not a single element from the "What must not exist" list.
