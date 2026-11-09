import { ExerciseDefinition, ExerciseKey, WorkoutTemplate } from "@/lib/types";

export const EXERCISES: ExerciseDefinition[] = [
  {
    key: "squat",
    name: "Squat",
    muscleGroup: "Legs",
    instructions: "Brace core, break at hips and knees, drive up through mid-foot.",
  },
  {
    key: "bench_press",
    name: "Bench Press",
    muscleGroup: "Chest",
    instructions: "Set shoulder blades, touch lower chest, press with stable bar path.",
  },
  {
    key: "barbell_row",
    name: "Barbell Row",
    muscleGroup: "Back",
    instructions: "Hinge torso, keep back tight, pull bar to lower ribs with control.",
  },
  {
    key: "overhead_press",
    name: "Overhead Press",
    muscleGroup: "Shoulders",
    instructions: "Squeeze glutes, press bar overhead in a vertical path.",
  },
  {
    key: "deadlift",
    name: "Deadlift",
    muscleGroup: "Posterior Chain",
    instructions: "Pull slack, push floor away, lock out with hips and lats tight.",
  },
];

export const EXERCISE_BY_KEY = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.key, exercise]),
) as Record<ExerciseKey, ExerciseDefinition>;

export const EXERCISE_KEY_BY_NAME = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.name.toLowerCase(), exercise.key]),
) as Record<string, ExerciseKey>;

/**
 * Three days rotating A → B → A → C. Only BB items carry `inc` into progression;
 * BW/TIME/DIST items are logged but never progressed.
 */
export const DEFAULT_WORKOUT_A: WorkoutTemplate = {
  id: "workout-a",
  name: "Workout A",
  exercises: [
    { exerciseId: "squat", sets: 5, reps: 5, inc: 5, mode: "BB" },
    { exerciseId: "bench_press", sets: 5, reps: 5, inc: 5, mode: "BB" },
    { exerciseId: "barbell_row", sets: 5, reps: 5, inc: 5, mode: "BB" },
    { exerciseId: "chin-up", sets: 3, reps: 8, inc: 0, mode: "BW" },
  ],
};

export const DEFAULT_WORKOUT_B: WorkoutTemplate = {
  id: "workout-b",
  name: "Workout B",
  exercises: [
    { exerciseId: "squat", sets: 5, reps: 5, inc: 5, mode: "BB" },
    { exerciseId: "overhead_press", sets: 5, reps: 5, inc: 5, mode: "BB" },
    { exerciseId: "deadlift", sets: 1, reps: 5, inc: 10, mode: "BB" },
  ],
};

export const DEFAULT_WORKOUT_C: WorkoutTemplate = {
  id: "workout-c",
  name: "Workout C",
  exercises: [
    { exerciseId: "row-erg", sets: 1, reps: 2000, inc: 0, mode: "DIST" },
    { exerciseId: "farmer-carry", sets: 4, reps: 40, inc: 5, mode: "TIME" },
  ],
};

export const DEFAULT_WORKOUT_GROUPS: WorkoutTemplate[] = [
  DEFAULT_WORKOUT_A,
  DEFAULT_WORKOUT_B,
  DEFAULT_WORKOUT_C,
];

/**
 * A → B → A → C. Every other day is A, and the non-A days alternate, so the next
 * day is not a function of the current day alone: after an A it depends on whether
 * B or C ran most recently. `previousDayIds` is the history, most recent first.
 */
export function getNextDayId(
  currentId: string,
  groups: WorkoutTemplate[],
  previousDayIds: string[] = [],
): string {
  const ids = new Set(groups.map((group) => group.id));
  // Exactly the three default days. Once a day is added or removed the program is
  // the user's own, and A → B → A → C would skip whatever they added.
  const isDefaultProgram =
    groups.length === 3 && ids.has("workout-a") && ids.has("workout-b") && ids.has("workout-c");

  // Custom programs fall back to a plain cycle through whatever days exist.
  if (!isDefaultProgram) {
    const index = groups.findIndex((group) => group.id === currentId);
    return groups[(index + 1) % Math.max(1, groups.length)]?.id ?? currentId;
  }

  if (currentId !== "workout-a") {
    return "workout-a";
  }

  const lastAlternate = previousDayIds.find((id) => id === "workout-b" || id === "workout-c");
  return lastAlternate === "workout-b" ? "workout-c" : "workout-b";
}

/**
 * Id for a new day: `workout-<letter>`, using the first letter not taken by an
 * existing day *or by any logged workout*. History keys on this id, so reusing a
 * deleted day's id would hand its old sessions to the new day. The letter is what
 * the badges show (see `workoutLetter`).
 */
export function newDayId(groups: WorkoutTemplate[], loggedDayIds: string[]): string {
  const taken = new Set([...groups.map((group) => group.id), ...loggedDayIds]);
  for (const letter of "abcdefghijklmnopqrstuvwxyz") {
    const id = `workout-${letter}`;
    if (!taken.has(id)) return id;
  }
  return `workout-${Date.now().toString(36)}`;
}

export const STARTING_WEIGHTS: Record<ExerciseKey, number> = {
  squat: 45,
  bench_press: 45,
  barbell_row: 65,
  overhead_press: 45,
  deadlift: 95,
};

export const MODE_LABELS = ["BB", "BW", "TIME", "DIST"] as const;
