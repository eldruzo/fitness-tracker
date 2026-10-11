import { useMemo, useRef, useState } from 'preact/hooks';
import { fmtDate, fmtNum, t } from '../i18n';
import { diffDays, type DateKey } from '../lib/dates';

export interface ChartPoint {
  date: DateKey;
  value: number;
}

/**
 * Single-series time chart. One y-axis, a 2px ink line, 8px square markers with
 * a surface ring, recessive gridlines, the latest value labelled directly.
 * Pointer and keyboard (arrow keys) both move a crosshair with a tooltip.
 * Always paired with a data table by the caller.
 */
export function LineChart({
  points,
  label,
  unit,
  digits = 1,
  height = 180,
}: {
  points: ChartPoint[];
  label: string;
  unit?: string;
  digits?: number;
  height?: number;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 56, t: 14, b: 26 };
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    if (!points.length) return null;
    const vals = points.map((p) => p.value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (lo === hi) {
      const d = Math.abs(lo) * 0.1 || 1;
      lo -= d;
      hi += d;
    }
    const ticks = niceTicks(lo, hi, 4, Math.pow(10, -digits));
    lo = Math.min(lo, ticks[0]);
    hi = Math.max(hi, ticks[ticks.length - 1]);
    const first = points[0].date;
    const span = Math.max(1, diffDays(first, points[points.length - 1].date));
    const x = (d: DateKey) =>
      points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (diffDays(first, d) / span) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    return { ticks, x, y, xs: points.map((p) => x(p.date)) };
  }, [points, H, digits]);

  if (!geo) return null;
  const { ticks, x, y, xs } = geo;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  const fmt = (v: number) => `${fmtNum(v, digits)}${unit ? ` ${unit}` : ''}`;
  const xLabels = points.length === 1 ? [points[0]] : [points[0], points[points.length - 1]];

  const nearest = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
    return best;
  };

  const a = active !== null ? points[active] : null;
  const ax = a ? x(a.date) : 0;
  const ay = a ? y(a.value) : 0;
  const tipW = 132;
  const tipX = Math.min(Math.max(ax - tipW / 2, pad.l), W - pad.r - tipW + 40);

  return (
    <svg
      ref={svgRef}
      class="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t('chart.summary', {
        label,
        n: points.length,
        first: fmt(points[0].value),
        last: fmt(last.value),
      })}
      tabIndex={0}
      onPointerMove={(e) => setActive(nearest(e.clientX))}
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const d = e.key === 'ArrowRight' ? 1 : -1;
          setActive((cur) => Math.max(0, Math.min(points.length - 1, (cur ?? (d > 0 ? -1 : points.length)) + d)));
        } else if (e.key === 'Escape') setActive(null);
      }}
    >
      <g class="chart-grid" aria-hidden="true">
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tv)} y2={y(tv)} />
            <text x={pad.l - 8} y={y(tv)} dy="0.32em" text-anchor="end">
              {fmtNum(tv, digits)}
            </text>
          </g>
        ))}
        {xLabels.map((p, i) => (
          <text
            key={p.date}
            x={x(p.date)}
            y={H - 6}
            text-anchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}
          >
            {fmtDate(p.date).slice(0, 5)}
          </text>
        ))}
      </g>
      <g aria-hidden="true">
        {points.length > 1 && <path class="chart-line" d={path} />}
        {points.map((p, i) => (
          <rect
            key={p.date + i}
            class={`chart-dot${i === active ? ' is-active' : ''}`}
            x={x(p.date) - 4}
            y={y(p.value) - 4}
            width="8"
            height="8"
          />
        ))}
        <text class="chart-last" x={x(last.date) + 10} y={y(last.value)} dy="0.32em">
          {fmtNum(last.value, digits)}
        </text>
        {a && (
          <g class="chart-tip">
            <line class="chart-cross" x1={ax} x2={ax} y1={pad.t} y2={H - pad.b} />
            <rect x={tipX} y={Math.max(2, ay - 46)} width={tipW} height="36" />
            <text x={tipX + 8} y={Math.max(2, ay - 46) + 15}>
              {fmtDate(a.date)}
            </text>
            <text x={tipX + 8} y={Math.max(2, ay - 46) + 30} class="chart-tip-v">
              {fmt(a.value)}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

/** 1-2-5 "nice" tick values spanning [lo, hi]. */
export function niceTicks(lo: number, hi: number, count: number, minStep = 0): number[] {
  const raw = Math.max((hi - lo) / Math.max(1, count), minStep);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.5; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
