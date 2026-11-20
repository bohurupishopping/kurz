import { useEffect, useRef, useState } from "preact/hooks";
import { api, type Domain, type LinkItem } from "../lib/api";
import { Link, navigate } from "../lib/router";
import { compact, copyText, fullDate, hostOf, num, relTime, shortDisplay } from "../lib/format";
import { Icon } from "../components/Icon";
import { Confirm, CopyButton, Menu, Spinner, toast, useAsync } from "../components/ui";
import { LinkForm } from "../components/LinkForm";
import { QrModal } from "../components/QrModal";

export function linkStatus(l: LinkItem) {
  if (l.disabled) return { label: "Disabled", cls: "danger" };
  if (l.expires_at && l.expires_at < Date.now()) return { label: "Expired", cls: "warn" };
  if (l.max_clicks && l.clicks >= l.max_clicks) return { label: "Limit reached", cls: "warn" };
  return null;
}

export function LinkBadges({ l, onTag }: { l: LinkItem; onTag?: (t: string) => void }) {
  const status = linkStatus(l);
  const any = status || l.has_password || l.expires_at || l.max_clicks || l.rules.length || l.tags.length || l.redirect_type === 301;
  if (!any) return null;
  return (
    <div class="meta">
      {status && <span class={`badge ${status.cls}`}>{status.label}</span>}
      {l.has_password && <span class="badge" title="Password protected"><Icon name="lock" size={11} /> Password</span>}
      {l.expires_at && !status && <span class="badge" title={`Expires ${fullDate(l.expires_at)}`}><Icon name="clock" size={11} /> {new Date(l.expires_at).toLocaleDateString()}</span>}
      {l.max_clicks && !status && <span class="badge" title="Click limit">{compact(l.clicks)}/{compact(l.max_clicks)}</span>}
      {l.rules.length > 0 && <span class="badge" title="Targeting rules"><Icon name="target" size={11} /> {l.rules.length}</span>}
      {l.redirect_type === 301 && <span class="badge">301</span>}
      {l.tags.map((t) =>
        onTag ? <button key={t} class="badge accent" onClick={() => onTag(t)}>#{t}</button> : <span key={t} class="badge accent">#{t}</span>,
      )}
    </div>
  );
}

export function LinksPage() {
  const params = new URLSearchParams(location.search);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(q);
  const [tag, setTag] = useState(params.get("tag") ?? "");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LinkItem | "new" | null>(null);
  const [qr, setQr] = useState<LinkItem | null>(null);
  const [deleting, setDeleting] = useState<LinkItem | null>(null);
  const [quickUrl, setQuickUrl] = useState("");
  const [quickSlug, setQuickSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const qs = new URLSearchParams({ q: query, tag, status, sort, page: String(page), limit: "50" });
  const list = useAsync(() => api<{ links: LinkItem[]; total: number; limit: number }>(`/links?${qs}`), [qs.toString()]);
  const domains = useAsync(() => api<Domain[]>("/domains"), []);
  const tags = useAsync(() => api<{ tag: string; count: number }[]>("/tags"), [list.data?.total]);

  // "/" focuses the shorten box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        urlInput.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  async function quickCreate(e: Event) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setCreating(true);
    try {
      let url = quickUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      const ds = domains.data ?? [];
      const link = await api<LinkItem>("/links", { body: { url, slug: quickSlug || undefined, domain: ds.length === 1 ? ds[0].hostname : "*" } });
      await copyText(link.short_url);
      toast(`Copied ${shortDisplay(link.short_url)}`);
      setQuickUrl("");
      setQuickSlug("");
      list.reload();
    } catch (err: any) {
      toast(err.message, true);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(l: LinkItem) {
    try {
      await api(`/links/${l.id}`, { method: "PATCH", body: { disabled: !l.disabled } });
      toast(l.disabled ? "Link enabled" : "Link disabled");
      list.reload();
    } catch (e: any) {
      toast(e.message, true);
    }
  }

  const data = list.data;
  const filtered = query || tag || status;

  return (
    <div class="container">
      <div class="page-head">
        <div>
          <h1>Links</h1>
          <p>Shorten, share and track every click.</p>
        </div>
      </div>
      <form class="quick" onSubmit={quickCreate}>
        <div class="input-group">
          <span class="addon"><Icon name="link" /></span>
          <input ref={urlInput} class="input" placeholder="Paste a long URL to shorten…" value={quickUrl} onInput={(e) => setQuickUrl(e.currentTarget.value)} aria-label="URL to shorten" autoFocus />
          {!quickUrl && <span class="addon" aria-hidden="true"><kbd>/</kbd></span>}
        </div>
        <div class="input-group slug">
          <input class="input" placeholder="custom-slug (optional)" value={quickSlug} onInput={(e) => setQuickSlug(e.currentTarget.value)} aria-label="Custom slug" />
        </div>
        <button type="button" class="btn" onClick={() => setEditing("new")} title="More options">
          <Icon name="sliders" size={14} /> Options
        </button>
        <button class="btn btn-primary" disabled={creating}>{creating ? "Shortening…" : "Shorten"}</button>
      </form>

      <div class="filters">
        <div class="search">
          <Icon name="search" />
          <input class="input" placeholder="Search links" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search links" />
        </div>
        {(tags.data?.length ?? 0) > 0 && (
          <select class="select" value={tag} onChange={(e) => { setTag(e.currentTarget.value); setPage(1); }} aria-label="Filter by tag">
            <option value="">All tags</option>
            {tags.data!.map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({t.count})</option>)}
          </select>
        )}
        <select class="select" value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }} aria-label="Filter by status">
          <option value="">All links</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </select>
        <select class="select" value={sort} onChange={(e) => setSort(e.currentTarget.value)} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="clicks">Most clicks</option>
        </select>
        {data && <span class="count">{num(data.total)} {data.total === 1 ? "link" : "links"}</span>}
      </div>

      <div class="card links">
        {list.loading && !data ? (
          <Spinner />
        ) : list.error ? (
          <div class="empty">{list.error}</div>
        ) : data && data.links.length === 0 ? (
          <div class="empty">
            <span class="empty-icon"><Icon name={filtered ? "search" : "link"} size={20} /></span>
            <h3>{filtered ? "No links match" : "No links yet"}</h3>
            <p>{filtered ? "Try a different search or filter." : "Paste a URL above to create your first short link."}</p>
          </div>
        ) : (
          data?.links.map((l) => (
            <div class="link-row" key={l.id}>
              <span class={`favicon${linkStatus(l) ? " off" : ""}`} aria-hidden="true">{hostOf(l.url)[0]}</span>
              <div class="link-main">
                <div class="short">
                  <a href={l.short_url} target="_blank" rel="noopener" title={l.short_url}>{shortDisplay(l.short_url)}</a>
                  <CopyButton text={l.short_url} />
                </div>
                <div class="dest" title={l.url}>{l.title ? <><span style="color:var(--fg-2)">{l.title}</span> · </> : null}{shortDisplay(l.url)}</div>
                <LinkBadges l={l} onTag={(t) => { setTag(t); setPage(1); }} />
              </div>
              <Link href={`/links/${l.id}`} class="clicks-cell" title="View stats">
                <b>{compact(l.clicks)}</b>
                <small>{l.clicks === 1 ? "click" : "clicks"}</small>
              </Link>
              <div class="date-cell" title={fullDate(l.created_at)}>{relTime(l.created_at)}</div>
              <div class="actions">
                <button class="icon-btn" title="QR code" aria-label="QR code" onClick={() => setQr(l)}><Icon name="qr" /></button>
                <button class="icon-btn" title="Edit" aria-label="Edit" onClick={() => setEditing(l)}><Icon name="edit" /></button>
                <Menu>
                  {(close) => (
                    <>
                      <button onClick={() => { close(); window.open(l.url, "_blank", "noopener"); }}><Icon name="external" /> Open destination</button>
                      <button onClick={() => { close(); toggle(l); }}><Icon name={l.disabled ? "play" : "ban"} /> {l.disabled ? "Enable" : "Disable"}</button>
                      <button class="danger" onClick={() => { close(); setDeleting(l); }}><Icon name="trash" /> Delete</button>
                    </>
                  )}
                </Menu>
              </div>
            </div>
          ))
        )}
        {data && data.total > data.limit && (
          <div class="pager">
            <span>{(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total}</span>
            <div class="row">
              <button class="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button class="btn btn-sm" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <LinkForm
          link={editing === "new" ? undefined : editing}
          initialUrl={editing === "new" ? quickUrl : undefined}
          domains={domains.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); if (editing === "new") setQuickUrl(""); list.reload(); }}
        />
      )}
      {qr && <QrModal url={qr.short_url} slug={qr.slug} onClose={() => setQr(null)} />}
      {deleting && (
        <Confirm
          title="Delete link?"
          text={`${shortDisplay(deleting.short_url)} will stop working and its ${deleting.clicks} recorded clicks will be deleted. This can't be undone.`}
          action="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/links/${deleting.id}`, { method: "DELETE" });
            toast("Link deleted");
            list.reload();
          }}
        />
      )}
    </div>
  );
}
