import { Hono } from "hono";
import type { AppEnv, LinkRow } from "../types";
import { HttpError } from "../types";
import { requireAuth } from "../lib/auth";
import { createLink, getLink, updateLink } from "../lib/links";
import { linkToApi, syncDomain, unsyncLink, domainKey } from "../lib/store";
import { getStats, parseStatsQuery } from "../lib/stats";
import { toCsv } from "../lib/csv";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/crypto";
import { emailEnabled, getSettings, setSettings, syncConfig } from "../lib/settings";
import { attachDomain, attachedHostnames, cfToken, detachDomain, verifyToken, workerName } from "../lib/cloudflare";
import { normalizeHost, optionalUrl } from "../lib/validate";
import { assertPassword } from "./auth";

const api = new Hono<AppEnv>();
api.use("*", requireAuth);

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;
const idParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Invalid id");
  return n;
};
async function defaultRedirect(c: any): Promise<number> {
  const s = await getSettings(c.env);
  return Number(s.default_redirect_type) === 301 ? 301 : 302;
}

// ---------- Links ----------

api.get("/links", async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.q) {
    where.push(`(slug LIKE ? OR url LIKE ? OR title LIKE ?)`);
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like);
  }
  if (q.tag) {
    where.push(`tags LIKE ?`);
    args.push(`%,${q.tag.toLowerCase()},%`);
  }
  if (q.domain) {
    where.push(`domain = ?`);
    args.push(q.domain);
  }
  const now = Date.now();
  if (q.status === "active") {
    where.push(`disabled = 0 AND (expires_at IS NULL OR expires_at > ?) AND (max_clicks IS NULL OR clicks < max_clicks)`);
    args.push(now);
  } else if (q.status === "disabled") where.push(`disabled = 1`);
  else if (q.status === "expired") {
    where.push(`((expires_at IS NOT NULL AND expires_at <= ?) OR (max_clicks IS NOT NULL AND clicks >= max_clicks))`);
    args.push(now);
  }
  const order = q.sort === "clicks" ? "clicks DESC, id DESC" : q.sort === "oldest" ? "id ASC" : "id DESC";
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const page = Math.max(Number(q.page) || 1, 1);
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows, count] = await c.env.DB.batch<any>([
    c.env.DB.prepare(`SELECT * FROM links ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...args, limit, (page - 1) * limit),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM links ${w}`).bind(...args),
  ]);
  return c.json({
    links: (rows.results as LinkRow[]).map((r) => linkToApi(r, origin(c))),
    total: count.results[0].n,
    page,
    limit,
  });
});

api.post("/links", async (c) => {
  const row = await createLink(c.env, await c.req.json().catch(() => null), await defaultRedirect(c));
  return c.json(linkToApi(row, origin(c)), 201);
});

api.post("/links/bulk", async (c) => {
  const body = await c.req.json<{ links?: unknown[] }>().catch(() => null);
  const items = Array.isArray(body?.links) ? body!.links : [];
  if (!items.length) throw new HttpError(400, "Send { links: [...] }");
  if (items.length > 100) throw new HttpError(400, "Up to 100 links per request");
  const def = await defaultRedirect(c);
  const results = [];
  for (const item of items) {
    try {
      const row = await createLink(c.env, item, def);
      results.push({ ok: true, link: linkToApi(row, origin(c)) });
    } catch (e) {
      results.push({ ok: false, error: e instanceof HttpError ? e.message : "Failed", input: item });
    }
  }
  return c.json({ results, created: results.filter((r) => r.ok).length });
});

api.get("/links/export", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM links ORDER BY id`).all<LinkRow>();
  const csv = toCsv(
    ["url", "slug", "domain", "short_url", "title", "tags", "redirect_type", "expires_at", "clicks", "disabled", "created_at"],
    results.map((r) => {
      const l = linkToApi(r, origin(c));
      return [
        l.url,
        l.slug,
        l.domain,
        l.short_url,
        l.title,
        l.tags.join(","),
        l.redirect_type,
        l.expires_at ? new Date(l.expires_at).toISOString() : "",
        l.clicks,
        l.disabled ? 1 : 0,
        new Date(l.created_at).toISOString(),
      ];
    }),
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kurz-links-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

api.get("/links/:id", async (c) => c.json(linkToApi(await getLink(c.env, idParam(c.req.param("id"))), origin(c))));

api.patch("/links/:id", async (c) => {
  const row = await updateLink(c.env, idParam(c.req.param("id")), await c.req.json().catch(() => null));
  return c.json(linkToApi(row, origin(c)));
});

api.delete("/links/:id", async (c) => {
  const row = await getLink(c.env, idParam(c.req.param("id")));
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM links WHERE id = ?`).bind(row.id),
    c.env.DB.prepare(`DELETE FROM clicks WHERE link_id = ?`).bind(row.id),
  ]);
  await unsyncLink(c.env, row);
  return c.json({ ok: true });
});

api.get("/links/:id/stats", async (c) => {
  const id = idParam(c.req.param("id"));
  await getLink(c.env, id);
  return c.json(await getStats(c.env, { linkId: id, ...parseStatsQuery(c.req.query()) }));
});

api.get("/tags", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT tags FROM links WHERE tags != ''`).all<{ tags: string }>();
  const counts = new Map<string, number>();
  for (const r of results) for (const t of r.tags.split(",").filter(Boolean)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return c.json([...counts].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })));
});

// ---------- Overview ----------

api.get("/stats", async (c) => {
  const opts = parseStatsQuery(c.req.query());
  const stats = await getStats(c.env, opts);
  const [totals, top] = await c.env.DB.batch<any>([
    c.env.DB.prepare(`SELECT COUNT(*) AS links, COALESCE(SUM(clicks), 0) AS clicks FROM links`),
    c.env.DB.prepare(
      `SELECT l.*, COUNT(k.id) AS period_clicks FROM clicks k JOIN links l ON l.id = k.link_id
       WHERE k.ts >= ? AND k.is_bot = 0 GROUP BY l.id ORDER BY period_clicks DESC LIMIT 8`,
    ).bind(stats.since),
  ]);
  return c.json({
    ...stats,
    total_links: totals.results[0].links,
    total_clicks: totals.results[0].clicks,
    top_links: top.results.map((r: any) => ({ ...linkToApi(r, origin(c)), period_clicks: r.period_clicks })),
  });
});

const reqHost = (c: { req: { url: string } }) => new URL(c.req.url).hostname;

// ---------- Site icons ----------

// Destination favicons for the links list. Fetched here so the browser never
// calls a third party, and cached at the edge for a week.
api.get("/favicon/:host", async (c) => {
  const host = c.req.param("host").toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.length > 253) return c.body(null, 404);
  const res = await fetch(`https://icons.duckduckgo.com/ip3/${host}.ico`, {
    cf: { cacheTtl: 604800, cacheEverything: true },
  }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  // No SVG: it could carry script, and this is served from the dashboard's origin.
  if (!res?.ok || !type.startsWith("image/") || type.includes("svg")) return c.body(null, 404, { "cache-control": "private, max-age=86400" });
  return new Response(res.body, {
    headers: { "content-type": type, "cache-control": "private, max-age=604800",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
});

// ---------- Domains ----------

api.get("/domains", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM links l WHERE l.domain = d.hostname) AS links FROM domains d ORDER BY d.hostname`,
  ).all<any>();
  // connected: true/false when Cloudflare is linked, null when we can't tell.
  const token = await cfToken(c.env);
  let attached: Set<string> | null = null;
  if (token) {
    attached = await workerName(c.env, token, reqHost(c))
      .then((name) => attachedHostnames(c.env, token, name))
      .catch(() => null);
  }
  return c.json(results.map((d) => ({ ...d, connected: attached ? attached.has(d.hostname) : null })));
});

api.post("/domains", async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const hostname = normalizeHost(body.hostname);
  const root = optionalUrl(body.root_redirect, "Root redirect");
  const nf = optionalUrl(body.not_found_url, "Not-found URL");
  const exists = await c.env.DB.prepare(`SELECT 1 FROM domains WHERE hostname = ?`).bind(hostname).first();
  if (exists) throw new HttpError(409, `${hostname} is already added`);
  // With Cloudflare linked, attach the domain to this Worker before saving it.
  const token = await cfToken(c.env);
  if (token) await attachDomain(c.env, token, hostname, await workerName(c.env, token, reqHost(c)));
  try {
    const row = await c.env.DB.prepare(
      `INSERT INTO domains (hostname, root_redirect, not_found_url, created_at) VALUES (?, ?, ?, ?) RETURNING *`,
    )
      .bind(hostname, root, nf, Date.now())
      .first();
    await syncDomain(c.env, hostname, { root_redirect: root, not_found_url: nf });
    return c.json({ ...row, links: 0, connected: token ? true : null }, 201);
  } catch (e) {
    if (/UNIQUE/.test(String(e))) throw new HttpError(409, `${hostname} is already added`);
    throw e;
  }
});

api.patch("/domains/:id", async (c) => {
  const id = idParam(c.req.param("id"));
  const body = await c.req.json<any>().catch(() => ({}));
  const row = await c.env.DB.prepare(`UPDATE domains SET root_redirect = ?, not_found_url = ? WHERE id = ? RETURNING *`)
    .bind(optionalUrl(body.root_redirect, "Root redirect"), optionalUrl(body.not_found_url, "Not-found URL"), id)
    .first<any>();
  if (!row) throw new HttpError(404, "Domain not found");
  await syncDomain(c.env, row.hostname, row);
  return c.json(row);
});

api.post("/domains/:id/connect", async (c) => {
  const row = await c.env.DB.prepare(`SELECT hostname FROM domains WHERE id = ?`)
    .bind(idParam(c.req.param("id")))
    .first<{ hostname: string }>();
  if (!row) throw new HttpError(404, "Domain not found");
  const token = await cfToken(c.env);
  if (!token) throw new HttpError(400, "Connect your Cloudflare account in Settings first");
  await attachDomain(c.env, token, row.hostname, await workerName(c.env, token, reqHost(c)));
  return c.json({ ok: true });
});

api.delete("/domains/:id", async (c) => {
  const id = idParam(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT hostname FROM domains WHERE id = ?`).bind(id).first<{ hostname: string }>();
  if (!row) throw new HttpError(404, "Domain not found");
  const used = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM links WHERE domain = ?`).bind(row.hostname).first<{ n: number }>();
  if (used?.n) throw new HttpError(409, `${row.hostname} still has ${used.n} link(s). Move or delete them first.`);
  // Never detach the hostname serving this request, or the dashboard goes offline.
  const token = await cfToken(c.env);
  if (token && row.hostname !== reqHost(c)) {
    await detachDomain(c.env, token, row.hostname, await workerName(c.env, token, reqHost(c)));
  }
  await c.env.DB.prepare(`DELETE FROM domains WHERE id = ?`).bind(id).run();
  await c.env.KV.delete(domainKey(row.hostname));
  return c.json({ ok: true });
});

// ---------- API tokens ----------

api.get("/tokens", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, prefix, last_used_at, created_at FROM api_tokens ORDER BY id DESC`,
  ).all();
  return c.json(results);
});

api.post("/tokens", async (c) => {
  if (c.get("auth") !== "session") throw new HttpError(403, "Sign in to the dashboard to create tokens");
  const body = await c.req.json<any>().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 60) || "API token";
  const token = `kurz_${randomToken(24)}`;
  const row = await c.env.DB.prepare(
    `INSERT INTO api_tokens (name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?) RETURNING id, name, prefix, last_used_at, created_at`,
  )
    .bind(name, await sha256(token), token.slice(0, 10), Date.now())
    .first();
  return c.json({ ...row, token }, 201);
});

api.delete("/tokens/:id", async (c) => {
  await c.env.DB.prepare(`DELETE FROM api_tokens WHERE id = ?`).bind(idParam(c.req.param("id"))).run();
  return c.json({ ok: true });
});

// ---------- Settings ----------

api.get("/settings", async (c) => {
  const s = await getSettings(c.env);
  return c.json({
    admin_email: s.admin_email ?? "",
    default_redirect_type: Number(s.default_redirect_type) === 301 ? 301 : 302,
    root_redirect: s.root_redirect ?? "",
    not_found_url: s.not_found_url ?? "",
    track_clicks: s.track_clicks !== "0",
    email_enabled: emailEnabled(c.env),
    click_retention_days: Number(c.env.CLICK_RETENTION_DAYS ?? 365),
    // The token itself is never sent back to the browser.
    cloudflare: c.env.CF_API_TOKEN ? "secret" : s.cf_api_token ? "settings" : null,
  });
});

api.patch("/settings", async (c) => {
  if (c.get("auth") !== "session") throw new HttpError(403, "Settings can only be changed from the dashboard");
  const body = await c.req.json<any>().catch(() => ({}));
  const update: Record<string, string | null> = {};
  if ("admin_email" in body) {
    const email = String(body.admin_email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
    update.admin_email = email;
  }
  if ("default_redirect_type" in body) update.default_redirect_type = Number(body.default_redirect_type) === 301 ? "301" : "302";
  if ("root_redirect" in body) update.root_redirect = optionalUrl(body.root_redirect, "Root redirect");
  if ("not_found_url" in body) update.not_found_url = optionalUrl(body.not_found_url, "Not-found URL");
  if ("track_clicks" in body) update.track_clicks = body.track_clicks ? "1" : "0";
  if ("cf_api_token" in body) {
    const token = String(body.cf_api_token ?? "").trim();
    if (token) {
      const { accountId } = await verifyToken(token);
      update.cf_api_token = token;
      update.cf_account_id = accountId;
    } else {
      update.cf_api_token = null;
      update.cf_account_id = null;
    }
  }
  await setSettings(c.env, update);
  await syncConfig(c.env);
  return c.json({ ok: true });
});

api.post("/settings/password", async (c) => {
  if (c.get("auth") !== "session") throw new HttpError(403, "Change the password from the dashboard");
  const body = await c.req.json<any>().catch(() => ({}));
  const s = await getSettings(c.env);
  if (!(await verifyPassword(String(body.current ?? ""), s.admin_password))) {
    throw new HttpError(400, "Current password is wrong");
  }
  await setSettings(c.env, { admin_password: await hashPassword(assertPassword(body.password)) });
  // Sign out other sessions.
  await c.env.DB.prepare(`DELETE FROM sessions WHERE id != ?`).bind(c.get("sessionId")).run();
  return c.json({ ok: true });
});

export default api;
