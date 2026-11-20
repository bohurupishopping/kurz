import { h, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

const BASE = "/_";
const listeners = new Set<() => void>();

const current = () => location.pathname.slice(BASE.length) || "/";

export function navigate(to: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", BASE + to);
  listeners.forEach((l) => l());
  if (!replace) window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(current());
  useEffect(() => {
    const update = () => setPath(current());
    listeners.add(update);
    addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

export function Link(props: { href: string; class?: string; children: ComponentChildren; [k: string]: unknown }) {
  const { href, children, ...rest } = props;
  return h(
    "a",
    {
      ...rest,
      href: BASE + href,
      onClick: (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      },
    },
    children,
  );
}
