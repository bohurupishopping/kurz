// Small server-rendered pages for visitors: password prompt, 404, expired, OG preview.

export function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// The Kurz mark: a K whose upper arm is an arrow pointing out. Same as docs/logo.svg.
export const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f9f9f9"/><g fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 8v16M14 16l8 8" stroke="#0d0d0d"/><path d="M14 16l8.5-8.5M16.5 7.5h6v6" stroke="#3a83f7"/></g></svg>';

const STYLE = `
:root{color-scheme:dark;--bg:#212121;--fg:#ededed;--muted:#afafaf;--line:rgb(255 255 255/.15);--primary:#f9f9f9;--primary-fg:#0d0d0d;--brand:#3a83f7}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;display:grid;place-items:start center;min-height:100vh;padding:18vh 16px 32px}
main{width:100%;max-width:360px}
.mark{display:block;margin-bottom:24px}
h1{font-size:28px;line-height:36px;font-weight:400;letter-spacing:-.02em;margin:0 0 6px}
p{color:var(--muted);margin:0 0 28px}
form{display:grid;gap:12px}
input{font:inherit;height:42px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--fg);outline:none}
input:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgb(58 131 247/.25)}
button{font:inherit;font-weight:500;height:42px;border-radius:8px;border:0;background:var(--primary);color:var(--primary-fg);cursor:pointer}
button:hover{background:rgb(249 249 249/.85)}
.err{color:#ff6b6b;font-size:14px;margin:0}
`;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" },
  });
}

export function notFoundPage(): Response {
  return page("Link not found", `<div class="mark">${LOGO_SVG}</div><h1>Link not found</h1><p>This short link doesn't exist or was removed.</p>`, 404);
}

export function expiredPage(): Response {
  return page("Link expired", `<div class="mark">${LOGO_SVG}</div><h1>This link has expired</h1><p>It's no longer available.</p>`, 410);
}

export function passwordPage(error = false): Response {
  return page(
    "Password required",
    `<div class="mark">${LOGO_SVG}</div><h1>Password required</h1><p>This link is protected. Enter the password to continue.</p>
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
