import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { compact, countryName, flag, num } from "../lib/format";

const DAY_FMT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDay = (d: string) => DAY_FMT.format(new Date(`${d}T00:00:00Z`));

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/** Single-series daily bar chart with hover tooltip. */
export function ClicksChart({ data, height = 220 }: { data: { day: string; clicks: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(e.contentRect.width, 200)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = { top: 8, right: 4, bottom: 24, left: 36 };
  const innerW = W - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.clicks), 0));
  const ticks = [0, max / 2, max];
  const step = innerW / Math.max(data.length, 1);
  const gap = Math.min(2 + step * 0.25, 8);
  const barW = Math.max(step - gap, 1);
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(W / 90)));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const bars = useMemo(
    () =>
      data.map((d, i) => {
        const x = pad.left + i * step + gap / 2;
        const h = (d.clicks / max) * innerH;
        const r = Math.min(4, barW / 2, h);
        const top = pad.top + innerH - h;
        const bottom = pad.top + innerH;
        // Rounded top corners only; base stays square on the axis.
        const path =
          h <= 0
            ? ""
            : `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${bottom}Z`;
        return { x, path, d };
      }),
    [data, max, height, W],
  );

  const tip = hover !== null ? bars[hover] : null;
  const tipLeft = tip ? Math.min(Math.max(tip.x + barW / 2, 60), W - 60) : 0;
  const tipTop = tip ? y(tip.d.clicks) : 0;

  return (
    <div class="chart" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-label={`Clicks per day, ${num(data.reduce((s, d) => s + d.clicks, 0))} total`}>
        {ticks.map((t) => (
          <g key={t}>
            <line class="grid" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
            <text class="axis" x={pad.left - 8} y={y(t) + 4} text-anchor="end">{compact(t)}</text>
          </g>
        ))}
        {bars.map((b, i) => (
          <g key={b.d.day}>
            {b.path && <path class={`bar${hover !== null && hover !== i ? " dim" : ""}`} d={b.path} />}
            <rect class="hit" x={pad.left + i * step} y={pad.top} width={step} height={innerH} onMouseEnter={() => setHover(i)} />
            {i % labelEvery === 0 && (
              <text class="axis" x={b.x + barW / 2} y={height - 6} text-anchor="middle">{fmtDay(b.d.day)}</text>
            )}
          </g>
        ))}
      </svg>
      {tip && (
        <div class="tooltip" style={{ left: tipLeft, top: tipTop }}>
          {fmtDay(tip.d.day)} · <b>{num(tip.d.clicks)}</b> {tip.d.clicks === 1 ? "click" : "clicks"}
        </div>
      )}
      <table class="sr-only">
        <caption>Clicks per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}><th>{d.day}</th><td>{d.clicks}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranked list with proportional background bars (referrers, countries, …). */
export function Breakdown({ title, rows, kind }: { title: string; rows: { key: string; clicks: number }[]; kind?: "country" }) {
  const max = Math.max(...rows.map((r) => r.clicks), 1);
  return (
    <div class="card card-pad">
      <h2 style="margin-bottom:12px">{title}</h2>
      {rows.length === 0 ? (
        <p class="sub" style="margin:0">No data yet</p>
      ) : (
        <div class="bars">
          {rows.map((r) => (
            <div class="bar-row" key={r.key} title={`${r.key}: ${num(r.clicks)}`}>
              <div class="fill" style={{ width: `${(r.clicks / max) * 100}%` }} />
              <span>{kind === "country" ? `${flag(r.key)}  ${countryName(r.key)}` : r.key}</span>
              <b>{num(r.clicks)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
