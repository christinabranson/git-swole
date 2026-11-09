"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkoutApp } from "@/context/workout-app-context";
import { workoutLetter } from "@/lib/week";
import { WorkoutLog } from "@/lib/types";

/** Sessions per page. The quick-nav jumps across pages, so this only bounds the DOM. */
const PAGE_SIZE = 12;

function sessionVolume(workout: WorkoutLog) {
  return workout.exercises.reduce(
    (sum, exercise) =>
      sum + exercise.setResults.reduce((setSum, set) => setSum + set.completedReps * exercise.weight, 0),
    0,
  );
}

function minutesOf(workout: WorkoutLog) {
  return workout.durationSeconds ? Math.round(workout.durationSeconds / 60) : null;
}

function shortDate(value: string) {
  return new Date(value)
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

/** Rep cells: green when the set hit its target, amber when it came up short. */
function RepCells({ exercise, size }: { exercise: WorkoutLog["exercises"][number]; size: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {exercise.setResults.map((set) => {
        const hit = !set.skipped && set.completedReps >= set.targetReps;
        return (
          <span
            key={set.setNumber}
            className={`flex items-center justify-center ${size} ${
              hit ? "bg-green-wash text-green" : "bg-amber-wash text-amber"
            }`}
          >
            <span className="num text-[11px]">{set.completedReps}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function LogScreen() {
  const { workoutLogs, settings, stateLoaded, deleteWorkout } = useWorkoutApp();
  const [page, setPage] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const quickNav = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  /** Which way the quick-nav can still scroll — drives the chevrons. */
  const readEdges = useCallback(() => {
    const el = quickNav.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  /*
   * A ResizeObserver rather than a measure-on-mount effect: it delivers an initial
   * observation on observe(), so the first measurement arrives through the observer
   * callback instead of a synchronous setState in the effect body.
   */
  useEffect(() => {
    const el = quickNav.current;
    if (!el) return;
    const observer = new ResizeObserver(readEdges);
    observer.observe(el);
    return () => observer.disconnect();
    // stateLoaded / length are here because the strip does not exist during the
    // loading return — without them the observer attaches to nothing, once.
  }, [readEdges, stateLoaded, workoutLogs.length]);

  const nudgeNav = (direction: -1 | 1) => {
    const el = quickNav.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  // Scrolling to a session is a DOM effect, not state — it runs after the page renders.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`session-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusId, page]);

  if (!stateLoaded) {
    return <div className="label px-[22px] py-10 text-[10px] text-dim desk:px-[26px]">Loading</div>;
  }

  if (workoutLogs.length === 0) {
    return (
      <div className="px-[22px] py-10 desk:px-[26px]">
        <h1 className="num text-[56px] uppercase leading-[0.9]">Log</h1>
        <p className="label mt-5 text-[9.5px] font-normal leading-[1.8] text-dim">
          Nothing logged yet. Finish a session and it lands here.
        </p>
      </div>
    );
  }

  const pageCount = Math.ceil(workoutLogs.length / PAGE_SIZE);
  const currentPage = Math.min(page, pageCount - 1);
  const visible = workoutLogs.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  // Both false means the strip fits — no chevrons needed.
  const scrollable = edges.left || edges.right;

  const jumpTo = (workoutId: string) => {
    const index = workoutLogs.findIndex((workout) => workout.id === workoutId);
    if (index < 0) return;
    setPage(Math.floor(index / PAGE_SIZE));
    setFocusId(workoutId);
  };

  return (
    <>
      {/* ---------- Desktop: sticky quick-nav over a continuous log ---------- */}
      <div className="hidden desk:block">
        <div className="sticky top-[58px] z-10 flex border-b border-line bg-raised">
          {scrollable ? (
            <button
              disabled={!edges.left}
              onClick={() => nudgeNav(-1)}
              aria-label="Scroll sessions left"
              className="label shrink-0 border-r border-line px-3 text-[14px] text-ink-2 disabled:text-off hover:enabled:bg-hover hover:enabled:text-green"
            >
              ‹
            </button>
          ) : null}

          <div
            ref={quickNav}
            onScroll={readEdges}
            className="scrollbar-none flex flex-1 gap-px overflow-x-auto"
          >
            {workoutLogs.map((workout) => {
            const group = settings.workoutGroups.find((item) => item.id === workout.workoutType);
            const active = workout.id === focusId;
            const onPage = visible.some((item) => item.id === workout.id);
            return (
              <button
                key={workout.id}
                onClick={() => jumpTo(workout.id)}
                className={`min-w-[150px] shrink-0 border-b-2 px-4 py-3 text-left ${
                  active
                    ? "border-green bg-subtle"
                    : onPage
                      ? "border-line bg-transparent hover:bg-hover"
                      : "border-transparent hover:bg-hover"
                }`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className={`label text-[9px] ${active || onPage ? "text-ink" : "text-dim"}`}>
                    {group?.name ?? workout.workoutType}
                  </span>
                  <span className="num text-[18px] text-green">{minutesOf(workout) ?? "—"}</span>
                </div>
                  <div className="label mt-1 text-[8px] font-normal text-dim">{shortDate(workout.date)}</div>
                </button>
              );
            })}
          </div>

          {scrollable ? (
            <button
              disabled={!edges.right}
              onClick={() => nudgeNav(1)}
              aria-label="Scroll sessions right"
              className="label shrink-0 border-l border-line px-3 text-[14px] text-ink-2 disabled:text-off hover:enabled:bg-hover hover:enabled:text-green"
            >
              ›
            </button>
          ) : null}
        </div>

        <div className="px-[26px] py-6">
          <div className="mb-5 flex items-end justify-between gap-6">
            <h1 className="num text-[40px] uppercase leading-[0.9]">Log</h1>
            <span className="label text-[8.5px] font-normal text-dim">
              {workoutLogs.length} sessions · page {currentPage + 1} of {pageCount}
            </span>
          </div>

          {/* One column header for the whole run of sessions. */}
          <div className="label sticky top-[119px] z-[5] grid grid-cols-[1fr_120px_260px] items-center gap-4 border-y border-line bg-bg py-3 text-[9px] text-dim">
            <span>Exercise</span>
            <span className="text-right">Weight</span>
            <span className="text-right">Sets</span>
          </div>

          {visible.map((workout) => {
            const group = settings.workoutGroups.find((item) => item.id === workout.workoutType);
            const minutes = minutesOf(workout);
            return (
              <div
                key={workout.id}
                id={`session-${workout.id}`}
                className={`scroll-mt-[159px] border-b border-line ${
                  workout.id === focusId ? "border-l-2 border-l-green bg-subtle/40" : ""
                }`}
              >
                {/* Session band */}
                <div className="flex flex-wrap items-baseline justify-between gap-4 bg-panel px-3 py-2.5">
                  <div className="flex items-baseline gap-3">
                    <span className="num text-[20px] text-green">
                      {workoutLetter(group, workout.workoutType)}
                    </span>
                    <span className="label text-[10px] text-ink">{group?.name ?? workout.workoutType}</span>
                    <span className="label text-[8.5px] font-normal text-dim">{shortDate(workout.date)}</span>
                  </div>
                  <div className="flex items-baseline gap-5">
                    <span className="label text-[8.5px] font-normal text-dim">
                      <span className="num mr-1.5 text-[15px] text-ink">
                        {sessionVolume(workout).toLocaleString()}
                      </span>
                      {settings.units} moved
                    </span>
                    <span className="label text-[8.5px] font-normal text-dim">
                      <span className="num mr-1.5 text-[15px] text-ink">{minutes ?? "—"}</span>
                      min
                    </span>
                    <button
                      onClick={() => deleteWorkout(workout.id)}
                      className="text-[12px] leading-none text-off hover:text-amber"
                      aria-label="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {workout.exercises.map((exercise, index) => (
                  <div
                    key={`${workout.id}-${index}`}
                    className="grid grid-cols-[1fr_120px_260px] items-center gap-4 border-b border-line-faint px-3 py-3 last:border-b-0 hover:bg-hover"
                  >
                    <span className="label text-[11px] text-ink">{exercise.exerciseName}</span>
                    <span className="num text-right text-[22px]">{exercise.weight}</span>
                    <RepCells exercise={exercise} size="h-[26px] w-[26px]" />
                  </div>
                ))}
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-4 pt-5">
            <p className="label text-[8.5px] font-normal text-dim">
              Green cells hit the target reps · amber cells came up short.
            </p>
            {pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 0}
                  onClick={() => {
                    setFocusId(null);
                    setPage(currentPage - 1);
                  }}
                  className="label border border-line px-4 py-2.5 text-[9px] text-ink-2 disabled:text-off hover:enabled:border-green hover:enabled:text-green"
                >
                  ‹ Newer
                </button>
                <span className="label px-2 text-[8.5px] font-normal text-dim">
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => {
                    setFocusId(null);
                    setPage(currentPage + 1);
                  }}
                  className="label border border-line px-4 py-2.5 text-[9px] text-ink-2 disabled:text-off hover:enabled:border-green hover:enabled:text-green"
                >
                  Older ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- Mobile: the whole history as one list ---------- */}
      <div className="px-[22px] py-5 desk:hidden">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h1 className="num text-[56px] uppercase leading-[0.9]">Log</h1>
          <span className="label pb-2 text-[8.5px] font-normal text-dim">
            {workoutLogs.length} sessions
          </span>
        </div>

        {/* Paginated like the desktop list — 24 sessions is ~5,800px of scroll. */}
        {visible.map((workout) => {
          const group = settings.workoutGroups.find((item) => item.id === workout.workoutType);
          const minutes = minutesOf(workout);
          return (
            <div key={workout.id} className="border-b border-line py-5">
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-3">
                  <span className="num text-[20px] text-green">
                    {workoutLetter(group, workout.workoutType)}
                  </span>
                  <span className="label text-[10px] text-ink">
                    {new Date(workout.date).toLocaleDateString("en-US", { weekday: "long" })}
                  </span>
                  <span className="label text-[9px] font-normal text-dim">{shortDate(workout.date)}</span>
                </div>
                <span className="label text-[8.5px] font-normal text-dim">
                  {minutes !== null ? `${minutes} min` : `${workout.exercises.length} lifts`}
                </span>
              </div>

              {workout.exercises.map((exercise, index) => (
                <div
                  key={`${workout.id}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="label text-[10px] text-ink-2">{exercise.exerciseName}</span>
                    <span className="num text-[20px]">{exercise.weight}</span>
                  </div>
                  <RepCells exercise={exercise} size="h-[30px] w-[30px]" />
                </div>
              ))}

              {workout.workoutNote ? (
                <p className="label mt-3 text-[9px] font-normal leading-[1.7] text-dim">{workout.workoutNote}</p>
              ) : null}
            </div>
          );
        })}

        {pageCount > 1 ? (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="label h-[48px] flex-1 border border-line text-[10px] text-ink-2 disabled:text-off"
            >
              ‹ Newer
            </button>
            <span className="label px-1 text-[9px] font-normal text-dim">
              {currentPage + 1} / {pageCount}
            </span>
            <button
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              className="label h-[48px] flex-1 border border-line text-[10px] text-ink-2 disabled:text-off"
            >
              Older ›
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
