import { DEFAULT_PROGRESSION } from "@/lib/progression";
import {
  ExerciseCatalogItem,
  PlateInventoryItem,
  ExerciseKey,
  WorkoutAppState,
  WorkoutLog,
  WorkoutSummary,
} from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";
import { EXERCISE_BY_KEY } from "@/lib/program";
import { DEFAULT_WORKOUT_GROUPS } from "@/lib/program";
import { DEFAULT_PLATE_INVENTORY } from "@/lib/plates";

const LOCAL_STATE_PREFIX = "git-swole-state-v1";

/**
 * Local state is namespaced per user. Without this, signing out and back in as
 * somebody else showed the previous account's history — there was one global key
 * that every user shared.
 */
export function localStateKey(userId: string | null | undefined) {
  return userId ? `${LOCAL_STATE_PREFIX}:${userId}` : LOCAL_STATE_PREFIX;
}
export type SyncResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export const DEFAULT_APP_STATE: WorkoutAppState = {
  settings: {
    units: "lb",
    weightIncrement: 5,
    restAfterHit: 90,
    restAfterMiss: 300,
    barbellWeight: 45,
    plateInventory: DEFAULT_PLATE_INVENTORY,
    workoutGroups: DEFAULT_WORKOUT_GROUPS,
  },
  progression: DEFAULT_PROGRESSION,
  workoutLogs: [],
};

function serializeWorkoutNote(note?: string, summary?: WorkoutSummary) {
  if (!summary) {
    return note ?? null;
  }
  const normalizedNote = note?.trim();
  return `[[SUMMARY:${summary.toUpperCase()}]]${normalizedNote ? `\n${normalizedNote}` : ""}`;
}

function parseWorkoutNote(raw: string | null): { workoutNote?: string; workoutSummary?: WorkoutSummary } {
  if (!raw) {
    return {};
  }

  const match = raw.match(/^\[\[SUMMARY:(UP|DOWN)\]\](?:\n([\s\S]*))?$/);
  if (!match) {
    return { workoutNote: raw };
  }

  const summary = match[1].toLowerCase() as WorkoutSummary;
  const noteBody = match[2]?.trim();
  return {
    workoutSummary: summary,
    workoutNote: noteBody || undefined,
  };
}

function migrateLegacyWorkoutGroups(settings: Partial<WorkoutAppState["settings"]> | undefined) {
  if (!settings) {
    return DEFAULT_APP_STATE.settings.workoutGroups;
  }

  if (Array.isArray(settings.workoutGroups) && settings.workoutGroups.length > 0) {
    const normalized = settings.workoutGroups
      .filter((group): group is NonNullable<typeof settings.workoutGroups>[number] => !!group && !!group.id)
      .map((group) => ({
        id: group.id,
        name: group.name?.trim() || "Workout",
        exercises: (group.exercises ?? [])
          .filter((exercise) => !!exercise?.exerciseId)
          .map((exercise) => ({
            exerciseId: exercise.exerciseId,
            sets: Math.max(1, Number(exercise.sets || 5)),
            reps: Math.max(1, Number(exercise.reps || 5)),
            // Programs saved before modes existed are all barbell work.
            inc: Number.isFinite(Number(exercise.inc)) ? Number(exercise.inc) : 5,
            mode: exercise.mode ?? "BB",
          })),
      }))
      .filter((group) => group.exercises.length > 0);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  const legacyA = (settings as { workoutAExerciseIds?: string[]; workoutAExercises?: string[] }).workoutAExerciseIds ??
    (settings as { workoutAExercises?: string[] }).workoutAExercises ??
    ["squat", "bench_press", "barbell_row"];
  const legacyB = (settings as { workoutBExerciseIds?: string[]; workoutBExercises?: string[] }).workoutBExerciseIds ??
    (settings as { workoutBExercises?: string[] }).workoutBExercises ??
    ["squat", "overhead_press", "deadlift"];

  return [
    {
      id: "workout-a",
      name: "Workout A",
      exercises: legacyA.map((exerciseId) => ({
        exerciseId,
        sets: 5,
        reps: 5,
        inc: 5,
        mode: "BB" as const,
      })),
    },
    {
      id: "workout-b",
      name: "Workout B",
      exercises: legacyB.map((exerciseId, idx) => ({
        exerciseId,
        sets: idx === 2 && exerciseId === "deadlift" ? 1 : 5,
        reps: 5,
        inc: exerciseId === "deadlift" ? 10 : 5,
        mode: "BB" as const,
      })),
    },
  ];
}

function normalizePlateInventory(input: unknown): PlateInventoryItem[] {
  if (!Array.isArray(input)) {
    return DEFAULT_APP_STATE.settings.plateInventory;
  }
  const cleaned = input
    .filter((item): item is PlateInventoryItem => !!item && typeof item === "object")
    .map((item) => ({
      weight: Number(item.weight),
      pairs: Math.max(0, Number(item.pairs)),
    }))
    .filter((item) => Number.isFinite(item.weight) && item.weight > 0 && Number.isFinite(item.pairs));
  return cleaned.length > 0 ? cleaned : DEFAULT_APP_STATE.settings.plateInventory;
}

function normalizeNextWorkoutType(nextWorkoutType: string | undefined, workoutGroups: WorkoutAppState["settings"]["workoutGroups"]) {
  if (!nextWorkoutType) {
    return workoutGroups[0]?.id ?? DEFAULT_PROGRESSION.nextWorkoutType;
  }
  if (nextWorkoutType === "A") {
    return "workout-a";
  }
  if (nextWorkoutType === "B") {
    return "workout-b";
  }
  return workoutGroups.some((group) => group.id === nextWorkoutType)
    ? nextWorkoutType
    : (workoutGroups[0]?.id ?? DEFAULT_PROGRESSION.nextWorkoutType);
}

function normalizeWorkoutLogType(workoutType: string) {
  if (workoutType === "A") return "workout-a";
  if (workoutType === "B") return "workout-b";
  return workoutType;
}

export function loadLocalState(userId: string | null | undefined): WorkoutAppState {
  if (typeof window === "undefined") {
    return DEFAULT_APP_STATE;
  }

  const raw = window.localStorage.getItem(localStateKey(userId));
  if (!raw) {
    return DEFAULT_APP_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkoutAppState>;
    const workoutGroups = migrateLegacyWorkoutGroups(parsed.settings);
    return {
      settings: {
        ...DEFAULT_APP_STATE.settings,
        ...parsed.settings,
        plateInventory: normalizePlateInventory(parsed.settings?.plateInventory),
        workoutGroups,
      },
      progression: {
        ...DEFAULT_APP_STATE.progression,
        ...parsed.progression,
        nextWorkoutType: normalizeNextWorkoutType(parsed.progression?.nextWorkoutType, workoutGroups),
        currentWeights: {
          ...DEFAULT_APP_STATE.progression.currentWeights,
          ...parsed.progression?.currentWeights,
        },
        failStreaks: {
          ...DEFAULT_APP_STATE.progression.failStreaks,
          ...parsed.progression?.failStreaks,
        },
      },
      workoutLogs: parsed.workoutLogs ?? [],
    };
  } catch {
    return DEFAULT_APP_STATE;
  }
}

export function persistLocalState(userId: string | null | undefined, state: WorkoutAppState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(localStateKey(userId), JSON.stringify(state));
}

export async function syncFromSupabase(
  userId: string,
  accessToken?: string,
): Promise<SyncResult<WorkoutAppState>> {
  try {
    const supabase = getSupabaseClient(accessToken);
    if (!supabase) {
      return { ok: false, error: "Supabase client is not configured." };
    }

    const [progressionRes, settingsRes, workoutsRes] = await Promise.all([
      supabase.from("progression").select("*").eq("user_id", userId).single(),
      supabase.from("users").select("*").eq("id", userId).single(),
      supabase
        .from("workouts")
      .select("id,date,workout_type,note,duration_seconds,workout_sets(exercise_id,exercise_key,exercise_name,weight,reps,completed,set_number)")
        .eq("user_id", userId)
        .order("date", { ascending: false }),
    ]);

    if (progressionRes.error || settingsRes.error || workoutsRes.error) {
      const reason =
        progressionRes.error?.message ??
        settingsRes.error?.message ??
        workoutsRes.error?.message ??
        "Unknown sync error.";
      console.error("Supabase sync failed", { progressionRes, settingsRes, workoutsRes });
      return { ok: false, error: reason };
    }

    const logs: WorkoutLog[] = (workoutsRes.data ?? []).map((workout) => {
      const grouped = new Map<string, WorkoutLog["exercises"][number]>();
      for (const set of workout.workout_sets ?? []) {
      const mapKey = set.exercise_id ?? set.exercise_key ?? set.exercise_name ?? `set-${set.set_number}`;
      const existing = grouped.get(mapKey);
        if (!existing) {
        grouped.set(mapKey, {
          exerciseKey: set.exercise_key ?? undefined,
          exerciseId: set.exercise_id ?? undefined,
          exerciseName:
            set.exercise_name ??
            (set.exercise_key ? EXERCISE_BY_KEY[set.exercise_key as ExerciseKey]?.name : undefined) ??
            "Unknown Exercise",
            weight: set.weight,
            setResults: [
              {
                setNumber: set.set_number,
                targetReps: 5,
                completedReps: set.reps,
                completed: set.completed,
                skipped: !set.completed,
              },
            ],
          });
        } else {
          existing.setResults.push({
            setNumber: set.set_number,
            targetReps: 5,
            completedReps: set.reps,
            completed: set.completed,
            skipped: !set.completed,
          });
        }
      }
      const noteParts = parseWorkoutNote(workout.note);
      return {
        id: workout.id,
        userId,
        date: workout.date,
        durationSeconds: workout.duration_seconds ?? undefined,
        workoutType: normalizeWorkoutLogType(workout.workout_type),
        workoutNote: noteParts.workoutNote,
        workoutSummary: noteParts.workoutSummary,
        exercises: [...grouped.values()],
      };
    });

    const syncedWorkoutGroups = migrateLegacyWorkoutGroups({
      workoutGroups: settingsRes.data.workout_groups ?? undefined,
      workoutAExerciseIds: settingsRes.data.workout_a_exercise_ids ?? undefined,
      workoutBExerciseIds: settingsRes.data.workout_b_exercise_ids ?? undefined,
      workoutAExercises: settingsRes.data.workout_a_exercises ?? undefined,
      workoutBExercises: settingsRes.data.workout_b_exercises ?? undefined,
    } as Partial<WorkoutAppState["settings"]> & {
      workoutAExercises?: string[];
      workoutBExercises?: string[];
    });

    return {
      ok: true,
      data: {
      settings: {
        ...DEFAULT_APP_STATE.settings,
        units: settingsRes.data.units,
        weightIncrement: settingsRes.data.weight_increment,
        restAfterHit: settingsRes.data.rest_timer_seconds,
        restAfterMiss: settingsRes.data.rest_after_miss_seconds ?? DEFAULT_APP_STATE.settings.restAfterMiss,
        barbellWeight: settingsRes.data.barbell_weight,
        plateInventory: normalizePlateInventory(settingsRes.data.plate_inventory),
        workoutGroups: syncedWorkoutGroups,
      },
      progression: {
        nextWorkoutType:
          normalizeNextWorkoutType(progressionRes.data.next_workout_type, syncedWorkoutGroups),
        currentWeights: progressionRes.data.current_weights,
        failStreaks: progressionRes.data.fail_streaks,
      },
      workoutLogs: logs,
      } as WorkoutAppState,
    };
  } catch (error) {
    console.error("Supabase sync threw exception", error);
    return { ok: false, error: error instanceof Error ? error.message : "Unexpected sync exception." };
  }
}

export async function persistSupabaseState(
  userId: string,
  state: WorkoutAppState,
  accessToken?: string,
): Promise<SyncResult> {
  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return { ok: false, error: "Supabase client is not configured." };
  }

  const [usersUpsert, progressionUpsert] = await Promise.all([
    supabase.from("users").upsert({
      id: userId,
      units: state.settings.units,
      weight_increment: state.settings.weightIncrement,
      rest_timer_seconds: state.settings.restAfterHit,
      rest_after_miss_seconds: state.settings.restAfterMiss,
      barbell_weight: state.settings.barbellWeight,
      plate_inventory: state.settings.plateInventory,
      workout_groups: state.settings.workoutGroups,
      updated_at: new Date().toISOString(),
    }),
    supabase.from("progression").upsert({
      user_id: userId,
      next_workout_type: state.progression.nextWorkoutType,
      current_weights: state.progression.currentWeights,
      fail_streaks: state.progression.failStreaks,
      updated_at: new Date().toISOString(),
    }),
  ]);

  if (usersUpsert.error || progressionUpsert.error) {
    console.error("Supabase state persist failed", {
      usersError: usersUpsert.error,
      progressionError: progressionUpsert.error,
    });
    return {
      ok: false,
      error: usersUpsert.error?.message ?? progressionUpsert.error?.message ?? "Failed to persist state.",
    };
  }
  return { ok: true };
}

export async function persistWorkoutToSupabase(
  workout: WorkoutLog,
  accessToken?: string,
): Promise<SyncResult> {
  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return { ok: false, error: "Supabase client is not configured." };
  }

  const workoutUpsert = await supabase.from("workouts").upsert({
    id: workout.id,
    user_id: workout.userId,
    date: workout.date,
    workout_type: workout.workoutType,
    note: serializeWorkoutNote(workout.workoutNote, workout.workoutSummary),
  });

  const setRows = workout.exercises.flatMap((exercise) =>
    exercise.setResults.map((setResult) => ({
      workout_id: workout.id,
      exercise_id: exercise.exerciseId ?? null,
      exercise_key: exercise.exerciseKey ?? null,
      exercise_name: exercise.exerciseName,
      set_number: setResult.setNumber,
      reps: setResult.completedReps,
      weight: exercise.weight,
      completed: setResult.completed && !setResult.skipped,
    })),
  );

  let setInsertError = null;
  if (setRows.length > 0) {
    const setInsert = await supabase.from("workout_sets").insert(setRows);
    setInsertError = setInsert.error;
  }

  if (workoutUpsert.error || setInsertError) {
    console.error("Supabase workout persist failed", {
      workoutError: workoutUpsert.error,
      setError: setInsertError,
    });
    return {
      ok: false,
      error: workoutUpsert.error?.message ?? setInsertError?.message ?? "Failed to persist workout.",
    };
  }
  return { ok: true };
}

export async function deleteWorkoutFromSupabase(
  workoutId: string,
  accessToken?: string,
): Promise<SyncResult> {
  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return { ok: false, error: "Supabase client is not configured." };
  }
  const deleted = await supabase.from("workouts").delete().eq("id", workoutId);
  if (deleted.error) {
    console.error("Supabase workout delete failed", deleted.error);
    return { ok: false, error: deleted.error.message };
  }
  return { ok: true };
}

export async function replaceWorkoutSetsInSupabase(
  workout: WorkoutLog,
  accessToken?: string,
): Promise<SyncResult> {
  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return { ok: false, error: "Supabase client is not configured." };
  }
  const deleted = await supabase.from("workout_sets").delete().eq("workout_id", workout.id);
  const setRows = workout.exercises.flatMap((exercise) =>
    exercise.setResults.map((setResult) => ({
      workout_id: workout.id,
      exercise_id: exercise.exerciseId ?? null,
      exercise_key: exercise.exerciseKey ?? null,
      exercise_name: exercise.exerciseName,
      set_number: setResult.setNumber,
      reps: setResult.completedReps,
      weight: exercise.weight,
      completed: setResult.completed && !setResult.skipped,
    })),
  );
  let insertError = null;
  if (setRows.length > 0) {
    const inserted = await supabase.from("workout_sets").insert(setRows);
    insertError = inserted.error;
  }

  if (deleted.error || insertError) {
    console.error("Supabase workout set replace failed", {
      deleteError: deleted.error,
      insertError,
    });
    return {
      ok: false,
      error: deleted.error?.message ?? insertError?.message ?? "Failed to replace workout sets.",
    };
  }
  return { ok: true };
}

export async function fetchExercisesFromSupabase(
  userId: string,
  accessToken?: string,
): Promise<SyncResult<ExerciseCatalogItem[]>> {
  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return { ok: false, error: "Supabase client is not configured." };
  }

  const { data, error } = await supabase
    .from("exercises")
    .select(
      "id,slug,name,primary_muscle,secondary_muscles,equipment,movement_pattern,description,is_global,created_by",
    )
    .or(`is_global.eq.true,created_by.eq.${userId}`)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: (data ?? []).map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      primaryMuscle: item.primary_muscle,
      secondaryMuscles: item.secondary_muscles ?? [],
      equipment: item.equipment,
      movementPattern: item.movement_pattern,
      description: item.description,
      ownership: item.is_global ? "global" : "user",
    })),
  };
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function upsertUserExerciseInSupabase(
  userId: string,
  input: Omit<ExerciseCatalogItem, "id" | "ownership" | "slug"> & { slug?: string },
  accessToken?: string,
): Promise<SyncResult<ExerciseCatalogItem>> {
  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return { ok: false, error: "Supabase client is not configured." };
  }

  const slug = input.slug?.trim() || `${slugify(input.name)}-${userId.slice(-6).toLowerCase()}`;
  const { data, error } = await supabase
    .from("exercises")
    .upsert(
      {
        slug,
        name: input.name,
        primary_muscle: input.primaryMuscle,
        secondary_muscles: input.secondaryMuscles,
        equipment: input.equipment,
        movement_pattern: input.movementPattern,
        description: input.description,
        is_global: false,
        created_by: userId,
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select(
      "id,slug,name,primary_muscle,secondary_muscles,equipment,movement_pattern,description,is_global,created_by",
    )
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to upsert user exercise." };
  }

  return {
    ok: true,
    data: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      primaryMuscle: data.primary_muscle,
      secondaryMuscles: data.secondary_muscles ?? [],
      equipment: data.equipment,
      movementPattern: data.movement_pattern,
      description: data.description,
      ownership: "user",
    },
  };
}
