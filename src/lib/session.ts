import { computePlates } from "@/lib/plates";
import { generateWarmupSets, WARMUP_SET_COUNT } from "@/lib/warmup";
import { PlateInventoryItem } from "@/lib/types";

const SESSION_STATE_PREFIX = "git-swole-session-v1";

/** An in-progress session belongs to one account, like everything else local. */
export function sessionStateKey(userId: string | null | undefined) {
  return userId ? `${SESSION_STATE_PREFIX}:${userId}` : SESSION_STATE_PREFIX;
}

export type SessionExercise = {
  exerciseId: string;
  exerciseName: string;
  exerciseKey?: string;
  sets: number;
  reps: number;
  mode: string;
};

export type LoggedSet = { reps: number; done: boolean };

export type SessionState = {
  dayId: string;
  startedAt: number;
  /** Working weight per exercise, adjustable mid-session with the ±5 buttons. */
  weights: Record<string, number>;
  sets: Record<string, LoggedSet[]>;
  warm: Record<string, boolean[]>;
  rest: number;
  restLen: number;
  restReason: "hit" | "miss" | null;
  quoteIdx: number;
  /** Set when the lifter ends the session early — shows the review before saving. */
  review?: boolean;
  /** Set by "back to session view", so a finished queue stops forcing the review. */
  reviewClosed?: boolean;
};

export type QueueItem = {
  kind: "warm" | "work";
  exerciseId: string;
  exerciseIndex: number;
  setIndex: number;
  weight: number;
  reps: number;
  /** Working sets only; warm-up reps are fixed by the ramp. */
  targetReps?: number;
};

export const FINISH_HEADLINES = [
  "Rack it",
  "Bar's empty",
  "Logged",
  "That's the session",
  "Chalk off",
  "Done lifting",
];

export const FINISH_LINES = [
  "THE BAR DOES NOT CARE HOW YOU FELT WALKING IN.",
  "SMALL JUMPS, KEPT FOR YEARS, BEAT BIG JUMPS KEPT FOR WEEKS.",
  "YOU DID NOT NEGOTIATE WITH THE WEIGHT. GOOD.",
  "NOTHING CLEVER HAPPENED HERE. THAT IS THE POINT.",
  "THE NEXT SESSION IS ALREADY HEAVIER. EAT.",
  "SHOWING UP WAS THE HARD SET.",
];

export function createSessionState(
  dayId: string,
  exercises: SessionExercise[],
  weightFor: (exercise: SessionExercise) => number,
  startedAt: number,
  quoteIdx: number,
): SessionState {
  const weights: Record<string, number> = {};
  const sets: Record<string, LoggedSet[]> = {};
  const warm: Record<string, boolean[]> = {};

  for (const exercise of exercises) {
    weights[exercise.exerciseId] = weightFor(exercise);
    sets[exercise.exerciseId] = Array.from({ length: exercise.sets }, () => ({
      reps: exercise.reps,
      done: false,
    }));
    // Only barbell work gets a ramp.
    warm[exercise.exerciseId] =
      exercise.mode === "BB" ? Array.from({ length: WARMUP_SET_COUNT }, () => false) : [];
  }

  return { dayId, startedAt, weights, sets, warm, rest: 0, restLen: 0, restReason: null, quoteIdx, review: false, reviewClosed: false };
}

/**
 * Rebuilt on every render, never stored: every incomplete set in program order.
 * Warm-ups for an exercise come before its working sets, and an exercise is
 * finished entirely before the next one starts.
 */
export function buildQueue(
  exercises: SessionExercise[],
  state: SessionState,
  barbellWeight: number,
): QueueItem[] {
  const queue: QueueItem[] = [];

  exercises.forEach((exercise, exerciseIndex) => {
    const working = state.weights[exercise.exerciseId] ?? 0;
    const ramp = generateWarmupSets(working, barbellWeight);

    (state.warm[exercise.exerciseId] ?? []).forEach((checked, setIndex) => {
      if (!checked) {
        queue.push({
          kind: "warm",
          exerciseId: exercise.exerciseId,
          exerciseIndex,
          setIndex,
          weight: ramp[setIndex]?.weight ?? barbellWeight,
          reps: ramp[setIndex]?.reps ?? 5,
        });
      }
    });

    (state.sets[exercise.exerciseId] ?? []).forEach((set, setIndex) => {
      if (!set.done) {
        queue.push({
          kind: "work",
          exerciseId: exercise.exerciseId,
          exerciseIndex,
          setIndex,
          weight: working,
          reps: set.reps,
          targetReps: exercise.reps,
        });
      }
    });
  });

  return queue;
}

export function countProgress(exercises: SessionExercise[], state: SessionState) {
  let done = 0;
  let total = 0;
  for (const exercise of exercises) {
    const warm = state.warm[exercise.exerciseId] ?? [];
    const sets = state.sets[exercise.exerciseId] ?? [];
    total += warm.length + sets.length;
    done += warm.filter(Boolean).length + sets.filter((set) => set.done).length;
  }
  return { done, total };
}

/** Volume counts working sets only — warm-ups never contribute. */
export function sessionVolume(exercises: SessionExercise[], state: SessionState) {
  return exercises.reduce((sum, exercise) => {
    const weight = state.weights[exercise.exerciseId] ?? 0;
    return (
      sum +
      (state.sets[exercise.exerciseId] ?? [])
        .filter((set) => set.done)
        .reduce((setSum, set) => setSum + set.reps * weight, 0)
    );
  }, 0);
}

export function plateLine(
  weight: number,
  barbellWeight: number,
  inventory: PlateInventoryItem[],
  units: string,
) {
  const math = computePlates(weight, barbellWeight, inventory);
  if (math.barOnly) {
    return { text: `BAR ONLY · ${barbellWeight}`, short: false, plates: math.plates };
  }
  const base = `PER SIDE · ${math.plates.join(" + ")}`;
  return {
    text: math.short > 0 ? `${base} · ${math.short} ${units.toUpperCase()} SHORT` : base,
    short: math.short > 0,
    plates: math.plates,
  };
}

export function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
