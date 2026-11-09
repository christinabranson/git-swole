"use client";

import { useState } from "react";
import { useWorkoutApp } from "@/context/workout-app-context";
import { EXERCISE_KEY_BY_NAME, MODE_LABELS } from "@/lib/program";
import { ExerciseMode, ProgramExercise, WorkoutTemplate } from "@/lib/types";
import { workoutLetter } from "@/lib/week";

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * A typed name that matches a known lift keeps that lift's id, so progression and
 * history keep tracking it. Anything else becomes a slug of what was typed.
 */
function resolveExerciseId(name: string) {
  return EXERCISE_KEY_BY_NAME[name.trim().toLowerCase()] ?? slugify(name) ?? "new-exercise";
}

const MODE_COLOUR: Record<ExerciseMode, string> = {
  BB: "border-green text-green",
  BW: "border-line text-dim",
  TIME: "border-amber-line text-amber",
  DIST: "border-amber-line text-amber",
};

export default function ProgramScreen() {
  const { settings, updateSettings, stateLoaded, exerciseCatalog } = useWorkoutApp();
  const [dayId, setDayId] = useState<string | null>(null);

  if (!stateLoaded) {
    return <div className="label px-[22px] py-10 text-[10px] text-dim desk:px-[26px]">Loading</div>;
  }

  const groups = settings.workoutGroups;
  const activeId = dayId ?? groups[0]?.id;
  const active = groups.find((group) => group.id === activeId);

  const writeDay = (next: WorkoutTemplate) => {
    updateSettings({
      workoutGroups: groups.map((group) => (group.id === next.id ? next : group)),
    });
  };

  const patchRow = (index: number, patch: Partial<ProgramExercise>) => {
    if (!active) return;
    writeDay({
      ...active,
      exercises: active.exercises.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    });
  };

  const displayName = (exerciseId: string) =>
    exerciseCatalog.find((item) => item.id === exerciseId || item.slug === exerciseId)?.name ??
    exerciseId.replace(/[-_]/g, " ");

  return (
    <div className="px-[22px] py-5 desk:px-[26px]">
      <h1 className="num mb-6 text-[56px] uppercase leading-[0.9] desk:text-[64px]">Program</h1>

      {/* Day switcher */}
      <div className="scrollbar-none -mx-[22px] mb-6 flex gap-px overflow-x-auto border-y border-line px-[22px] desk:mx-0 desk:px-0">
        {groups.map((group) => {
          const isActive = group.id === activeId;
          return (
            <button
              key={group.id}
              onClick={() => setDayId(group.id)}
              className={`min-w-[170px] shrink-0 border-b-2 px-4 py-3 text-left ${
                isActive ? "border-green bg-subtle" : "border-transparent hover:bg-hover"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={`label text-[9px] ${isActive ? "text-ink" : "text-dim"}`}>{group.name}</span>
                <span className="num text-[20px] text-green">{workoutLetter(group)}</span>
              </div>
              <div className="label mt-1 text-[8px] font-normal text-dim">{group.exercises.length} lifts</div>
            </button>
          );
        })}
      </div>

      {active ? (
        <>
          <div className="label hidden grid-cols-[32px_1fr_70px_70px_70px_80px_40px] items-center gap-3 border-b border-line py-3 text-[9px] text-dim desk:grid">
            <span>#</span>
            <span>Exercise</span>
            <span>Sets</span>
            <span>Reps</span>
            <span>Step</span>
            <span>Mode</span>
            <span />
          </div>

          {active.exercises.map((row, index) => (
            <div
              key={`${row.exerciseId}-${index}`}
              className="grid grid-cols-[28px_1fr_40px] items-center gap-3 border-b border-line-faint py-3 desk:grid-cols-[32px_1fr_70px_70px_70px_80px_40px] desk:hover:bg-hover"
            >
              <span className="num text-[13px] text-dim">{String(index + 1).padStart(2, "0")}</span>

              <input
                defaultValue={displayName(row.exerciseId)}
                onBlur={(event) => patchRow(index, { exerciseId: resolveExerciseId(event.target.value) })}
                className="label border-transparent bg-transparent px-0 py-2 text-[11px] text-ink focus:border-green focus:px-2"
              />

              <div className="col-span-2 flex items-center gap-2 desk:contents">
                {(["sets", "reps"] as const).map((field) => (
                  <input
                    key={field}
                    inputMode="numeric"
                    value={row[field]}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      patchRow(index, { [field]: Math.max(1, Number(digits || 1)) });
                    }}
                    className="num w-[56px] border-transparent px-0 py-2 text-[20px] text-ink focus:border-green focus:px-2 desk:w-[60px]"
                  />
                ))}
                <input
                  inputMode="decimal"
                  value={row.inc}
                  onChange={(event) => {
                    const cleaned = event.target.value.replace(/[^0-9.]/g, "");
                    patchRow(index, { inc: Number(cleaned || 0) });
                  }}
                  className="num w-[56px] border-transparent px-0 py-2 text-[20px] text-dim focus:border-green focus:px-2 desk:w-[60px]"
                />
                <button
                  onClick={() => {
                    const next = MODE_LABELS[(MODE_LABELS.indexOf(row.mode) + 1) % MODE_LABELS.length];
                    patchRow(index, { mode: next });
                  }}
                  className={`label border px-2 py-1.5 text-[8.5px] ${MODE_COLOUR[row.mode]}`}
                >
                  {row.mode}
                </button>
              </div>

              <button
                onClick={() =>
                  writeDay({ ...active, exercises: active.exercises.filter((_, i) => i !== index) })
                }
                className="justify-self-end text-[13px] leading-none text-off hover:text-amber"
                aria-label="Delete row"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={() =>
              writeDay({
                ...active,
                exercises: [
                  ...active.exercises,
                  { exerciseId: "new-exercise", sets: 3, reps: 8, inc: 5, mode: "BB" },
                ],
              })
            }
            className="label mt-5 border border-line px-5 py-3.5 text-[9.5px] text-ink-2 hover:border-green hover:text-green"
          >
            + Add exercise
          </button>
        </>
      ) : null}
    </div>
  );
}
