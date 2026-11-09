# Handoff: Git Swole — barbell workout tracker (mobile + desktop/tablet)

## Overview
Git Swole is a linear-progression barbell tracker (5×5-style programs). The design covers two
form factors that share one product model:

- **Mobile** — a phone app: Today, Session, Log, Progress, Program, Settings.
- **Desktop / tablet** — the same six screens as a left rail + single content column, sharing one
  app component mounted at 1440×900 (browser) and 1194×834 (iPad landscape).

The centre of the product is the session screen. On both form factors it shows **one set at a
time** (weight, plate math, a loaded-bar diagram, a reps stepper, one log button) with the whole
session queued underneath as one row per exercise and one cell per set. Logging walks warm-up
sets then working sets, in order, across exercises. Rest starts automatically and its length
depends on whether the set hit its target reps.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that show
intended look and behaviour. They are **not production code to copy**. They are authored in a
proprietary in-browser component format (`.dc.html`: an HTML template plus a small logic class)
that only runs in the design tool, so there is nothing to lift directly.

The task is to **recreate these designs in the target codebase's existing environment** — React
Native / Swift / Kotlin for the phone, React or the house web stack for desktop — using its
established components, navigation, and state patterns. If no environment exists yet, pick the
framework that fits the product (a native or React Native app for the phone-first experience) and
implement there.

Open the HTML files in a browser to interact with the prototypes: every button, stepper, timer,
tab and inline edit works.

## Fidelity
**High fidelity.** Final colours, typography, spacing, sizes, states, copy and interaction
behaviour. Values in this document are exact and should be reproduced as-is. Two caveats:

- Data is fixture data (sessions, history, chart series). Wire to real data.
- Progress charts are drawn from hardcoded series; the shape is the spec, not the numbers.

---

## Design tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| Background | `#0B0E10` | App background, screen base |
| Surface raised | `#0E1113` | Rail, headers, sticky bars |
| Surface panel | `#161B1E` | Section headers, chips, inset panels |
| Surface subtle | `#141A1D` | Selected row / active list item |
| Surface hover | `#101518` | Row hover on desktop |
| Plate fill heavy | `#20272B` | Plate blocks ≥ 25 lb in bar diagram |
| Plate fill light | `#171D20` | Plate blocks < 25 lb |
| Border | `#23292D` | All 1px dividers, control outlines |
| Border faint | `#1A1F22` | Table row dividers |
| Text primary | `#EDEDE7` | Numbers, headings, active labels |
| Text secondary | `#B9C4C8` | Inactive-but-readable labels |
| Text dim | `#7C8A91` | Meta, units, captions, inactive labels |
| Text disabled | `#3D4649` | Not-owned plates, empty set cells, delete icon |
| Text faint | `#5C686D` | Unlogged set-cell numerals, bar shaft/collar fill |
| Accent green | `#45BB7C` | Success, primary action, today, hit reps, "on target" |
| Accent amber | `#E8A33D` | Warm-up sets, missed reps, longer rest, warnings |
| Green wash | `rgba(69,187,124,.16)` | Logged-and-hit cell background |
| Green wash faint | `rgba(69,187,124,.07)` | Logged row background |
| Green wash tint | `rgba(69,187,124,.12)` | Selected filter chip background |
| Amber wash | `rgba(232,163,61,.18)` | Missed-rep cell background |
| Amber wash faint | `rgba(232,163,61,.14)` | Completed warm-up cell background |
| Amber border | `rgba(232,163,61,.4)` | Completed warm-up cell border |
| Ring track | `#1C2226` | Rest-timer ring track |
| Ring track bar | `#161B1E` | Rest progress-bar track |

No gradients, no shadows anywhere except the tablet bezel mock (`0 0 0 8px #101315`).
No border radius on content: every control, cell, row and button is a **square rectangle**.
The only radii in the design are 2–3px on plate blocks in the bar diagram, 6–8px on the app
logo, and the device-frame bezels (38px) which are presentation chrome, not UI.

### Typography
Two families, loaded from Google Fonts:

- **Anton** (400 only) — every number that matters: weights, reps, timers, stat values,
  big headlines. Always tight leading (`.78`–`1`), `text-transform: uppercase` for words.
- **IBM Plex Mono** (400 / 500 / 600) — everything else: labels, meta, captions, body copy,
  table headers, button text. Always letter-spaced.

Type scale as used (font / size / line-height / letter-spacing):

| Role | Spec |
|---|---|
| Hero weight (mobile session) | Anton 86px / .8 |
| Hero weight (desktop session) | Anton clamp(120px, 15vw, 210px) / .8 |
| Rest timer (mobile ring) | Anton 96px / .8, tabular-nums |
| Rest timer (desktop) | Anton clamp(120px, 17vw, 240px) / .8, tabular-nums |
| Reps stepper value | Anton 56px / .8 (mobile), 90px / .8 (desktop) |
| Screen headline | Anton 56–64px / .9, uppercase |
| Finish headline | Anton 60px / .84 (mobile), clamp(64px, 8vw, 124px) / .82 (desktop) |
| Stat value | Anton 26–34px / 1 |
| Set cell numeral | Anton 13–15px / 1 (mobile), 15–28px (desktop) |
| Table numeric | Anton 20–26px / 1 |
| Section label | IBM Plex Mono 500 9–10px / 1, letter-spacing .20–.26em, uppercase |
| Table header | IBM Plex Mono 500 9px / 1, letter-spacing .16em |
| Row label | IBM Plex Mono 500 10–13px / 1, letter-spacing .05–.14em, uppercase |
| Meta / caption | IBM Plex Mono 400 8.5–10px / 1, letter-spacing .12–.16em |
| Body copy | IBM Plex Mono 400 9.5–11.5px / 1.7–1.8, `text-wrap: pretty` |
| Button label | IBM Plex Mono 500 9.5–14px / 1, letter-spacing .14–.24em |
| Clock | IBM Plex Mono 400 10–15px, letter-spacing .12–.16em, tabular-nums |

Rule of thumb: **numbers are Anton, words are Plex Mono, and words are always tracked out and
usually uppercase.** Sentence-case appears only in screen headlines ("Rack it", "Plate
inventory") and settings row labels.

### Spacing & sizing
- Mobile screen padding: **22px** horizontal. Section vertical rhythm 14–22px.
- Desktop content padding: **26px** horizontal (tables, headers), 30–44px for focus mode.
- Desktop rail: **82px** wide. Rail item padding 15px 4px. Header height **58px**
  (72px in focus mode).
- Mobile: status bar 42px, focus/session header **66px**, tab bar at bottom of frame.
- Table row heights: 50px (warm-up), 56–64px (working sets, plate rows), 58px (program rows).
- Set cells: **34px square** (mobile), 34–44px (desktop).
- Primary buttons: 58–70px tall (mobile), 72–120px (desktop focus). Steppers 60px square
  (mobile), 84–100px (desktop). Every tap target ≥ 44px.
- Dividers: 1px `#23292D` between sections, 1px `#1A1F22` between rows.

---

## Product model

### Program
Three days rotating A → B → A → C. Each day is a list of items:

```
{ name, sets, reps, inc, mode }   mode ∈ BB | BW | TIME | DIST
```

- **Day A · Barbell** — Squat 5×5 +5, Bench Press 5×5 +5, Barbell Row 5×5 +5, Chin-up 3×8 (BW)
- **Day B · Barbell** — Squat 5×5 +5, Overhead Press 5×5 +5, Deadlift 1×5 +10
- **Day C · Conditioning** — Row · Erg 1×2000 (DIST), Farmer Carry 4×40 +5 (TIME)

`inc` ("step") is the weight added after a clean session and only applies to `BB` items.

### Warm-up ramp
Computed from the working weight `w` and the bar weight `b`, three sets, rounded to the
nearest 5:

1. `b` × 5
2. `max(b, round(w × 0.50 / 5) × 5)` × 5
3. `max(b, round(w × 0.75 / 5) × 5)` × 3

Warm-ups are checkable, never count toward volume, and never affect progression.

### Plate math
Per side: `(weight − barWeight) / 2`. Greedily take the heaviest plate that fits, bounded by
the **pairs the user actually owns** (plate inventory in Settings). A pair count of zero removes
that plate from the calculation. If a remainder is left, show it as `· N SHORT` in amber.
If per-side is zero, show `BAR ONLY · <barWeight>`.

Default inventory: 45×4 pairs, 35×2, 25×2, 10×2, 5×2, 2.5×2. Bar 45 lb.

Bar diagram (loaded bar, one side only): a horizontal shaft block, then plate blocks
outside-in from heaviest, then a collar, then the sleeve end — all on one vertical centre axis.
Plate block sizes (width × height, px):

```
45 → 17×74   35 → 15×64   25 → 13×54   10 → 10×40   5 → 8×31   2.5 → 7×25
```

Fill `#20272B` / border `#3D4649` for ≥25 lb; `#171D20` / `#2B3235` below. Labels sit on a
single baseline below the bar, centred under each plate.

### Rest
Two configurable lengths: **after a hit** (default 90 s) and **after a miss** (default 300 s
mobile / 180 s desktop). The timer starts automatically when a working set is logged and picks
its length from the result. Rest is skippable and extendable by +30 s.

### Progression
A clean session (all reps at target) adds `inc` to that lift next session. Missed reps hold the
weight. The Progress screen charts working weight over time with range filters
**3M / 6M / 1Y / 2Y / 5Y**, defaulting to **3M**.

---

## Screens — mobile (`Git Swole v2.dc.html`)

Rendered inside an iPhone frame; five-item bottom tab bar (Today, Log, Progress, Program,
Settings) plus the session screen, which is a full takeover.

### 1. Today
- Header: app logo (26px, 6px radius) + wordmark row.
- `THIS WEEK` label, then a 7-column MON–SUN strip: each column is a day letter above a 44px
  cell. Logged days fill solid green with `#0E1113` text; today gets a 1.5px green outline and
  green text; rest days are `#161B1E` with 9.5px Plex Mono "REST"; planned days are an outlined
  empty cell. Workout letters are Anton 20px.
- Workout header: green `TODAY · WED AUG 12` eyebrow, `Workout A` in Anton 64px, meta line
  `3 LIFTS · 15 SETS · 4,225 LB PLANNED · EST 38 MIN`.
- Up-next list: one row per lift with index, name, scheme (`5×5 +5`), last session, today's
  weight (Anton) and change (`+5` green / `HOLD` dim).
- Primary CTA: full-width green `START WORKOUT A` (58px) → session screen.

### 2. Session — one set at a time
Full-screen takeover below the status bar.

**Header (66px)** — logo 24px, `WORKOUT A` in green, elapsed clock (tabular), `FINISH` in
green text, `✕` to leave without finishing.

**Current set block**
- Kind chip: outlined `WARM-UP` (amber) or `WORKING` (green), 8.5px Plex Mono, .16em.
- Beside it: `<EXERCISE> · SET n OF m` (or `WARM n OF 3`) in dim tracked mono.
- Weight in Anton 86px with the unit beside it; warm-up weights render in `#B9C4C8`,
  working weights in `#EDEDE7`.
- Loaded-bar diagram to the right, 86px tall, one side only, centred axis.
- Plate line under it: `PER SIDE · 45 + 25 + 2.5`, amber if short.

**Reps stepper** — 60px square − / + buttons flanking the rep count in Anton 56px, with a note
line: `REPS · TARGET 5` for working sets, `REPS · WARM-UP, NOT COUNTED` for warm-ups.
Steppers are disabled for warm-up sets. − hover amber, + hover green.

**Log button** — full-width 70px. Working sets: solid green, `LOG SET n`. Warm-up sets:
transparent with amber border and amber text, `WARM-UP SET DONE`. Pressing shifts 1px down.

**Session queue** — scrollable, `SESSION QUEUE` header on `#161B1E` with a green `done/total`
count. One block per exercise: name + `weight · done/total` meta, then a row of 34px cells —
warm-up cells (labelled with their weight) then a 1px divider then working cells (labelled with
the set number, replaced by the logged reps once done). Cell states: current = `#161B1E` fill
with a coloured border and light text; done warm-up = amber wash; done working = green wash if
reps hit target, amber wash if short; pending = outlined with `#5C686D` numeral. Any pending
cell is tappable to jump the queue. The current exercise's block gets a green left bar and
`#141A1D` background.

**Rest state** — replaces the set block: a 250px ring (3px stroke, `#1C2226` track, coloured
progress, rotated −90°) with the countdown in Anton 96px at its centre, then two 58px buttons:
outlined `+30 S` and solid green `NEXT SET`. Green ring after a hit, amber after a miss.

**Finish state** — when the queue empties: green `WORKOUT A COMPLETE`, a randomly chosen
headline in Anton 60px (`Rack it`, `Bar's empty`, `Logged`, `That's the session`, `Chalk off`,
`Done lifting`), a randomly chosen line in tracked mono (six options, e.g. "THE BAR DOES NOT
CARE HOW YOU FELT WALKING IN."), three bordered stat boxes (sets / volume / minutes), and a
green 64px `REVIEW & SAVE` → summary.

### 3. Log
Session history, newest first. Each entry: day name + date + duration, then one line per lift
with its name and weight, and reps as a row of coloured cells (green = hit, amber = short).
Conditioning lines show a text result instead of cells.

### 4. Progress
Lift selector, working weight in Anton, gain for the range in green, an SVG line chart
(2px `#EDEDE7` polyline, 1px gridlines) with a range chip row (3M / 6M / 1Y / 2Y / 5Y,
selected = green border + `rgba(69,187,124,.12)` fill), tick labels beneath, and a stat row:
best set, best volume, est 1RM, sessions.

### 5. Program
One editable list per day, day switcher on top. Each row: index, name, sets, reps, step, mode
tag, delete. Cycling mode tag: BB → BW → TIME → DIST.

### 6. Settings
Sections: preferences (units lb/kg, rest after a good set, rest after a missed set, bar
weight), plate inventory (one row per plate with a pair stepper and computed total; zero =
"NOT OWNED" in `#3D4649`), exercises & data (custom exercises, import history, sync).

---

## Screens — desktop / tablet (`Git Swole Desktop.dc.html` → `GSDesk.dc.html`)

Two mounts of the same component: a 1440×900 browser window and a 1194×834 iPad-landscape frame.

**Chrome** — 82px left rail (logo at top, six labels, status text at the bottom: `READY` or
`IN SESSION` + elapsed), then a single content column with a 58px header: breadcrumb on the
left; clock and the primary action on the right. The session screen replaces this header with its
own (see below) and keeps the rail.

**Selector strip** — every screen except Today has a horizontal strip under the header instead
of a list pane: one 170px-min cell per item (exercise, session, lift, program day, settings
section) with a title, a right-aligned Anton value, and a sub-line. Selected cell gets a 2px
green bottom border.

### Today
Week strip (same design as mobile, full width), then the workout header with three stat
columns (sessions / week streak / avg min), then the planned-lift table
(`# · EXERCISE · SCHEME · LAST · TODAY · CHANGE`), then `START WORKOUT A` (52px green) and
`EDIT PROGRAM` (outlined).

### Session — one set at a time
Same model as mobile, laid out for a wide screen. The rail stays visible; the content column gets
its own 58px header: `SESSION · WORKOUT A`, a queue progress line (`n OF 24 SETS DONE · n LEFT`),
the elapsed clock, `FINISH SESSION` (outlined green) and `✕` (leaves without finishing).

- **Live state** — a hero row: kind chip (`WARM-UP` amber / `WORKING` green), exercise + set
  label, weight in Anton clamp(120px, 15vw, 210px) with the loaded-bar diagram beside it (labels
  on one baseline) and the plate line under it, plus ±5 weight buttons. Right column
  (clamp 270–400px, pushed to the right edge): a reps stepper with 84–100px square −/+ buttons
  and the count in Anton 90px, the target note, and one log button ~120px tall — solid green
  `LOG SET n` for working sets, amber-outlined `WARM-UP SET DONE` for ramp sets.
- **Queue** — a table under the hero: `SESSION QUEUE · done/total` header with `WARM-UP` and
  `WORKING SETS` column labels, then one row per exercise (name, `weight · scheme · n/m done`),
  warm-up cells, a divider, then working cells. Cells are 44px, labelled with the ramp weight or
  the set number, replaced by logged reps once done; states as on mobile (current = outlined and
  filled `#161B1E`, hit = green wash, short = amber wash, pending = outlined with a faint
  numeral). The current exercise's row gets a green left bar and `#141A1D` background. Any
  pending cell is clickable to jump the queue.
- **Rest state** — replaces the hero row: countdown in Anton clamp(120px, 17vw, 240px), a 6px
  progress bar (max 720px) and two 72px buttons (`+30 S`, `NEXT SET`). The queue stays visible.
- **Finish state** — random Anton headline + random line, stat boxes, and the save action.

The rail status reads `IN SESSION` while the session screen is open and `READY` otherwise, and
the elapsed clock starts as soon as the screen opens.

### Log / Progress / Program / Settings
Table-first versions of the mobile screens. Program is **inline-editable**: name, sets, reps and
step are text inputs (transparent, borderless; focus shows a 1px green border), mode is a
cycling tag, rows delete via an `✕` that turns amber on hover, and `+ ADD EXERCISE` appends a
row. Settings mirrors mobile with wider steppers and a plate table.

---

## Interactions & behaviour

| Trigger | Result |
|---|---|
| `START WORKOUT A` (either form factor) | Session screen, timer running, queue at the first warm-up |
| Log button, warm-up | Marks that ramp set done, advances the queue, no rest timer |
| Log button, working set | Marks it done, starts rest at hit/miss length, advances the queue |
| Tap a pending queue cell | Jumps the queue to that set (works across exercises) |
| `+30 S` | Adds 30 s to both remaining and total rest (progress stays honest) |
| `NEXT SET` | Zeroes the rest timer, returns to the live set |
| Queue empty | Finish state with random headline + line and session stats |
| `REVIEW & SAVE` / `FINISH` / `FINISH SESSION` | Session summary (mobile) / Log (desktop) |
| `✕` | Leaves the session without finishing, back to Today |
| ±5 buttons | Adjust that lift's working weight, floored at bar weight; plate math recomputes |
| Reps stepper | Working sets only, floored at 0 |
| Range chips | Re-plot the chart and the gain figure |
| Program inputs | Commit on change; sets/reps/step are digit-filtered |
| Mode tag | Cycles BB → BW → TIME → DIST |
| Rail / tab bar / selector strip | Switch screen or selected item; no back button anywhere |

Timers tick once per second while a session is active. Elapsed time formats `M:SS`; rest
formats `M:SS` with tabular numerals so it doesn't jitter.

Hover (desktop only): rows lighten to `#101518` / `#141A1D`; outlined buttons take their accent
colour on the border and text; the delete `✕` turns amber. Buttons shift 1px down on press.

---

## State

Session state, per active workout:

```
screen            'app' | 'session' | 'summary'
tab               which app screen is showing
exIdx             index of the current exercise
elapsed           seconds since the session started
rest, restLen     remaining and total rest seconds
restReason        'hit' | 'miss'  (drives ring colour and copy)
weights           { [liftId]: workingWeight }
sets              { [liftId]: [{ reps, done }] }
warm              { [liftId]: [bool, bool, bool] }
quoteIdx          index into the headline/line lists, re-rolled per session
```

Settings state: `units`, `increment`, `restLenSetting`, `failLenSetting`, `barWeight`,
`plates: [{ weight, pairs }]`.

Program state: `prog: { A|B|C: { title, rows: [{ name, sets, reps, inc, mode }] } }`,
plus `dayKey` for the selected day.

Derived, never stored: the session queue (all incomplete warm-up and working sets in order),
plate math, warm-up ramp, chart series, counts, and every colour decision.

Data the real app needs beyond this: persisted session history, per-lift PRs, and the
progression rule applied at session save.

---

## Screenshots
`screenshots/` holds captures of every screen and every session state. Mobile shots are taken in
the phone frame with the design notes beside them; desktop shots are the 1440 browser mount.

**Mobile** (`NN-mobile.png`)
| # | State |
|---|---|
| 01 | Today — week strip, workout header, up-next list |
| 02 | Log — session history with rep cells |
| 03 | Progress — chart, range chips, stats |
| 04 | Program — editable day |
| 05 | Settings |
| 06 | Today (return) |
| 07 | Session — first warm-up set (bar only) |
| 08–10 | Session — warm-up ramp advancing 45 → 95 → 140 |
| 11 | Rest — green ring after a hit set, +30 S / NEXT SET |
| 12 | Session — next working set, queue showing logged cells |

**Desktop** (`NN-desktop.png`)
| # | State |
|---|---|
| 01 | Today — week strip, stats, planned-lift table |
| 02 | Session — first warm-up set, queue table below |
| 03–05 | Session — warm-up ramp advancing |
| 06 | Rest — countdown, progress bar, queue still visible |
| 07 | Log |
| 08 | Progress |
| 09 | Program — inline-editable table |
| 10 | Settings |

## Assets
- `public/gitswole.png` — app logo, supplied by the user. Used in the mobile Today header
  (26px), the mobile session header (24px), and the desktop rail and focus banner (26/34px),
  always with a small radius and `object-fit: cover`.
- Fonts: Anton and IBM Plex Mono from Google Fonts. No icon set — the few glyphs used
  (`✓ ○ ✕ − + › →`) are text characters.
- No images or illustrations beyond the logo.

## Files
See also `FLOWS.md` — flows, the session state machine, per-screen interaction inventory, UX
rules, responsive behaviour, and the gaps a real build has to close.

| File | What it is |
|---|---|
| `Git Swole v2.dc.html` | Mobile app, all screens, in a phone frame, with design notes alongside |
| `Git Swole Desktop.dc.html` | Desktop + tablet page: mounts the app in a browser window and an iPad frame, with notes |
| `GSDesk.dc.html` | The desktop/tablet app component itself (all six screens) |
| `ios-frame.jsx`, `browser-window.jsx` | Device/browser chrome used by the two pages — presentation only, not part of the product |
| `support.js` | Runtime for the design-tool component format — not product code |
| `public/gitswole.png` | App logo |

Open the two top-level HTML files in a browser to use the prototypes.
