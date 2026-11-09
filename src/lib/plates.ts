import { PlateInventoryItem } from "@/lib/types";

export const DEFAULT_PLATE_INVENTORY: PlateInventoryItem[] = [
  { weight: 45, pairs: 4 },
  { weight: 35, pairs: 2 },
  { weight: 25, pairs: 2 },
  { weight: 10, pairs: 2 },
  { weight: 5, pairs: 2 },
  { weight: 2.5, pairs: 2 },
];

/** Plate block sizes for the loaded-bar diagram, in px (width × height). */
export const PLATE_BLOCK_SIZE: Record<number, { w: number; h: number }> = {
  45: { w: 17, h: 74 },
  35: { w: 15, h: 64 },
  25: { w: 13, h: 54 },
  10: { w: 10, h: 40 },
  5: { w: 8, h: 31 },
  2.5: { w: 7, h: 25 },
};

export type PlateMath = {
  /** Plates for one side, heaviest first. */
  plates: number[];
  /** Weight per side that the owned plates could not make. */
  short: number;
  perSide: number;
  barOnly: boolean;
};

/**
 * Greedy per-side plate maths, bounded by the pairs the user actually owns.
 * A pair count of zero drops that plate from the calculation entirely; anything
 * left over is reported as `short` rather than silently discarded.
 */
export function computePlates(
  targetWeight: number,
  barbellWeight: number,
  inventory: PlateInventoryItem[] = DEFAULT_PLATE_INVENTORY,
): PlateMath {
  const perSide = Math.max(0, (targetWeight - barbellWeight) / 2);

  if (perSide === 0) {
    return { plates: [], short: 0, perSide: 0, barOnly: true };
  }

  let remaining = perSide;
  const plates: number[] = [];
  const owned = [...inventory]
    .filter((item) => item.weight > 0 && item.pairs > 0)
    .sort((a, b) => b.weight - a.weight);

  for (const item of owned) {
    const fits = Math.floor((remaining + 0.001) / item.weight);
    const count = Math.min(fits, item.pairs);
    for (let index = 0; index < count; index += 1) {
      plates.push(item.weight);
      remaining = Number((remaining - item.weight).toFixed(2));
    }
  }

  return {
    plates,
    short: remaining > 0.001 ? Number(remaining.toFixed(2)) : 0,
    perSide,
    barOnly: false,
  };
}
