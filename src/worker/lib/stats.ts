import type { Env } from "../types";

export interface StatsQuery {
  linkId?: number;
  days: number;
  tz: number; // minutes, as returned by Date#getTimezoneOffset()
}

export function parseStatsQuery(q: Record<string, string | undefined>): Omit<StatsQuery, "linkId"> {
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365);
  const tz = Math.min(Math.max(Number(q.tz) || 0, -840), 840);
  return { days, tz };
}

/** Clicks per local day plus breakdowns, bots excluded. */
export async function getStats(env: Env, { linkId, days, tz }: StatsQuery) {
  const offsetSec = -tz * 60;
  const now = Date.now();
  // Start at local midnight `days - 1` days ago.
  const localNow = now + offsetSec * 1000;
  const startLocal = Math.floor(localNow / 86_400_000) * 86_400_000 - (days - 1) * 86_400_000;
  const since = startLocal - offsetSec * 1000;

  const where = `ts >= ?1 AND is_bot = 0${linkId ? " AND link_id = ?2" : ""}`;
  const args: unknown[] = linkId ? [since, linkId] : [since];
  const q = (sql: string) => env.DB.prepare(sql).bind(...args);
  const breakdown = (col: string, fallback: string) =>
    q(`SELECT COALESCE(${col}, '${fallback}') AS k, COUNT(*) AS n FROM clicks WHERE ${where} GROUP BY k ORDER BY n DESC LIMIT 10`);

  const [series, referrers, countries, devices, browsers, oses, bots] = await env.DB.batch<any>([
    q(`SELECT date(ts / 1000 + ${offsetSec}, 'unixepoch') AS day, COUNT(*) AS n FROM clicks WHERE ${where} GROUP BY day`),
    breakdown("referrer", "Direct"),
    breakdown("country", "Unknown"),
    breakdown("device", "Unknown"),
    breakdown("browser", "Other"),
    breakdown("os", "Other"),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM clicks WHERE ts >= ?1 AND is_bot = 1${linkId ? " AND link_id = ?2" : ""}`).bind(...args),
  ]);

  const byDay = new Map<string, number>(series.results.map((r: any) => [r.day, r.n]));
  const timeseries = Array.from({ length: days }, (_, i) => {
    const day = new Date(startLocal + i * 86_400_000).toISOString().slice(0, 10);
    return { day, clicks: byDay.get(day) ?? 0 };
  });
  const total = timeseries.reduce((s, d) => s + d.clicks, 0);
  const list = (r: D1Result<any>) => r.results.map((x: any) => ({ key: x.k, clicks: x.n }));

  return {
    days,
    total,
    bots: bots.results[0]?.n ?? 0,
    timeseries,
    referrers: list(referrers),
    countries: list(countries),
    devices: list(devices),
    browsers: list(browsers),
    os: list(oses),
    since,
  };
}
