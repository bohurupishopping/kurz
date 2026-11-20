export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/_/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-kurz": "1" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
  });
  const isJson = res.headers.get("content-type")?.includes("json");
  const data: any = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth")) onUnauthorized();
    throw new ApiError(res.status, (isJson && data?.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface Rule {
  type: "device" | "os" | "country";
  value: string;
  url: string;
}

export interface LinkItem {
  id: number;
  domain: string;
  slug: string;
  short_url: string;
  url: string;
  title: string | null;
  redirect_type: number;
  has_password: boolean;
  expires_at: number | null;
  expired_url: string | null;
  max_clicks: number | null;
  clicks: number;
  disabled: boolean;
  tags: string[];
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  rules: Rule[];
  created_at: number;
  updated_at: number;
}

export interface Domain {
  id: number;
  hostname: string;
  root_redirect: string | null;
  not_found_url: string | null;
  links: number;
}

export interface Stats {
  days: number;
  total: number;
  bots: number;
  timeseries: { day: string; clicks: number }[];
  referrers: { key: string; clicks: number }[];
  countries: { key: string; clicks: number }[];
  devices: { key: string; clicks: number }[];
  browsers: { key: string; clicks: number }[];
  os: { key: string; clicks: number }[];
}
