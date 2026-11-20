import type { Env, LinkRow } from "../types";
import { HttpError } from "../types";
import { hashPassword, randomSlug } from "./crypto";
import { syncLink } from "./store";
import {
  assertSlug,
  assertUrl,
  normalizeHost,
  normalizeRules,
  normalizeTags,
  optionalInt,
  optionalText,
  optionalTimestamp,
  optionalUrl,
  packTags,
} from "./validate";

type Fields = Partial<Omit<LinkRow, "id" | "clicks" | "created_at" | "updated_at">>;

/** Turn an API body into DB columns. On create every field is set; on update only keys present. */
export async function buildFields(env: Env, body: any, partial: boolean): Promise<Fields> {
  if (!body || typeof body !== "object") throw new HttpError(400, "Expected a JSON object");
  const has = (k: string) => !partial || k in body;
  const f: Fields = {};

  if (has("url")) f.url = assertUrl(body.url);
  if (body.slug !== undefined && body.slug !== null && String(body.slug).trim() !== "") {
    f.slug = assertSlug(String(body.slug).trim());
  }
  if (has("domain")) {
    const d = body.domain;
    f.domain = !d || d === "*" ? "*" : normalizeHost(d);
    if (f.domain !== "*") {
      const exists = await env.DB.prepare(`SELECT 1 FROM domains WHERE hostname = ?`).bind(f.domain).first();
      if (!exists) throw new HttpError(400, `Add ${f.domain} under Domains first`);
    }
  }
  if (has("title")) f.title = optionalText(body.title, 200);
  if ("redirect_type" in body) f.redirect_type = Number(body.redirect_type) === 301 ? 301 : 302;
  if ("password" in body) {
    f.password_hash = body.password ? await hashPassword(String(body.password).slice(0, 256)) : null;
  }
  if (has("expires_at")) f.expires_at = optionalTimestamp(body.expires_at, "Expiry date");
  if (has("expired_url")) f.expired_url = optionalUrl(body.expired_url, "Expired URL");
  if (has("max_clicks")) f.max_clicks = optionalInt(body.max_clicks, "Click limit", 1);
  if ("disabled" in body) f.disabled = body.disabled ? 1 : 0;
  if (has("tags")) f.tags = packTags(normalizeTags(body.tags));
  if (has("og_title")) f.og_title = optionalText(body.og_title, 200);
  if (has("og_description")) f.og_description = optionalText(body.og_description, 500);
  if (has("og_image")) f.og_image = optionalUrl(body.og_image, "Preview image");
  if (has("rules")) {
    const rules = normalizeRules(body.rules);
    f.rules = rules.length ? JSON.stringify(rules) : null;
  }
  return f;
}

function isUniqueError(e: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));
}

export async function getLink(env: Env, id: number): Promise<LinkRow> {
  const row = await env.DB.prepare(`SELECT * FROM links WHERE id = ?`).bind(id).first<LinkRow>();
  if (!row) throw new HttpError(404, "Link not found");
  return row;
}

export async function createLink(env: Env, body: any, defaultRedirect: number): Promise<LinkRow> {
  const f = await buildFields(env, body, false);
  f.redirect_type ??= defaultRedirect === 301 ? 301 : 302;
  f.disabled ??= 0;
  const now = Date.now();
  const custom = Boolean(f.slug);

  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = custom ? f.slug! : randomSlug(attempt < 3 ? 6 : 8);
    const cols = { ...f, slug, created_at: now, updated_at: now };
    const keys = Object.keys(cols);
    try {
      const row = await env.DB.prepare(
        `INSERT INTO links (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")}) RETURNING *`,
      )
        .bind(...keys.map((k) => (cols as any)[k]))
        .first<LinkRow>();
      await syncLink(env, row!);
      return row!;
    } catch (e) {
      if (!isUniqueError(e)) throw e;
      if (custom) throw new HttpError(409, `The slug "${slug}" is already taken`);
    }
  }
  throw new HttpError(500, "Couldn't generate a unique slug, try again");
}

export async function updateLink(env: Env, id: number, body: any): Promise<LinkRow> {
  const prev = await getLink(env, id);
  const f = await buildFields(env, body, true);
  const keys = Object.keys(f);
  if (!keys.length) return prev;
  try {
    const row = await env.DB.prepare(
      `UPDATE links SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? RETURNING *`,
    )
      .bind(...keys.map((k) => (f as any)[k]), Date.now(), id)
      .first<LinkRow>();
    await syncLink(env, row!, prev);
    return row!;
  } catch (e) {
    if (isUniqueError(e)) throw new HttpError(409, `The slug "${f.slug}" is already taken`);
    throw e;
  }
}
