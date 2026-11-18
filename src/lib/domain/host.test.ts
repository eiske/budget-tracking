import { describe, expect, it } from "vitest";
import { hostnameOf, isAllowedHost, isSameOrigin, parseAllowedHosts } from "./host";

describe("hostnameOf", () => {
  it.each([
    ["localhost:3000", "localhost"],
    ["127.0.0.1:3100", "127.0.0.1"],
    ["LOCALHOST", "localhost"],
    ["[::1]:3000", "::1"],
    ["[::1]", "::1"],
    ["example.com", "example.com"],
  ])("%s -> %s", (header, name) => expect(hostnameOf(header)).toBe(name));

  it.each([null, undefined, "", "   ", ":3000", "[::1", "[]:80"])("%j -> null", (h) => expect(hostnameOf(h)).toBeNull());
});

describe("isAllowedHost", () => {
  it("accepts the loopback names with or without a port", () => {
    for (const h of ["localhost", "localhost:3000", "127.0.0.1:3100", "[::1]:3000", "LocalHost:80"]) {
      expect(isAllowedHost(h)).toBe(true);
    }
  });

  it("rejects anything else, including DNS-rebinding style lookalikes", () => {
    for (const h of [
      "evil.com", "evil.com:3000", "127.0.0.1.evil.com", "localhost.evil.com", "evil.com.localhost.attacker.io",
      "localhost@evil.com", "evil.com:80@localhost", "192.168.1.10:3000", "0.0.0.0:3000", "[::2]:3000",
      "", null, undefined,
    ]) {
      expect(isAllowedHost(h as string | null | undefined)).toBe(false);
    }
  });

  it("honors explicitly allowed extra hosts, case-insensitively and only by exact name", () => {
    expect(isAllowedHost("my-pc.local:3000", ["my-pc.local"])).toBe(true);
    expect(isAllowedHost("MY-PC.local", ["my-pc.LOCAL"])).toBe(true);
    expect(isAllowedHost("other.local", ["my-pc.local"])).toBe(false);
    expect(isAllowedHost("my-pc.local.evil.com", ["my-pc.local"])).toBe(false);
  });
});

describe("parseAllowedHosts", () => {
  it("splits, trims, lowercases and drops empties", () => {
    expect(parseAllowedHosts(" A.local, b.LOCAL ,, ")).toEqual(["a.local", "b.local"]);
    expect(parseAllowedHosts(undefined)).toEqual([]);
    expect(parseAllowedHosts("")).toEqual([]);
  });
});

describe("isSameOrigin", () => {
  it("accepts a missing Origin (non-browser client) and a matching one", () => {
    expect(isSameOrigin(null, "127.0.0.1:3000")).toBe(true);
    expect(isSameOrigin("http://127.0.0.1:3000", "127.0.0.1:3000")).toBe(true);
    expect(isSameOrigin("http://LOCALHOST:3000", "localhost:3000")).toBe(true);
  });

  it("rejects a different host or port, and garbage", () => {
    expect(isSameOrigin("https://evil.com", "127.0.0.1:3000")).toBe(false);
    expect(isSameOrigin("http://127.0.0.1:4000", "127.0.0.1:3000")).toBe(false);
    expect(isSameOrigin("null", "127.0.0.1:3000")).toBe(false);
    expect(isSameOrigin("not a url", "127.0.0.1:3000")).toBe(false);
  });
});
