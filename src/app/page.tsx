"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useWorkoutApp } from "@/context/workout-app-context";
import { useToday } from "@/lib/use-now";
import { buildWeekStrip, workoutLetter } from "@/lib/week";
import { WARMUP_SET_COUNT } from "@/lib/warmup";

function formatWeight(weight: number) {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
}

export default function TodayScreen() {
  const {
    nextWorkoutExercises,
    nextWorkoutName,
    nextWorkoutType,
    workoutLogs,
    settings,
    stateLoaded,
    currentWeights,
  } = useWorkoutApp();
  // Null during SSR, and day-stable afterwards, so this screen is not re-rendering once a second.
  const now = useToday();

  const week = useMemo(
    () =>
      now
        ? buildWeekStrip(workoutLogs, settings.workoutGroups, nextWorkoutType, now)
        : { days: [], rangeLabel: "" },
    [now, workoutLogs, settings.workoutGroups, nextWorkoutType],
  );

  const weightFor = useCallback(
    (key?: string) => (key ? (currentWeights[key as keyof typeof currentWeights] ?? 0) : 0),
    [currentWeights],
  );

  const plan = useMemo(() => {
    const totalSets = nextWorkoutExercises.reduce((sum, item) => sum + item.sets, 0);
    const plannedVolume = nextWorkoutExercises.reduce(
      (sum, item) => sum + (item.mode === "BB" ? item.sets * item.reps * weightFor(item.exerciseKey) : 0),
      0,
    );
    // Working sets plus the three-set ramp per barbell lift, ~2.4 min a set.
    const rampSets = nextWorkoutExercises.filter((item) => item.mode === "BB").length * WARMUP_SET_COUNT;
    return {
      totalSets,
      plannedVolume,
      estimatedMinutes: Math.round(((totalSets + rampSets) * 2.4) / 5) * 5,
    };
  }, [nextWorkoutExercises, weightFor]);

  /** Last time this lift was trained: its weight, and whether it was clean. */
  function lastSession(exerciseKey?: string) {
    if (!exerciseKey) return null;
    for (const log of workoutLogs) {
      const entry = log.exercises.find((item) => item.exerciseKey === exerciseKey);
      if (entry) {
        const clean = entry.setResults.every(
          (set) => !set.skipped && set.completed && set.completedReps >= set.targetReps,
        );
        const topReps = Math.max(...entry.setResults.map((set) => set.completedReps));
        return { weight: entry.weight, reps: topReps, clean };
      }
    }
    return null;
  }

  if (!stateLoaded) {
    return <div className="label px-[22px] py-10 text-[10px] text-dim desk:px-[26px]">Loading</div>;
  }

  const sessionCount = workoutLogs.length;
  const weekStreak = week.days.filter((day) => day.completed).length;
  const letter = workoutLetter(
    settings.workoutGroups.find((group) => group.id === nextWorkoutType),
    nextWorkoutType,
  );

  return (
    <div className="px-[22px] py-5 desk:px-[26px]">
      {/* Week strip */}
      <div className="label mb-3 text-[9px] text-dim">
        This week
        {week.rangeLabel ? <span className="ml-2 font-normal">· {week.rangeLabel}</span> : null}
      </div>
      <div className="mb-8 grid grid-cols-7 gap-1.5">
        {week.days.map((day) => {
          // Completed fills the cell; today rings it. A day can be both.
          /*
           * Each branch carries its own border width; a shared `border` on the
           * element used to beat the wider value in the cascade.
           *
           * The handoff asks for 1.5px on today, but Chrome rounds both
           * border-width and outline-width to whole pixels, so 1.5px paints as 1px
           * and today reads exactly as heavy as the hairlines around it. 2px keeps
           * the intent — today is visibly heavier — and renders predictably.
           */
          const filled = day.completed
            ? "border border-green bg-green text-bg"
            : day.rest
              ? "border border-transparent bg-panel text-dim"
              : day.isToday
                ? "border-2 border-green bg-transparent text-green"
                : "border border-line bg-transparent text-faint";
          // The outline-only case already reads as today through its border.
          const ringed = day.isToday && (day.completed || day.rest);

          return (
            <div key={day.key} className="flex flex-col items-center gap-1.5">
              <span className="label text-[8px] text-dim">{day.dayLetter}</span>
              <div
                className={`flex h-[44px] w-full items-center justify-center ${filled} ${
                  ringed ? "outline-2 outline-green outline-offset-2" : ""
                }`}
              >
                {day.rest ? (
                  <span className="label text-[8.5px]">Rest</span>
                ) : (
                  <span className="num text-[20px]">{day.letter ?? ""}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Workout header */}
      <div className="mb-2 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="label mb-2 text-[9px] text-green">
            Today {now ? `· ${now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : ""}
          </div>
          <h1 className="num text-[56px] uppercase leading-[0.9] desk:text-[64px]">{nextWorkoutName}</h1>
          <div className="label mt-3 text-[9px] font-normal text-dim">
            {nextWorkoutExercises.length} lifts · {plan.totalSets} sets ·{" "}
            {plan.plannedVolume.toLocaleString()} {settings.units} planned · est {plan.estimatedMinutes} min
          </div>
        </div>

        {/* Desktop stat columns */}
        <div className="hidden gap-10 desk:flex">
          {[
            { value: sessionCount, label: "Sessions" },
            { value: weekStreak, label: "This week", accent: true },
            { value: plan.estimatedMinutes, label: "Avg min" },
          ].map((stat) => (
            <div key={stat.label} className="text-right">
              <div className={`num text-[34px] ${stat.accent ? "text-green" : "text-ink"}`}>{stat.value}</div>
              <div className="label mt-1.5 text-[8.5px] text-dim">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Planned lifts */}
      <div className="mt-7 border-t border-line">
        <div className="label hidden grid-cols-[32px_1fr_90px_110px_90px_70px] items-center gap-3 border-b border-line py-3 text-[9px] text-dim desk:grid">
          <span>#</span>
          <span>Exercise</span>
          <span>Scheme</span>
          <span>Last</span>
          <span className="text-right">Today</span>
          <span className="text-right">Change</span>
        </div>

        {nextWorkoutExercises.map((exercise, index) => {
          const last = lastSession(exercise.exerciseKey);
          const weight = weightFor(exercise.exerciseKey);
          const progresses = exercise.mode === "BB";
          const change = !progresses ? null : last && !last.clean ? "hold" : `+${exercise.inc}`;

          return (
            <div
              key={`${exercise.exerciseId}-${index}`}
              className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-line-faint py-4 desk:grid-cols-[32px_1fr_90px_110px_90px_70px] desk:hover:bg-hover"
            >
              <span className="num text-[13px] text-dim">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="label text-[11px] text-ink">{exercise.exerciseName}</div>
                <div className="label mt-1.5 text-[8.5px] font-normal text-dim desk:hidden">
                  {exercise.sets}×{exercise.reps}
                  {progresses ? ` +${exercise.inc}` : ` · ${exercise.mode}`}
                  {last ? ` · last ${formatWeight(last.weight)}` : ""}
                </div>
              </div>
              <span className="label hidden text-[9px] font-normal text-dim desk:block">
                {exercise.sets}×{exercise.reps}
                {progresses ? ` +${exercise.inc}` : ""}
              </span>
              <span className="label hidden text-[9px] font-normal text-dim desk:block">
                {last ? `${formatWeight(last.weight)} × ${last.reps}` : "—"}
              </span>
              <div className="text-right">
                <span className="num text-[26px]">{progresses ? formatWeight(weight) : exercise.reps}</span>
                {!progresses ? <span className="label ml-1 text-[8px] text-dim">{exercise.mode}</span> : null}
              </div>
              <span
                className={`label hidden text-right text-[9px] desk:block ${
                  change === "hold" ? "text-dim" : change ? "text-green" : "text-off"
                }`}
              >
                {change ?? "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 desk:flex-row">
        <Link
          href="/workout"
          className="label flex h-[58px] items-center justify-between bg-green px-6 text-[13px] text-bg desk:h-[52px] desk:w-auto desk:gap-10"
        >
          <span>Start workout {letter}</span>
          <span>→</span>
        </Link>
        <Link
          href="/program"
          className="label hidden h-[52px] items-center justify-center border border-line px-6 text-[11px] text-ink-2 hover:border-green hover:text-green desk:flex"
        >
          Edit program
        </Link>
      </div>
    </div>
  );
}
