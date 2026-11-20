import { Hono } from "hono";
import type { AppEnv, Env } from "./types";
import { HttpError } from "./types";
import { ensureSchema } from "./db/schema";
import authRoutes from "./routes/auth";
import apiRoutes from "./routes/api";
import { handleRedirect } from "./routes/redirect";
import { LOGO_SVG, notFoundPage } from "./lib/pages";

const app = new Hono<AppEnv>();

const isAdminHost = (env: Env, url: string) => !env.ADMIN_HOST || new URL(url).hostname === env.ADMIN_HOST;

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

// ---- Admin API ----
app.use("/_/api/*", async (c, next) => {
  if (!isAdminHost(c.env, c.req.url)) return c.json({ error: "Not found" }, 404);
  await ensureSchema(c.env);
  await next();
  c.header("cache-control", "no-store");
});
app.route("/_/api/auth", authRoutes);
app.route("/_/api", apiRoutes);
app.all("/_/api/*", (c) => c.json({ error: "Not found" }, 404));

// ---- Admin UI (static assets, SPA fallback) ----
app.get("/_", (c) => c.redirect("/_/", 301));
app.get("/_/*", async (c) => {
  if (!isAdminHost(c.env, c.req.url)) return notFoundPage();
  let res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) res = await c.env.ASSETS.fetch(new URL("/_/", c.req.url));
  const headers = new Headers(res.headers);
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
  return new Response(res.body, { status: res.status, headers });
});

app.get("/robots.txt", () => new Response("User-agent: *\nDisallow: /_/\n", { headers: { "content-type": "text/plain" } }));
app.get("/favicon.ico", () =>
  new Response(LOGO_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } }),
);

// ---- Short links ----
app.on(["GET", "HEAD", "POST"], "*", async (c) => {
  // Without a root redirect, "/" goes to the dashboard — unless the admin lives elsewhere.
  if (new URL(c.req.url).pathname === "/" && !isAdminHost(c.env, c.req.url)) {
    const res = await handleRedirect(c);
    return res.headers.get("location")?.endsWith("/_/") ? notFoundPage() : res;
  }
  return handleRedirect(c);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env);
        const now = Date.now();
        const stmts = [
          env.DB.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now),
          env.DB.prepare(`DELETE FROM reset_tokens WHERE expires_at < ?`).bind(now),
        ];
        const days = Number(env.CLICK_RETENTION_DAYS ?? 365);
        if (days > 0) stmts.push(env.DB.prepare(`DELETE FROM clicks WHERE ts < ?`).bind(now - days * 86_400_000));
        await env.DB.batch(stmts);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
