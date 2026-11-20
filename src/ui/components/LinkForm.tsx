import { useState } from "preact/hooks";
import { api, type Domain, type LinkItem, type Rule } from "../lib/api";
import { toLocalInput } from "../lib/format";
import { Modal, toast } from "./ui";
import { Icon } from "./Icon";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

function readUtm(url: string): Record<string, string> {
  try {
    const u = new URL(url);
    return Object.fromEntries(UTM_KEYS.map((k) => [k, u.searchParams.get(k) ?? ""]));
  } catch {
    return Object.fromEntries(UTM_KEYS.map((k) => [k, ""]));
  }
}

function applyUtm(url: string, utm: Record<string, string>): string {
  try {
    const u = new URL(url);
    for (const k of UTM_KEYS) {
      if (utm[k]?.trim()) u.searchParams.set(k, utm[k].trim());
      else u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function LinkForm(props: {
  link?: LinkItem;
  domains: Domain[];
  initialUrl?: string;
  onClose: () => void;
  onSaved: (l: LinkItem) => void;
}) {
  const l = props.link;
  const [url, setUrl] = useState(l?.url ?? props.initialUrl ?? "");
  const [slug, setSlug] = useState(l?.slug ?? "");
  const [domain, setDomain] = useState(l?.domain ?? (props.domains.length === 1 ? props.domains[0].hostname : "*"));
  const [title, setTitle] = useState(l?.title ?? "");
  const [tags, setTags] = useState(l?.tags.join(", ") ?? "");
  const [redirectType, setRedirectType] = useState(l?.redirect_type ?? 0);
  const [expiresAt, setExpiresAt] = useState(toLocalInput(l?.expires_at ?? null));
  const [expiredUrl, setExpiredUrl] = useState(l?.expired_url ?? "");
  const [maxClicks, setMaxClicks] = useState(l?.max_clicks ? String(l.max_clicks) : "");
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [rules, setRules] = useState<Rule[]>(l?.rules ?? []);
  const [ogTitle, setOgTitle] = useState(l?.og_title ?? "");
  const [ogDesc, setOgDesc] = useState(l?.og_description ?? "");
  const [ogImage, setOgImage] = useState(l?.og_image ?? "");
  const [disabled, setDisabled] = useState(l?.disabled ?? false);
  const [utm, setUtm] = useState(readUtm(url));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const host = domain === "*" ? location.host : domain;
  const setUtmField = (k: string, v: string) => {
    const next = { ...utm, [k]: v };
    setUtm(next);
    setUrl(applyUtm(url, next));
  };

  async function submit() {
    setError("");
    setBusy(true);
    const body: Record<string, unknown> = {
      url: url.trim(),
      slug: slug.trim() || undefined,
      domain,
      title,
      tags,
      expires_at: expiresAt ? new Date(expiresAt).getTime() : null,
      expired_url: expiredUrl,
      max_clicks: maxClicks,
      rules: rules.filter((r) => r.value.trim() && r.url.trim()),
      og_title: ogTitle,
      og_description: ogDesc,
      og_image: ogImage,
      disabled,
    };
    if (redirectType) body.redirect_type = redirectType;
    if (password) body.password = password;
    else if (removePassword) body.password = null;
    try {
      const saved = l
        ? await api<LinkItem>(`/links/${l.id}`, { method: "PATCH", body })
        : await api<LinkItem>("/links", { body });
      toast(l ? "Link updated" : "Link created");
      props.onSaved(saved);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const hasAdvanced = Boolean(l && (l.expires_at || l.max_clicks || l.has_password || l.redirect_type === 301));

  return (
    <Modal
      title={l ? "Edit link" : "New link"}
      onClose={props.onClose}
      onSubmit={submit}
      footer={
        <>
          {error && <p class="error" style="margin-right:auto;align-self:center">{error}</p>}
          <button type="button" class="btn" onClick={props.onClose}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={busy}>{busy ? "Saving…" : l ? "Save" : "Create link"}</button>
        </>
      }
    >
      <label class="field">
        <span>Destination URL</span>
        <input class="input" type="url" required autoFocus placeholder="https://example.com/very/long/page" value={url} onInput={(e) => { setUrl(e.currentTarget.value); setUtm(readUtm(e.currentTarget.value)); }} />
      </label>

      <label class="field">
        <span>Short link</span>
        <div class="input-group">
          {props.domains.length > 0 ? (
            <select class="select" value={domain} onChange={(e) => setDomain(e.currentTarget.value)} aria-label="Domain">
              <option value="*">Any domain</option>
              {props.domains.map((d) => <option key={d.id} value={d.hostname}>{d.hostname}</option>)}
            </select>
          ) : (
            <span class="addon">{host}/</span>
          )}
          <input class="input" placeholder={l ? "" : "random"} value={slug} onInput={(e) => setSlug(e.currentTarget.value)} aria-label="Slug" />
        </div>
        <small>Leave empty for a random slug. Letters, numbers, - _ and . are allowed.</small>
      </label>

      <div class="grid-2">
        <label class="field">
          <span>Title <small>(optional)</small></span>
          <input class="input" value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Spring launch" />
        </label>
        <label class="field">
          <span>Tags</span>
          <input class="input" value={tags} onInput={(e) => setTags(e.currentTarget.value)} placeholder="social, launch" />
        </label>
      </div>

      <details class="section">
        <summary><Icon name="tag" /> UTM builder <small>Campaign tracking</small></summary>
        <div class="inner">
          <div class="grid-2">
            {UTM_KEYS.map((k) => (
              <label class="field" key={k}>
                <span>{k.replace("utm_", "").replace(/^./, (c) => c.toUpperCase())}</span>
                <input class="input" value={utm[k]} onInput={(e) => setUtmField(k, e.currentTarget.value)} placeholder={{ utm_source: "twitter", utm_medium: "social", utm_campaign: "launch", utm_term: "", utm_content: "" }[k]} />
              </label>
            ))}
          </div>
          <small style="color:var(--muted)">Parameters are written into the destination URL as you type.</small>
        </div>
      </details>

      <details class="section" open={hasAdvanced}>
        <summary><Icon name="sliders" /> Expiry, limits & password</summary>
        <div class="inner">
          <div class="grid-2">
            <label class="field">
              <span>Expires at</span>
              <input class="input" type="datetime-local" value={expiresAt} onInput={(e) => setExpiresAt(e.currentTarget.value)} />
            </label>
            <label class="field">
              <span>Click limit</span>
              <input class="input" type="number" min="1" value={maxClicks} onInput={(e) => setMaxClicks(e.currentTarget.value)} placeholder="Unlimited" />
            </label>
          </div>
          <label class="field">
            <span>After expiry, send visitors to</span>
            <input class="input" type="url" value={expiredUrl} onInput={(e) => setExpiredUrl(e.currentTarget.value)} placeholder="Show an “expired” page" />
          </label>
          <label class="field">
            <span>Password</span>
            {l?.has_password && !removePassword ? (
              <div class="row">
                <input class="input" type="password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="Protected · type to change" autocomplete="new-password" />
                <button type="button" class="btn btn-sm btn-danger" onClick={() => setRemovePassword(true)}>Remove</button>
              </div>
            ) : (
              <input class="input" type="password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="No password" autocomplete="new-password" />
            )}
          </label>
          <label class="field">
            <span>Redirect type</span>
            <select class="select" value={redirectType} onChange={(e) => setRedirectType(Number(e.currentTarget.value))}>
              <option value={0}>Default (from settings)</option>
              <option value={302}>302 · Temporary (recommended, every click counted)</option>
              <option value={301}>301 · Permanent (browsers may cache it)</option>
            </select>
          </label>
        </div>
      </details>

      <details class="section" open={rules.length > 0}>
        <summary><Icon name="target" /> Targeting <small>{rules.length ? `${rules.length} rule${rules.length > 1 ? "s" : ""}` : "Device, OS, country"}</small></summary>
        <div class="inner">
          {rules.map((r, i) => (
            <div class="rule" key={i}>
              <select class="select" value={r.type} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, type: e.currentTarget.value as Rule["type"], value: "" } : x)))}>
                <option value="device">Device</option>
                <option value="os">OS</option>
                <option value="country">Country</option>
              </select>
              {r.type === "country" ? (
                <input class="input" value={r.value} placeholder="us, ca" onInput={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, value: e.currentTarget.value } : x)))} />
              ) : (
                <select class="select" value={r.value} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, value: e.currentTarget.value } : x)))}>
                  <option value="">Choose…</option>
                  {(r.type === "device" ? ["mobile", "tablet", "desktop"] : ["ios", "android", "windows", "macos", "linux"]).map((v) => (
                    <option key={v} value={v}>{v === "ios" ? "iOS" : v === "macos" ? "macOS" : v[0].toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              )}
              <input class="input" type="url" value={r.url} placeholder="https://…" onInput={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, url: e.currentTarget.value } : x)))} />
              <button type="button" class="icon-btn" aria-label="Remove rule" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Icon name="x" /></button>
            </div>
          ))}
          <div>
            <button type="button" class="btn btn-sm" onClick={() => setRules([...rules, { type: "os", value: "ios", url: "" }])}>
              <Icon name="plus" size={14} /> Add rule
            </button>
          </div>
          <small style="color:var(--muted)">The first matching rule wins. Everyone else goes to the destination URL.</small>
        </div>
      </details>

      <details class="section" open={Boolean(l?.og_title || l?.og_image)}>
        <summary><Icon name="image" /> Social preview <small>Custom card on X, Slack, WhatsApp…</small></summary>
        <div class="inner">
          <label class="field"><span>Title</span><input class="input" value={ogTitle} onInput={(e) => setOgTitle(e.currentTarget.value)} /></label>
          <label class="field"><span>Description</span><textarea class="textarea" rows={2} value={ogDesc} onInput={(e) => setOgDesc(e.currentTarget.value)} /></label>
          <label class="field"><span>Image URL</span><input class="input" type="url" value={ogImage} onInput={(e) => setOgImage(e.currentTarget.value)} placeholder="https://…/card.png (1200×630)" /></label>
        </div>
      </details>

      {l && (
        <label class="switch">
          <input type="checkbox" checked={!disabled} onChange={(e) => setDisabled(!e.currentTarget.checked)} />
          Link is {disabled ? "disabled" : "active"}
        </label>
      )}
    </Modal>
  );
}
