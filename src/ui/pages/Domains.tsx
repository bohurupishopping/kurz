import { useState } from "preact/hooks";
import { api, type Domain } from "../lib/api";
import { Link } from "../lib/router";
import { Icon } from "../components/Icon";
import { Confirm, Modal, Spinner, toast, useAsync } from "../components/ui";

function DomainForm({ domain, linked, onClose, onSaved }: { domain?: Domain; linked: boolean; onClose: () => void; onSaved: () => void }) {
  const [hostname, setHostname] = useState(domain?.hostname ?? "");
  const [root, setRoot] = useState(domain?.root_redirect ?? "");
  const [nf, setNf] = useState(domain?.not_found_url ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={domain ? domain.hostname : "Add domain"}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true);
        setError("");
        try {
          const body = { hostname, root_redirect: root, not_found_url: nf };
          if (domain) await api(`/domains/${domain.id}`, { method: "PATCH", body });
          else await api("/domains", { body });
          toast(domain ? "Domain updated" : linked ? "Domain connected. HTTPS can take a few minutes." : "Domain added");
          onSaved();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
      footer={
        <>
          {error && <p class="error" style="margin-right:auto;align-self:center">{error}</p>}
          <button type="button" class="btn" onClick={onClose}>Cancel</button>
          <button class="btn btn-primary" disabled={busy}>{domain ? "Save" : busy && linked ? "Connecting…" : "Add domain"}</button>
        </>
      }
    >
      {!domain && (
        <label class="field">
          <span>Hostname</span>
          <input class="input" required autoFocus placeholder="go.example.com" value={hostname} onInput={(e) => setHostname(e.currentTarget.value)} />
          <small>
            {linked
              ? "Kurz connects it to Cloudflare for you. The domain's DNS has to be on your Cloudflare account."
              : "Connect it to this Worker in Cloudflare first (see the steps on this page)."}
          </small>
        </label>
      )}
      <label class="field">
        <span>Root redirect</span>
        <input class="input" type="url" placeholder="https://example.com" value={root} onInput={(e) => setRoot(e.currentTarget.value)} />
        <small>Where visitors to {hostname || "the domain"}/ go. Empty uses the global setting.</small>
      </label>
      <label class="field">
        <span>Not-found redirect</span>
        <input class="input" type="url" placeholder="Show a 404 page" value={nf} onInput={(e) => setNf(e.currentTarget.value)} />
        <small>Where unknown short links go.</small>
      </label>
    </Modal>
  );
}

export function DomainsPage() {
  const list = useAsync(() => api<Domain[]>("/domains"), []);
  const settings = useAsync(() => api<{ cloudflare: string | null }>("/settings"), []);
  const linked = Boolean(settings.data?.cloudflare);
  const [connecting, setConnecting] = useState<number | null>(null);
  const connect = async (d: Domain) => {
    setConnecting(d.id);
    try {
      await api(`/domains/${d.id}/connect`, { body: {} });
      toast("Domain connected. HTTPS can take a few minutes.");
      list.reload();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setConnecting(null);
    }
  };
  const [editing, setEditing] = useState<Domain | "new" | null>(null);
  const [deleting, setDeleting] = useState<Domain | null>(null);

  return (
    <div class="container">
      <div class="page-head">
        <div>
          <h1>Domains</h1>
          <p>Serve short links from your own domains. Links set to “Any domain” work on all of them.</p>
        </div>
        <button class="btn btn-primary" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add domain</button>
      </div>

      <div class="stack">
        <div class="card card-pad">
          {list.loading && !list.data ? (
            <Spinner />
          ) : list.data!.length === 0 ? (
            <div class="empty" style="padding:24px">
              <span class="empty-icon"><Icon name="globe" size={20} /></span>
              <h3>No custom domains yet</h3>
              <p>Links work on <b>{location.host}</b> right now. Add a domain to use your own.</p>
            </div>
          ) : (
            list.data!.map((d) => (
              <div class="list-row" key={d.id}>
                <div style="min-width:0">
                  <div style="font-weight:600;display:flex;gap:8px;align-items:center">
                    <Icon name="globe" size={14} /> {d.hostname}
                    {d.hostname === location.hostname && <span class="badge">Current</span>}
                    {d.connected === true && <span class="badge good">Connected</span>}
                    {d.connected === false && <span class="badge warn">Not connected</span>}
                  </div>
                  <div class="muted">
                    {d.links} link{d.links === 1 ? "" : "s"}
                    {d.root_redirect && <> · root → {d.root_redirect.replace(/^https?:\/\//, "")}</>}
                    {d.not_found_url && <> · 404 → {d.not_found_url.replace(/^https?:\/\//, "")}</>}
                  </div>
                </div>
                <div class="row" style="gap:2px">
                  {d.connected === false && (
                    <button class="btn" style="margin-right:6px" disabled={connecting === d.id} onClick={() => connect(d)}>
                      {connecting === d.id ? "Connecting…" : "Connect"}
                    </button>
                  )}
                  <button class="icon-btn" aria-label="Edit" onClick={() => setEditing(d)}><Icon name="edit" /></button>
                  <button class="icon-btn" aria-label="Remove" onClick={() => setDeleting(d)}><Icon name="trash" /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {settings.data && !linked && (
          <div class="card card-pad">
            <h2>Connect domains automatically</h2>
            <p class="sub">
              Link your Cloudflare account once and Kurz sets up DNS and SSL whenever you add a domain.
            </p>
            <Link href="/settings#cloudflare" class="btn btn-primary">Connect Cloudflare</Link>
            <details style="margin-top:18px">
              <summary class="muted" style="cursor:pointer">Or connect each domain by hand</summary>
              <ol class="steps" style="margin-top:12px">
                <li>Open the Cloudflare dashboard → <b>Workers & Pages</b> → <b>kurz</b>.</li>
                <li>Go to <b>Settings → Domains & Routes</b> → <b>Add → Custom domain</b>.</li>
                <li>Enter the hostname (e.g. <code>go.example.com</code>). Don't create the DNS record yourself.</li>
                <li>Add the same hostname here, then pick it when creating links.</li>
              </ol>
            </details>
          </div>
        )}
      </div>

      {editing && <DomainForm linked={linked} domain={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {deleting && (
        <Confirm
          title={`Remove ${deleting.hostname}?`}
          text={
            linked
              ? "Kurz will stop serving links on it and remove it from Cloudflare, including its DNS record."
              : "Kurz will stop tracking this domain. Remove it in Cloudflare too if you no longer need it."
          }
          action="Remove"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api(`/domains/${deleting.id}`, { method: "DELETE" });
              toast("Domain removed");
              list.reload();
            } catch (e: any) {
              toast(e.message, true);
            }
          }}
        />
      )}
    </div>
  );
}
