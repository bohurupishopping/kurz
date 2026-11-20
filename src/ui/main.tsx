import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./styles.css";
import { api, setUnauthorizedHandler } from "./lib/api";
import { Link, navigate, usePath } from "./lib/router";
import { storage } from "./lib/format";
import { Icon, Logo } from "./components/Icon";
import { Spinner, Toasts } from "./components/ui";
import { Forgot, Login, Reset, Setup } from "./pages/Auth";
import { LinksPage } from "./pages/Links";
import { AnalyticsPage, LinkDetailPage } from "./pages/Stats";
import { DomainsPage } from "./pages/Domains";
import { SettingsPage } from "./pages/Settings";

interface Status { setup: boolean; authed: boolean; email_enabled: boolean; admin_email_hint: string | null }

function ThemeToggle() {
  const isDark = () =>
    document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
  const [dark, setDark] = useState(isDark());
  return (
    <button
      class="icon-btn"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title="Toggle theme"
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        storage("kurz-theme", next);
        setDark(!dark);
      }}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

function Shell({ path, onLogout }: { path: string; onLogout: () => void }) {
  const nav = [
    { href: "/", label: "Links", match: (p: string) => p === "/" || p.startsWith("/links") },
    { href: "/analytics", label: "Analytics", match: (p: string) => p.startsWith("/analytics") },
    { href: "/domains", label: "Domains", match: (p: string) => p.startsWith("/domains") },
    { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
  ];
  const linkMatch = path.match(/^\/links\/(\d+)/);
  let page;
  if (linkMatch) page = <LinkDetailPage id={Number(linkMatch[1])} />;
  else if (path.startsWith("/analytics")) page = <AnalyticsPage />;
  else if (path.startsWith("/domains")) page = <DomainsPage />;
  else if (path.startsWith("/settings")) page = <SettingsPage />;
  else page = <LinksPage />;

  return (
    <>
      <header class="topbar">
        <div class="topbar-inner">
          <Link href="/" class="brand"><Logo /><span>Kurz</span></Link>
          <nav class="nav">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} class={n.match(path) ? "active" : ""} aria-current={n.match(path) ? "page" : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div class="topbar-actions">
            <ThemeToggle />
            <button
              class="icon-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await api("/auth/logout", { body: {} }).catch(() => {});
                onLogout();
              }}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>
      <main key={path}>{page}</main>
    </>
  );
}

function App() {
  const path = usePath();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const refresh = () =>
    api<Status>("/auth/status").then(setStatus, (e) => setError(e.message));

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
  } else view = <Shell path={path} onLogout={() => setStatus({ ...status, authed: false })} />;

  return (
    <>
      {view}
      <Toasts />
    </>
  );
}

render(<App />, document.getElementById("app")!);
