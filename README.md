<p><img src="docs/logo.svg" width="56" height="56" alt="Kurz logo"></p>

# Kurz

**A light, fast, open-source link shortener that runs entirely on Cloudflare.**
One Worker, free tier friendly, your own domains, clean dashboard. ~30 KB total.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mddanishyusuf/kurz)


## Features

- **Short links**: random or custom slugs, 301/302, edit, disable, delete
- **Your domains**: serve links from any number of Cloudflare custom domains, per-domain root and 404 redirects
- **Analytics** without cookies: clicks over time, referrers, countries, devices, browsers, OS; bots filtered out
- **Link controls**: expiry date, click limits, password protection, fallback URL after expiry
- **Targeting**: send iOS, Android, mobile or specific countries to different URLs
- **Social previews**: custom title, description and image for X, Slack, WhatsApp, LinkedIn…
- **QR codes**: SVG and PNG download for every link
- **UTM builder**, tags, search, filters
- **CSV import/export** and a **REST API** with tokens
- **Simple auth**: one admin password, reset by email via Cloudflare Email Routing (or from the terminal)
- Query strings pass through: `sho.rt/x?utm_source=tw` → `destination?utm_source=tw`

## How it works

```
visitor → Worker ─┬─ KV  (slug → destination, read at the edge, ~ms)
                  └─ D1  (links, clicks, settings; click logged after the redirect is sent)
admin   → /_/     → Preact dashboard served from Workers static assets
```

Redirects never wait on the database. The D1 schema is created automatically on first use, so there is no migration step.

## Deploy

### Option A: one click

Click **Deploy to Cloudflare** above. Cloudflare forks the repo, creates the KV namespace and D1 database, and deploys. Open `https://kurz.<your-subdomain>.workers.dev/_/` and create your admin account.

### Option B: from your machine

```bash
git clone https://github.com/mddanishyusuf/kurz && cd kurz
npm install
npx wrangler login
npm run deploy
```

Wrangler creates the KV namespace and D1 database on the first deploy. Then open `/_/` on your Worker URL to set up the admin account.

> **Set up the admin right after deploying.** The first person to open `/_/` creates the admin. To lock it to you, set `ADMIN_EMAIL` in `wrangler.jsonc` before deploying.

## Custom domains

The domain's DNS has to be on Cloudflare.

1. Cloudflare dashboard → **Workers & Pages** → **kurz** → **Settings → Domains & Routes** → **Add → Custom domain**, for example `go.example.com`.
2. In Kurz, go to **Domains → Add domain** and enter the same hostname.
3. Choose the domain when you create links.

Links set to **Any domain** work on every connected hostname. Links tied to a domain only work there.
To keep the dashboard off your short domains, set `ADMIN_HOST` (for example `admin.example.com`).

You can also declare domains in `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "go.example.com", "custom_domain": true }]
```

## Password reset by email

Kurz sends reset links with the Cloudflare `send_email` binding:

1. Enable **Email Routing** on a domain in Cloudflare (Email → Email Routing).
2. Add your admin email as a **verified destination address**.
3. Set `EMAIL_FROM` in `wrangler.jsonc` to an address on that domain, such as `kurz@example.com`, then redeploy.

Without email set up, reset from your terminal:

```bash
npm run set-password            # production
npm run set-password -- --local # local dev
```

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `EMAIL_FROM` | (empty) | Sender address for reset emails. Leave empty to turn email reset off |
| `ADMIN_EMAIL` | (empty) | If set, only this email can complete the first-time setup |
| `ADMIN_HOST` | (empty) | If set, the dashboard and API are only served on this hostname |
| `CLICK_RETENTION_DAYS` | `365` | A daily cron deletes click rows older than this (`0` keeps them forever) |

Global defaults (root redirect, 404 redirect, default 301/302, click tracking on or off) are set in **Settings**.

## API

Create a token in **Settings → API tokens**, then:

```bash
# Create
curl -X POST https://go.example.com/_/api/links \
  -H "Authorization: Bearer kurz_…" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/launch","slug":"launch","tags":["social"]}'

# List / search
curl "https://go.example.com/_/api/links?q=launch&limit=20" -H "Authorization: Bearer kurz_…"
```

| Method | Path | Notes |
|---|---|---|
| `GET` | `/_/api/links` | `q`, `tag`, `domain`, `status` (active/expired/disabled), `sort` (newest/oldest/clicks), `page`, `limit` |
| `POST` | `/_/api/links` | `url` is required. Optional: `slug`, `domain`, `title`, `tags`, `redirect_type`, `password`, `expires_at`, `expired_url`, `max_clicks`, `rules`, `og_title`, `og_description`, `og_image` |
| `POST` | `/_/api/links/bulk` | `{ "links": [...] }`, up to 100 per request |
| `GET` `PATCH` `DELETE` | `/_/api/links/:id` | `PATCH` takes any field from create, plus `disabled` |
| `GET` | `/_/api/links/:id/stats` | `days` (1–365), `tz` (minutes, as from `getTimezoneOffset()`) |
| `GET` | `/_/api/links/export` | CSV |
| `GET` | `/_/api/stats` | Overview across all links |
| `GET` `POST` `PATCH` `DELETE` | `/_/api/domains[/:id]` | |
| `GET` | `/_/api/tags` | |

Targeting rule format: `{ "type": "os" | "device" | "country", "value": "ios" | "mobile" | "us,ca", "url": "https://…" }`. The first matching rule wins.

## Free tier notes

Cloudflare's free plan easily covers personal and small-team use:

- **Workers**: 100k requests/day.
- **D1**: each human click is about 2 row writes, so roughly 50k clicks/day fit in the 100k writes/day limit. You can turn off click tracking in Settings.
- **KV**: 1,000 writes/day, used only when links or domains are created or changed, never on clicks. A big CSV import counts against it.
- **Passwords** use PBKDF2-SHA256 with 50k iterations to stay inside the free plan's CPU limit. Login and reset are rate limited (5 per minute per IP).

## Development

```bash
npm install
npm run dev        # builds the dashboard, runs the Worker at http://localhost:8787/_/
npm run dev:ui     # optional: Vite hot reload for the dashboard (proxies the API to :8787)
npm test           # unit tests
npm run typecheck
```

Local dev uses local KV and D1 automatically. To try reset emails locally, run
`npx wrangler dev --var EMAIL_FROM:kurz@example.com`. Wrangler saves each sent email as an `.eml` file and prints its path.

```
src/worker/   Hono app: redirect engine, auth, admin API, D1 schema
src/ui/       Preact dashboard (built into dist/ui/_/)
scripts/      set-password CLI
test/         unit tests
```

## License

MIT
