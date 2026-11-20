import { EmailMessage } from "cloudflare:email";
import type { Env } from "../types";
import { HttpError } from "../types";

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII subjects.
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
}

function b64Body(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/.{1,76}/g, "$&\r\n");
}

/** Send an email through the Cloudflare Email Routing `send_email` binding. */
export async function sendEmail(env: Env, to: string, subject: string, text: string, html: string) {
  if (!env.EMAIL || !env.EMAIL_FROM) throw new HttpError(503, "Email is not configured");
  const from = env.EMAIL_FROM;
  const domain = from.split("@")[1] ?? "kurz.local";
  const boundary = `kurz-${crypto.randomUUID()}`;
  const raw = [
    `From: Kurz <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64Body(text),
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64Body(html),
    `--${boundary}--`,
    ``,
  ].join("\r\n");
  await env.EMAIL.send(new EmailMessage(from, to, raw));
}
