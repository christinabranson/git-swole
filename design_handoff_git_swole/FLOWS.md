# Flows & interaction guide

Read this alongside `README.md` (design spec) and `screenshots/`. Everything here is behaviour
the prototypes actually implement — treat it as the acceptance criteria.

---

## 1. The one flow that matters: logging a session

Both form factors run the same state machine. The screen always shows exactly one of four states.

```
              ┌──────────────┐
   enter →    │  LIVE (set)  │ ── log warm-up set ──────────┐
              └──────┬───────┘                             │ (no rest)
                     │ log working set                     │
                     ▼                                     │
              ┌──────────────┐   +30 S ↺                    │
              │    REST      │ ── NEXT SET / expires ───────┤
              └──────────────┘                             │
                     │                                     │
                     └──────── queue empty ────────────────┤
                                                           ▼
                                                   ┌──────────────┐
                                                   │   FINISH     │ → summary / log
                                                   └──────────────┘
```

### The queue
Built fresh on every render from program + state; never stored.

```
for each exercise in today's day, in program order:
    for each of its 3 warm-up sets, in order:      if not checked → push
    for each of its working sets, in order:        if not done    → push
current set = queue[0]
```

Consequences the design relies on:
- Warm-ups for exercise 2 come **after** all of exercise 1's working sets. The queue is
  exercise-by-exercise, not interleaved.
- Un-checking a warm-up cell puts that set back at the front of that exercise's block, so the
  current set changes. This is intentional: a mis-tap is undone by tapping the cell again.
- Tapping any pending cell logs *that* set directly, so a user can work out of order (e.g. skip
  the ramp entirely by tapping the first working cell). The queue then continues from the
  earliest remaining set.
- `done/total` counts warm-ups **and** working sets (3 per exercise + its working sets:
  24 for a three-lift day of 5×5s).

### Logging a warm-up set
Marks it checked, advances the queue, **starts no timer**. The button reads
`WARM-UP SET DONE` and is amber-outlined, so it never looks like a real set. Warm-up reps are
fixed by the ramp (5 / 5 / 3) — the stepper is inert while a warm-up set is current.

### Logging a working set
1. The rep count comes from the stepper (pre-filled with the target, adjustable before logging).
2. The set is marked done and stores the reps that were entered.
3. `hit = reps >= target`.
4. Rest starts immediately: `restLen = hit ? restAfterHit : restAfterMiss` (90 s / 300 s mobile,
   90 s / 180 s desktop, both configurable).
5. The queue advances.

There is no confirmation step and no undo dialog: the cell is the record, and a wrong cell is
fixed by tapping it.

### Rest
- Counts down once per second; the ring / bar shows `remaining / total`.
- `+30 S` adds to **both** remaining and total, so the progress indicator stays honest.
- `NEXT SET` zeroes it and returns to the live set. Reaching zero does the same thing.
- Colour is the whole message: green ring = you hit your reps, short rest; amber ring = you
  missed, longer rest. Mobile states the reason in words under the ring.
- The user can leave rest running and still see what's next (desktop keeps the queue on screen;
  mobile's ring is a full-screen state by design, since a phone at the rack has no room for both).

### Finishing
- Queue empty → the finish state appears on its own (no button press needed).
- A random headline (6 options) and a random supporting line (6 options) are picked **once per
  session**, on entering the session — not per render, or they'd flicker.
- Stats shown: sets logged, volume moved (working sets only: `Σ weight × reps`), minutes elapsed.
- `REVIEW & SAVE` (mobile) → session summary. `FINISH SESSION` in the desktop header → Log.
- `✕` leaves without finishing and keeps the session state, so re-entering resumes exactly where
  the user left off. Nothing is discarded on exit.

---

## 2. Navigation model

**Mobile** — five bottom tabs (Today, Log, Progress, Program, Settings). The session is a
full-screen takeover with its own header, not a tab. Its header has `FINISH` and `✕`; there is
no back chevron anywhere in the app.

**Desktop / tablet** — an 82px rail with all six screens, always one click away. Under the
header, screens that are "a list of things" (session exercises, sessions, lifts, program days,
settings sections) get a horizontal selector strip instead of a list pane. Today has no strip.
The session screen keeps the rail visible and overlays only the content column.

No modals, no drawers, no nested navigation. Every screen is reachable in one action from every
other screen. This is deliberate: a user mid-session should never be more than one tap from
where they were.

---

## 3. Per-screen interaction inventory

### Today
| Element | Interaction |
|---|---|
| Week strip | Read-only. Today = green outline, logged = solid green, rest = filled grey cell |
| Up-next rows | Read-only in the prototype; a real build may open the lift's progress |
| `START WORKOUT A` | → session, timer starts, queue at the first warm-up set |
| `EDIT PROGRAM` (desktop) | → Program screen, today's day selected |

### Session
| Element | Interaction |
|---|---|
| Reps stepper − / + | Working sets only; floored at 0; hover −  amber, + green |
| ±5 weight buttons | Change that lift's working weight, floored at bar weight; plate math and the bar diagram recompute live; changes apply to every remaining set of that lift |
| Log button | See flow above; press shifts 1px down |
| Warm-up cell | Toggles that ramp set done / not done |
| Working cell | Logs that set if pending; logged cells are inert |
| Exercise row / pager chip | Selects that exercise as current |
| `+30 S` / `NEXT SET` | Rest controls |
| `FINISH` / `FINISH SESSION` | Ends the session |
| `✕` | Leaves, session state preserved |

### Log
Read-only history, newest first: day, date, duration, then one line per lift with weight and reps
as coloured cells (green = hit target, amber = short). Conditioning lines show a text result
(`8:12`, `4 × 40 S`) instead of cells.

### Progress
| Element | Interaction |
|---|---|
| Lift selector | Switches the charted lift; every stat and the chart re-derive |
| Range chips 3M / 6M / 1Y / 2Y / 5Y | Re-plot the series and the gain figure; default 3M |
| Chart | Static line; a real build should add a scrubber or point tooltips |

### Program
| Element | Interaction |
|---|---|
| Day selector A / B / C | Switches the edited day |
| Name field | Free text, commits on change |
| Sets / Reps / Step fields | Digit-filtered (step also allows `.`), commit on change |
| Mode tag | Click cycles BB → BW → TIME → DIST; colour follows (BB green, BW dim, TIME/DIST amber) |
| `✕` | Deletes the row; icon turns amber on hover |
| `+ ADD EXERCISE` | Appends `New exercise 3×8 +5 BB` |

Inputs are transparent and borderless until focused, when they take a 1px green border. Nothing
is disabled; there is no save button — edits are the state.

### Settings
| Element | Interaction |
|---|---|
| Units lb / kg | Segmented pick; relabels every unit in the app |
| Rest after a good set | Stepper, 15 s steps, floor 30 s, ceiling 600 s |
| Rest after a missed set | Stepper, 15 s steps, floor 60 s, ceiling 900 s |
| Bar weight | Stepper, 5 lb steps, 15–65 |
| Plate pairs | Stepper 0–20 per plate; total column recomputes; 0 shows `NOT OWNED` and drops the plate from plate math |
| Data rows | Navigational (custom exercises, import history, sync) — not implemented in the prototype |

---

## 4. UX rules that carry the design

1. **One set at a time.** The session screen answers "what do I do right now" before it answers
   anything else. Weight is the biggest thing on screen; everything else is smaller than it.
2. **The queue is the map, not the controls.** It exists so the user can see what's left and jump
   if they need to — but the primary path is one button, over and over.
3. **Colour carries meaning, never decoration.** Green = hit / primary / today. Amber = warm-up,
   missed, longer rest, warning. Nothing else is coloured.
4. **Warm-ups are visibly not real sets.** Amber chip, amber outlined button, weight in a dimmer
   grey, inert stepper, "NOT COUNTED" in the note, excluded from volume and progression.
5. **Rest length is feedback.** The user learns their result from how long the app makes them
   wait and what colour the timer is, without reading a word.
6. **Numbers are readable at arm's length.** Weights, reps and timers are set in Anton at sizes
   that survive a phone propped against a plate tree.
7. **No confirmation, no undo dialogs.** Every logged value is directly editable by tapping the
   thing that holds it.
8. **Nothing is behind a back button.** Tabs on mobile, a rail on desktop, and one selector strip.
9. **Chrome is hairlines, not cards.** 1px `#23292D` dividers, square corners, no shadows, no
   rounded panels. Density comes from spacing, not containers.
10. **Every tap target ≥ 44px.** Steppers 60px on mobile, log buttons 70px, set cells 34px with
    generous row padding around them.

---

## 5. Responsive behaviour

- **Mobile** is a fixed phone layout: 22px side padding, everything full-width, one column.
- **Desktop / tablet** is the same component at two widths (1440 and 1194). It adapts by
  `clamp()` on the session hero (weight size, right-column width, gaps) — no breakpoints, no
  layout switch. Tables absorb the extra width; the rail and header are fixed height.
- Below roughly 900px the desktop layout is not intended to be used — fall back to the mobile
  layout.
- Long content scrolls inside the content column; the rail, header and (on desktop) the hero row
  do not scroll away independently of it.

---

## 6. Build notes / gaps to close

Things the prototype deliberately does not solve, which a real implementation needs:

- **Persistence.** Session state, history, settings and program all live in memory. Sessions
  should be saved on finish, and an interrupted session should be resumable after app restart.
- **Progression on save.** The rule (clean session → add `inc`; miss → hold) is documented but
  applied only as fixture data in the Today screen's "change" column.
- **Deload rule.** The progress chart shows deload points in the series; the policy behind them
  (e.g. three consecutive misses → drop 10%) is not defined. Confirm with the user.
- **Units.** Switching to kg relabels but does not convert. Decide whether kg mode uses a kg bar
  (20 kg) and kg plates, which also changes the plate-math table and the ramp rounding (2.5 kg
  steps rather than 5 lb).
- **Charts.** Series are hardcoded; ranges beyond available history need an empty state.
- **Timers in the background.** Rest must keep running (and ideally notify) when the app is
  backgrounded or the screen locks.
- **Accessibility.** The design is colour-led; pair every colour state with its text label (the
  cells already carry numbers, the chips carry words). Check contrast of `#7C8A91` on `#0B0E10`
  for anything a user must read, and keep the 44px targets.
