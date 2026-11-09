"use client";

import { PLATE_BLOCK_SIZE } from "@/lib/plates";

/**
 * One side of a loaded bar: shaft, plates outside-in from heaviest, collar, sleeve
 * end — all on one vertical centre axis, with the plate labels on a single baseline
 * beneath. Block sizes come from the handoff plate table; `scale` multiplies them so
 * the desktop hero can show the bar at the weight of the number beside it.
 */
export function BarDiagram({ plates, scale = 1 }: { plates: number[]; scale?: number }) {
  const px = (value: number) => Math.round(value * scale);
  const shaft = { w: px(34), h: px(6) };
  const collar = { w: px(5), h: px(18) };
  const sleeve = { w: px(14), h: px(6) };
  const gap = Math.max(2, px(2));
  const tallest = plates.reduce((max, plate) => Math.max(max, PLATE_BLOCK_SIZE[plate]?.h ?? 0), collar.h);

  return (
    <div className="flex flex-col items-start" style={{ gap: px(6) }}>
      <div className="flex items-center" style={{ height: px(tallest) }}>
        <div style={{ width: shaft.w, height: shaft.h, background: "var(--text-faint)" }} />
        {plates.map((plate, index) => {
          const size = PLATE_BLOCK_SIZE[plate] ?? { w: 8, h: 30 };
          const heavy = plate >= 25;
          return (
            <div
              key={`${plate}-${index}`}
              className="rounded-[2px] border"
              style={{
                width: px(size.w),
                height: px(size.h),
                background: heavy ? "var(--plate-heavy)" : "var(--plate-light)",
                borderColor: heavy ? "var(--text-disabled)" : "#2b3235",
                marginRight: gap,
              }}
            />
          );
        })}
        <div style={{ width: collar.w, height: collar.h, background: "var(--text-disabled)" }} />
        <div style={{ width: sleeve.w, height: sleeve.h, background: "var(--text-faint)" }} />
      </div>

      <div className="flex items-start">
        <span style={{ width: shaft.w }} />
        {plates.map((plate, index) => {
          const size = PLATE_BLOCK_SIZE[plate] ?? { w: 8, h: 30 };
          return (
            <span
              key={`label-${plate}-${index}`}
              className="text-center tracking-[0.06em] text-dim"
              style={{ width: px(size.w), marginRight: gap, fontSize: Math.max(7.5, px(7.5)) }}
            >
              {plate}
            </span>
          );
        })}
      </div>
    </div>
  );
}
