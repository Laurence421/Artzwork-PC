"use client";

import { useState } from "react";
import { formatPrice } from "@/features/shared/lib/money";

export type DailySales = { day: string; sales: number; orders: number };

const W = 600;
const H = 180;
const TOP = 16; // room for the max label
const GAP = 2; // surface gap between bars
const RADIUS = 4; // rounded data end

const dayLabel = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDay = (iso: string) => dayLabel.format(new Date(`${iso}T00:00:00Z`));

/** Bar with a rounded top and a square base on the baseline. */
function barPath(x: number, w: number, h: number) {
  const y = H - h;
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H} Z`;
}

/** Daily sales, last 30 days. One series, so no legend: the title names it. */
export function SalesChart({ daily }: { daily: DailySales[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...daily.map((d) => d.sales), 0);
  const slot = W / daily.length;
  const barW = slot - GAP;
  const height = (sales: number) => (max === 0 ? 0 : (sales / max) * (H - TOP));
  const current = active === null ? null : daily[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full overflow-visible" role="group" aria-label="Sales per day, last 30 days">
          {/* Recessive grid: the top value and the baseline only. */}
          <line x1={0} x2={W} y1={TOP} y2={TOP} className="stroke-border" strokeDasharray="2 4" />
          <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" />
          {daily.map((d, i) => {
            const h = height(d.sales);
            return (
              <g
                key={d.day}
                tabIndex={0}
                aria-label={`${fmtDay(d.day)}: ${formatPrice(d.sales)}, ${d.orders} orders`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-default outline-none"
              >
                {/* Hit area is the whole column, bigger than the bar. The bar's aria-label is what screen readers hear. */}
                <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                {h > 0 && (
                  <path
                    d={barPath(i * slot + GAP / 2, barW, h)}
                    className={`fill-chart-1 ${active === i ? "opacity-80" : ""}`}
                  />
                )}
                {active === i && <rect x={i * slot} y={0} width={slot} height={H} className="fill-none stroke-primary" strokeWidth={1} />}
              </g>
            );
          })}
        </svg>
        {max > 0 && (
          <span className="absolute top-0 left-0 -translate-y-1/2 bg-surface pr-1 text-xs text-muted tabular-nums">
            {formatPrice(max)}
          </span>
        )}
        {current && active !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 z-10 flex -translate-x-1/2 -translate-y-full flex-col rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            style={{ left: `${((active + 0.5) / daily.length) * 100}%` }}
          >
            <span className="font-semibold tabular-nums">{formatPrice(current.sales)}</span>
            <span className="text-muted">
              {fmtDay(current.day)} · {current.orders} {current.orders === 1 ? "order" : "orders"}
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>{fmtDay(daily[0].day)}</span>
        <span>{fmtDay(daily[daily.length - 1].day)}</span>
      </div>
      {max === 0 && <p className="text-sm text-muted">No sales in the last 30 days yet.</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Sales</th>
              <th className="py-1 text-right font-medium">Orders</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day} className="border-t border-border">
                <td className="py-1">{fmtDay(d.day)}</td>
                <td className="py-1 text-right">{formatPrice(d.sales)}</td>
                <td className="py-1 text-right">{d.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
