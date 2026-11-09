"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A horizontally scrollable selector strip with edge chevrons.
 *
 * The chevrons only appear when the content actually overflows, and each one
 * disappears at its end of the travel. They overlay the strip rather than sitting
 * beside it: on a 390px phone a pair of flanking buttons would eat a quarter of
 * the available width.
 */
export function ScrollStrip({ children }: { children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const readEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  /*
   * A ResizeObserver delivers an initial observation on observe(), so the first
   * measurement arrives through the callback rather than a setState in the effect
   * body. It watches the content too, since items can arrive after mount.
   */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(readEdges);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [readEdges]);

  const nudge = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const chevron =
    "absolute top-0 bottom-0 z-10 flex w-[30px] items-center justify-center bg-raised/95 text-[15px] text-ink-2 hover:text-green";

  return (
    <div className="relative">
      <div ref={scroller} onScroll={readEdges} className="scrollbar-none flex gap-px overflow-x-auto">
        {children}
      </div>

      {edges.left ? (
        <button onClick={() => nudge(-1)} aria-label="Scroll left" className={`${chevron} left-0 border-r border-line`}>
          ‹
        </button>
      ) : null}
      {edges.right ? (
        <button onClick={() => nudge(1)} aria-label="Scroll right" className={`${chevron} right-0 border-l border-line`}>
          ›
        </button>
      ) : null}
    </div>
  );
}
