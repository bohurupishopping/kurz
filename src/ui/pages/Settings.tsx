import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api";
import { fullDate, relTime } from "../lib/format";
import { parseCsv } from "../../worker/lib/csv";
import { Icon } from "../components/Icon";
import { Confirm, CopyButton, Spinner, toast, useAsync } from "../components/ui";

interface SettingsData {
  admin_email: string;
  default_redirect_type: number;
  root_redirect: string;
  not_found_url: string;
  track_clicks: boolean;
  email_enabled: boolean;
  click_retention_days: number;
}

function General({ s, reload }: { s: SettingsData; reload: () => void }) {
  const [form, setForm] = useState(s);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(s), [s]);
  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/settings", { method: "PATCH", body: form });
      toast("Settings saved");
      reload();
    } catch (err: any) {
      toast(err.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="card card-pad" onSubmit={save}>
      <h2>General</h2>
      <p class="sub">Defaults for every domain. Each domain can override the redirects.</p>
      <div class="stack">
        <div class="grid-2">
          <label class="field">
            <span>Root redirect</span>
            <input class="input" type="url" placeholder="Opens the dashboard" value={form.root_redirect} onInput={(e) => setForm({ ...form, root_redirect: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span>Not-found redirect</span>
            <input class="input" type="url" placeholder="Show a 404 page" value={form.not_found_url} onInput={(e) => setForm({ ...form, not_found_url: e.currentTarget.value })} />
          </label>
        </div>
        <label class="field">
          <span>Default redirect type</span>
          <select class="select" value={form.default_redirect_type} onChange={(e) => setForm({ ...form, default_redirect_type: Number(e.currentTarget.value) })}>
            <option value={302}>302 · Temporary (recommended)</option>
            <option value={301}>301 · Permanent</option>
          </select>
        </label>
        <label class="switch">
          <input type="checkbox" checked={form.track_clicks} onChange={(e) => setForm({ ...form, track_clicks: e.currentTarget.checked })} />
          Track clicks <span style="color:var(--muted)">· kept for {s.click_retention_days > 0 ? `${s.click_retention_days} days` : "ever"}, no cookies</span>
        </label>
        <div><button class="btn btn-primary" disabled={busy}>Save</button></div>
      </div>
    </form>
  );
}

function Account({ s, reload }: { s: SettingsData; reload: () => void }) {
  const [email, setEmail] = useState(s.admin_email);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <div class="card card-pad">
      <h2>Account</h2>
      <p class="sub">There's one admin account.</p>
      <div class="stack">
        <form
          class="field"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/settings", { method: "PATCH", body: { admin_email: email } });
              toast("Email updated");
              reload();
            } catch (err: any) {
              toast(err.message, true);
            }
          }}
        >
          <span>Admin email</span>
          <div class="row">
            <input class="input" type="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
            <button class="btn" disabled={email === s.admin_email}>Update</button>
          </div>
          {s.email_enabled ? (
            <small><Icon name="mail" size={12} /> Password reset emails are on (Cloudflare Email Routing).</small>
          ) : (
            <div class="notice warn">Password reset by email is off. Set <code>EMAIL_FROM</code> and enable Email Routing to turn it on (see README).</div>
          )}
        </form>
        <form
          class="field"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/settings/password", { body: { current, password: next } });
              toast("Password changed. Other sessions were signed out.");
              setCurrent("");
              setNext("");
            } catch (err: any) {
              toast(err.message, true);
            }
          }}
        >
          <span>Change password</span>
          <div class="grid-2">
            <input class="input" type="password" required placeholder="Current password" value={current} onInput={(e) => setCurrent(e.currentTarget.value)} autocomplete="current-password" />
            <input class="input" type="password" required minLength={8} placeholder="New password" value={next} onInput={(e) => setNext(e.currentTarget.value)} autocomplete="new-password" />
          </div>
          <div><button class="btn">Change password</button></div>
        </form>
      </div>
    </div>
  );
}

interface Token { id: number; name: string; prefix: string; last_used_at: number | null; created_at: number }

function Tokens() {
  const list = useAsync(() => api<Token[]>("/tokens"), []);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Token | null>(null);
  return (
    <div class="card card-pad">
      <h2>API tokens</h2>
      <p class="sub">Create links from scripts, Zapier, Raycast, or anything that speaks HTTP.</p>
      <div class="stack">
        <form
          class="row"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const t = await api<Token & { token: string }>("/tokens", { body: { name } });
              setCreated(t.token);
              setName("");
              list.reload();
            } catch (err: any) {
              toast(err.message, true);
            }
          }}
        >
          <input class="input" placeholder="Token name, e.g. Raycast" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          <button class="btn"><Icon name="key" size={14} /> Create</button>
        </form>
        {created && (
          <div class="stack" style="gap:8px">
            <div class="notice warn">Copy this token now. It won't be shown again.</div>
            <div class="token-box"><span style="flex:1">{created}</span><CopyButton text={created} /></div>
            <pre class="token-box" style="white-space:pre-wrap;margin:0">{`curl -X POST ${location.origin}/_/api/links \\
  -H "Authorization: Bearer ${created.slice(0, 10)}…" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","slug":"hello"}'`}</pre>
          </div>
        )}
        {list.data && list.data.length > 0 && (
          <div>
            {list.data.map((t) => (
              <div class="list-row" key={t.id}>
                <div>
                  <div style="font-weight:550">{t.name} <span class="mono" style="color:var(--muted)">{t.prefix}…</span></div>
                  <div class="muted">Created {fullDate(t.created_at)} · {t.last_used_at ? `last used ${relTime(t.last_used_at)}` : "never used"}</div>
                </div>
                <button class="btn btn-sm btn-danger" onClick={() => setRevoking(t)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {revoking && (
        <Confirm
          title="Revoke token?"
          text={`Anything using “${revoking.name}” will stop working immediately.`}
          action="Revoke"
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            await api(`/tokens/${revoking.id}`, { method: "DELETE" });
            toast("Token revoked");
            list.reload();
          }}
        />
      )}
    </div>
  );
}

const COLUMNS = ["url", "slug", "domain", "title", "tags", "redirect_type", "expires_at"];

function ImportExport() {
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);

  async function onFile(file: File) {
    const rows = parseCsv(await file.text());
    if (!rows.length) return toast("That file is empty", true);
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const hasHeader = header.includes("url");
    const cols = hasHeader ? header : COLUMNS;
    const items = (hasHeader ? rows.slice(1) : rows).map((r) => {
      const o: Record<string, string> = {};
      cols.forEach((c, i) => COLUMNS.includes(c) && r[i]?.trim() && (o[c] = r[i].trim()));
      return o;
    });
    const state = { done: 0, total: items.length, failed: [] as string[] };
    setProgress({ ...state });
    for (let i = 0; i < items.length; i += 100) {
      try {
        const res = await api<{ results: { ok: boolean; error?: string; input?: any }[] }>("/links/bulk", { body: { links: items.slice(i, i + 100) } });
        res.results.forEach((r) => !r.ok && state.failed.push(`${r.input?.slug || r.input?.url || "row"}: ${r.error}`));
      } catch (e: any) {
        state.failed.push(e.message);
      }
      state.done = Math.min(i + 100, items.length);
      setProgress({ ...state });
    }
    toast(`Imported ${state.total - state.failed.length} of ${state.total} links`, state.failed.length > 0);
  }

  return (
    <div class="card card-pad">
      <h2>Import & export</h2>
      <p class="sub">CSV columns: <code>url</code> (required), <code>slug</code>, <code>domain</code>, <code>title</code>, <code>tags</code>, <code>redirect_type</code>, <code>expires_at</code>.</p>
      <div class="row" style="flex-wrap:wrap">
        <label class="btn">
          <Icon name="upload" size={14} /> Import CSV
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
        </label>
        <a class="btn" href="/_/api/links/export" download><Icon name="download" size={14} /> Export all links</a>
      </div>
      {progress && (
        <div class="stack" style="margin-top:14px;gap:8px">
          <div class="notice">Imported {progress.done - progress.failed.length < 0 ? 0 : progress.done - progress.failed.length} / {progress.total}{progress.done < progress.total ? "…" : ""}</div>
          {progress.failed.length > 0 && (
            <details>
              <summary style="cursor:pointer;color:var(--danger)">{progress.failed.length} failed</summary>
              <ul style="margin:8px 0 0;padding-left:18px;color:var(--fg-2);font-size:13px">{progress.failed.slice(0, 50).map((f, i) => <li key={i}>{f}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const s = useAsync(() => api<SettingsData>("/settings"), []);
  return (
    <div class="container" style="max-width:760px">
      <div class="page-head"><div><h1>Settings</h1></div></div>
      {!s.data ? (
        <Spinner />
      ) : (
        <div class="stack">
          <General s={s.data} reload={s.reload} />
          <Account s={s.data} reload={s.reload} />
          <Tokens />
          <ImportExport />
        </div>
      )}
    </div>
  );
}
