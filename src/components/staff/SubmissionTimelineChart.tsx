import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  dayLabel,
  formatValue,
  valueOn,
  type TimelineChart,
  type TimelinePoint,
  type TimelineSeries,
} from "@/lib/submissionTimeline";

/** The current event, then earlier editions, in a fixed order: color follows the edition. */
const CURVE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];
/** The line says which series: solid for submitted to the event, dashed for added to deejaytools. */
const SERIES_DASH: Record<TimelineSeries, string | undefined> = { submitted: undefined, added: "5 4" };

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { top: 12, right: 16, bottom: 32, left: 44 };

function ticks(max: number, unit: TimelineChart["unit"]): number[] {
  if (unit === "percent") return [0, 25, 50, 75, 100];
  const step = Math.max(1, Math.ceil(max / 4 / 5) * 5);
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}

function dayTicks(from: number, to: number): number[] {
  const out: number[] = [];
  for (let d = Math.ceil(from / 7) * 7; d <= to; d += 7) out.push(d);
  if (!out.includes(0) && from <= 0 && to >= 0) out.push(0);
  return out.sort((a, b) => a - b);
}

function Swatch({ color, series }: { color: string; series: TimelineSeries }) {
  return (
    <svg width="18" height="6" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2" strokeDasharray={SERIES_DASH[series]} />
    </svg>
  );
}

/**
 * Cumulative submissions by day from day 0, the current event against
 * earlier editions of its series: for each edition (one color) a solid line
 * for music submitted to the event and a dashed one for the same songs by
 * the day they were added to deejaytools. Hovering reads every line on one
 * day; otherwise the readout is today.
 */
export default function SubmissionTimelineChart({ chart }: { chart: TimelineChart }) {
  const { unit, fromDay, toDay, today, curves } = chart;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const maxValue = useMemo(() => {
    const top = Math.max(1, ...curves.flatMap((c) => [...c.points, ...c.added].map((p) => p.value)));
    return unit === "percent" ? Math.max(100, top) : top;
  }, [curves, unit]);
  const yTicks = ticks(maxValue, unit);
  const yMax = Math.max(maxValue, yTicks.at(-1) ?? 0);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (day: number) => PAD.left + ((day - fromDay) / Math.max(1, toDay - fromDay)) * innerW;
  const y = (value: number) => PAD.top + innerH - (value / yMax) * innerH;
  const path = (points: TimelinePoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join("");

  const todayInRange = today >= fromDay && today <= toDay;
  const readDay = hoverDay ?? (todayInRange ? today : toDay);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const sx = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const day = Math.round(fromDay + ((sx - PAD.left) / innerW) * (toDay - fromDay));
    setHoverDay(Math.min(toDay, Math.max(fromDay, day)));
  };

  const read = (v: number | null) => (v === null ? "no data" : formatValue(v, unit));
  const summary = curves
    .map((c) => `${c.name}: ${read(valueOn(c, readDay))} submitted, ${read(valueOn(c, readDay, "added"))} added`)
    .join("; ");

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
        <li className="font-medium text-foreground">{dayLabel(readDay)}{readDay === today && " (today)"}</li>
        {curves.map((c, i) => {
          const color = CURVE_COLORS[i % CURVE_COLORS.length];
          const v = valueOn(c, readDay);
          const added = valueOn(c, readDay, "added");
          return (
            <li key={c.id} className="flex items-center gap-1.5">
              <Swatch color={color} series="submitted" />
              <span className={c.current ? "text-foreground" : undefined}>{c.name}</span>
              <span className="tabular-nums text-foreground">{v === null ? "–" : formatValue(v, unit)}</span>
              <Swatch color={color} series="added" />
              <span className="tabular-nums" title="Added to deejaytools">
                {added === null ? "–" : formatValue(added, unit)} added
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["submitted", "added"] as const).map((series) => (
          <span key={series} className="flex items-center gap-1.5">
            <Swatch color="currentColor" series={series} />
            {series === "submitted" ? "Submitted to the event" : "Song added to deejaytools"}
          </span>
        ))}
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`Submissions by day from the start, and their songs by the day added to deejaytools, ${unit === "percent" ? "as a share of registrations" : "as counts"}. ${dayLabel(readDay)}: ${summary}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverDay(null)}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className="stroke-muted-foreground/15" />
            <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {formatValue(t, unit)}
            </text>
          </g>
        ))}
        {dayTicks(fromDay, toDay).map((d) => (
          <text key={`x${d}`} x={x(d)} y={HEIGHT - PAD.bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
            {d < 0 ? `−${-d}` : d}
          </text>
        ))}
        <text x={PAD.left + innerW / 2} y={HEIGHT - 2} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          Days from the start (day 0)
        </text>
        {fromDay <= 0 && toDay >= 0 && (
          <line x1={x(0)} x2={x(0)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-muted-foreground/40" />
        )}
        {[...curves].reverse().flatMap((c) => {
          const i = curves.indexOf(c);
          return (["added", "submitted"] as const).map((series) => (
            <path
              key={`${c.id}-${series}`}
              d={path(series === "added" ? c.added : c.points)}
              fill="none"
              stroke={CURVE_COLORS[i % CURVE_COLORS.length]}
              strokeWidth={c.current ? 2.5 : 2}
              strokeDasharray={SERIES_DASH[series]}
              strokeLinejoin="round"
              strokeLinecap={series === "added" ? "butt" : "round"}
              opacity={c.current ? 1 : 0.85}
            />
          ));
        })}
        <line
          x1={x(readDay)}
          x2={x(readDay)}
          y1={PAD.top}
          y2={PAD.top + innerH}
          strokeDasharray="3 3"
          className="stroke-muted-foreground/70"
        />
        {curves.flatMap((c, i) =>
          (["added", "submitted"] as const).map((series) => {
            const v = valueOn(c, readDay, series);
            if (v === null) return null;
            const color = CURVE_COLORS[i % CURVE_COLORS.length];
            return (
              <circle
                key={`dot-${c.id}-${series}`}
                cx={x(readDay)}
                cy={y(v)}
                r={series === "added" ? 3 : 4}
                fill={series === "added" ? undefined : color}
                stroke={series === "added" ? color : undefined}
                className={series === "added" ? "fill-background" : "stroke-background"}
                strokeWidth={2}
              />
            );
          })
        )}
      </svg>
    </div>
  );
}
