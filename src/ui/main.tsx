import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "@fontsource-variable/mona-sans";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { api, setUnauthorizedHandler } from "./lib/api";
import { Link, navigate, usePath } from "./lib/router";
import { Icon, Logo } from "./components/Icon";
import { Spinner, Toasts } from "./components/ui";
import { Forgot, Login, Reset, Setup } from "./pages/Auth";
import { LinksPage } from "./pages/Links";
import { AnalyticsPage, LinkDetailPage } from "./pages/Stats";
import { DomainsPage } from "./pages/Domains";
import { SettingsPage } from "./pages/Settings";

interface Status { setup: boolean; authed: boolean; email: string | null; email_enabled: boolean; admin_email_hint: string | null }

const NAV = [
  { href: "/", label: "Links", icon: "link", match: (p: string) => p === "/" || p.startsWith("/links") },
  { href: "/analytics", label: "Analytics", icon: "chart", match: (p: string) => p.startsWith("/analytics") },
  { href: "/domains", label: "Domains", icon: "globe", match: (p: string) => p.startsWith("/domains") },
  { href: "/settings", label: "Settings", icon: "sliders", match: (p: string) => p.startsWith("/settings") },
];

function Shell({ path, email, onLogout }: { path: string; email: string | null; onLogout: () => void }) {
  const linkMatch = path.match(/^\/links\/(\d+)/);
  let page;
  if (linkMatch) page = <LinkDetailPage id={Number(linkMatch[1])} />;
  else if (path.startsWith("/analytics")) page = <AnalyticsPage />;
  else if (path.startsWith("/domains")) page = <DomainsPage />;
  else if (path.startsWith("/settings")) page = <SettingsPage />;
  else page = <LinksPage />;

  const logout = async () => {
    await api("/auth/logout", { body: {} }).catch(() => {});
    onLogout();
  };

  return (
    <div class="app">
      <aside class="sidebar">
        <Link href="/" class="side-brand"><Logo /> Kurz</Link>
        <nav class="side-nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} class={n.match(path) ? "active" : ""} aria-current={n.match(path) ? "page" : undefined}>
              <Icon name={n.icon} size={18} /> {n.label}
            </Link>
          ))}
          <p class="side-label">Resources</p>
          <a class="side-link" href="https://github.com/mddanishyusuf/kurz#api" target="_blank" rel="noopener">
            <Icon name="book" size={18} /> API docs
          </a>
          <a class="side-link" href="https://github.com/mddanishyusuf/kurz" target="_blank" rel="noopener">
            <Icon name="github" size={18} /> GitHub
          </a>
        </nav>
        <div class="side-foot">
          <div class="account">
            <span class="avatar">{(email ?? "A")[0]}</span>
            <span class="account-text">
              <b>Admin</b>
              <span>{email ?? ""}</span>
            </span>
            <button class="icon-btn" aria-label="Sign out" title="Sign out" onClick={logout}><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="mobile-top">
          <div class="mobile-row">
            <Link href="/" class="side-brand"><Logo /> Kurz</Link>
            <button class="icon-btn" aria-label="Sign out" onClick={logout}><Icon name="logout" /></button>
          </div>
          <nav class="mobile-nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} class={n.match(path) ? "active" : ""}>{n.label}</Link>
            ))}
          </nav>
        </header>
        <main key={path}>{page}</main>
      </div>
    </div>
  );
}

function App() {
  const path = usePath();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const refresh = () => api<Status>("/auth/status").then(setStatus, (e) => setError(e.message));

  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setStatus((s) => (s ? { ...s, authed: false } : s)));
  }, []);

  // Keep the URL in sync with the auth state.
  useEffect(() => {
    if (!status) return;
    const authPages = ["/login", "/forgot", "/reset", "/setup"];
    if (status.authed && authPages.includes(path)) navigate("/", true);
    else if (!status.authed && status.setup && !authPages.includes(path)) navigate("/login", true);
  }, [status, path]);

  if (error) return <div class="center"><p class="error">{error}</p></div>;
  if (!status) return <Spinner />;

  let view;
  if (!status.setup) view = <Setup emailHint={status.admin_email_hint} onDone={refresh} />;
  else if (!status.authed) {
    if (path === "/forgot") view = <Forgot emailEnabled={status.email_enabled} />;
    else if (path === "/reset") view = <Reset onDone={refresh} />;
    else view = <Login onDone={refresh} />;
  } else view = <Shell path={path} email={status.email} onLogout={() => setStatus({ ...status, authed: false })} />;

  return (
    <>
      {view}
      <Toasts />
    </>
  );
}

render(<App />, document.getElementById("app")!);
