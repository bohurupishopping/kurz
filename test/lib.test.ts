import { describe, expect, it } from "vitest";
import { hashPassword, randomSlug, verifyPassword } from "../src/worker/lib/crypto";
import { parseUA } from "../src/worker/lib/ua";
import { normalizeHost, normalizeTags, packTags, unpackTags, validSlug, assertUrl, normalizeRules } from "../src/worker/lib/validate";
import { parseCsv, toCsv } from "../src/worker/lib/csv";
import { mergeQuery, pickTarget } from "../src/worker/routes/redirect";

describe("crypto", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("pbkdf2$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
  it("makes slugs without look-alike chars", () => {
    for (let i = 0; i < 200; i++) expect(randomSlug()).toMatch(/^[a-km-np-z2-9]{6}$/);
  });
});

describe("validate", () => {
  it("accepts good slugs and rejects bad ones", () => {
    expect(validSlug("launch-2026")).toBe(true);
    expect(validSlug("a.b_c")).toBe(true);
    expect(validSlug("_admin")).toBe(false);
    expect(validSlug("has space")).toBe(false);
    expect(validSlug("favicon.ico")).toBe(false);
    expect(validSlug("a/b")).toBe(false);
  });
  it("only allows http(s) URLs", () => {
    expect(assertUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(() => assertUrl("javascript:alert(1)")).toThrow();
    expect(() => assertUrl("not a url")).toThrow();
  });
  it("normalizes hosts and tags", () => {
    expect(normalizeHost("https://Go.Example.com/path")).toBe("go.example.com");
    expect(() => normalizeHost("localhost")).toThrow();
    const tags = normalizeTags("Launch, launch, Social!, ");
    expect(tags).toEqual(["launch", "social"]);
    expect(unpackTags(packTags(tags))).toEqual(tags);
  });
  it("validates rules", () => {
    expect(normalizeRules([{ type: "os", value: "iOS", url: "https://apps.apple.com/x" }])[0].value).toBe("ios");
    expect(() => normalizeRules([{ type: "planet", value: "x", url: "https://a.b" }])).toThrow();
  });
});

describe("ua", () => {
  it("detects iPhone Safari", () => {
    const u = parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    expect(u).toMatchObject({ os: "iOS", browser: "Safari", device: "mobile", isBot: false });
  });
  it("detects desktop Chrome on Windows", () => {
    const u = parseUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
    expect(u).toMatchObject({ os: "Windows", browser: "Chrome", device: "desktop", isBot: false });
  });
  it("flags bots and preview bots", () => {
    expect(parseUA("Twitterbot/1.0")).toMatchObject({ isBot: true, isPreviewBot: true });
    expect(parseUA("curl/8.4.0")).toMatchObject({ isBot: true, isPreviewBot: false });
    expect(parseUA("")).toMatchObject({ isBot: true });
  });
});

describe("redirect helpers", () => {
  const ua = parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari/604.1");
  it("picks the first matching rule", () => {
    const rules = [
      { type: "country" as const, value: "de,at", url: "https://de.example.com" },
      { type: "os" as const, value: "ios", url: "https://apps.apple.com" },
    ];
    expect(pickTarget(rules, ua, "DE")).toBe("https://de.example.com");
    expect(pickTarget(rules, ua, "US")).toBe("https://apps.apple.com");
    expect(pickTarget(undefined, ua, "US")).toBeNull();
  });
  it("forwards query params without overriding the destination's", () => {
    expect(mergeQuery("https://x.com/?a=1", new URLSearchParams("a=2&b=3"))).toBe("https://x.com/?a=1&b=3");
    expect(mergeQuery("https://x.com/", new URLSearchParams())).toBe("https://x.com/");
  });
});

describe("csv", () => {
  it("round-trips quoted cells", () => {
    const csv = toCsv(["url", "tags"], [["https://a.com/?x=1,2", 'say "hi"']]);
    expect(parseCsv(csv)).toEqual([["url", "tags"], ["https://a.com/?x=1,2", 'say "hi"']]);
  });
  it("handles CRLF and blank lines", () => {
    expect(parseCsv("a,b\r\n\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
