import { type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { copyText } from "../lib/format";

// ---------- Toasts ----------
type Toast = { id: number; text: string; error?: boolean };
let toastId = 0;
const toastListeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
export function toast(text: string, error = false) {
  const t = { id: ++toastId, text, error };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l(toasts));
  }, error ? 5000 : 2600);
}
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    toastListeners.add(setList);
    return () => void toastListeners.delete(setList);
  }, []);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`toast${t.error ? " error" : ""}`}>
          <Icon name={t.error ? "x" : "check"} />
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- Modal ----------
export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  size?: "sm";
  onSubmit?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);
  const Wrap: any = props.onSubmit ? "form" : "div";
  return (
    <div class="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <Wrap
        class={`modal${props.size ? ` ${props.size}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onSubmit={(e: Event) => {
          e.preventDefault();
          props.onSubmit?.();
        }}
      >
        <div class="modal-head">
          <h2>{props.title}</h2>
          <button type="button" class="icon-btn" onClick={props.onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div class="modal-body">{props.children}</div>
        {props.footer && <div class="modal-foot">{props.footer}</div>}
      </Wrap>
    </div>
  );
}

export function Confirm(props: { title: string; text: string; action: string; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={props.title}
      size="sm"
      onClose={props.onClose}
      footer={
        <>
          <button class="btn" type="button" onClick={props.onClose}>Cancel</button>
          <button
            class="btn btn-primary"
            style="background:var(--danger);border-color:var(--danger);color:#fff"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onConfirm();
                props.onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {props.action}
          </button>
        </>
      }
    >
      <p style="margin:0;color:var(--fg-2)">{props.text}</p>
    </Modal>
  );
}

// ---------- Small pieces ----------
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      class={label ? "btn btn-sm" : `icon-btn${done ? " ok" : ""}`}
      title="Copy"
      aria-label={`Copy ${text}`}
      onClick={async (e) => {
        e.stopPropagation();
        await copyText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      <Icon name={done ? "check" : "copy"} size={label ? 14 : 15} />
      {label && (done ? "Copied" : label)}
    </button>
  );
}

export function Menu({ children }: { children: (close: () => void) => ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <div ref={ref} style="position:relative">
      <button type="button" class="icon-btn" aria-label="More actions" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more" />
      </button>
      {open && <div class="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export const Spinner = () => (
  <div class="center">
    <div class="spinner" />
  </div>
);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e) => live && setState({ error: e.message, loading: false }),
    );
    return () => void (live = false);
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), set: (data: T) => setState({ data, loading: false }) };
}
