// Small server-rendered pages for visitors: password prompt, 404, expired, OG preview.

export function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STYLE = `
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--card:#fff;--accent:#ea580c;--accent-fg:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--line:#292524;--card:#1c1917;--accent:#fb923c;--accent-fg:#1c1917}}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;padding:16px}
main{width:100%;max-width:360px;text-align:center}
.mark{font-weight:700;letter-spacing:-.02em;color:var(--accent);font-size:13px;text-transform:uppercase}
h1{font-size:22px;letter-spacing:-.02em;margin:12px 0 6px}
p{color:var(--muted);margin:0 0 20px}
form{display:grid;gap:10px}
input{font:inherit;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);outline:none}
input:focus{border-color:var(--accent)}
button{font:inherit;font-weight:600;padding:11px;border-radius:10px;border:0;background:var(--accent);color:var(--accent-fg);cursor:pointer}
.err{color:#dc2626;font-size:14px;margin:0}
`;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" },
  });
}

export function notFoundPage(): Response {
  return page("Link not found", `<div class="mark">Kurz</div><h1>Link not found</h1><p>This short link doesn't exist or was removed.</p>`, 404);
}

export function expiredPage(): Response {
  return page("Link expired", `<div class="mark">Kurz</div><h1>This link has expired</h1><p>It's no longer available.</p>`, 410);
}

export function passwordPage(error = false): Response {
  return page(
    "Password required",
    `<div class="mark">Kurz</div><h1>Password required</h1><p>This link is protected. Enter the password to continue.</p>
<form method="post"><input type="password" name="password" placeholder="Password" autofocus required autocomplete="current-password">${
      error ? `<p class="err">Wrong password. Try again.</p>` : ""
    }<button type="submit">Continue</button></form>`,
    error ? 401 : 200,
  );
}

export function ogPage(target: string, og: { title?: string; description?: string; image?: string }): Response {
  const meta = [
    og.title && `<meta property="og:title" content="${esc(og.title)}"><meta name="twitter:title" content="${esc(og.title)}">`,
    og.description &&
      `<meta property="og:description" content="${esc(og.description)}"><meta name="description" content="${esc(og.description)}"><meta name="twitter:description" content="${esc(og.description)}">`,
    og.image && `<meta property="og:image" content="${esc(og.image)}"><meta name="twitter:image" content="${esc(og.image)}">`,
    `<meta name="twitter:card" content="${og.image ? "summary_large_image" : "summary"}">`,
    `<meta property="og:url" content="${esc(target)}">`,
  ]
    .filter(Boolean)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(og.title ?? target)}</title>${meta}<meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><a href="${esc(target)}">${esc(target)}</a></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
