import type { Context } from "hono";
import type { AppEnv, Env, KvConfig, KvDomain, KvLink, Rule } from "../types";
import { verifyPassword } from "../lib/crypto";
import { parseUA, type UAInfo } from "../lib/ua";
import { domainKey, linkKey } from "../lib/store";
import { expiredPage, notFoundPage, ogPage, passwordPage } from "../lib/pages";

function redirect(url: string, status: 301 | 302): Response {
  return new Response(null, {
    status,
    headers: {
      location: url,
      // Keep browsers from caching forever so clicks keep being counted.
      "cache-control": status === 301 ? "private, max-age=3600" : "private, no-store",
      "referrer-policy": "unsafe-url",
    },
  });
}

/** Pick a destination based on device / OS / country targeting rules. */
export function pickTarget(rules: Rule[] | undefined, ua: UAInfo, country: string | undefined): string | null {
  if (!rules) return null;
  const os = ua.os.toLowerCase();
  const c = (country ?? "").toLowerCase();
  for (const r of rules) {
    const values = r.value.split(",").map((v) => v.trim());
    if (r.type === "device" && values.includes(ua.device)) return r.url;
    if (r.type === "os" && values.includes(os)) return r.url;
    if (r.type === "country" && c && values.includes(c)) return r.url;
  }
  return null;
}

/** Forward query params from the short URL (e.g. ?utm_source=x) to the destination. */
export function mergeQuery(target: string, incoming: URLSearchParams): string {
  if (![...incoming.keys()].length) return target;
  const u = new URL(target);
  for (const [k, v] of incoming) if (!u.searchParams.has(k)) u.searchParams.append(k, v);
  return u.toString();
}

function referrerHost(req: Request, host: string): string | null {
  const ref = req.headers.get("referer");
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    return h === host ? null : h;
  } catch {
    return null;
  }
}

async function logClick(env: Env, link: KvLink, req: Request, ua: UAInfo, host: string) {
  const cf = (req as any).cf ?? {};
  const now = Date.now();
  const insert = env.DB.prepare(
    `INSERT INTO clicks (link_id, ts, country, referrer, device, browser, os, is_bot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(link.id, now, cf.country ?? null, referrerHost(req, host), ua.device, ua.browser, ua.os, ua.isBot ? 1 : 0);
  try {
    if (ua.isBot) await insert.run();
    else await env.DB.batch([insert, env.DB.prepare(`UPDATE links SET clicks = clicks + 1 WHERE id = ?`).bind(link.id)]);
  } catch (e) {
    console.error("click log failed", e);
  }
}

export async function handleRedirect(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const req = c.req.raw;
  const url = new URL(req.url);
  const host = url.hostname.toLowerCase();
  let slug: string;
  try {
    slug = decodeURIComponent(url.pathname.slice(1)).replace(/\/+$/, "");
  } catch {
    return notFoundPage();
  }

  const [domain, cfg] = await Promise.all([
    env.KV.get<KvDomain>(domainKey(host), { type: "json", cacheTtl: 60 }),
    env.KV.get<KvConfig>("cfg", { type: "json", cacheTtl: 60 }),
  ]);

  if (!slug) {
    const root = domain?.root ?? cfg?.root;
    if (root) return redirect(root, 302);
    return Response.redirect(new URL("/_/", url).toString(), 302);
  }

  const link =
    (await env.KV.get<KvLink>(linkKey(host, slug), { type: "json", cacheTtl: 60 })) ??
    (await env.KV.get<KvLink>(linkKey("*", slug), { type: "json", cacheTtl: 60 }));

  if (!link) {
    const nf = domain?.nf ?? cfg?.nf;
    return nf ? redirect(nf, 302) : notFoundPage();
  }

  // Expiry by date or by click limit.
  let expired = Boolean(link.exp && Date.now() > link.exp);
  if (!expired && link.max) {
    const row = await env.DB.prepare(`SELECT clicks FROM links WHERE id = ?`).bind(link.id).first<{ clicks: number }>();
    expired = (row?.clicks ?? 0) >= link.max;
  }
  if (expired) return link.expUrl ? redirect(link.expUrl, 302) : expiredPage();

  if (link.pw) {
    if (req.method !== "POST") return passwordPage();
    const form = await req.formData().catch(() => null);
    const pw = form?.get("password");
    if (typeof pw !== "string" || !(await verifyPassword(pw, link.pw))) return passwordPage(true);
  }

  const ua = parseUA(req.headers.get("user-agent"));
  const country = (req as any).cf?.country as string | undefined;
  const target = mergeQuery(pickTarget(link.rules, ua, country) ?? link.url, url.searchParams);

  if (cfg?.track !== false) c.executionCtx.waitUntil(logClick(env, link, req, ua, host));

  if (link.og && ua.isPreviewBot) return ogPage(target, link.og);
  // After a password POST, use 303 so the browser follows with GET.
  if (req.method === "POST") return Response.redirect(target, 303);
  return redirect(target, link.t);
}
