"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

/** Fixed-row-height windowed list — renders only visible rows (+ overscan) so thousands of assets stay smooth. */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  overscan = 6,
  className = "",
}: {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  return (
    <div
      ref={ref}
      className={`overflow-y-auto ${className}`}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        requestAnimationFrame(() => setScrollTop(top));
      }}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {items.slice(start, end).map((item, i) => (
          <div key={start + i} style={{ position: "absolute", top: (start + i) * rowHeight, left: 0, right: 0, height: rowHeight }}>
            {renderRow(item, start + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
