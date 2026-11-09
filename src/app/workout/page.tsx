"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkoutApp } from "@/context/workout-app-context";
import { useAuth } from "@/lib/auth";
import { BarDiagram } from "@/components/bar-diagram";
import {
  buildQueue,
  countProgress,
  createSessionState,
  FINISH_HEADLINES,
  FINISH_LINES,
  formatClock,
  plateLine,
  sessionStateKey,
  SessionExercise,
  SessionState,
  sessionVolume,
} from "@/lib/session";
import { generateWarmupSets } from "@/lib/warmup";
import { WorkoutExerciseLog } from "@/lib/types";

export default function SessionScreen() {
  const router = useRouter();
  const { userId: accountId } = useAuth();
  const {
    nextWorkoutExercises,
    nextWorkoutName,
    nextWorkoutType,
    currentWeights,
    settings,
    stateLoaded,
    completeWorkout,
  } = useWorkoutApp();

  const [session, setSession] = useState<SessionState | null>(null);
  const [repsEdit, setRepsEdit] = useState<{ key: string; reps: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const exercises: SessionExercise[] = useMemo(
    () =>
      nextWorkoutExercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        exerciseKey: exercise.exerciseKey,
        sets: exercise.sets,
        reps: exercise.reps,
        mode: exercise.mode,
      })),
    [nextWorkoutExercises],
  );

  /*
   * Resume an interrupted session, or start a fresh one for today's day.
   *
   * The set-state-in-effect rule is disabled across this effect deliberately:
   * localStorage cannot be read during render, and the app state this depends on
   * only lands after mount. The `session` guard makes it run once per session.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!stateLoaded || session || exercises.length === 0) {
      return;
    }
    const raw = window.localStorage.getItem(sessionStateKey(accountId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SessionState;
        if (parsed.dayId === nextWorkoutType) {
          setSession(parsed);
          return;
        }
      } catch {
        // Corrupt session state is not worth recovering — start clean.
      }
    }
    setSession(
      createSessionState(
        nextWorkoutType,
        exercises,
        (exercise) =>
          exercise.exerciseKey
            ? (currentWeights[exercise.exerciseKey as keyof typeof currentWeights] ?? settings.barbellWeight)
            : 0,
        Date.now(),
        Math.floor(Math.random() * FINISH_HEADLINES.length),
      ),
    );
  }, [accountId, stateLoaded, session, exercises, nextWorkoutType, currentWeights, settings.barbellWeight]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (session) {
      window.localStorage.setItem(sessionStateKey(accountId), JSON.stringify(session));
    }
  }, [accountId, session]);

  /*
   * One tick a second drives both the elapsed clock and the rest countdown.
   * Depends on startedAt alone — depending on `session` tore the interval down and
   * rebuilt it on every logged set, so during a busy session it never completed a
   * tick and the clock sat at 0:01.
   */
  const startedAt = session?.startedAt;
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setSession((previous) =>
        previous && previous.rest > 0 ? { ...previous, rest: previous.rest - 1 } : previous,
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const queue = useMemo(
    () => (session ? buildQueue(exercises, session, settings.barbellWeight) : []),
    [exercises, session, settings.barbellWeight],
  );
  const current = queue[0];

  /*
   * The stepper is pre-filled with the target and resets whenever the current set
   * changes. Derived during render rather than synced in an effect, so there is no
   * frame where the stepper still shows the previous set's reps.
   */
  const currentKey = current ? `${current.exerciseId}:${current.kind}:${current.setIndex}` : "";
  const reps =
    repsEdit?.key === currentKey
      ? repsEdit.reps
      : (current?.targetReps ?? current?.reps ?? 5);
  const setReps = useCallback((value: number) => setRepsEdit({ key: currentKey, reps: value }), [currentKey]);

  const logSet = useCallback(
    (target = current) => {
      if (!session || !target) return;
      setSession((previous) => {
        if (!previous) return previous;
        if (target.kind === "warm") {
          const warm = [...(previous.warm[target.exerciseId] ?? [])];
          warm[target.setIndex] = true;
          // Warm-ups never start a rest timer.
          return { ...previous, warm: { ...previous.warm, [target.exerciseId]: warm } };
        }
        const sets = [...(previous.sets[target.exerciseId] ?? [])];
        const logged = target === current ? reps : (target.targetReps ?? target.reps);
        sets[target.setIndex] = { reps: logged, done: true };
        const hit = logged >= (target.targetReps ?? target.reps);
        const restLen = hit ? settings.restAfterHit : settings.restAfterMiss;
        return {
          ...previous,
          sets: { ...previous.sets, [target.exerciseId]: sets },
          rest: restLen,
          restLen,
          restReason: hit ? "hit" : "miss",
        };
      });
    },
    [current, reps, session, settings.restAfterHit, settings.restAfterMiss],
  );

  const toggleWarm = (exerciseId: string, setIndex: number) => {
    setSession((previous) => {
      if (!previous) return previous;
      const warm = [...(previous.warm[exerciseId] ?? [])];
      warm[setIndex] = !warm[setIndex];
      return { ...previous, warm: { ...previous.warm, [exerciseId]: warm } };
    });
  };

  const adjustWeight = (delta: number) => {
    if (!current || !session) return;
    setSession((previous) =>
      previous
        ? {
            ...previous,
            weights: {
              ...previous.weights,
              [current.exerciseId]: Math.max(
                settings.barbellWeight,
                (previous.weights[current.exerciseId] ?? 0) + delta,
              ),
            },
          }
        : previous,
    );
  };

  const saveSession = () => {
    if (!session) return;
    const logs: WorkoutExerciseLog[] = exercises
      .map((exercise): WorkoutExerciseLog | null => {
        const done = (session.sets[exercise.exerciseId] ?? []).filter((set) => set.done);
        if (done.length === 0) return null;
        return {
          exerciseKey: exercise.exerciseKey as WorkoutExerciseLog["exerciseKey"],
          exerciseName: exercise.exerciseName,
          exerciseId: exercise.exerciseId,
          weight: session.weights[exercise.exerciseId] ?? 0,
          setResults: done.map((set, index) => ({
            setNumber: index + 1,
            targetReps: exercise.reps,
            completedReps: set.reps,
            completed: true,
            skipped: false,
          })),
        };
      })
      .filter((entry): entry is WorkoutExerciseLog => entry !== null);

    window.localStorage.removeItem(sessionStateKey(accountId));
    if (logs.length === 0) {
      // Nothing was logged — do not write an empty workout into the history.
      router.push("/");
      return;
    }
    completeWorkout({ exercises: logs, durationSeconds: elapsed });
    router.push("/history");
  };

  /** FINISH ends the session and shows the review; it does not save on its own. */
  const endSession = () => {
    setSession((previous) => (previous ? { ...previous, review: true, reviewClosed: false, rest: 0 } : previous));
  };

  if (!stateLoaded || !session) {
    return <div className="label px-[22px] py-10 text-[10px] text-dim">Loading session</div>;
  }

  const progress = countProgress(exercises, session);
  const resting = session.rest > 0;
  const completedAll = queue.length === 0;
  // The review opens when the queue empties or FINISH is pressed, and stays shut
  // once dismissed — otherwise "back to session view" would bounce straight back.
  const finished = (completedAll || session.review === true) && session.reviewClosed !== true;
  const units = settings.units.toUpperCase();
  const currentExercise = current ? exercises[current.exerciseIndex] : undefined;

  return (
    <div className="min-h-screen">
      {/* Session header — replaces the app header, keeps the rail on desktop */}
      <header className="sticky top-0 z-10 flex h-[66px] items-center justify-between gap-3 border-b border-line bg-raised px-[22px] desk:h-[58px] desk:px-[26px]">
        <div className="flex items-center gap-3">
          <Image src="/gitswole.png" alt="" width={30} height={30} className="rounded-[7px] object-cover desk:hidden" />
          <span className="label text-[9.5px] text-green">
            <span className="hidden desk:inline">Session · </span>
            {nextWorkoutName}
          </span>
          <span className="label hidden text-[8.5px] font-normal text-dim desk:inline">
            {progress.done} of {progress.total} sets done · {progress.total - progress.done} left
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] tracking-[0.14em] text-dim tabular-nums">{formatClock(elapsed)}</span>
          {!finished ? (
            <button onClick={endSession} className="label border border-green px-3 py-2 text-[10px] text-green">
              Finish<span className="hidden desk:inline"> session</span>
            </button>
          ) : null}
          <Link href="/" className="text-[15px] leading-none text-dim hover:text-ink" aria-label="Leave session">
            ✕
          </Link>
        </div>
      </header>

      {finished ? (
        <FinishState
          name={nextWorkoutName}
          completedAll={completedAll}
          setsLeft={progress.total - progress.done}
          quoteIdx={session.quoteIdx}
          // Working sets only: warm-ups are excluded from volume, so they are
          // excluded from the count too. The queue counter still shows both.
          sets={exercises.reduce(
            (sum, exercise) => sum + (session.sets[exercise.exerciseId] ?? []).filter((set) => set.done).length,
            0,
          )}
          volume={sessionVolume(exercises, session)}
          minutes={Math.round(elapsed / 60)}
          units={units}
          onSave={saveSession}
          onBack={() => setSession((previous) => (previous ? { ...previous, review: false, reviewClosed: true } : previous))}
        />
      ) : resting ? (
        <RestState
          remaining={session.rest}
          total={session.restLen}
          reason={session.restReason}
          onExtend={() => setSession((p) => (p ? { ...p, rest: p.rest + 30, restLen: p.restLen + 30 } : p))}
          onSkip={() => setSession((p) => (p ? { ...p, rest: 0 } : p))}
        />
      ) : current ? (
        <LiveState
          current={current}
          exerciseName={currentExercise?.exerciseName ?? ""}
          totalSets={currentExercise?.sets ?? 0}
          reps={reps}
          setReps={setReps}
          units={units}
          plate={plateLine(current.weight, settings.barbellWeight, settings.plateInventory, settings.units)}
          onAdjustWeight={adjustWeight}
          onLog={() => logSet()}
        />
      ) : null}

      {/*
       * On desktop the queue is a persistent table under the hero — rest keeps it,
       * and at finish it reads as the completed session. On the phone the finish
       * state is a full-screen moment, as rest is, so the queue drops away.
       */}
      <div className={finished || resting ? "hidden desk:block" : undefined}>
        <Queue
          exercises={exercises}
          session={session}
          barbellWeight={settings.barbellWeight}
          current={current}
          progress={progress}
          onWarmToggle={toggleWarm}
          onLogPending={(item) => logSet(item)}
        />
      </div>
    </div>
  );
}

function LiveState({
  current,
  exerciseName,
  totalSets,
  reps,
  setReps,
  units,
  plate,
  onAdjustWeight,
  onLog,
}: {
  current: ReturnType<typeof buildQueue>[number];
  exerciseName: string;
  totalSets: number;
  reps: number;
  setReps: (value: number) => void;
  units: string;
  plate: ReturnType<typeof plateLine>;
  onAdjustWeight: (delta: number) => void;
  onLog: () => void;
}) {
  const warm = current.kind === "warm";

  return (
    <div className="px-[22px] py-6 desk:px-[26px] desk:py-8">
      <div className="flex flex-col gap-8 desk:flex-row desk:items-start desk:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span
              className={`label border px-2 py-1.5 text-[8.5px] ${
                warm ? "border-amber-line text-amber" : "border-green text-green"
              }`}
            >
              {warm ? "Warm-up" : "Working"}
            </span>
            <span className="label text-[9px] font-normal text-dim">
              {exerciseName} ·{" "}
              {warm ? `Warm ${current.setIndex + 1} of 3` : `Set ${current.setIndex + 1} of ${totalSets}`}
            </span>
          </div>

          {/*
           * The bar diagram sits beside the weight on one centre axis, on both form
           * factors. Plate block sizes are fixed by the handoff, so the weight is
           * sized to stay in proportion with them — see the note in CLAUDE.md.
           */}
          <div className="flex items-center gap-6 overflow-x-clip desk:gap-14">
            <div className="flex shrink-0 items-baseline gap-3">
              <span
                className={`num text-[86px] desk:text-[clamp(120px,13vw,200px)] ${warm ? "text-ink-2" : "text-ink"}`}
              >
                {current.weight}
              </span>
              <span className="label text-[11px] text-dim desk:text-[14px]">{units}</span>
            </div>
            {/*
             * Two instances rather than a transform: scaling with CSS would not
             * reserve layout space, and the plate blocks are sized in real px.
             */}
            <div className="desk:hidden">
              <BarDiagram plates={plate.plates} />
            </div>
            <div className="hidden desk:block">
              <BarDiagram plates={plate.plates} scale={1.75} />
            </div>
          </div>

          {/*
           * The plate line and the weight adjusters share a row on the phone. The
           * mobile references have no ±5 at all, but a lifter at the rack needs to
           * correct the working weight, so they are kept and compacted instead —
           * which also keeps the queue reachable without scrolling.
           */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className={`label text-[9px] font-normal ${plate.short ? "text-amber" : "text-dim"}`}>
              {plate.text}
            </div>
            <div className="flex shrink-0 gap-1.5 desk:hidden">
              <button
                onClick={() => onAdjustWeight(-5)}
                className="label h-[30px] w-[44px] border border-line text-[10px] text-ink-2"
              >
                −5
              </button>
              <button
                onClick={() => onAdjustWeight(5)}
                className="label h-[30px] w-[44px] border border-line text-[10px] text-ink-2"
              >
                +5
              </button>
            </div>
          </div>

          <div className="mt-5 hidden gap-2 desk:flex">
            <button
              onClick={() => onAdjustWeight(-5)}
              className="label h-[40px] w-[62px] border border-line text-[12px] text-ink-2 hover:border-amber hover:text-amber"
            >
              −5
            </button>
            <button
              onClick={() => onAdjustWeight(5)}
              className="label h-[40px] w-[62px] border border-line text-[12px] text-ink-2 hover:border-green hover:text-green"
            >
              +5
            </button>
          </div>
        </div>

        {/* Reps + log */}
        <div className="desk:w-[clamp(320px,34vw,520px)] desk:shrink-0">
          <div className="flex items-center justify-between gap-4 desk:justify-end desk:gap-7">
            <button
              disabled={warm}
              onClick={() => setReps(Math.max(0, reps - 1))}
              className="label h-[60px] w-[60px] border border-line text-[18px] text-ink-2 disabled:text-off desk:h-[100px] desk:w-[100px] desk:text-[24px] hover:enabled:border-amber hover:enabled:text-amber"
            >
              −
            </button>
            <span className="num text-[56px] desk:text-[90px]">{reps}</span>
            <button
              disabled={warm}
              onClick={() => setReps(reps + 1)}
              className="label h-[60px] w-[60px] border border-line text-[18px] text-ink-2 disabled:text-off desk:h-[100px] desk:w-[100px] desk:text-[24px] hover:enabled:border-green hover:enabled:text-green"
            >
              +
            </button>
          </div>
          <div className="label mt-3 text-[8.5px] font-normal text-dim desk:text-right">
            {warm ? "Reps · warm-up set, not counted" : `Reps · target ${current.targetReps ?? current.reps}`}
          </div>

          <button
            onClick={onLog}
            className={`label mt-6 h-[70px] w-full text-[15px] desk:h-[140px] desk:text-[22px] ${
              warm ? "border border-amber-line text-amber" : "bg-green text-bg"
            }`}
          >
            {warm ? "Warm-up set done" : `Log set ${current.setIndex + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function RestState({
  remaining,
  total,
  reason,
  onExtend,
  onSkip,
}: {
  remaining: number;
  total: number;
  reason: "hit" | "miss" | null;
  onExtend: () => void;
  onSkip: () => void;
}) {
  const hit = reason !== "miss";
  const colour = hit ? "var(--green)" : "var(--amber)";
  const fraction = total > 0 ? remaining / total : 0;
  const radius = 118;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center px-[22px] py-8 desk:px-[26px]">
      {/* Mobile: ring. Desktop: a big countdown over a progress bar. */}
      <div className="relative flex h-[250px] w-[250px] items-center justify-center desk:hidden">
        <svg width="250" height="250" className="absolute -rotate-90">
          <circle cx="125" cy="125" r={radius} fill="none" stroke="var(--ring-track)" strokeWidth="3" />
          <circle
            cx="125"
            cy="125"
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
          />
        </svg>
        <span className="num text-[96px] tabular-nums" style={{ color: colour }}>
          {formatClock(remaining)}
        </span>
      </div>

      <div className="hidden w-full flex-col items-center desk:flex">
        <span className="num text-[clamp(120px,17vw,240px)] tabular-nums" style={{ color: colour }}>
          {formatClock(remaining)}
        </span>
        <div className="mt-6 h-[6px] w-full max-w-[720px] bg-ring-track-bar">
          <div className="h-full transition-[width]" style={{ width: `${fraction * 100}%`, background: colour }} />
        </div>
      </div>

      <div className={`label mt-5 text-[9px] desk:hidden ${hit ? "text-green" : "text-amber"}`}>
        {hit ? "All reps · short rest" : "Missed reps · longer rest"}
      </div>

      <div className="mt-6 flex w-full max-w-[520px] gap-3">
        <button
          onClick={onExtend}
          className="label h-[58px] flex-1 border border-line text-[12px] text-ink-2 hover:border-green hover:text-green desk:h-[72px] desk:text-[13px]"
        >
          +30 s
        </button>
        <button onClick={onSkip} className="label h-[58px] flex-1 bg-green text-[12px] text-bg desk:h-[72px] desk:text-[13px]">
          Next set
        </button>
      </div>
    </div>
  );
}

function FinishState({
  name,
  completedAll,
  setsLeft,
  quoteIdx,
  sets,
  volume,
  minutes,
  units,
  onSave,
  onBack,
}: {
  name: string;
  completedAll: boolean;
  setsLeft: number;
  quoteIdx: number;
  sets: number;
  volume: number;
  minutes: number;
  units: string;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <div className="px-[22px] py-8 desk:grid desk:grid-cols-[1fr_minmax(420px,560px)] desk:gap-16 desk:px-[26px] desk:py-10">
      {/* Left: what happened */}
      <div className="min-w-0">
        <div className={`label text-[9.5px] ${completedAll ? "text-green" : "text-amber"}`}>
          {completedAll ? `${name} complete` : `${name} · ended with ${setsLeft} sets left`}
        </div>
        <h1 className="num mt-4 text-[60px] uppercase leading-[0.84] desk:text-[clamp(64px,8vw,124px)] desk:leading-[0.82]">
          {FINISH_HEADLINES[quoteIdx % FINISH_HEADLINES.length]}
        </h1>
        <p className="label mt-5 max-w-[420px] text-[9px] font-normal leading-[1.8] text-dim">
          {FINISH_LINES[quoteIdx % FINISH_LINES.length]}
        </p>
      </div>

      {/* Right: the numbers and the way out */}
      <div className="mt-8 desk:mt-0">
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: sets, label: "Sets logged" },
            { value: volume.toLocaleString(), label: `${units} moved` },
            { value: minutes, label: "Minutes" },
          ].map((stat) => (
            <div key={stat.label} className="border border-line px-4 py-5">
              <div className="num text-[26px] text-green desk:text-[34px]">{stat.value}</div>
              <div className="label mt-2 text-[8px] text-dim">{stat.label}</div>
            </div>
          ))}
        </div>

        <button onClick={onSave} className="label mt-4 h-[64px] w-full bg-green text-[14px] text-bg desk:h-[100px] desk:text-[17px]">
          Save session
        </button>
        <button
          onClick={onBack}
          className="label mt-3 h-[52px] w-full border border-line text-[11px] text-ink-2 hover:border-green hover:text-green desk:h-[60px] desk:text-[11.5px]"
        >
          Back to session view
        </button>
      </div>
    </div>
  );
}

/** Warm-up cells carry their ramp reps; working cells carry the set number, then the result. */
function CellLabel({ children }: { children: React.ReactNode }) {
  return <span className="label mt-0.5 text-[6.5px] font-normal opacity-70">{children}</span>;
}

function Queue({
  exercises,
  session,
  barbellWeight,
  current,
  progress,
  onWarmToggle,
  onLogPending,
}: {
  exercises: SessionExercise[];
  session: SessionState;
  barbellWeight: number;
  current?: ReturnType<typeof buildQueue>[number];
  progress: { done: number; total: number };
  onWarmToggle: (exerciseId: string, setIndex: number) => void;
  onLogPending: (item: ReturnType<typeof buildQueue>[number]) => void;
}) {
  // Fixed columns so the WARM-UP / WORKING SETS headers line up down the table.
  const columns = "desk:grid desk:grid-cols-[1fr_170px_290px] desk:items-center desk:gap-4";

  return (
    <div className="border-t border-line">
      <div className={`flex items-center justify-between bg-panel px-[22px] py-3 desk:px-[26px] ${columns}`}>
        <span className="label text-[9px] text-dim">
          Session queue
          <span className="ml-2 text-green">
            {progress.done}/{progress.total}
          </span>
        </span>
        <span className="label hidden text-[8.5px] text-dim desk:block">Warm-up</span>
        <span className="label hidden text-[8.5px] text-dim desk:block">Working sets</span>
      </div>

      {exercises.map((exercise, exerciseIndex) => {
        const weight = session.weights[exercise.exerciseId] ?? 0;
        const ramp = generateWarmupSets(weight, barbellWeight);
        const warm = session.warm[exercise.exerciseId] ?? [];
        const sets = session.sets[exercise.exerciseId] ?? [];
        const isCurrent = current?.exerciseIndex === exerciseIndex;
        const doneCount = warm.filter(Boolean).length + sets.filter((set) => set.done).length;

        return (
          <div
            key={exercise.exerciseId}
            className={`flex flex-col gap-3 border-b border-line-faint px-[22px] py-4 desk:px-[26px] ${columns} ${
              isCurrent ? "border-l-2 border-l-green bg-subtle" : ""
            }`}
          >
            <div className="min-w-0">
              <div className="label text-[11px] text-ink">{exercise.exerciseName}</div>
              <div className="label mt-1.5 text-[8.5px] font-normal text-dim">
                {weight > 0 ? `${weight} ${exercise.mode === "BB" ? "" : ""}· ` : ""}
                {exercise.sets}×{exercise.reps} · {doneCount}/{warm.length + sets.length} done
              </div>
            </div>

            {/* desk:contents lets these two groups become grid cells on desktop */}
            <div className="flex flex-wrap items-center gap-1.5 desk:contents">
              <div className="flex gap-1.5">
                {warm.map((checked, setIndex) => {
                  const isNow = isCurrent && current?.kind === "warm" && current.setIndex === setIndex;
                  return (
                    <button
                      key={`warm-${setIndex}`}
                      onClick={() => onWarmToggle(exercise.exerciseId, setIndex)}
                      className={`flex h-[34px] w-[34px] flex-col items-center justify-center border desk:h-[48px] desk:w-[48px] ${
                        checked
                          ? "border-amber-line bg-amber-wash-faint text-amber"
                          : isNow
                            ? "border-amber bg-panel text-ink"
                            : "border-line text-faint"
                      }`}
                      title={`Warm-up ${setIndex + 1}`}
                    >
                      <span className="num text-[13px] desk:text-[15px]">{ramp[setIndex]?.weight ?? ""}</span>
                      <CellLabel>×{ramp[setIndex]?.reps ?? 5}</CellLabel>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-1.5">
                {sets.map((set, setIndex) => {
                  const isNow = isCurrent && current?.kind === "work" && current.setIndex === setIndex;
                  const hit = set.done && set.reps >= exercise.reps;
                  return (
                    <button
                      key={`work-${setIndex}`}
                      disabled={set.done}
                      onClick={() =>
                        onLogPending({
                          kind: "work",
                          exerciseId: exercise.exerciseId,
                          exerciseIndex,
                          setIndex,
                          weight,
                          reps: set.reps,
                          targetReps: exercise.reps,
                        })
                      }
                      className={`flex h-[34px] w-[34px] flex-col items-center justify-center border desk:h-[48px] desk:w-[48px] ${
                        set.done
                          ? hit
                            ? "border-transparent bg-green-wash text-green"
                            : "border-transparent bg-amber-wash text-amber"
                          : isNow
                            ? "border-green bg-panel text-ink"
                            : "border-line text-faint"
                      }`}
                    >
                      <span className="num text-[13px] desk:text-[15px]">
                        {set.done ? set.reps : setIndex + 1}
                      </span>
                      <CellLabel>{set.done ? (hit ? "hit" : "short") : "set"}</CellLabel>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
