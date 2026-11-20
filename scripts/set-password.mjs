#!/usr/bin/env node
// Reset the admin password from your terminal — the fallback when email isn't set up.
//   npm run set-password            → production (remote D1)
//   npm run set-password -- --local → local dev database
import { webcrypto as crypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import readline from "node:readline";

const local = process.argv.includes("--local");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
const lines = rl[Symbol.asyncIterator]();
let muted = false;
// Hide typed characters on a real terminal.
rl._writeToOutput = (s) => !muted && rl.output.write(s);

async function ask(question) {
  process.stdout.write(question);
  muted = true;
  const { value = "" } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return value;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

async function hash(password) {
  const iterations = 50_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}`;
}

const pw = await ask("New admin password: ");
if (pw.length < 8) {
  rl.close();
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}
if ((await ask("Confirm password: ")) !== pw) {
  rl.close();
  console.error("Passwords don't match.");
  process.exit(1);
}

rl.close();
const h = await hash(pw);
const sql = `INSERT INTO settings (key, value) VALUES ('admin_password', '${h}') ON CONFLICT (key) DO UPDATE SET value = excluded.value; DELETE FROM sessions;`;
execFileSync("npx", ["wrangler", "d1", "execute", "DB", local ? "--local" : "--remote", "--command", sql], { stdio: "inherit" });
console.log(`\n✓ Password updated${local ? " (local)" : ""}. All sessions were signed out.`);
