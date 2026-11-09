import { STARTING_WEIGHTS } from "@/lib/program";
import { ExerciseKey, ProgressionState, WorkoutExerciseLog } from "@/lib/types";

const INITIAL_FAIL_STREAKS: Record<ExerciseKey, number> = {
  squat: 0,
  bench_press: 0,
  barbell_row: 0,
  overhead_press: 0,
  deadlift: 0,
};

export const DEFAULT_PROGRESSION: ProgressionState = {
  nextWorkoutType: "workout-a",
  currentWeights: { ...STARTING_WEIGHTS },
  failStreaks: { ...INITIAL_FAIL_STREAKS },
};

/**
 * The program row's own `inc` wins when the caller supplies one. Without it we fall
 * back to the old global-increment behaviour (deadlift moves in double steps).
 */
function getIncrement(
  exerciseKey: ExerciseKey,
  baseIncrement: number,
  incByExerciseId?: Record<string, number>,
) {
  const programIncrement = incByExerciseId?.[exerciseKey];
  if (programIncrement !== undefined && Number.isFinite(programIncrement)) {
    return programIncrement;
  }
  return exerciseKey === "deadlift" ? baseIncrement * 2 : baseIncrement;
}

function didExerciseSucceed(exercise: WorkoutExerciseLog) {
  return exercise.setResults.every((setResult) => {
    if (setResult.skipped) {
      return false;
    }
    return setResult.completed && setResult.completedReps >= setResult.targetReps;
  });
}

export function getNextWorkoutType(currentType: string): string {
  return currentType === "workout-a" ? "workout-b" : "workout-a";
}

export function applyWorkoutProgression(
  previous: ProgressionState,
  exerciseLogs: WorkoutExerciseLog[],
  baseIncrement: number,
  nextWorkoutTypeOverride?: string,
  incByExerciseId?: Record<string, number>,
): ProgressionState {
  const nextWeights = { ...previous.currentWeights };
  const nextFailStreaks = { ...previous.failStreaks };

  for (const exerciseLog of exerciseLogs) {
    if (!exerciseLog.exerciseKey) {
      continue;
    }
    const succeeded = didExerciseSucceed(exerciseLog);
    const key = exerciseLog.exerciseKey;

    if (succeeded) {
      const increment = getIncrement(key, baseIncrement, incByExerciseId);
      const basedOnPerformedWeight = exerciseLog.weight + increment;
      nextWeights[key] = Number((Math.max(nextWeights[key] + increment, basedOnPerformedWeight)).toFixed(2));
      nextFailStreaks[key] = 0;
      continue;
    }

    nextFailStreaks[key] += 1;

    if (nextFailStreaks[key] >= 3) {
      nextWeights[key] = Number((nextWeights[key] * 0.9).toFixed(2));
      nextFailStreaks[key] = 0;
    }
  }

  return {
    currentWeights: nextWeights,
    failStreaks: nextFailStreaks,
    nextWorkoutType: nextWorkoutTypeOverride ?? getNextWorkoutType(previous.nextWorkoutType),
  };
}
