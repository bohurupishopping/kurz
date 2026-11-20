import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError } from "../types";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/crypto";
import { createSession, currentSession, destroySession, rateLimit } from "../lib/auth";
import { emailEnabled, getSettings, setSettings, syncConfig } from "../lib/settings";
import { sendEmail } from "../lib/email";
import { esc } from "../lib/pages";

const auth = new Hono<AppEnv>();
const RESET_TTL = 30 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertPassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  if (pw.length > 256) throw new HttpError(400, "Password is too long");
  return pw;
}

auth.get("/status", async (c) => {
  const s = await getSettings(c.env);
  const authed = Boolean(await currentSession(c));
  return c.json({
    setup: Boolean(s.admin_password),
    authed,
    email: authed ? (s.admin_email ?? null) : null,
    email_enabled: emailEnabled(c.env),
    admin_email_hint: c.env.ADMIN_EMAIL || null,
  });
});

auth.post("/setup", async (c) => {
  await rateLimit(c, "setup");
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as any);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email");
  if (c.env.ADMIN_EMAIL && email !== c.env.ADMIN_EMAIL.toLowerCase()) {
    throw new HttpError(403, "This email isn't allowed to set up this instance");
  }
  const hash = await hashPassword(assertPassword(body.password));
  // Atomic: only the very first setup wins.
  const res = await c.env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT (key) DO NOTHING`,
  )
    .bind(hash)
    .run();
  if (!res.meta.changes) throw new HttpError(409, "Kurz is already set up");
  await setSettings(c.env, { admin_email: email, track_clicks: "1", default_redirect_type: "302" });
  await syncConfig(c.env);
  await createSession(c);
  return c.json({ ok: true });
});

auth.post("/login", async (c) => {
  await rateLimit(c, "login");
  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as any);
  const s = await getSettings(c.env);
  if (!s.admin_password) throw new HttpError(409, "Kurz isn't set up yet");
  if (!(await verifyPassword(String(body.password ?? ""), s.admin_password))) {
    throw new HttpError(401, "Wrong password");
  }
  await createSession(c);
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

auth.post("/forgot", async (c) => {
  await rateLimit(c, "forgot");
  if (!emailEnabled(c.env)) {
    throw new HttpError(503, "Email reset isn't configured. Run `npm run set-password` to set a new password.");
  }
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as any);
  const email = String(body.email ?? "").trim().toLowerCase();
  const s = await getSettings(c.env);
  // Same response either way so the admin email can't be guessed.
  if (s.admin_email && email === s.admin_email.toLowerCase()) {
    const token = randomToken();
    await c.env.DB.prepare(`INSERT INTO reset_tokens (id, expires_at) VALUES (?, ?)`)
      .bind(await sha256(token), Date.now() + RESET_TTL)
      .run();
    const link = `${new URL(c.req.url).origin}/_/reset?token=${token}`;
    await sendEmail(
      c.env,
      s.admin_email,
      "Reset your Kurz password",
      `Someone asked to reset the password for your Kurz admin.\n\nReset it here (valid for 30 minutes):\n${link}\n\nIf this wasn't you, ignore this email.`,
      `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1c1917">
<p style="font-weight:600;font-size:15px;margin:0 0 20px">Kurz</p>
<h2 style="margin:0 0 8px">Reset your password</h2>
<p style="color:#57534e">Someone asked to reset the password for your Kurz admin. This link is valid for 30 minutes.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#212121;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
<p style="color:#a8a29e;font-size:13px">If this wasn't you, ignore this email.</p></div>`,
    );
  }
  return c.json({ ok: true });
});

auth.post("/reset", async (c) => {
  await rateLimit(c, "reset");
  const body = await c.req.json<{ token?: string; password?: string }>().catch(() => ({}) as any);
  const password = assertPassword(body.password);
  const id = await sha256(String(body.token ?? ""));
  const del = await c.env.DB.prepare(`DELETE FROM reset_tokens WHERE id = ? AND expires_at > ?`)
    .bind(id, Date.now())
    .run();
  if (!del.meta.changes) throw new HttpError(400, "This reset link is invalid or has expired");
  await setSettings(c.env, { admin_password: await hashPassword(password) });
  // Sign out everywhere and burn any other reset links.
  await c.env.DB.batch([c.env.DB.prepare(`DELETE FROM sessions`), c.env.DB.prepare(`DELETE FROM reset_tokens`)]);
  await createSession(c);
  return c.json({ ok: true });
});

export default auth;
