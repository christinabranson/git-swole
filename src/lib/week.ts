import { getNextDayId } from "@/lib/program";
import { WorkoutLog, WorkoutTemplate } from "@/lib/types";

export type WeekDayCell = {
  key: string;
  dayLetter: string;
  /** Workout letter (A / B / C). Absent only on rest days. */
  letter?: string;
  /** A session was logged on this day — the cell fills solid. */
  completed: boolean;
  /** Today — the cell takes a green ring, whether or not it is also completed. */
  isToday: boolean;
  /** Nothing planned and nothing logged. */
  rest: boolean;
};

export type WeekStrip = {
  days: WeekDayCell[];
  /** e.g. "AUG 17 – 23", or "AUG 31 – SEP 6" across a month boundary. */
  rangeLabel: string;
};

const DAY_LETTERS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
// Days the program is planned on. Past days with no log read as rest.
const TRAINING_DAYS = new Set([0, 2, 4]); // Mon / Wed / Fri

/** "workout-a" → "A"; falls back to the first letter of the name. */
export function workoutLetter(group: WorkoutTemplate | undefined, groupId?: string) {
  const source = group?.id ?? groupId ?? "";
  const match = source.match(/-([a-z])$/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return (group?.name ?? source).trim().slice(-1).toUpperCase() || "?";
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const weekday = (result.getDay() + 6) % 7; // Monday-first
  result.setDate(result.getDate() - weekday);
  result.setHours(0, 0, 0, 0);
  return result;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function monthName(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

function formatRange(monday: Date, sunday: Date) {
  const from = monthName(monday);
  const to = monthName(sunday);
  return from === to
    ? `${from} ${monday.getDate()} – ${sunday.getDate()}`
    : `${from} ${monday.getDate()} – ${to} ${sunday.getDate()}`;
}

/**
 * The Monday–Sunday strip on Today.
 *
 * Cells carry two independent signals: `completed` fills the cell, `isToday` rings
 * it — so a day that is both still reads as today. Days ahead of today on the
 * program's training days show the letter they are projected to be, walking the
 * A → B → A → C rotation forward from what is up next.
 */
export function buildWeekStrip(
  logs: WorkoutLog[],
  groups: WorkoutTemplate[],
  nextGroupId: string,
  now: Date,
): WeekStrip {
  const monday = startOfWeek(now);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Day history, most recent first — what the rotation needs to project forward.
  const history = logs
    .slice()
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .map((log) => log.workoutType);

  let projectedId = nextGroupId;
  const takeProjected = () => {
    const current = projectedId;
    projectedId = getNextDayId(current, groups, history);
    history.unshift(current);
    return current;
  };

  const days = DAY_LETTERS.map((dayLetter, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const isToday = sameDay(date, now);

    const log = logs.find((entry) => sameDay(new Date(entry.date), date));
    if (log) {
      const group = groups.find((item) => item.id === log.workoutType);
      return {
        key,
        dayLetter,
        letter: workoutLetter(group, log.workoutType),
        completed: true,
        isToday,
        rest: false,
      };
    }

    if (isToday) {
      const group = groups.find((item) => item.id === nextGroupId);
      return {
        key,
        dayLetter,
        letter: workoutLetter(group, takeProjected()),
        completed: false,
        isToday: true,
        rest: false,
      };
    }

    if (date > now && TRAINING_DAYS.has(index)) {
      const id = takeProjected();
      return {
        key,
        dayLetter,
        letter: workoutLetter(
          groups.find((item) => item.id === id),
          id,
        ),
        completed: false,
        isToday: false,
        rest: false,
      };
    }

    return { key, dayLetter, completed: false, isToday: false, rest: true };
  });

  return { days, rangeLabel: formatRange(monday, sunday) };
}
