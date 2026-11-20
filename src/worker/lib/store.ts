import type { Env, KvDomain, KvLink, LinkRow, Rule } from "../types";
import { unpackTags } from "./validate";

export const linkKey = (domain: string, slug: string) => `l:${domain}:${slug.toLowerCase()}`;
export const domainKey = (host: string) => `d:${host}`;

export function toKv(row: LinkRow): KvLink {
  const rec: KvLink = { id: row.id, url: row.url, t: row.redirect_type === 301 ? 301 : 302 };
  if (row.expires_at) rec.exp = row.expires_at;
  if (row.expired_url) rec.expUrl = row.expired_url;
  if (row.password_hash) rec.pw = row.password_hash;
  if (row.max_clicks) rec.max = row.max_clicks;
  const rules = parseRules(row.rules);
  if (rules.length) rec.rules = rules;
  if (row.og_title || row.og_description || row.og_image) {
    rec.og = {
      title: row.og_title ?? undefined,
      description: row.og_description ?? undefined,
      image: row.og_image ?? undefined,
    };
  }
  return rec;
}

export function parseRules(raw: string | null): Rule[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Write (or remove, if disabled) the KV record for a link. */
export async function syncLink(env: Env, row: LinkRow, previous?: { domain: string; slug: string }) {
  const ops: Promise<unknown>[] = [];
  if (previous && linkKey(previous.domain, previous.slug) !== linkKey(row.domain, row.slug)) {
    ops.push(env.KV.delete(linkKey(previous.domain, previous.slug)));
  }
  ops.push(
    row.disabled
      ? env.KV.delete(linkKey(row.domain, row.slug))
      : env.KV.put(linkKey(row.domain, row.slug), JSON.stringify(toKv(row))),
  );
  await Promise.all(ops);
}

export async function unsyncLink(env: Env, row: Pick<LinkRow, "domain" | "slug">) {
  await env.KV.delete(linkKey(row.domain, row.slug));
}

export async function syncDomain(env: Env, host: string, d: { root_redirect: string | null; not_found_url: string | null }) {
  const rec: KvDomain = {};
  if (d.root_redirect) rec.root = d.root_redirect;
  if (d.not_found_url) rec.nf = d.not_found_url;
  await env.KV.put(domainKey(host), JSON.stringify(rec));
}

export function linkToApi(row: LinkRow, origin: string) {
  const base = row.domain === "*" ? origin : `https://${row.domain}`;
  return {
    id: row.id,
    domain: row.domain,
    slug: row.slug,
    short_url: `${base}/${row.slug}`,
    url: row.url,
    title: row.title,
    redirect_type: row.redirect_type,
    has_password: Boolean(row.password_hash),
    expires_at: row.expires_at,
    expired_url: row.expired_url,
    max_clicks: row.max_clicks,
    clicks: row.clicks,
    disabled: Boolean(row.disabled),
    tags: unpackTags(row.tags),
    og_title: row.og_title,
    og_description: row.og_description,
    og_image: row.og_image,
    rules: parseRules(row.rules),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
