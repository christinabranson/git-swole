/**
 * Dev-only seed data. Loaded exclusively through a dynamic import behind
 * `IS_DEV_AUTH`, so it is code-split into its own chunk (~9 KB, including the
 * exercise catalog JSON). That chunk is still emitted by a production build, but
 * `IS_DEV_AUTH` is false there, so no production browser ever requests it.
 *
 * Nothing is seeded automatically: every account starts empty. This is reached
 * only through the console helpers below, when you want data to look at.
 *
 * Generation is deterministic (no Math.random) so the History and Progress screens
 * look identical between reloads — useful when comparing UI work side by side.
 */

// No alias exists for files outside src/, so this one import is relative.
import globalExercises from "../../data/global-exercises.json";
import { DEFAULT_WORKOUT_A, DEFAULT_WORKOUT_B, EXERCISE_BY_KEY, STARTING_WEIGHTS } from "@/lib/program";
import { DEFAULT_APP_STATE, localStateKey } from "@/lib/storage";
import {
  ExerciseCatalogItem,
  ExerciseKey,
  WorkoutAppState,
  WorkoutExerciseLog,
  WorkoutLog,
  WorkoutSetResult,
  WorkoutTemplate,
} from "@/lib/types";

const SESSION_COUNT = 24; // ~8 weeks at 3 sessions per week
const DAY_MS = 24 * 60 * 60 * 1000;
// Sessions that should log a failed lift, so deload/fail-streak UI has something to show.
const FAILING_SESSIONS = new Set([12, 13, 20]);

export function buildDevExerciseCatalog(): ExerciseCatalogItem[] {
  return globalExercises.map((exercise) => ({
    id: exercise.slug,
    slug: exercise.slug,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    equipment: exercise.equipment,
    movementPattern: exercise.movementPattern,
    description: exercise.description,
    ownership: "global" as const,
  }));
}

function buildSetResults(sets: number, reps: number, failed: boolean): WorkoutSetResult[] {
  return Array.from({ length: sets }, (_, index) => {
    const setNumber = index + 1;
    // A failed lift still completes the early sets, then falls short on the last two.
    const shortfall = failed && setNumber > sets - 2;
    const completedReps = shortfall ? Math.max(1, reps - 2) : reps;
    return {
      setNumber,
      targetReps: reps,
      completedReps,
      completed: !shortfall,
      skipped: false,
    };
  });
}

function buildDevState(now: number): WorkoutAppState {
  const weights: Record<ExerciseKey, number> = { ...STARTING_WEIGHTS };
  const failStreaks: Record<ExerciseKey, number> = {
    squat: 0,
    bench_press: 0,
    barbell_row: 0,
    overhead_press: 0,
    deadlift: 0,
  };
  const logs: WorkoutLog[] = [];

  for (let session = 0; session < SESSION_COUNT; session += 1) {
    const template: WorkoutTemplate = session % 2 === 0 ? DEFAULT_WORKOUT_A : DEFAULT_WORKOUT_B;
    const sessionFails = FAILING_SESSIONS.has(session);
    const exercises: WorkoutExerciseLog[] = [];

    template.exercises.forEach((programExercise, exerciseIndex) => {
      const exerciseKey = programExercise.exerciseId as ExerciseKey;
      if (!EXERCISE_BY_KEY[exerciseKey]) {
        return;
      }
      // Only the last lift of a failing session misses, which is the realistic case.
      const failed = sessionFails && exerciseIndex === template.exercises.length - 1;
      const weight = weights[exerciseKey];

      exercises.push({
        exerciseKey,
        exerciseName: EXERCISE_BY_KEY[exerciseKey].name,
        exerciseId: exerciseKey,
        weight,
        setResults: buildSetResults(programExercise.sets, programExercise.reps, failed),
      });

      if (failed) {
        failStreaks[exerciseKey] += 1;
        if (failStreaks[exerciseKey] >= 3) {
          weights[exerciseKey] = Number((weight * 0.9).toFixed(2));
          failStreaks[exerciseKey] = 0;
        }
        return;
      }

      failStreaks[exerciseKey] = 0;
      weights[exerciseKey] = weight + (exerciseKey === "deadlift" ? 10 : 5);
    });

    // Sessions land every other day, oldest first, ending today.
    const daysAgo = (SESSION_COUNT - 1 - session) * 2;
    logs.push({
      id: `dev-workout-${session + 1}`,
      userId: "local",
      date: new Date(now - daysAgo * DAY_MS).toISOString(),
      // Deterministic 34–46 min, so the Log screen has real durations to show.
      durationSeconds: (34 + (session % 7) * 2) * 60,
      workoutType: template.id,
      workoutSummary: sessionFails ? "down" : "up",
      workoutNote: sessionFails ? "Grinder. Left the last set short." : undefined,
      exercises,
    });
  }

  return {
    settings: { ...DEFAULT_APP_STATE.settings },
    progression: {
      // The next session is whatever did not just run.
      nextWorkoutType: SESSION_COUNT % 2 === 0 ? DEFAULT_WORKOUT_A.id : DEFAULT_WORKOUT_B.id,
      currentWeights: weights,
      failStreaks,
    },
    // The app renders history newest first.
    workoutLogs: logs.reverse(),
  };
}

export function seedDevState(userId: string) {
  window.localStorage.setItem(localStateKey(userId), JSON.stringify(buildDevState(Date.now())));
}

export function resetDevState(userId: string) {
  window.localStorage.removeItem(localStateKey(userId));
}

/** Console helpers for reshaping local state mid-overhaul without digging through devtools. */
export function installDevHelpers(userId: string) {
  if (typeof window === "undefined") {
    return;
  }
  Object.assign(window, {
    gitSwoleDev: {
      seed: () => {
        seedDevState(userId);
        window.location.reload();
      },
      reset: () => {
        resetDevState(userId);
        window.location.reload();
      },
      empty: () => {
        window.localStorage.setItem(localStateKey(userId), JSON.stringify(DEFAULT_APP_STATE));
        window.location.reload();
      },
    },
  });
}
