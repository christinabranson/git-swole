"use client";

import { useAuth, useUser } from "@/lib/auth";
import { IS_DEV_AUTH } from "@/lib/dev-auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_PROGRESSION } from "@/lib/progression";
import { applyWorkoutProgression } from "@/lib/progression";
import { ImportedWorkoutDraft } from "@/lib/importer";
import { EXERCISE_BY_KEY, getNextDayId } from "@/lib/program";
import {
  DEFAULT_APP_STATE,
  deleteWorkoutFromSupabase,
  fetchExercisesFromSupabase,
  loadLocalState,
  persistLocalState,
  persistWorkoutToSupabase,
  persistSupabaseState,
  replaceWorkoutSetsInSupabase,
  syncFromSupabase,
  upsertUserExerciseInSupabase,
} from "@/lib/storage";
import {
  AppSettings,
  ExerciseCatalogItem,
  ExerciseKey,
  ExerciseMode,
  PersonalRecord,
  WorkoutTemplate,
  WorkoutExerciseLog,
  WorkoutLog,
  WorkoutSummary,
} from "@/lib/types";

type WorkoutAppContextValue = {
  stateLoaded: boolean;
  syncStatus: "local" | "syncing" | "synced" | "error";
  syncError: string | null;
  nextWorkoutType: string;
  nextWorkoutName: string;
  settings: AppSettings;
  nextWorkoutExercises: {
    exerciseId: string;
    exerciseName: string;
    exerciseKey?: ExerciseKey;
    sets: number;
    reps: number;
    inc: number;
    mode: ExerciseMode;
  }[];
  currentWeights: Record<ExerciseKey, number>;
  exerciseCatalog: ExerciseCatalogItem[];
  workoutLogs: WorkoutLog[];
  personalRecords: PersonalRecord[];
  completeWorkout: (params: {
    exercises: WorkoutExerciseLog[];
    note?: string;
    summary?: WorkoutSummary;
    durationSeconds?: number;
  }) => void;
  updateSettings: (nextSettings: Partial<AppSettings>) => void;
  deleteWorkout: (workoutId: string) => void;
  updateWorkout: (updatedWorkout: WorkoutLog) => void;
  createOrUpdateUserExercise: (
    input: Omit<ExerciseCatalogItem, "id" | "ownership" | "slug"> & { slug?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  importWorkouts: (workouts: ImportedWorkoutDraft[]) => Promise<{ imported: number; skipped: number }>;
};

const WorkoutAppContext = createContext<WorkoutAppContextValue | null>(null);
const SYNC_TIMEOUT_MS = 10000;

function computePersonalRecords(logs: WorkoutLog[]): PersonalRecord[] {
  const records = new Map<ExerciseKey, PersonalRecord>();

  for (const workout of logs) {
    for (const exercise of workout.exercises) {
      if (!exercise.exerciseKey) {
        continue;
      }
      const existing = records.get(exercise.exerciseKey);
      const totalVolume = exercise.setResults.reduce(
        (sum, setResult) => sum + setResult.completedReps * exercise.weight,
        0,
      );
      const bestSetReps = Math.max(...exercise.setResults.map((setResult) => setResult.completedReps));

      if (!existing) {
        records.set(exercise.exerciseKey, {
          exerciseKey: exercise.exerciseKey,
          maxWeight: exercise.weight,
          bestVolume: totalVolume,
          bestSetReps,
        });
        continue;
      }

      existing.maxWeight = Math.max(existing.maxWeight, exercise.weight);
      existing.bestVolume = Math.max(existing.bestVolume, totalVolume);
      existing.bestSetReps = Math.max(existing.bestSetReps, bestSetReps);
    }
  }

  return [...records.values()];
}

function summarizeWorkout(exercises: WorkoutExerciseLog[]): WorkoutSummary {
  const allSuccessful = exercises.every((exercise) =>
    exercise.setResults.every(
      (setResult) => !setResult.skipped && setResult.completed && setResult.completedReps >= setResult.targetReps,
    ),
  );
  return allSuccessful ? "up" : "down";
}

function recomputeProgressionFromLogs(logs: WorkoutLog[], increment: number, workoutGroups: WorkoutTemplate[]) {
  if (logs.length === 0) {
    return DEFAULT_PROGRESSION;
  }

  const ascending = [...logs].sort((a, b) => (a.date > b.date ? 1 : -1));
  let progression = { ...DEFAULT_PROGRESSION };

  // Most recent first, so the A → B → A → C alternation can be resolved as we replay.
  const processedDayIds: string[] = [];

  for (const workout of ascending) {
    const normalizedWorkoutType = mapLegacyWorkoutTypeToGroupId(workout.workoutType);
    progression = applyWorkoutProgression(
      {
        ...progression,
        nextWorkoutType: normalizedWorkoutType,
      },
      workout.exercises,
      increment,
      getNextWorkoutGroupId(normalizedWorkoutType, workoutGroups, processedDayIds),
    );
    processedDayIds.unshift(normalizedWorkoutType);
  }

  return progression;
}

/** `previousDayIds` is the day history, most recent first — see getNextDayId. */
function getNextWorkoutGroupId(
  currentGroupId: string,
  groups: WorkoutTemplate[],
  previousDayIds: string[] = [],
) {
  if (groups.length === 0) {
    return currentGroupId;
  }
  if (groups.findIndex((group) => group.id === currentGroupId) < 0) {
    return groups[0].id;
  }
  // A → B → A → C, not a plain cycle through the day list.
  return getNextDayId(currentGroupId, groups, previousDayIds);
}

function mapLegacyWorkoutTypeToGroupId(type: string) {
  if (type === "A") return "workout-a";
  if (type === "B") return "workout-b";
  return type;
}

function buildWorkoutFingerprint(workout: {
  date: string;
  workoutType: WorkoutLog["workoutType"];
  exercises: WorkoutLog["exercises"];
}) {
  const compactExercises = [...workout.exercises]
    .sort((a, b) =>
      `${a.exerciseId ?? ""}:${a.exerciseName || ""}`.localeCompare(`${b.exerciseId ?? ""}:${b.exerciseName || ""}`),
    )
    .map((exercise) => ({
      exerciseId: exercise.exerciseId ?? null,
      exerciseKey: exercise.exerciseKey ?? null,
      exerciseName: exercise.exerciseName,
      weight: Number(exercise.weight.toFixed(2)),
      sets: [...exercise.setResults]
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((setResult) => ({
          setNumber: setResult.setNumber,
          reps: setResult.completedReps,
          target: setResult.targetReps,
          skipped: setResult.skipped,
        })),
    }));

  return JSON.stringify({
    date: workout.date.slice(0, 10),
    workoutType: workout.workoutType,
    exercises: compactExercises,
  });
}

export function WorkoutAppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { getToken, userId: accountId } = useAuth();
  const [state, setState] = useState(DEFAULT_APP_STATE);
  const [stateLoaded, setStateLoaded] = useState(false);
  /*
   * Which account the in-memory state belongs to. Without this, the persist effect
   * fired once with the new account id but the previous account's state and wrote
   * it under the new key — which also made the seeder think the account already
   * had data.
   */
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [syncStatus, setSyncStatus] = useState<"local" | "syncing" | "synced" | "error">("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [exerciseCatalog, setExerciseCatalog] = useState<ExerciseCatalogItem[]>([]);

  const getSupabaseToken = useCallback(async () => {
    try {
      // Preferred for Clerk+Supabase JWKS integration.
      const sessionToken = await getToken();
      if (sessionToken) {
        return sessionToken;
      }
    } catch (error) {
      console.warn("Failed to retrieve Clerk session token for Supabase sync.", error);
    }

    try {
      // Backward compatibility for template-based setups.
      const templateToken = await getToken({ template: "supabase" });
      if (templateToken) {
        return templateToken;
      }
    } catch (error) {
      console.warn("Failed to retrieve Clerk 'supabase' template token.", error);
    }

    const message =
      "Could not get Clerk token for Supabase. If using JWKS, verify Clerk is configured as Supabase JWT provider.";
    setSyncStatus("error");
    setSyncError(message);
    return null;
  }, [getToken]);

  const runSupabaseTask = useCallback(
    async (task: (token: string) => Promise<{ ok: boolean; error?: string }>) => {
      const token = await getSupabaseToken();
      if (!token) {
        return;
      }
      setSyncStatus("syncing");
      setSyncError(null);
      try {
        const result = await Promise.race([
          task(token),
          new Promise<{ ok: false; error: string }>((resolve) => {
            window.setTimeout(() => resolve({ ok: false, error: "Sync timed out after 10 seconds." }), SYNC_TIMEOUT_MS);
          }),
        ]);
        if (result.ok) {
          setSyncStatus("synced");
          setSyncError(null);
        } else {
          setSyncStatus("error");
          setSyncError(result.error || "Sync failed.");
        }
      } catch (error) {
        console.error("Supabase task failed", error);
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unexpected sync task failure.");
      }
    },
    [getSupabaseToken],
  );

  /*
   * Reloads whenever the signed-in account changes, so signing in as somebody else
   * swaps the data rather than leaving the previous user's history on screen.
   */
  useEffect(() => {
    let cancelled = false;
    setStateLoaded(false);

    void (async () => {
      if (IS_DEV_AUTH && accountId) {
        // Console helpers only — nothing is seeded unless you ask for it.
        const devSeed = await import("@/lib/dev-seed");
        devSeed.installDevHelpers(accountId);
      }
      if (cancelled) {
        return;
      }
      setState(accountId ? loadLocalState(accountId) : DEFAULT_APP_STATE);
      setLoadedFor(accountId);
      setStateLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    if (!stateLoaded || !user?.id) {
      return;
    }

    void (async () => {
      setSyncStatus("syncing");
      setSyncError(null);
      const token = await getSupabaseToken();
      if (!token) return;
      try {
        const result = await Promise.race([
          syncFromSupabase(user.id, token),
          new Promise<{ ok: false; error: string }>((resolve) => {
            window.setTimeout(() => resolve({ ok: false, error: "Initial sync timed out after 10 seconds." }), SYNC_TIMEOUT_MS);
          }),
        ]);
        if (!result.ok || !result.data) {
          setSyncStatus("error");
          setSyncError(!result.ok ? result.error : "Initial sync failed.");
          return;
        }
        setState(result.data);
        setSyncStatus("synced");
        setSyncError(null);
      } catch (error) {
        console.error("Initial Supabase sync failed", error);
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unexpected initial sync failure.");
      }
    })();
  }, [getSupabaseToken, stateLoaded, user?.id]);

  useEffect(() => {
    if (IS_DEV_AUTH) {
      void import("@/lib/dev-seed").then((devSeed) => {
        setExerciseCatalog(devSeed.buildDevExerciseCatalog());
      });
      return;
    }
    if (!user?.id) {
      return;
    }
    void (async () => {
      const token = await getSupabaseToken();
      if (!token) return;
      const result = await fetchExercisesFromSupabase(user.id, token);
      if (result.ok && result.data) {
        setExerciseCatalog(result.data);
      }
    })();
  }, [getSupabaseToken, user?.id]);

  useEffect(() => {
    // Never write one account's state under another account's key.
    if (!stateLoaded || loadedFor !== accountId) {
      return;
    }
    persistLocalState(accountId, state);
    if (user?.id) {
      void (async () => {
        const token = await getSupabaseToken();
        if (!token) {
          return;
        }
        try {
          const result = await Promise.race([
            persistSupabaseState(user.id, state, token),
            new Promise<{ ok: false; error: string }>((resolve) => {
              window.setTimeout(() => resolve({ ok: false, error: "State sync timed out after 10 seconds." }), SYNC_TIMEOUT_MS);
            }),
          ]);
          if (result.ok) {
            setSyncStatus("synced");
            setSyncError(null);
          } else {
            setSyncStatus("error");
            setSyncError(result.error || "State sync failed.");
          }
        } catch (error) {
          console.error("Supabase state persist task failed", error);
          setSyncStatus("error");
          setSyncError(error instanceof Error ? error.message : "Unexpected state sync failure.");
        }
      })();
    }
  }, [accountId, loadedFor, getSupabaseToken, state, stateLoaded, user?.id]);

  const nextWorkoutExercises = useMemo(() => {
    const nextGroup =
      state.settings.workoutGroups.find((group) => group.id === state.progression.nextWorkoutType) ??
      state.settings.workoutGroups[0];
    if (!nextGroup) {
      return [];
    }

    return nextGroup.exercises.map((exercise, idx) => {
      const exerciseId = exercise.exerciseId;
      const catalogItem = exerciseCatalog.find((item) => item.id === exerciseId || item.slug === exerciseId);
      const slugKey =
        catalogItem?.slug && catalogItem.slug in EXERCISE_BY_KEY
          ? (catalogItem.slug as ExerciseKey)
          : undefined;
      const directKey = exerciseId in EXERCISE_BY_KEY ? (exerciseId as ExerciseKey) : undefined;
      const exerciseKey = slugKey ?? directKey;
      const exerciseName =
        catalogItem?.name ?? (exerciseKey ? EXERCISE_BY_KEY[exerciseKey]?.name : undefined) ?? exerciseId;
      return {
        exerciseId: catalogItem?.id ?? exerciseId,
        exerciseName,
        exerciseKey,
        sets: Math.max(1, Number(exercise.sets || (idx === 2 && exerciseKey === "deadlift" ? 1 : 5))),
        reps: Math.max(1, Number(exercise.reps || 5)),
        inc: Number.isFinite(Number(exercise.inc)) ? Number(exercise.inc) : 5,
        mode: exercise.mode ?? "BB",
      };
    });
  }, [exerciseCatalog, state.progression.nextWorkoutType, state.settings.workoutGroups]);

  const completeWorkout = ({
    exercises,
    note,
    summary,
    durationSeconds,
  }: {
    exercises: WorkoutExerciseLog[];
    note?: string;
    summary?: WorkoutSummary;
    durationSeconds?: number;
  }) => {
    const nextLog: WorkoutLog = {
      id: crypto.randomUUID(),
      userId: user?.id ?? "local",
      date: new Date().toISOString(),
      durationSeconds,
      workoutType: state.progression.nextWorkoutType,
      workoutNote: note,
      workoutSummary: summary,
      exercises,
    };

    if (user?.id) {
      void runSupabaseTask((token) => persistWorkoutToSupabase(nextLog, token));
    }

    setState((previous) => {
      const nextWorkoutGroupId = getNextWorkoutGroupId(
        previous.progression.nextWorkoutType,
        previous.settings.workoutGroups,
        // workoutLogs is newest first, and excludes the session being saved.
        previous.workoutLogs.map((workout) => mapLegacyWorkoutTypeToGroupId(workout.workoutType)),
      );
      const nextProgression = applyWorkoutProgression(
        previous.progression,
        exercises,
        previous.settings.weightIncrement,
        nextWorkoutGroupId,
      );
      return {
        ...previous,
        progression: nextProgression,
        workoutLogs: [nextLog, ...previous.workoutLogs],
      };
    });
  };

  const updateSettings = (nextSettings: Partial<AppSettings>) => {
    setState((previous) => {
      const mergedSettings = {
        ...previous.settings,
        ...nextSettings,
      };
      const nextGroupId = mergedSettings.workoutGroups.some(
        (group) => group.id === previous.progression.nextWorkoutType,
      )
        ? previous.progression.nextWorkoutType
        : (mergedSettings.workoutGroups[0]?.id ?? previous.progression.nextWorkoutType);
      return {
        ...previous,
        settings: mergedSettings,
        progression: {
          ...previous.progression,
          nextWorkoutType: nextGroupId,
        },
      };
    });
  };

  const deleteWorkout = (workoutId: string) => {
    if (user?.id) {
      void runSupabaseTask((token) => deleteWorkoutFromSupabase(workoutId, token));
    }
    setState((previous) => ({
      ...previous,
      workoutLogs: previous.workoutLogs.filter((workout) => workout.id !== workoutId),
    }));
  };

  const updateWorkout = (updatedWorkout: WorkoutLog) => {
    if (user?.id) {
      void runSupabaseTask((token) => replaceWorkoutSetsInSupabase(updatedWorkout, token));
    }
    setState((previous) => ({
      ...previous,
      workoutLogs: previous.workoutLogs.map((workout) =>
        workout.id === updatedWorkout.id ? updatedWorkout : workout,
      ),
    }));
  };

  const importWorkouts = async (workouts: ImportedWorkoutDraft[]) => {
    if (workouts.length === 0) {
      return { imported: 0, skipped: 0 };
    }

    const existingFingerprintSet = new Set(state.workoutLogs.map((workout) => buildWorkoutFingerprint(workout)));

    const importedLogs: WorkoutLog[] = [];
    for (const workout of workouts) {
      const resolvedExercises: WorkoutExerciseLog[] = [];
      for (const exercise of workout.exercises) {
        const existingCatalog = exerciseCatalog.find(
          (item) => item.name.toLowerCase() === exercise.exerciseName.toLowerCase(),
        );

        if (existingCatalog) {
          resolvedExercises.push({
            ...exercise,
            exerciseId: existingCatalog.id,
          });
          continue;
        }

        if (!user?.id) {
          resolvedExercises.push(exercise);
          continue;
        }

        const token = await getSupabaseToken();
        if (!token) {
          resolvedExercises.push(exercise);
          continue;
        }

        const created = await upsertUserExerciseInSupabase(
          user.id,
          {
            name: exercise.exerciseName,
            primaryMuscle: "Unknown",
            secondaryMuscles: [],
            equipment: "Unknown",
            movementPattern: "Unknown",
            description: "Imported from workout history",
          },
          token,
        );
        if (created.ok && created.data) {
          setExerciseCatalog((previous) => {
            const exists = previous.some((item) => item.id === created.data!.id);
            return exists ? previous : [...previous, created.data!];
          });
          resolvedExercises.push({
            ...exercise,
            exerciseId: created.data.id,
          });
        } else {
          resolvedExercises.push(exercise);
        }
      }

      const nextLog: WorkoutLog = {
        id: crypto.randomUUID(),
        userId: user?.id ?? "local",
        date: workout.date,
        workoutType: mapLegacyWorkoutTypeToGroupId(workout.workoutType),
        workoutNote: workout.workoutNote,
        workoutSummary: summarizeWorkout(resolvedExercises),
        exercises: resolvedExercises,
      };
      const fingerprint = buildWorkoutFingerprint(nextLog);
      if (existingFingerprintSet.has(fingerprint)) {
        continue;
      }
      existingFingerprintSet.add(fingerprint);
      importedLogs.push(nextLog);
    }

    if (importedLogs.length === 0) {
      return { imported: 0, skipped: workouts.length };
    }

    const mergedLogs = [...importedLogs, ...state.workoutLogs].sort((a, b) => (a.date > b.date ? -1 : 1));
    const nextProgression = recomputeProgressionFromLogs(
      mergedLogs,
      state.settings.weightIncrement,
      state.settings.workoutGroups,
    );

    setState((previous) => ({
      ...previous,
      workoutLogs: mergedLogs,
      progression: nextProgression,
    }));

    if (user?.id) {
      await runSupabaseTask(async (token) => {
        for (const workout of importedLogs) {
          const result = await persistWorkoutToSupabase(workout, token);
          if (!result.ok) {
            return result;
          }
        }
        const progressionSync = await persistSupabaseState(
          user.id,
          {
            ...state,
            workoutLogs: mergedLogs,
            progression: nextProgression,
          },
          token,
        );
        return progressionSync;
      });
    }

    return {
      imported: importedLogs.length,
      skipped: workouts.length - importedLogs.length,
    };
  };

  const createOrUpdateUserExercise = async (
    input: Omit<ExerciseCatalogItem, "id" | "ownership" | "slug"> & { slug?: string },
  ) => {
    if (IS_DEV_AUTH) {
      const slug = input.slug ?? input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const devItem: ExerciseCatalogItem = { ...input, id: slug, slug, ownership: "user" };
      setExerciseCatalog((previous) =>
        [...previous.filter((item) => item.id !== slug), devItem].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { ok: true };
    }
    if (!user?.id) {
      return { ok: false, error: "You must be signed in to manage custom exercises." };
    }
    const token = await getSupabaseToken();
    if (!token) {
      return { ok: false, error: "No Supabase auth token available." };
    }
    const result = await upsertUserExerciseInSupabase(user.id, input, token);
    if (!result.ok || !result.data) {
      return { ok: false, error: !result.ok ? result.error : "Unable to save exercise." };
    }
    setExerciseCatalog((previous) => {
      const without = previous.filter((item) => item.id !== result.data!.id);
      return [...without, result.data!].sort((a, b) => a.name.localeCompare(b.name));
    });
    return { ok: true };
  };

  const personalRecords = useMemo(() => computePersonalRecords(state.workoutLogs), [state.workoutLogs]);
  const nextWorkoutName =
    state.settings.workoutGroups.find((group) => group.id === state.progression.nextWorkoutType)?.name ??
    "Workout";

  const value: WorkoutAppContextValue = {
    stateLoaded,
    syncStatus,
    syncError,
    nextWorkoutType: state.progression.nextWorkoutType,
    nextWorkoutName,
    settings: state.settings,
    nextWorkoutExercises,
    currentWeights: state.progression.currentWeights,
    exerciseCatalog,
    workoutLogs: state.workoutLogs,
    personalRecords,
    completeWorkout,
    updateSettings,
    deleteWorkout,
    updateWorkout,
    createOrUpdateUserExercise,
    importWorkouts,
  };

  return <WorkoutAppContext.Provider value={value}>{children}</WorkoutAppContext.Provider>;
}

export function useWorkoutApp() {
  const context = useContext(WorkoutAppContext);
  if (!context) {
    throw new Error("useWorkoutApp must be used within WorkoutAppProvider");
  }
  return context;
}

export function getExerciseName(exerciseKey?: ExerciseKey, fallbackName?: string) {
  if (exerciseKey) {
    return EXERCISE_BY_KEY[exerciseKey].name;
  }
  return fallbackName ?? "Unknown Exercise";
}
