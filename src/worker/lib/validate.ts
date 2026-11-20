import { HttpError, type Rule } from "../types";

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const RESERVED = new Set(["favicon.ico", "robots.txt", "sitemap.xml", "apple-touch-icon.png"]);
const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function validSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED.has(slug.toLowerCase());
}

export function assertSlug(slug: string): string {
  if (!validSlug(slug)) {
    throw new HttpError(400, "Slug can use letters, numbers, '-', '_' and '.', and must start with a letter or number.");
  }
  return slug;
}

export function assertUrl(value: unknown, field = "url"): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} is required`);
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    throw new HttpError(400, `${field} must be a valid URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new HttpError(400, `${field} must start with http:// or https://`);
  }
  return u.toString();
}

export function optionalUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return assertUrl(value, field);
}

export function normalizeHost(value: unknown): string {
  const h = String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!HOST_RE.test(h)) throw new HttpError(400, "Enter a valid hostname, like go.example.com");
  return h;
}

export function normalizeTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const out = new Set<string>();
  for (const t of list) {
    const tag = String(t).trim().toLowerCase().replace(/[^a-z0-9 _-]/g, "").slice(0, 32);
    if (tag) out.add(tag);
  }
  return [...out].slice(0, 20);
}

/** Tags are stored as ",a,b," so a single LIKE '%,tag,%' finds them. */
export function packTags(tags: string[]): string {
  return tags.length ? `,${tags.join(",")},` : "";
}

export function unpackTags(packed: string | null): string[] {
  return (packed ?? "").split(",").filter(Boolean);
}

export function normalizeRules(value: unknown): Rule[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "rules must be a list");
  return value.slice(0, 20).map((r: any) => {
    const type = r?.type;
    if (type !== "device" && type !== "os" && type !== "country") {
      throw new HttpError(400, "Rule type must be device, os or country");
    }
    const v = String(r.value ?? "").trim().toLowerCase();
    if (!v) throw new HttpError(400, "Each rule needs a value");
    return { type, value: v, url: assertUrl(r.url, "Rule URL") };
  });
}

export function optionalInt(value: unknown, field: string, min = 0): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new HttpError(400, `${field} must be a whole number ≥ ${min}`);
  return n;
}

export function optionalTimestamp(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a date`);
  return Math.round(n);
}

export function optionalText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().slice(0, max);
  return s || null;
}
