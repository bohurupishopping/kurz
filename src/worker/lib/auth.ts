import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Env } from "../types";
import { HttpError } from "../types";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "kurz_session";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

export async function createSession(c: Context<AppEnv>): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  await c.env.DB.prepare(`INSERT INTO sessions (id, expires_at, created_at) VALUES (?, ?, ?)`)
    .bind(await sha256(token), now + SESSION_TTL, now)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    maxAge: SESSION_TTL / 1000,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Returns the session id (hash) if the request carries a valid session cookie. */
export async function currentSession(c: Context<AppEnv>): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256(token);
  const row = await c.env.DB.prepare(`SELECT id FROM sessions WHERE id = ? AND expires_at > ?`)
    .bind(id, Date.now())
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function tokenAuth(env: Env, header: string | undefined): Promise<boolean> {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return false;
  const row = await env.DB.prepare(`SELECT id, last_used_at FROM api_tokens WHERE token_hash = ?`)
    .bind(await sha256(m[1]))
    .first<{ id: number; last_used_at: number | null }>();
  if (!row) return false;
  // Only touch last_used_at hourly to save D1 writes.
  if (!row.last_used_at || Date.now() - row.last_used_at > 3_600_000) {
    await env.DB.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`).bind(Date.now(), row.id).run();
  }
  return true;
}

/** Accepts a Bearer API token or a session cookie (with a CSRF header for writes). */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (await tokenAuth(c.env, c.req.header("authorization"))) {
    c.set("auth", "token");
    return next();
  }
  const sid = await currentSession(c);
  if (!sid) throw new HttpError(401, "Not signed in");
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.header("x-kurz") !== "1") {
    throw new HttpError(403, "Missing X-Kurz header");
  }
  c.set("auth", "session");
  c.set("sessionId", sid);
  return next();
};

/** Per-IP rate limit via the Workers Rate Limiting binding (no-op if not bound). */
export async function rateLimit(c: Context<AppEnv>, scope: string): Promise<void> {
  if (!c.env.LIMITER) return;
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const { success } = await c.env.LIMITER.limit({ key: `${scope}:${ip}` });
  if (!success) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
}
