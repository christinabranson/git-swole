# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Git Swole — a linear-progression barbell tracker. Next.js App Router SPA-style
app, Clerk for auth, Supabase (Postgres) for persistence, with a localStorage
fallback so the app is fully usable signed out.

The UI implements `design_handoff_git_swole/` (README.md = spec, FLOWS.md =
acceptance criteria, screenshots/ = reference). That handoff is the source of
truth for visuals and interaction; its hex values and sizes are exact, not
approximations. Read it before changing anything visual.

## Commands

```bash
npm install              # Node 24 (see .nvmrc)
npm run dev              # dev server on :3000
npm run build            # production build
npm run start            # serve production build
npm run lint             # eslint (flat config, next core-web-vitals + typescript)
npm run sync:exercises   # upsert data/global-exercises.json into Supabase `exercises`
```

There is no test suite, no CI config, and no Docker/deploy manifest in the repo.
`npm run lint` and `npm run build` are the only automated checks — run both after
non-trivial changes.

## Setup

1. `cp .env.example .env.local` and fill in Clerk + Supabase keys.
2. Run `supabase/schema.sql` in the Supabase SQL editor (idempotent — safe to rerun).
3. `npm run sync:exercises` needs `SUPABASE_SERVICE_ROLE_KEY`; it is the only
   place the service-role key is used and it runs from Node, never the browser.

For UI work, skip all of that: set `NEXT_PUBLIC_DEV_AUTH=1` in `.env.local` and
run `npm run dev`. See "Dev auth bypass" below.

## Architecture

**Everything is client-side.** Every page and component is `"use client"`; there
are no route handlers, server actions, or server components beyond `layout.tsx`.
The Supabase client is called directly from the browser and is authorized by RLS.

- `src/app/*/page.tsx` — routes: `/` Today, `/workout` Session, `/history` Log,
  `/progress`, `/program`, `/settings`, `/import`.
- `src/app/layout.tsx` → `providers.tsx` → `AuthProvider` > `WorkoutAppProvider`,
  wrapped by `components/app-shell.tsx` (82px rail on desktop, bottom tabs on
  mobile). The session screen supplies its own header and hides the tab bar.
- `src/context/workout-app-context.tsx` — the single source of truth. Holds
  settings, progression, workout logs, exercise catalog, and sync status; every
  page consumes it via `useWorkoutApp()`. Mutations go through this context, not
  through `storage.ts` directly.
- `src/lib/storage.ts` — persistence layer: localStorage read/write plus all
  Supabase reads/writes and row⇄domain mapping. Returns
  `SyncResult<T> = {ok:true,data?} | {ok:false,error}`; it never throws at callers.
- `src/lib/` domain logic, all pure and dependency-free: `program.ts` (exercise
  defs, the A/B/C day templates and the A→B→A→C rotation, starting weights),
  `progression.ts`, `plates.ts` (per-side maths + bar-diagram block sizes),
  `warmup.ts` (the three-set ramp), `session.ts` (queue derivation and session
  state), `week.ts`, `importer.ts` (StrongLifts CSV), `types.ts`.
- `src/lib/use-now.ts` — clock as an external store. Use `useToday()` for
  date-only screens so they do not re-render once a second.
- `src/proxy.ts` — Clerk middleware. Next.js 16 renamed `middleware.ts` to
  `proxy.ts`; do not recreate a `middleware.ts`.

> **`/program` is on hold.** It is excluded from the UI overhaul by request. It
> currently edits a fixed A/B/C template, but the intended direction is that any
> user can build a **completely custom** workout plan, which will likely reshape
> `WorkoutTemplate` / `ProgramExercise`. Do not restyle it as part of overhaul
> work, and avoid hardening code around the current program shape.


### Dev auth

`NEXT_PUBLIC_DEV_AUTH=1` (dev builds only — `IS_DEV_AUTH` in `src/lib/dev-auth.ts`
also requires `NODE_ENV !== "production"`) runs auth without Clerk or Supabase.

- **Import auth from `@/lib/auth`, never from `@clerk/nextjs` directly.** That
  module is the seam: it re-exports `useAuth`, `useUser`, `AuthProvider`,
  `SignInButton`, and `UserButton`, swapping in dev implementations when the flag
  is on. `src/proxy.ts` is the one legitimate exception.
- The dev implementations are chosen at module load, not inside the hook, because
  no `ClerkProvider` is mounted in dev mode and Clerk's own hooks would throw.
- **It is a real session with a real identity.** `/sign-in` takes an email, derives
  a stable user id from it, and stores the session under `git-swole-dev-auth`.
  Different email, different account.
- **The app is gated.** Without a session every route redirects to `/sign-in`;
  there is no guest mode.
- **`useAuth().userId` is what all local data is keyed on**, in both dev and Clerk
  modes. `loadLocalState` / `persistLocalState` / `sessionStateKey` all namespace
  by it. Before this, one global key was shared by every user, so signing out and
  back in as somebody else showed the previous account's history.
- **The auth value is cached per session object**, not rebuilt per render — a fresh
  object each render invalidates the context's `getSupabaseToken` `useCallback` and
  spins the effects into an infinite update loop.
- **The hydration window reports `isLoaded: false`, not "signed out."** The store
  cannot be read during hydration; reporting signed-out there made the gate fire on
  every full page load and bounce a signed-in user to `/sign-in`.
- **The context tracks `loadedFor`** — which account the in-memory state belongs to
  — and refuses to persist unless it matches the current account. Otherwise the
  persist effect fires once with the new account id and the previous account's
  state, writing it under the new key.
- **`useUser()` returns `user: null` in dev**, which keeps every Supabase call (all
  gated on `user?.id`) switched off. New Supabase calls should keep that gate.
- **Nothing is seeded automatically.** Every account starts empty.
  `src/lib/dev-seed.ts` only installs `window.gitSwoleDev.{seed,reset,empty}`,
  which act on the signed-in account when you want data to look at. It is reached
  through a dynamic import behind `IS_DEV_AUTH`, so it is code-split into its own
  chunk that production never fetches.

### The session screen

`/workout` is the centre of the product and the one screen worth understanding.
It runs a four-state machine — live set → rest → (repeat) → finish — over a queue
that is **rebuilt on every render and never stored** (`buildQueue` in
`src/lib/session.ts`): for each exercise in program order, its unchecked warm-ups
then its unlogged working sets. Consequences the design depends on:

- Warm-ups for exercise 2 come *after* all of exercise 1's working sets.
- Un-checking a warm-up cell puts that set back at the front of its block, so the
  current set changes. That is how a mis-tap is undone.
- Any pending cell is clickable to log that set directly, out of order.
- Warm-ups start no rest timer, never count toward volume, and never progress.
- Rest length is the feedback: `restAfterHit` on target, `restAfterMiss` when
  short. `+30 S` adds to remaining *and* total so the progress ring stays honest.

In-progress session state persists to localStorage under
`git-swole-session-v1`, so leaving with `✕` and coming back resumes exactly.

### Auth → Supabase token flow

`getSupabaseToken()` in the context tries `getToken()` (Clerk-as-JWKS-provider,
the preferred path) and falls back to `getToken({ template: "supabase" })` for
older template setups. The token is passed to `getSupabaseClient(accessToken)`,
which builds a per-call client with an `Authorization: Bearer` header. Only the
anon-key client is cached; token-bearing clients are never cached.

### Sync model

Local-first. State loads from localStorage on mount, then, if signed in, is
replaced by a Supabase fetch. Every state change writes to localStorage and, when
signed in, upserts to Supabase. All Supabase work goes through `runSupabaseTask`,
which races against a 10s timeout and drives the `syncStatus`
(`local | syncing | synced | error`) badge in the nav.

### Data model

RLS everywhere, keyed on `auth.jwt()->>'sub'` matching the Clerk user id (so
`users.id` is `text`, not a uuid). Tables: `users` (settings), `progression`,
`workouts` → `workout_sets`, and `exercises` (global rows have
`is_global = true, created_by = null`; user rows are the inverse, enforced by a
check constraint).

## Conventions

- Path alias `@/*` → `src/*`. Use it; no deep relative imports.
- TypeScript `strict`. Avoid `any`; the existing code casts narrowly with
  inline object types when mapping loose Supabase rows.
- Tailwind v4 (CSS-first, no `tailwind.config`). **Use the design tokens, never
  raw hex**: `bg-bg`, `bg-panel`, `border-line`, `text-dim`, `text-green`,
  `bg-green-wash`, etc. They are defined once in `globals.css` from the handoff
  table.
- Two type utilities carry the type system: `.num` (Anton — every number that
  matters) and `.label` (IBM Plex Mono, uppercase, tracked — every word).
  Numbers are Anton, words are Plex Mono.
- `desk:` is the custom 900px breakpoint. Below it the mobile layout is used;
  there is no tablet-specific layout.
- Square corners everywhere. No shadows, no gradients, no rounded panels — 1px
  hairlines and spacing carry the density.
- Colour is meaning, never decoration: green = hit / primary / today, amber =
  warm-up / missed / longer rest / warning. Nothing else is coloured.
- Domain logic stays pure in `src/lib/`; React state and effects stay in the
  context; components render.

## Gotchas

- **Legacy migration paths are load-bearing.** Workouts used to be fixed
  `A`/`B` with `workout_a_exercises` string arrays; they are now arbitrary
  `workoutGroups` templates with ids like `workout-a`. `migrateLegacyWorkoutGroups`,
  `normalizeWorkoutLogType`, and the `update` blocks in `schema.sql` exist for
  that. Keep both shapes readable when touching settings or workout types.
- **`workoutSummary` is smuggled through the note column.** `workouts.note`
  stores `[[SUMMARY:UP]]\n<note>`; see `serializeWorkoutNote` / `parseWorkoutNote`.
- Progression only applies to the five built-in `ExerciseKey`s — logs for custom
  catalog exercises carry no `exerciseKey` and are skipped by
  `applyWorkoutProgression` and by PR computation.
- `schema.sql` is a single re-runnable file, not a numbered migration series.
  Add changes as `if not exists` / guarded `do $$` blocks in the same style.
- **Everything in `globals.css` must stay inside a layer.** Unlayered CSS beats
  Tailwind utilities in the cascade. This bit twice: element rules outside a layer
  broke `border-transparent` on the Program inputs, and `.num` / `.label` outside a
  layer silently swallowed every `leading-*` and `tracking-*` override applied on
  top of them — the finish headline rendered at .8 leading no matter what the
  class said. Element rules go in `@layer base`, `.num` / `.label` in
  `@layer components`.
- Rest is two settings now (`restAfterHit` / `restAfterMiss`). The first maps to
  the existing `rest_timer_seconds` column; the second needs
  `rest_after_miss_seconds`, added to `schema.sql` — **re-run it** before signed-in
  sync will persist that field.
- The warm-up ramp is three sets (bar / 50% / 75%), not the old four-set 20-80%
  version. It is specified in the handoff; do not "improve" the percentages.
- **The A → B → A → C rotation is not a cycle through the day list.** Every other
  day is A and the non-A days alternate, so the next day is not a function of the
  current day alone — `getNextDayId` takes the day history (most recent first) to
  decide whether B or C follows an A. Both call sites in the context must pass it,
  or the program silently degrades to A → B → A → B and day C never runs.
- The session hero weight is `clamp(120px, 13vw, 200px)` on desktop, not the
  handoff's `clamp(120px, 15vw, 210px)`, and the bar diagram beside it is rendered
  at `scale={1.75}`. These two numbers are a pair: plate block sizes are fixed px,
  so raising one without the other makes the diagram look like a toy next to the
  number (or vice versa). At 1440px this gives a ~150px glyph against a ~161px
  diagram, matching the proportion in the handoff's screenshots. Change them
  together.
- The hero row uses `overflow-x-clip`, never `overflow-hidden`. `.num` sets
  `line-height: 0.8`, so the Anton glyphs overflow their line box vertically and
  `overflow-hidden` slices the tops off the weight. `clip` is the one value that
  does not force the other axis to `auto`.
- The elapsed-clock interval depends on `startedAt` only. Depending on `session`
  rebuilt the interval on every logged set, so it never completed a tick during an
  active session and the clock froze near 0:01.
