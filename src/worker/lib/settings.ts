import type { Env, KvConfig } from "../types";

export type SettingKey =
  | "admin_email"
  | "admin_password"
  | "default_redirect_type"
  | "root_redirect"
  | "not_found_url"
  | "track_clicks"
  | "cf_api_token"
  | "cf_account_id"
  | "cf_worker_name";

export async function getSettings(env: Env): Promise<Partial<Record<SettingKey, string>>> {
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export async function setSettings(env: Env, values: Partial<Record<SettingKey, string | null>>): Promise<void> {
  const stmts = Object.entries(values).map(([k, v]) =>
    v === null
      ? env.DB.prepare(`DELETE FROM settings WHERE key = ?`).bind(k)
      : env.DB.prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        ).bind(k, v),
  );
  if (stmts.length) await env.DB.batch(stmts);
}

/** Mirror the redirect-relevant settings into KV so redirects never touch D1. */
export async function syncConfig(env: Env): Promise<void> {
  const s = await getSettings(env);
  const cfg: KvConfig = {
    root: s.root_redirect || undefined,
    nf: s.not_found_url || undefined,
    track: s.track_clicks !== "0",
  };
  await env.KV.put("cfg", JSON.stringify(cfg));
}

export function emailEnabled(env: Env): boolean {
  return Boolean(env.EMAIL && env.EMAIL_FROM);
}
