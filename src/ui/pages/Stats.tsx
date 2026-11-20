import { useState } from "preact/hooks";
import { api, type Domain, type LinkItem, type Stats } from "../lib/api";
import { Link, navigate } from "../lib/router";
import { compact, fullDate, num, shortDisplay } from "../lib/format";
import { Icon } from "../components/Icon";
import { CopyButton, Spinner, toast, useAsync, Confirm } from "../components/ui";
import { Breakdown, ClicksChart } from "../components/Charts";
import { LinkForm } from "../components/LinkForm";
import { QrModal } from "../components/QrModal";
import { LinkBadges } from "./Links";

const RANGES = [7, 30, 90, 365];
const tz = new Date().getTimezoneOffset();

function RangePicker({ days, set }: { days: number; set: (d: number) => void }) {
  return (
    <div class="seg" role="group" aria-label="Time range">
      {RANGES.map((d) => (
        <button key={d} class={days === d ? "on" : ""} onClick={() => set(d)} aria-pressed={days === d}>
          {d === 365 ? "1y" : `${d}d`}
        </button>
      ))}
    </div>
  );
}

function StatsBody({ s }: { s: Stats }) {
  return (
    <>
      <div class="card card-pad">
        <ClicksChart data={s.timeseries} />
      </div>
      <div class="breakdowns">
        <Breakdown title="Referrers" rows={s.referrers} />
        <Breakdown title="Countries" rows={s.countries} kind="country" />
        <Breakdown title="Devices" rows={s.devices} kind="device" />
        <Breakdown title="Browsers" rows={s.browsers} />
        <Breakdown title="Operating systems" rows={s.os} />
      </div>
    </>
  );
}

export function LinkDetailPage({ id }: { id: number }) {
  const [days, setDays] = useState(30);
  const [editing, setEditing] = useState(false);
  const [qr, setQr] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const link = useAsync(() => api<LinkItem>(`/links/${id}`), [id]);
  const stats = useAsync(() => api<Stats>(`/links/${id}/stats?days=${days}&tz=${tz}`), [id, days]);
  const domains = useAsync(() => api<Domain[]>("/domains"), []);

  if (link.error) return <div class="container"><div class="empty"><h3>{link.error}</h3><Link href="/">Back to links</Link></div></div>;
  if (!link.data) return <Spinner />;
  const l = link.data;

  return (
    <div class="container">
      <Link href="/" class="back"><Icon name="back" size={14} /> All links</Link>
      <div class="page-head">
        <div style="min-width:0">
          <h1 class="short" style="font-size:28px;font-weight:400;letter-spacing:-0.02em">
            <a href={l.short_url} target="_blank" rel="noopener">{shortDisplay(l.short_url)}</a>
            <CopyButton text={l.short_url} />
          </h1>
          <p class="dest" style="font-size:14px;margin:4px 0 0">→ <a href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></p>
          <LinkBadges l={l} />
        </div>
        <div class="row">
          <button class="btn" onClick={() => setQr(true)}><Icon name="qr" size={14} /> QR</button>
          <button class="btn" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> Edit</button>
          <button class="btn btn-danger" onClick={() => setDeleting(true)} aria-label="Delete" title="Delete"><Icon name="trash" size={14} /></button>
        </div>
      </div>

      <div class="kpis">
        <div class="card kpi"><div class="label">Clicks · last {days}d</div><div class="value">{stats.data ? num(stats.data.total) : "–"}</div></div>
        <div class="card kpi"><div class="label">All-time clicks</div><div class="value">{num(l.clicks)}</div></div>
        <div class="card kpi"><div class="label">Bots filtered · {days}d</div><div class="value">{stats.data ? num(stats.data.bots) : "–"}</div></div>
        <div class="card kpi"><div class="label">Created</div><div class="value sm">{fullDate(l.created_at)}</div></div>
      </div>

      <div class="page-head" style="margin-bottom:12px">
        <h2 class="section-title">Clicks</h2>
        <RangePicker days={days} set={setDays} />
      </div>
      {stats.data ? <StatsBody s={stats.data} /> : <Spinner />}

      {editing && (
        <LinkForm link={l} domains={domains.data ?? []} onClose={() => setEditing(false)} onSaved={(saved) => { setEditing(false); link.set(saved); }} />
      )}
      {qr && <QrModal url={l.short_url} slug={l.slug} onClose={() => setQr(false)} />}
      {deleting && (
        <Confirm
          title="Delete link?"
          text={`${shortDisplay(l.short_url)} will stop working and its click history will be deleted.`}
          action="Delete"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await api(`/links/${l.id}`, { method: "DELETE" });
            toast("Link deleted");
            navigate("/");
          }}
        />
      )}
    </div>
  );
}

type Overview = Stats & { total_links: number; total_clicks: number; top_links: (LinkItem & { period_clicks: number })[] };

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const s = useAsync(() => api<Overview>(`/stats?days=${days}&tz=${tz}`), [days]);
  const d = s.data;
  return (
    <div class="container">
      <div class="page-head">
        <div>
          <h1>Analytics</h1>
          <p>Clicks across all your links. Bots are filtered out.</p>
        </div>
        <RangePicker days={days} set={setDays} />
      </div>
      {!d ? (
        <Spinner />
      ) : (
        <>
          <div class="kpis">
            <div class="card kpi"><div class="label">Clicks · last {days}d</div><div class="value">{num(d.total)}</div></div>
            <div class="card kpi"><div class="label">All-time clicks</div><div class="value">{num(d.total_clicks)}</div></div>
            <div class="card kpi"><div class="label">Links</div><div class="value">{num(d.total_links)}</div></div>
            <div class="card kpi"><div class="label">Bots filtered · {days}d</div><div class="value">{num(d.bots)}</div></div>
          </div>
          <div class="card card-pad">
            <ClicksChart data={d.timeseries} />
          </div>
          <div class="breakdowns">
            <div class="card card-pad">
              <h2 style="margin-bottom:12px">Top links</h2>
              {d.top_links.length === 0 ? (
                <p class="sub" style="margin:0">No clicks in this period</p>
              ) : (
                <div class="bars">
                  {d.top_links.map((l) => (
                    <Link key={l.id} href={`/links/${l.id}`} class="bar-row" style="text-decoration:none">
                      <div class="fill" style={{ width: `${(l.period_clicks / d.top_links[0].period_clicks) * 100}%` }} />
                      <span>/{l.slug}</span>
                      <b>{compact(l.period_clicks)}</b>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Breakdown title="Referrers" rows={d.referrers} />
            <Breakdown title="Countries" rows={d.countries} kind="country" />
            <Breakdown title="Devices" rows={d.devices} kind="device" />
            <Breakdown title="Browsers" rows={d.browsers} />
            <Breakdown title="Operating systems" rows={d.os} />
          </div>
        </>
      )}
    </div>
  );
}
