# Dandori

A personal planner for a single user. The laptop and the phone are equal.

**The main criterion of this project is minimalism.** If a feature is not described
in this file, it must not exist. Nothing "for the future", nothing "because that is
how it is usually done". An extra button is a failed requirement, not a bonus.

---

## Product decisions

Fixed after the interviews. Change only at the explicit request of the project owner.

### Workspaces

- Workspaces are created by the user, there can be any number of them, and the app
  creates none by itself. An empty database shows the header alone — no tabs, no
  views, nothing for them to stand on — and the first workspace is made from the
  header's menu. A pair named for you is a pair of names you did not choose and have
  to rename or delete before you can start.
- The name of a new workspace is asked for in a window of the app's own, the same
  one the questions are asked in, with the field already focused: Enter makes the
  workspace, Escape drops it. The browser's own `prompt()` stood here — the one
  browser window left in the app, and standing at the one moment the app has
  nothing else on screen to be recognised by. An empty name still gives «Без
  названия»: a name is fixed in the settings, and refusing to start without one
  would be a gate in front of an empty database.
- Isolation is complete: own tasks, own labels, own notes. Nothing is shown together.
- Switching is done from the header: the current workspace's name opens the list,
  and a name in it is picked. Past two workspaces a list is the only honest shape
  for it, so the switch costs the click that opens it.
- A workspace can be renamed and deleted. Since it is arbitrary, a typo in the name
  needs some way to be fixed, otherwise it stays there forever.

### Board

- Columns are **days**, not statuses. Drag a card into another column and you change its date.
- A task's date is its deadline, or its start date when it has no deadline. One
  answer for the whole app: the column it sits in, the point it takes on the
  timeline, the day its calendar event is made on, and the day the banner counts
  from. A task with a start date and no deadline used to fall into «Без даты» on
  the board while the timeline drew it on its date and the calendar skipped it —
  three answers to one question, and two of them wrong. Dragging such a card
  moves the date it has: no deadline is invented for it, and dropping it on
  «Без даты» clears the same date it was placed by.
- Two range modes:
  - `14 дней` (14 days) — a sliding window that always holds «Сегодня» (today),
    starting from yesterday — see below.
  - `Лента` (feed) — infinite scroll of days to the left and to the right, days load as you go.
    It has a «Сегодня» button that scrolls back to the current date; the 14-day window
    does not need one, today is always inside it. It opens where that button
    brings it back to: the days behind today are loaded only so that there is
    somewhere to scroll, and opening on the first of them put the laptop a
    fortnight in the past.
- The third mode is `Месяц` (month): a plain monthly grid. This is the calendar from
  the requirements, there is no separate tab for it. It carries the same «Сегодня»
  button as «Лента» and for the same reason — it is paged away from the current
  date and there has to be one way back.
- On a phone a month cell is 55 px wide, which holds no words: a task is drawn
  there as its label's colour bar and nothing else. The month is the overview of
  where the load sits; the day behind the cell is where it is read — so a tap on
  the cell switches to «Лента» at that day, and a tap on one of the colour bars
  opens the task itself. Without it the overview was a dead end: the load was
  visible and unreachable, and the day had to be found again by hand. On the
  laptop a cell already holds the titles, and nothing is added there.
- The «Без даты» (no date) column is pinned on the left and does not scroll away.
  Dragging a card back into it clears the date.
- There is no «Просрочено» column, and adding one back is a finding. An overdue task
  stays on its own day; the reminder banner is the one place that gathers them all,
  and a click on a chip there opens the task. A pinned column could only ever hold
  the days the window does not already show, so it disagreed with the banner and
  read as broken.
- The «14 дней» window starts from yesterday: otherwise yesterday's deadline would
  disappear from the board at midnight. In «Лента» and «Месяц» the past is reachable anyway.
  «14 дней» opens at the start of that window, «Без даты» pinned and yesterday
  standing beside it — opening on today instead parked yesterday underneath the
  pinned column, which is the one place it may not be.
- The current day's column is outlined, Saturdays and Sundays are shaded a shade
  darker, and the headers of yesterday, today and tomorrow carry that word beside
  the date rather than instead of it. The date is what a header is for; the word
  is what the eye lands on when the strip is scrolled.
- On the phone nothing is pinned: the pinned column plus one day already fill the
  whole screen. «Без даты» becomes an ordinary first column of the feed, and the
  initial scroll position is today.
- A day column takes the whole width of a phone. A column at 78% of it left a fifth
  of the screen to a card sliced down the middle, which reads as damage rather than
  as an invitation to swipe; the snap and the day header say there is more to the
  side. The strip is scrolled by the day, so the day is the unit.
- A swipe leaves the strip on a day, never between two. The snap is mandatory:
  a phone screen is 390 px against a column of 382, so a swipe that ran out
  halfway had no edge near enough for a loose snap to pull it to, and the strip
  stood on the seam with two half days on it. One swipe moves one day, a hard
  fling two. The snap is lifted for the length of a card's drag, because a snap
  of any strictness undoes the few pixels a frame the auto-scroll moves.
- «Лента» grows its window of days only once the strip has stopped moving.
  Adding days while a fling is still running puts the scroll position back from
  the main thread, and the compositor, still carrying the gesture from its own
  offset, throws that away a frame later: the feed jumped a fortnight backwards,
  and a long fling did it ten times over — four months gone in one swipe.
- Auto-scroll while a card is dragged near the edge runs at about one column a
  second at the very edge. The library's own acceleration is seven times that — a
  week gone before a finger can lift, and the card lands nowhere near the day it
  was aimed at. Planning happens on the laptop and «Месяц» is there for the long
  view, so this gesture only has to be aimable, not fast.
- A task with a far-off date stays on its own date, it does not "collapse" anywhere.
- A task that starts on one day and is due on another is marked on both. The
  card stands on the day the task stands on, as it always has, and on the start
  day there is a mark of it: the title under the word «Начало», dimmed, with the
  same label colour so the eye joins the two. The start date was otherwise
  invisible everywhere but the timeline and the card's own field — a month of
  work would begin with nothing anywhere saying so, which is how a field comes
  to be half dead. It appears whenever the two dates differ, at a day's gap as
  at a month's: a threshold would be a number to remember, and the same task
  would be drawn one way this week and another the next.
  The mark is a mark and nothing more. It opens the task and that is all —
  no checkbox, nothing to drag. A start is moved where the other dates are
  moved: in the card, or by dragging the card itself. One task with two handles
  in two columns is two places to be wrong about what was just moved.
  Marks stand above the day's cards, in the order of the deadlines they belong
  to. They are the one thing on that day the owner would otherwise never see,
  where a card standing on its own day cannot be missed; they are kept from
  reading as cards by being quieter rather than by being further down.
  It is drawn in the day columns and in the month's cells, both of which are
  read as "what falls on these days"; the timeline already draws the span
  itself, and «Без даты» has no day to mark. A finished task is not marked:
  the mark is there to catch work about to begin, and work that is done is not
  about to begin. On the phone's month cells it is a colour bar like any other,
  which is all a 55 px cell holds either way.
- «Сделано» (done) is a checkbox right on the card. The card fades and gets struck
  through, but stays on its day.

### Card

One schema for all workspaces. No per-workspace schemas.

- Title
- Description (markdown)
- Start date (optional)
- Deadline (optional)
- Время (optional): a start and an end, hours and minutes. It stands beside the
  dates and belongs to neither of them on its own — a deadline says which day
  something falls on, but a conference also has a length, and a reminder set
  without one says nothing about whether the afternoon is still free. It is
  written under the title on the card and nowhere else: the board's columns are
  days and the timeline's scale is days, and neither is redrawn by an hour.
  Nothing sorts, groups or filters by it. It is left out of the month grid's
  cells, where a card is a fifth of a day column wide and carries its title and
  nothing else — the month says where the load sits and the day behind it is
  where the load is read.
  An end alone cannot be given — the field opens once there is a start to
  measure it from — and a start alone is a moment rather than a span, which is
  all the card then says. The pair is taken off the same way it is given, by
  rubbing out the start, and that is the price of the rule: a start rubbed out
  to be typed again takes the end beside it. A frame carried over midnight ends
  the next morning, since 22:00 to 01:00 is a thing an evening's work does and
  the hours say so plainly.
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

**The day is the unit, the clock is an aside.** A task stands on a day, is
dragged by the day and is drawn by the day. The frame above says how long that
day's work runs, and two things read it: the owner's eye on the card and the
calendar event. No time slots, no time blocking, nothing laid out on a grid of
hours.

### Labels

- 5–10 predefined **colors**. The names are set by the user, they are not hardcoded.
- A label can be renamed, recolored and deleted — in the same list of labels
  in the task card, «Правка» (edit) mode. A deleted label is removed from all tasks.
- Labels are separate in every workspace.
- The label filter lives in the header and applies to all views at once. The
  reminder banner is outside it: the banner is about dates falling due, not about
  a slice of the board, and a deadline hidden because its label is unticked is a
  deadline missed. On the notes tab the filter button is not shown at all —
  notes carry no labels, and a control that can change nothing is noise.

### Timeline

- A separate tab. Horizontal bars along the dates.
- A bar runs from the start date to the deadline. If there is only one date — a dot/milestone.
- Finished tasks are not drawn at all. The tab is for the deadlines still ahead, and
  a season of completed work buries them. The board is where a finished task stays
  visible, struck through on its own day.
- The main scenario: see all deadlines on one scale and understand where the jam is.
- An overdue task is said three ways at once and no more: its name in red, a ring
  around its bar or dot, and the red mark on the axis. On the phone the row itself
  takes a pale red band instead of the ring — the scale is scrolled there, and the
  mark that carries the colour is often off the screen, so the row has to say it
  on its own. On the laptop that band covered a quarter of the tab for two late
  tasks and lost its colour under the pointer.
- The current day is a hairline down the whole height of the scale. Saturdays and
  Sundays are shaded in the header of the scale and there only: a band down the
  whole height, as the board draws it, would cross every bar on the tab and turn
  the one thing the eye follows into stripes.
- On the laptop a bar carries the task's dates and a day column its own date as a
  pointer's tooltip. It is the one thing in the app that depends on hover, and it
  may stay so: nothing is reached only through it. The phone has no hover and gets
  none of it — there is no room for a callout there, and nothing is lost with it gone.
- The scale is never shorter than a month from today: with a couple of tasks it would
  otherwise take a third of the screen and look cut off.
- Two range modes, switched at the top of the empty corner beside the axis:
  `Всё` — the whole span at once, and `Месяц` — a month across the screen, the rest
  reached by scrolling. A cluster of deadlines a few days apart cannot be read on a
  scale that spans a year, and dropping the far tasks to make room would lose the
  overview the tab exists for; the switch keeps both. Nothing is hidden in either
  mode, only the zoom differs. The choice is remembered per device.
  The phone gets no switch and is always `Месяц`: 400 px cannot hold a year of
  anything, so days stay readable and the rest of the scale is scrolled to. The
  two ends of the name column — the corner above the names and the foot below
  them — hold nothing there, so the scale runs over them rather than under.
  Pinned and painted, as they are on the laptop where one of them carries the
  switch, they cost the scale a third of a 390 px screen: every scroll slid the
  first day and half a month's name in under a blank block and cut them down the
  middle. The column's own line stays along the names, which is the stretch of
  it that divides anything.
- A column is a day only while days are wide enough to read. Past that the step
  grows to a week and then to a month, so a grant two years out still fits on the
  screen instead of squeezing every day into a hairline. Dates keep their exact
  place inside a column — only the grid and the labels become coarser. On a phone
  there is no width to fit anything into, so the step holds out longer and the
  scale scrolls instead.
- The stretching stops there, and the rest is scrolled. A column never goes below
  the width its step can be read at, so a deadline far enough out makes the track
  wider than the screen rather than the columns narrower than an eye. Every task
  is on the scale at its own date whatever that costs in width: the scale used to
  be cut to five years instead, which left a task past that pinned to the last
  column, standing months away from the date it has. Only a mistyped year is
  still caught, at thirty — past any deadline a person plans towards.
- An axis is pinned along the bottom edge: one line across the full width, closed by
  an arrow, with ticks on Mondays and month boundaries and month names underneath.
  One dot per task at its deadline (its start date if it has no deadline), and a short
  callout joined to the dot by a lead. Callouts alternate above and below the axis and
  stack into a few levels when they crowd; when nothing fits the callout is dropped and
  the dot stays, still clickable. Clicking a dot or a callout opens the task.
  The dot is 9 px of paint with nothing grown around it — the one control in the
  app left at its own size. It carried a 27 px box for a finger, and half a
  million real taps measured what that cost: on a phone a day is 14 px wide and
  two tasks sharing a day stand 7 px apart, so the box reached past the
  neighbour's centre, and a tap on a dot's own middle opened a different task 21
  times out of 28 in a crowded month. The paint alone is not naked — a browser
  already carries a tap some nine pixels past a control, which is the reach the
  box was after — and a missed tap at a lone dot opens nothing and is repeated,
  where the box's win opened the wrong task.
  The axis lives inside the same scroller as the rows, so the two halves cannot drift
  apart. It shows deadlines, not spans — duration is what the rows above are for.
- On the phone it always scrolls horizontally; on the laptop it fits whenever its
  columns are readable at that width, and scrolls when they are not.

### Google Calendar

Added at the owner's explicit request, against two entries of the closed list
below — and those entries are amended to match. The reason is narrow and worth
naming: the app has no way to reach him when it is closed, and building one means
a background service on the phone. Google Calendar already is that service. This
is not an integration for its own sake; it is the reminder the banner cannot give.

- Signing in to Google is a row in the settings window and is optional. The app
  keeps working untouched without it. The same button stands in the event's own
  window when the account is not connected yet — it is not a second home for the
  setting, it is what a tick has to lead to: the window opened by ticking the
  checkbox would otherwise be empty, with the setting it needs three clicks away.
- A task carries a «Синхронизировать с Google Calendar» checkbox. Ticking it opens
  a small window: the time of the event, up to three reminders (how long before,
  and whether a notification or an e-mail), which calendar, and the event's colour.
  Saving creates the event. Beside a ticked checkbox stands «Править», which opens
  the same window again.
- An event takes the colour of the task's first label, and the colour picked in
  the window stands for a task that carries none. A workspace synced whole put
  every event it made in one colour, which is the one thing a calendar full of
  them cannot be read by — and the labels are already the colours the owner
  sorts by, in both places at once. The nine label colours map onto nine of
  Google's eleven, one to one, and the picker keeps its job where there is no
  label to take a colour from.
- **The clock is the task's, and there is one of it.** The event opens at the
  task's start time and closes at its end time; the sync window sets that same
  frame from the other side, and the task card sets it from this one. Two clocks
  saying different things about one task is a question with no answer — the app
  would show one hour and the phone would ring at another.
  Where a task carries no frame the terms carry a default start, and that is
  what its event is made on: a workspace synced whole has to put its events at
  some hour, and its tasks are not going to be given one each by hand. The terms
  carry a default end beside it, on the same footing.
  A frame is the task's own data, never its terms. Setting one in the sync
  window changes the event and nothing else, and it does not take the task out
  from under its workspace's switch the way altering the terms does. It is
  given whole, though: an end set on a task that had no frame hands it the
  start as well, the hour its terms would have given it, and from that moment
  the task keeps its own hours while the workspace goes on setting everyone
  else's. Half a frame is not a frame, and the card says which hours the task
  has as soon as it has any.
- Without an end the event lasts 30 minutes. Nothing in the app says how long
  such a task takes, and a reminder needs an event, not a guess at a duration.
- A task with two dates and a frame of its own carrying both times makes one
  event across the whole span: it
  opens at the start time on the start date and closes at the end time on the
  deadline. That is what a conference across three days is. Three events, one
  per day, would be three things to keep in step with one task, and the event's
  id is the task's — there is room for one. Anything short of both dates and
  both times stays a single event on the task's own day, as it was before. A
  default end carried by the terms is a length, not a span: it stretches the
  event on the task's own day and never across two, because the terms speak for
  every task in the workspace and a span is a thing one task has.
- The event follows the task. Change the title, the description or the deadline
  and the event is rewritten in place — dragged to another day, it moves there
  with the same time and the same reminders. Finish the task or delete it and the
  event goes: a reminder for something already done is noise.
- A workspace can be synced whole: one checkbox in its settings, and every dated
  task in it goes into the calendar on the same terms. It is a standing
  arrangement, not a sweep — a task made tomorrow joins by itself, changing the
  terms changes all of them, and unticking takes the events away again. A task
  the owner set up by hand is never spoken over by it. The terms are set in the
  same place and belong to the workspace: sync is per workspace, so its defaults
  are too.
  A task can still be taken out of such a workspace one by one: unticking its
  checkbox says so explicitly, and that is remembered, because clearing its own
  terms would only drop it back under the workspace's.
  «Править» on such a task shows the workspace's terms, and saving them unchanged
  changes nothing: the task keeps following the workspace. Only what the owner
  actually altered is written onto the task, and only that takes it out from under
  the switch. Saving the terms as they stood used to detach it silently — the task
  went on looking the same and stopped hearing the workspace for good.
  This is the one rule in the app that acts on rows made after it was written,
  which is close to the automations the list forbids. It is allowed because it
  is a switch the owner holds and can see, on one workspace, doing one thing —
  and because the alternative, ticking each new task by hand, is the chore the
  switch exists to spare him.
- The exchange runs in the browser while the app is open, like the rest of the
  sync, bar one step. An edit made with the app closed reaches the calendar the
  next time it is opened.
  Google hands out an hour of access at a time, and gives the means of making
  the next hour only to a client that can keep a secret. A page delivered to a
  browser keeps none: everything in it is read by whoever opens it. So the
  site's own worker — the one already serving these files — holds the secret and
  takes that one step: it trades the code the consent screen sends back, and
  trades the refresh token for another hour. It keeps nothing, since the tokens
  go straight back to the browser that asked, and it answers no request that did
  not come from this site. That is the whole of the server side of this project:
  no data passes through it, nothing is stored on it, and if the calendar ever
  goes the file goes with it. The rule it breaks was written in this file, and
  it was right until it was measured — Google's token client opens a window even
  when it has nothing to ask, a blocked window is what a browser does to a window
  nobody clicked for, and so every reload ended the connection and cost a click
  to restore. This integration exists to deliver the reminder the app cannot,
  and a reminder that stops arriving because a token quietly expired is worse
  than no integration at all.
  Signing in is therefore a page of Google's, opened by the owner's own click
  and coming back to the app: once, rather than once an hour. What comes back
  and stays is the refresh token alone — it is the account, and it goes when the
  account is disconnected, Google being told to drop the grant as it does. The
  hour of access it buys lives in the tab and nowhere else: a reload spends one
  silent request making another, and a second key kept at rest would buy nothing
  but a thing to lose. The consent screen names no account either. A browser
  signed into several has to ask which is meant, and being asked is the point:
  the owner picks the calendar the events go to, and a hint remembered from the
  first time would pick it for him for good.
  The secret itself is in Cloudflare's secrets and nowhere else: not in the
  repository, not in the bundle, not in anything the worker writes back.
- One-way, but for one thing: an event that is gone. The calendar is told what
  the task says and nothing that happens to the event in Google is read back —
  except its deletion, which unticks the task's checkbox exactly as unticking it
  by hand would, and on a task under a whole-synced workspace is written as that
  task's own refusal, so the switch cannot put the event back. Without it the
  only way out of a sweep was inside the app: clearing the thing off the
  calendar is the gesture that comes to hand, and it held only until the next
  edit of the task rewrote the event into place.
  While the app is open, each calendar it has events in is asked once a pass
  what changed in it since the last time it was asked. Asking creates nothing —
  it is a read — and the answer is acted on before the same pass writes
  anything, so a task whose event was deleted leaves the sync before it can be
  rewritten. Nothing else in the answer is looked at: not a moved event, not a
  renamed one, not an event of the owner's that was never ours. A deletion made
  while the app is shut is noticed the next time it is opened.
  Two directions in full would need a server to listen and a second answer to
  every conflict. This is one bit travelling the other way, and all it can do is
  turn something off. It has a price: an event dragged into another calendar
  inside Google reads as a deletion and unticks its task, leaving that event
  behind where it was dragged — which calendar an event stands in is chosen in
  the app, and Google is not asked.
- Which calendar an event stands in travels with the task. It is the only record
  that the event exists at all: a device that did not create it — a second one,
  or the same one after signing out cleared its local notes — would otherwise
  have no way to know there was anything to take away, and turning the sync off
  would leave the events behind with nothing that could ever remove them.

### Notes

- A sidebar with a tree of folders and files, feels like the file tree in VS Code.
- Markdown, edited right inside the app.
- The tree is separate in every workspace.
- A note or a folder is moved by dragging it onto another folder, and reordered by
  dragging it between its neighbours — the tree is the only place a note lives, so
  the tree is where it is carried. No «Переместить» item and no folder picker: the
  menu holds renaming and deleting, and a third way to say "this one goes there"
  would be a list of every folder in the workspace.

### Reminders

- Only a banner at the top inside the app: overdue / today / the next few days.
- The banner **can be dismissed** and does not come back during the current session.
  It shows up again the next time the app is opened.
- No push notifications of our own. What has to reach the owner with the app shut
  goes through Google Calendar — see above.

### Interface

- Two themes: dark and light, following the system setting plus a manual toggle.
- Density is compact. On the phone it is compact at a hand's scale, not the laptop's
  shrunk: 44 px is what a fingertip covers, and everything meant to be tapped is
  laid out on it where the layout allows. Where it does not, the paint stays small
  and nothing is grown around it: measured on the phone, a browser already carries
  a tap 10–13 px past a control's own edge, and up to 11 px into the next control,
  so an invisible box grown towards a neighbour does not reach into empty space —
  it moves the boundary and takes the neighbour's taps. A grid of 166 258 taps
  found that every such growth cost a neighbour more than it gained, and a second
  grid of 542 640 across the timeline's axis found the same where such a growth
  had been allowed as an exception. It is allowed only where nothing tappable
  stands within about 25 px — measured, not assumed, and on this phone there is
  no such place: where a dot does stand 70 px from the next, growth is free and
  wins nothing either.
  Anything typed into is held at 16 px, or iOS Safari zooms the page in
  on focus and leaves it zoomed.
- There is no hover on a phone. A control that only appears when a pointer is over
  it cannot be reached at all, so nothing may depend on hover to be usable.
- The workspace switcher, the label filter and the gear stay in the top corners,
  the hardest place on the screen for a thumb. They are used rarely enough that
  reach is worth less than a header that reads the same on both devices.
- Horizontal overscroll is suppressed on the scrollers. A two-finger swipe over the
  board or the timeline was navigating the browser back, and nothing in a single-page
  app is reached by going back — the gesture only ever lost the user's place.
- Three tabs: `Доска` (board) · `Таймлайн` (timeline) · `Заметки` (notes).
- On the laptop the board's range modes stand in the header, beside the tabs they
  belong to. A bar of their own under the header cost 41 px of board height to
  hold 200 px of buttons, while the header had a thousand empty pixels in its
  middle. On the phone they keep that bar: there it is a full-width control,
  each mode a third of the screen for a thumb.
- Settings are a window, not a menu. The gear opens a panel over the page — its
  own sections down the side, the way an editor's settings work — and everything
  that used to hang off the gear lives in it: theme, language, the workspace's
  name and deletion, the export, signing out, and Google Calendar. A menu could
  hold five items; it cannot hold a form. It is a part of the page, never a
  second browser window.
- Two interface languages, Russian and English, picked in the settings window and
  remembered per device. The sign-in screen carries the same pair of names under
  the form: it is reached before the settings window exists, and a visitor who
  cannot read Russian would otherwise meet a Russian form with no way past it —
  which is the one situation the English was added for. Russian is the default. The two language names are the
  exception to the dictionary: each is written in itself — «Русский», "English" —
  so that someone who cannot read the current language can still find his own. The project is shown to people
  who do not read it, and a planner whose every label is unreadable cannot be
  looked at at all. Neither language is a translation of the other in the code:
  both live side by side in one dictionary, and a string with only one of them is
  a bug. A word that is spelled the same in both — "Email", "Markdown" — is written
  in the dictionary twice all the same: it costs one line, and a word hardcoded in
  a component is a word nobody finds when it has to change. The address is called
  "Email" in both languages throughout, including the failed sign-in.
- A question before anything is taken away — a task, a label, a note, a
  workspace, or edits a sign-out would lose — is asked by the app, not by the
  browser. One window for all of them: a step inside the settings window would
  have served the workspace alone, and the notes tree has nowhere to put one.
  The focus starts on «Отмена»: a stray Enter must not delete anything. The
  sign-out question names no number — that would be a counter, and it would
  count rows rather than edits.
- Sync status dot in the header: 7×7 px, visible only during an exchange, when offline
  or on error. The app writes to the local database and does not wait for the network,
  so without the dot a silently failed send would look like success.

### Data

- Supabase Postgres, access closed off by RLS policies on `user_id`.
- Login by email and password. There is one account. A failed sign-in says
  which of two things went wrong — the email or password, or no connection to
  the server — in the interface's language. The owner has to know whether to
  retype or to wait, and the server's own message is English whatever the
  interface is set to.
- Offline: reading and editing. Local cache in IndexedDB, the queue of edits goes out
  once there is network.
- Conflict resolution is last-write-wins by `updated_at`, over the whole row, and
  the server is the judge: it refuses an update older than the row it holds.
  Left to the devices, the edit that *arrived* last won instead — an offline
  edit from the morning overwrote the afternoon's, and a deleted task came back.
  The whole row is the unit, and that is the price: dragging a card renumbers the
  other cards of that day, deleting a label rewrites every task that carried it,
  and each of those rows travels entire. Two devices editing different fields of
  one task within the same minute therefore lose one of the two edits. Merging
  field by field would need a history per column; with one owner and two devices
  it buys a case that happens by accident, if at all.
- Signing out never loses an edit silently. What is queued is sent first; what
  cannot be sent is named, and the owner is asked before it goes.
- The local cache belongs to one account. A device that finds someone else's
  rows in it at sign-in starts clean rather than showing them.
- Export of all data to JSON. There is no import. Ids of labels and notes that no
  longer exist are dropped as it is written: a task edited offline can come back
  from a conflict still carrying the label deleted on the other device, and though
  no view ever draws it, the export is the one place it would be read.

### PWA

- The same address on the laptop and on the phone, responsive layout.
- Manifest and service worker, installs to the Android home screen,
  opens without the address bar once installed.
- The manifest's own name and description are Russian and are the one exception
  to the two languages. They are built into the file, and the device reads them
  before the app runs, so there is nothing there to pick a language with.
- A new build reaches a running app on its own: the app checks for one hourly and
  reloads once the new service worker takes over. An installed app on the phone is
  resumed rather than reopened for days, and without the check it would go on
  serving the build it was installed with.

---

## What must not exist

The list is closed. Any item from here, in the code or in the interface, is a bug.

- Collaboration: users, roles, invites, assignees, comments, mentions.
- Time tracking, estimates in hours, time reports. A task's frame says when
  something runs; nothing measures how long it took, and nothing adds it up.
  Time slots, hour grids and time blocking in any form.
- Sprints, cycles, modules, epics, backlogs, story points.
- Automations, rules, webhooks, integrations with external services — except
  Google Calendar, and only in the shape described above. It exists to deliver a
  reminder the app cannot deliver itself; anything else routed through it is a
  finding.
- AI features of any kind.
- Dashboards with metrics, productivity charts, statistics.
- Onboarding tours, empty states with illustrations, teaching hints.
- Push notifications of our own. Google Calendar's reminders are the whole point
  of the integration above, and they are Google's to deliver.
- Configurable field schemas per workspace.
- Any indicators and counters except the sync status dot, and the number of
  chosen labels on the header's filter button. That number is the control's own
  state, not a metric: collapsed, the filter is otherwise silent about a board
  that is hiding half its tasks.

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
| Hosting | Cloudflare Workers (static assets, plus the one route above) |

The timeline, the monthly grid and the day feed are written by hand on CSS grid.
We do not pull in Gantt or calendar libraries: they all drag in time slots and hours,
and we only have dates.

A new dependency is added only if writing it by hand is noticeably more expensive.
Justify it in the commit message.

---

## Database schema

```
workspaces   id, user_id, name, position, gcal_sync boolean,
             gcal jsonb {time, end, calendar_id, color_id, reminders},
             created_at, updated_at, deleted
labels       id, user_id, workspace_id, name, color, position,
             created_at, updated_at, deleted
tasks        id, user_id, workspace_id, title, description,
             start_date, due_date, start_time, end_time,
             done, remind_days_before, muted,
             note_id, position,
             label_ids jsonb [uuid], custom_fields jsonb [{name, value}],
             gcal jsonb {time, end, calendar_id, color_id,
                         reminders [{method, minutes}]} | {off: true},
             gcal_placed text,
             created_at, updated_at, deleted
notes        id, user_id, workspace_id, parent_id, kind (folder|file),
             name, content, position, created_at, updated_at, deleted

every table  synced_at — stamped by the server as it writes the row
```

All tables are under RLS, bound to `auth.uid()`. A label, a task or a note can
only be written into a workspace of the same user: the foreign key alone checks
that the workspace exists, not whose it is.

Dates use the `date` type, not `timestamp`, and the hours a task may carry are a
separate pair of `text` columns spelled `HH:MM`. A day and an hour are answers to
different questions here — a task is dragged by the day and keeps its frame
through the move — and one `timestamp` would have to invent an hour for every
task that has none. `text` rather than `time` because `gcal.time` is spelled that
way already and because a `time` column hands back `09:00:00` what was written as
`09:00`: the row a device wrote would differ from the row it reads, and every
pull would look like an edit. The housekeeping `created_at` / `updated_at` /
`synced_at` are never shown in the interface either. `updated_at` is
the device's, and settles conflicts; `synced_at` is the server's, and is what a
device pulls by — an edit made offline keeps the time it was made, and a device
that pulled by `updated_at` would never ask for anything that old again.

Labels are stored as a `label_ids` array in the task itself, there is no join table.
There is a single user, referential integrity buys nothing here
and makes sync twice as complicated.

`supabase/schema.sql` is the one place the database is written — tables,
functions, triggers and policies alike — and it is idempotent, so a database is
brought up to date by running it again. A migration file carries only what
re-running cannot do: a column added to a table that already exists, and a
one-off edit to rows already there. A definition copied into a migration is a
second copy that agrees with the first only until someone changes one of them,
and a disagreement in the rules that decide conflicts and deletions is one
nothing in the app would show.

Deletion is soft: `deleted = true`. Otherwise a deletion made on the phone would never
reach the laptop that was offline at that moment. A deleted workspace takes its
rows with it on the server, including one another device added while it was
being deleted.

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

Owns: `supabase/`, `src/db/`, `src/sync/`, `src/auth/`, `src/gcal/`.

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

Owns: `vite.config.ts`, the manifest and the service worker, `wrangler.jsonc`,
`worker/`, CI, `README.md`.

- Build configuration, PWA, deploy to Cloudflare Workers (static assets).
- Checking the install to the home screen.
- Secrets never end up in the repository under any circumstances.

### `designer` — visual design

Owns nothing on `main`. Works in a separate worktree on the `design` branch and
never touches `main`, never pushes, never deploys. If the pass turns out badly it is
thrown away by deleting the branch, and nothing has to be undone.

Touches `src/styles/` and the `.css` files of the views and components, plus the
smallest markup change a style genuinely needs. Never `src/db/`, `src/sync/`,
`src/auth/`.

- Spacing, type scale, colour tokens, borders, shadows, hover and focus states.
- Parity between the two themes, and between the laptop and the phone.
- Adds nothing. The "What must not exist" list applies to it in full, and so does
  every product decision above: restyling what exists is design, adding an element
  is a finding. Reordering what is already on screen needs the owner's word.
- Interface text is not reworded, shortened or retranslated. Both languages live
  in `src/i18n/`, and a string is changed there or not at all.

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
  Areas: `board`, `timeline`, `notes`, `ui`, `db`, `sync`, `auth`, `pwa`, `build`, `docs`.
  `ui` is for what crosses the views: tokens, base styles, the header, the dialog.
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
