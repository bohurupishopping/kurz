import type { Env } from "../types";

// Each entry is one schema version. Append new versions; never edit old ones.
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hostname TEXT NOT NULL UNIQUE,
      root_redirect TEXT,
      not_found_url TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL DEFAULT '*',
      slug TEXT NOT NULL COLLATE NOCASE,
      url TEXT NOT NULL,
      title TEXT,
      redirect_type INTEGER NOT NULL DEFAULT 302,
      password_hash TEXT,
      expires_at INTEGER,
      expired_url TEXT,
      max_clicks INTEGER,
      clicks INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '',
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      rules TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (domain, slug)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_links_created ON links (created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      country TEXT,
      referrer TEXT,
      device TEXT,
      browser TEXT,
      os TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_clicks_link_ts ON clicks (link_id, ts)`,
    `CREATE INDEX IF NOT EXISTS idx_clicks_ts ON clicks (ts)`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS reset_tokens (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

let ready: Promise<void> | null = null;

/** Creates or upgrades the schema once per isolate. */
export function ensureSchema(env: Env): Promise<void> {
  ready ??= migrate(env).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function migrate(env: Env): Promise<void> {
  let current = 0;
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'schema_version'`).first<{ value: string }>();
    current = Number(row?.value ?? 0);
  } catch {
    current = 0; // settings table doesn't exist yet
  }
  if (current >= SCHEMA_VERSION) return;
  const stmts = MIGRATIONS.slice(current).flat().map((sql) => env.DB.prepare(sql));
  stmts.push(
    env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('schema_version', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ).bind(String(SCHEMA_VERSION)),
  );
  await env.DB.batch(stmts);
}
