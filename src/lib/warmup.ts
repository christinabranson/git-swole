import { PlateInventoryItem } from "@/lib/types";
import { computePlates } from "@/lib/plates";

export type WarmupSet = {
  weight: number;
  reps: number;
};

function roundTo5(weight: number) {
  return Math.round(weight / 5) * 5;
}

/**
 * The ramp is three sets computed off the working weight `w` and bar weight `b`:
 *   1. b × 5      2. max(b, round(w × 0.50)) × 5      3. max(b, round(w × 0.75)) × 3
 * Warm-ups never count toward volume and never affect progression.
 */
export function generateWarmupSets(targetWeight: number, barbellWeight: number): WarmupSet[] {
  return [
    { weight: barbellWeight, reps: 5 },
    { weight: Math.max(barbellWeight, roundTo5(targetWeight * 0.5)), reps: 5 },
    { weight: Math.max(barbellWeight, roundTo5(targetWeight * 0.75)), reps: 3 },
  ];
}

export const WARMUP_SET_COUNT = 3;

/** Convenience for the session screen: the ramp plus its plate maths. */
export function describeWarmupSet(
  set: WarmupSet,
  barbellWeight: number,
  inventory: PlateInventoryItem[],
) {
  return { ...set, plates: computePlates(set.weight, barbellWeight, inventory) };
}
