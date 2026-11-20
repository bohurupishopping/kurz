export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS: Fetcher;
  EMAIL?: SendEmail;
  LIMITER?: RateLimit;
  EMAIL_FROM?: string;
  ADMIN_HOST?: string;
  ADMIN_EMAIL?: string;
  CLICK_RETENTION_DAYS?: string;
  /** Optional secret. Otherwise the token saved in Settings is used. */
  CF_API_TOKEN?: string;
  WORKER_NAME?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { auth: "session" | "token"; sessionId?: string };
};

export type RuleType = "device" | "os" | "country";
export interface Rule {
  type: RuleType;
  value: string;
  url: string;
}

/** Compact record stored in KV — everything the redirect path needs. */
export interface KvLink {
  id: number;
  url: string;
  t: 301 | 302;
  exp?: number;
  expUrl?: string;
  pw?: string;
  max?: number;
  rules?: Rule[];
  og?: { title?: string; description?: string; image?: string };
}

export interface KvDomain {
  root?: string;
  nf?: string;
}

export interface KvConfig {
  root?: string;
  nf?: string;
  track: boolean;
}

export interface LinkRow {
  id: number;
  domain: string;
  slug: string;
  url: string;
  title: string | null;
  redirect_type: number;
  password_hash: string | null;
  expires_at: number | null;
  expired_url: string | null;
  max_clicks: number | null;
  clicks: number;
  disabled: number;
  tags: string;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  rules: string | null;
  created_at: number;
  updated_at: number;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
