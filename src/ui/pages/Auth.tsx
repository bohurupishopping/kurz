import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { api } from "../lib/api";
import { Link, navigate } from "../lib/router";
import { Logo } from "../components/Icon";

function AuthShell({ children, foot }: { children: ComponentChildren; foot?: ComponentChildren }) {
  return (
    <div class="auth">
      <div class="auth-card">
        <div class="brand"><Logo /><span>Kurz</span></div>
        <div class="card">{children}</div>
        {foot && <div class="auth-foot">{foot}</div>}
      </div>
    </div>
  );
}

function useSubmit(fn: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

export function Setup({ onDone, emailHint }: { onDone: () => void; emailHint: string | null }) {
  const [email, setEmail] = useState(emailHint ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    if (password !== confirm) throw new Error("Passwords don't match");
    await api("/auth/setup", { body: { email, password } });
    onDone();
  });
  return (
    <AuthShell>
      <h1>Welcome to Kurz</h1>
      <p>Create the admin account for this instance. Your email is only used for password resets.</p>
      <form onSubmit={submit}>
        <label class="field"><span>Email</span><input class="input" type="email" required autoFocus value={email} onInput={(e) => setEmail(e.currentTarget.value)} autocomplete="email" /></label>
        <label class="field"><span>Password</span><input class="input" type="password" required minLength={8} value={password} onInput={(e) => setPassword(e.currentTarget.value)} autocomplete="new-password" placeholder="At least 8 characters" /></label>
        <label class="field"><span>Confirm password</span><input class="input" type="password" required value={confirm} onInput={(e) => setConfirm(e.currentTarget.value)} autocomplete="new-password" /></label>
        {error && <p class="error">{error}</p>}
        <button class="btn btn-primary" disabled={busy}>{busy ? "Setting up…" : "Create admin"}</button>
      </form>
    </AuthShell>
  );
}

export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    await api("/auth/login", { body: { password } });
    onDone();
  });
  return (
    <AuthShell foot={<Link href="/forgot">Forgot password?</Link>}>
      <h1>Sign in</h1>
      <p>Enter your admin password.</p>
      <form onSubmit={submit}>
        <input class="input" type="password" required autoFocus value={password} onInput={(e) => setPassword(e.currentTarget.value)} autocomplete="current-password" placeholder="Password" aria-label="Password" />
        {error && <p class="error">{error}</p>}
        <button class="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthShell>
  );
}

export function Forgot({ emailEnabled }: { emailEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, submit } = useSubmit(async () => {
    await api("/auth/forgot", { body: { email } });
    setSent(true);
  });
  return (
    <AuthShell foot={<Link href="/login">Back to sign in</Link>}>
      <h1>Reset password</h1>
      {!emailEnabled ? (
        <>
          <p>Email isn't configured on this instance. Reset the password from your terminal instead:</p>
          <div class="token-box">npm run set-password</div>
        </>
      ) : sent ? (
        <p style="margin:0">If <b>{email}</b> is the admin email, a reset link is on its way. It's valid for 30 minutes.</p>
      ) : (
        <>
          <p>Enter the admin email and we'll send you a reset link.</p>
          <form onSubmit={submit}>
            <input class="input" type="email" required autoFocus value={email} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="you@example.com" aria-label="Email" autocomplete="email" />
            {error && <p class="error">{error}</p>}
            <button class="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export function Reset({ onDone }: { onDone: () => void }) {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    if (password !== confirm) throw new Error("Passwords don't match");
    await api("/auth/reset", { body: { token, password } });
    navigate("/", true);
    onDone();
  });
  return (
    <AuthShell foot={<Link href="/login">Back to sign in</Link>}>
      <h1>Choose a new password</h1>
      <p>You'll be signed out on all other devices.</p>
      <form onSubmit={submit}>
        <label class="field"><span>New password</span><input class="input" type="password" required minLength={8} autoFocus value={password} onInput={(e) => setPassword(e.currentTarget.value)} autocomplete="new-password" /></label>
        <label class="field"><span>Confirm</span><input class="input" type="password" required value={confirm} onInput={(e) => setConfirm(e.currentTarget.value)} autocomplete="new-password" /></label>
        {error && <p class="error">{error}</p>}
        <button class="btn btn-primary" disabled={busy || !token}>{busy ? "Saving…" : "Set password"}</button>
      </form>
    </AuthShell>
  );
}
