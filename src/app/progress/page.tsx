"use client";

import { useMemo, useState } from "react";
import { useWorkoutApp } from "@/context/workout-app-context";
import { ScrollStrip } from "@/components/scroll-strip";
import { EXERCISES } from "@/lib/program";
import { ExerciseKey, WorkoutExerciseLog } from "@/lib/types";

const RANGES = [
  { key: "3M", months: 3 },
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "2Y", months: 24 },
  { key: "5Y", months: 60 },
] as const;

// Chart viewBox. Stretched to the container width, so all geometry is normalised.
const CHART_W = 720;
const CHART_H = 220;
const PAD_Y = 16;
// Horizontal inset so the first and last points are not clipped by the edges.
const PAD_X = 10;
// Head- and foot-room, so the line never runs corner to corner regardless of data.
const DOMAIN_PAD = 0.18;

function topSet(entry: WorkoutExerciseLog) {
  return Math.max(...entry.setResults.map((set) => set.completedReps));
}

function fullDate(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

export default function ProgressScreen() {
  const { workoutLogs, settings, stateLoaded, currentWeights } = useWorkoutApp();
  const [lift, setLift] = useState<ExerciseKey>("squat");
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("3M");
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    const months = RANGES.find((item) => item.key === range)?.months ?? 3;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const raw = workoutLogs
      .filter((workout) => new Date(workout.date) >= cutoff)
      .flatMap((workout) => {
        const entry = workout.exercises.find((exercise) => exercise.exerciseKey === lift);
        return entry ? [{ date: new Date(workout.date), weight: entry.weight, entry }] : [];
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const weights = raw.map((point) => point.weight);
    const low = weights.length ? Math.min(...weights) : 0;
    const high = weights.length ? Math.max(...weights) : 1;
    // A flat series still needs a domain to sit inside.
    const pad = (high - low || 10) * DOMAIN_PAD;
    // Snap the axis to round numbers — an unsnapped domain reads as 181 / 103 / 24.
    const step = high - low > 100 ? 10 : 5;
    const domainMin = Math.max(0, Math.floor((low - pad) / step) * step);
    const domainMax = Math.ceil((high + pad) / step) * step;
    const domainSpan = domainMax - domainMin;

    return {
      domainMin,
      domainMax,
      points: raw.map((point, index) => ({
        ...point,
        nx: raw.length === 1 ? 0.5 : index / (raw.length - 1),
        ny: (domainMax - point.weight) / domainSpan,
      })),
    };
  }, [workoutLogs, lift, range]);

  const series = chart.points;

  const stats = useMemo(() => {
    if (series.length === 0) return null;
    const best = series.reduce((max, point) => (point.weight > max.weight ? point : max), series[0]);
    const missedSets = series.reduce(
      (count, point) =>
        count + point.entry.setResults.filter((set) => set.skipped || set.completedReps < set.targetReps).length,
      0,
    );
    const oneRm = series.reduce((max, point) => {
      // Epley: an estimate, not a tested max.
      return Math.max(max, point.weight * (1 + topSet(point.entry) / 30));
    }, 0);
    return {
      current: series[series.length - 1].weight,
      gain: series[series.length - 1].weight - series[0].weight,
      bestSet: `${best.weight} × ${topSet(best.entry)}`,
      missedSets,
      oneRm: Math.round(oneRm),
      sessions: series.length,
    };
  }, [series]);

  if (!stateLoaded) {
    return <div className="label px-[22px] py-10 text-[10px] text-dim desk:px-[26px]">Loading</div>;
  }

  const toY = (ny: number) => PAD_Y + ny * (CHART_H - PAD_Y * 2);
  const toX = (nx: number) => PAD_X + nx * (CHART_W - PAD_X * 2);
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const polyline = series.map((point) => `${toX(point.nx).toFixed(1)},${toY(point.ny).toFixed(1)}`).join(" ");
  const active = hovered !== null ? series[hovered] : null;

  // Nearest point to the pointer, in container space.
  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (series.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHovered(Math.round(fraction * (series.length - 1)));
  };

  const liftName = EXERCISES.find((exercise) => exercise.key === lift)?.name ?? lift;

  return (
    <div className="px-[22px] py-5 desk:px-[26px]">
      {/* Lift selector strip */}
      <div className="-mx-[22px] mb-6 border-y border-line desk:-mx-[26px]">
        <ScrollStrip>
          {EXERCISES.map((exercise) => {
          const activeLift = exercise.key === lift;
          const sessions = workoutLogs.filter((workout) =>
            workout.exercises.some((item) => item.exerciseKey === exercise.key),
          ).length;
          return (
            <button
              key={exercise.key}
              onClick={() => {
                setLift(exercise.key);
                setHovered(null);
              }}
              className={`min-w-[170px] shrink-0 border-b-2 px-4 py-3 text-left ${
                activeLift ? "border-green bg-subtle" : "border-transparent hover:bg-hover"
              }`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className={`label text-[9px] ${activeLift ? "text-ink" : "text-dim"}`}>{exercise.name}</span>
                <span className="num text-[18px] text-green">{currentWeights[exercise.key] ?? "—"}</span>
              </div>
                <div className="label mt-1 text-[8px] font-normal text-dim">{sessions} sessions</div>
              </button>
            );
          })}
        </ScrollStrip>
      </div>

      {stats ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="num text-[56px] uppercase leading-[0.9] desk:text-[64px]">{liftName}</h1>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="num text-[40px]">{stats.current}</span>
                <span className="label text-[9px] text-dim">
                  {stats.gain >= 0 ? "+" : ""}
                  {stats.gain} {settings.units} last {range}
                </span>
              </div>
            </div>

            {/* Range chips sit with the headline, per the reference */}
            <div className="flex flex-wrap gap-2">
              {RANGES.map((item) => {
                const on = item.key === range;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setRange(item.key);
                      setHovered(null);
                    }}
                    className={`label border px-4 py-2.5 text-[9px] ${
                      on ? "border-green bg-green-wash-tint text-green" : "border-line text-dim hover:text-ink-2"
                    }`}
                  >
                    {item.key}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart with a scrubber: hovering reads out the date and weight. */}
          <div className="mt-7 flex gap-3">
            {/* Y axis: without it a 5 lb gain and a 115 lb gain draw identically. */}
            <div className="relative w-[46px] shrink-0" style={{ height: CHART_H }}>
              {[0, 0.5, 1].map((step) => (
                <span
                  key={step}
                  className="label absolute right-0 -translate-y-1/2 text-[8px] font-normal text-dim"
                  style={{ top: pct(toY(step), CHART_H) }}
                >
                  {Math.round(chart.domainMax - step * (chart.domainMax - chart.domainMin))}
                </span>
              ))}
            </div>

            <div
              className="relative flex-1 select-none"
              onMouseMove={onMove}
              onMouseLeave={() => setHovered(null)}
            >
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="none"
                className="h-[220px] w-full"
              >
                {[0, 0.5, 1].map((step) => (
                  <line
                    key={step}
                    x1="0"
                    x2={CHART_W}
                    y1={toY(step)}
                    y2={toY(step)}
                    stroke="var(--border-faint)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                {active ? (
                  <line
                    x1={toX(active.nx)}
                    x2={toX(active.nx)}
                    y1="0"
                    y2={CHART_H}
                    stroke="var(--green)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                <polyline
                  points={polyline}
                  fill="none"
                  stroke="var(--text-primary)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/*
               * Markers are HTML, not SVG: the viewBox is stretched horizontally, so
               * an SVG rect would come out oblong.
               */}
              {series.map((point, index) => (
                <span
                  key={point.date.toISOString()}
                  className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${
                    index === hovered ? "h-[9px] w-[9px] bg-green" : "h-[4px] w-[4px] bg-dim"
                  }`}
                  style={{ left: pct(toX(point.nx), CHART_W), top: pct(toY(point.ny), CHART_H) }}
                />
              ))}

              {active ? (
                <div
                  className="pointer-events-none absolute z-10 border border-line bg-panel px-3 py-2"
                  style={{
                    left: pct(toX(active.nx), CHART_W),
                    top: pct(toY(active.ny), CHART_H),
                    transform: `translate(${active.nx > 0.8 ? "-100%" : active.nx < 0.2 ? "0" : "-50%"}, -140%)`,
                  }}
                >
                  <div className="label text-[8px] font-normal text-dim">{fullDate(active.date)}</div>
                  <div className="num mt-1 text-[20px] text-ink">
                    {active.weight}
                    <span className="label ml-1.5 text-[8px] text-dim">{settings.units}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Axis ticks, offset to clear the y-axis gutter */}
          <div className="label mt-2 flex justify-between pl-[58px] text-[8px] font-normal text-dim">
            {[series[0], series[Math.floor(series.length / 2)], series[series.length - 1]].map(
              (point, index) => (
                <span key={index}>
                  {point?.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                </span>
              ),
            )}
          </div>

          {/* Stat row */}
          <div className="mt-7 grid grid-cols-2 border-y border-line desk:grid-cols-4">
            {[
              { label: "Best set", value: stats.bestSet },
              { label: "Missed sets", value: stats.missedSets },
              { label: "Est 1RM", value: stats.oneRm },
              { label: "Sessions", value: stats.sessions },
            ].map((stat, index) => (
              <div
                key={stat.label}
                className={`px-5 py-5 ${index % 2 === 1 ? "border-l border-line" : ""} ${
                  index >= 2 ? "border-t border-line desk:border-t-0" : ""
                } ${index > 0 ? "desk:border-l desk:border-line" : ""}`}
              >
                <div className="label text-[8.5px] text-dim">{stat.label}</div>
                <div className="num mt-2 text-[26px] desk:text-[30px]">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Session table for the charted range */}
          <div className="mt-8">
            <div className="label mb-1 text-[9px] text-dim">Sessions · {range}</div>
            <div className="label grid grid-cols-[1fr_90px_150px] items-center gap-3 border-b border-line py-3 text-[9px] text-dim desk:grid-cols-[1fr_110px_260px_90px]">
              <span>Date</span>
              <span className="text-right">Weight</span>
              <span className="text-right">Sets</span>
              <span className="hidden text-right desk:block">Change</span>
            </div>

            {[...series].reverse().map((point, index, reversed) => {
              const previous = reversed[index + 1];
              const change = previous ? point.weight - previous.weight : null;
              return (
                <div
                  key={point.date.toISOString()}
                  className={`grid grid-cols-[1fr_90px_150px] items-center gap-3 border-b border-line-faint py-3 desk:grid-cols-[1fr_110px_260px_90px] ${
                    active && active.date.getTime() === point.date.getTime() ? "bg-subtle" : "hover:bg-hover"
                  }`}
                >
                  <span className="label text-[10px] text-ink">{fullDate(point.date)}</span>
                  <span className="num text-right text-[22px]">{point.weight}</span>
                  {/* Per-set cells: green hit the target, amber came up short. */}
                  <div className="flex flex-wrap justify-end gap-1">
                    {point.entry.setResults.map((set) => {
                      const hit = !set.skipped && set.completedReps >= set.targetReps;
                      return (
                        <span
                          key={set.setNumber}
                          className={`flex h-[26px] w-[26px] items-center justify-center ${
                            hit ? "bg-green-wash text-green" : "bg-amber-wash text-amber"
                          }`}
                        >
                          <span className="num text-[11px]">{set.completedReps}</span>
                        </span>
                      );
                    })}
                  </div>
                  <span
                    className={`label hidden text-right text-[9px] desk:block ${
                      change === null ? "text-off" : change > 0 ? "text-green" : change < 0 ? "text-amber" : "text-dim"
                    }`}
                  >
                    {change === null ? "—" : change > 0 ? `+${change}` : change < 0 ? `${change}` : "hold"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <h1 className="num text-[56px] uppercase leading-[0.9] desk:text-[64px]">{liftName}</h1>
          <p className="label mt-5 text-[9.5px] font-normal leading-[1.8] text-dim">
            No sessions for this lift in the last {range}. Pick a longer range or train it.
          </p>
        </>
      )}
    </div>
  );
}
