// Attach and detach Workers Custom Domains through the Cloudflare API, so adding a
// domain in Kurz is the only step. Needs an API token with the "Edit Cloudflare
// Workers" permissions (Workers Scripts: Edit, Workers Routes: Edit, Zone: Read).

import { getSettings, setSettings } from "./settings";
import { HttpError, type Env } from "../types";

const API = "https://api.cloudflare.com/client/v4";

interface CfResponse<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

interface Zone {
  id: string;
  name: string;
  account: { id: string };
}

interface WorkerDomain {
  id: string;
  hostname: string;
  service: string;
  zone_id: string;
}

async function cf<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  const data = (await res.json().catch(() => null)) as CfResponse<T> | null;
  if (!data?.success) {
    const err = data?.errors?.[0];
    // 6003/6111: malformed token, 9106/9109/10000/10001: invalid or missing permission.
    if (res.status === 401 || res.status === 403 || [6003, 6111, 9106, 9109, 10000, 10001].includes(err?.code ?? 0)) {
      throw new HttpError(400, "Cloudflare rejected the API token. Check that it's valid and has the Workers permissions.");
    }
    throw new HttpError(400, err?.message ? `Cloudflare: ${err.message}` : `Cloudflare API error (${res.status})`);
  }
  return data.result;
}

/** The token from the `CF_API_TOKEN` secret, or the one saved in Settings. */
export async function cfToken(env: Env): Promise<string | null> {
  if (env.CF_API_TOKEN) return env.CF_API_TOKEN;
  return (await getSettings(env)).cf_api_token || null;
}

export function workerName(env: Env): string {
  return env.WORKER_NAME || "kurz";
}

/** Check a token and return the account it belongs to. */
export async function verifyToken(token: string): Promise<{ accountId: string; zones: number }> {
  const zones = await cf<Zone[]>(token, "/zones?per_page=50");
  if (!zones.length) throw new HttpError(400, "This token can't see any zones. Give it access to your domains.");
  return { accountId: zones[0].account.id, zones: zones.length };
}

/** Find the Cloudflare zone a hostname belongs to (go.example.co.uk → example.co.uk). */
async function findZone(token: string, hostname: string): Promise<Zone> {
  const parts = hostname.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const name = parts.slice(i).join(".");
    const [zone] = await cf<Zone[]>(token, `/zones?name=${encodeURIComponent(name)}`);
    if (zone) return zone;
  }
  throw new HttpError(400, `${hostname} isn't on this Cloudflare account. Its DNS has to be managed by Cloudflare.`);
}

/** Point a hostname at this Worker. Cloudflare creates the DNS record and certificate. */
export async function attachDomain(env: Env, token: string, hostname: string): Promise<void> {
  const zone = await findZone(token, hostname);
  try {
    await cf<WorkerDomain>(token, `/accounts/${zone.account.id}/workers/domains`, {
      method: "PUT",
      body: JSON.stringify({ hostname, service: workerName(env), zone_id: zone.id, environment: "production" }),
    });
  } catch (e) {
    if (e instanceof HttpError && /externally managed DNS|already has.*DNS record/i.test(e.message)) {
      throw new HttpError(
        409,
        `${hostname} already has a DNS record. Delete it in Cloudflare → ${zone.name} → DNS, then try again.`,
      );
    }
    throw e;
  }
  await setSettings(env, { cf_account_id: zone.account.id });
}

/** Remove the hostname from this Worker. Cloudflare deletes the DNS record it made. */
export async function detachDomain(env: Env, token: string, hostname: string): Promise<void> {
  const accountId = await accountFor(env, token);
  const found = await cf<WorkerDomain[]>(
    token,
    `/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(hostname)}`,
  );
  for (const d of found.filter((d) => d.hostname === hostname && d.service === workerName(env))) {
    await cf(token, `/accounts/${accountId}/workers/domains/${d.id}`, { method: "DELETE" });
  }
}

/** Hostnames currently attached to this Worker. */
export async function attachedHostnames(env: Env, token: string): Promise<Set<string>> {
  const accountId = await accountFor(env, token);
  const list = await cf<WorkerDomain[]>(
    token,
    `/accounts/${accountId}/workers/domains?service=${encodeURIComponent(workerName(env))}`,
  );
  return new Set(list.filter((d) => d.service === workerName(env)).map((d) => d.hostname));
}

async function accountFor(env: Env, token: string): Promise<string> {
  const saved = (await getSettings(env)).cf_account_id;
  if (saved) return saved;
  const { accountId } = await verifyToken(token);
  await setSettings(env, { cf_account_id: accountId });
  return accountId;
}
