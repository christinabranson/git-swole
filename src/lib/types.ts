export type ExerciseKey =
  | "squat"
  | "bench_press"
  | "barbell_row"
  | "overhead_press"
  | "deadlift";

export type WorkoutType = string;
export type WeightUnit = "lb" | "kg";
export type WorkoutSummary = "up" | "down";
export type ExerciseOwnership = "global" | "user";
/** BB progresses by `inc`; BW/TIME/DIST are logged but never progressed. */
export type ExerciseMode = "BB" | "BW" | "TIME" | "DIST";

export type ExerciseDefinition = {
  key: ExerciseKey;
  name: string;
  muscleGroup: string;
  instructions: string;
  imageUrl?: string;
};

export type ExerciseCatalogItem = {
  id: string;
  slug: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  movementPattern: string;
  description: string;
  ownership: ExerciseOwnership;
};

export type PlateInventoryItem = {
  weight: number;
  pairs: number;
};

export type ProgramExercise = {
  exerciseId: string;
  sets: number;
  reps: number;
  /** Weight added after a clean session. Applies to BB items only. */
  inc: number;
  mode: ExerciseMode;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: ProgramExercise[];
};

export type WorkoutSetResult = {
  setNumber: number;
  targetReps: number;
  completedReps: number;
  completed: boolean;
  skipped: boolean;
};

export type WorkoutExerciseLog = {
  exerciseKey?: ExerciseKey;
  exerciseName: string;
  exerciseId?: string;
  weight: number;
  setResults: WorkoutSetResult[];
  note?: string;
};

export type WorkoutLog = {
  id: string;
  userId: string;
  date: string;
  /** Wall-clock length of the session. Absent on imported or pre-existing logs. */
  durationSeconds?: number;
  workoutType: WorkoutType;
  workoutNote?: string;
  workoutSummary?: WorkoutSummary;
  exercises: WorkoutExerciseLog[];
};

export type ProgressionState = {
  nextWorkoutType: WorkoutType;
  currentWeights: Record<ExerciseKey, number>;
  failStreaks: Record<ExerciseKey, number>;
};

export type AppSettings = {
  units: WeightUnit;
  weightIncrement: 2.5 | 5 | 10;
  /** Rest length after a set that hit its target reps. */
  restAfterHit: number;
  /** Rest length after a set that came up short — longer on purpose. */
  restAfterMiss: number;
  barbellWeight: number;
  plateInventory: PlateInventoryItem[];
  workoutGroups: WorkoutTemplate[];
};

export type PersonalRecord = {
  exerciseKey: ExerciseKey;
  maxWeight: number;
  bestVolume: number;
  bestSetReps: number;
};

export type WorkoutAppState = {
  settings: AppSettings;
  progression: ProgressionState;
  workoutLogs: WorkoutLog[];
};
