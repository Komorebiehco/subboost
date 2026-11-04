import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSourceDohUrl, resolveSourceHostname } from "./source-doh";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));

function answer(address = "1.1.1.1") {
  return Buffer.from([
    0, 0, 0x81, 0x80, 0, 0, 0, 1, 0, 0, 0, 0,
    0, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4,
    ...address.split(".").map(Number),
  ]);
}

function respond(body = answer(), statusCode = 200, headers = { "content-type": "application/dns-message" }) {
  return (_options: unknown, callback: (response: unknown) => void) => {
    const request = new EventEmitter() as EventEmitter & { end: ReturnType<typeof vi.fn> };
    request.end = vi.fn(() => {
      const response = Object.assign(Readable.from([body]), { statusCode, headers });
      queueMicrotask(() => callback(response));
    });
    return request;
  };
}

describe("custom source DoH", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lookup.mockResolvedValue([{ address: "223.5.5.5" }]);
    mocks.request.mockImplementation(respond());
  });

  it("accepts the configured AliDNS IP endpoint and pins its connection", async () => {
    const signal = new AbortController().signal;
    await expect(resolveSourceHostname("source.example", " https://223.5.5.5/dns-query ", signal))
      .resolves.toEqual(["1.1.1.1"]);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      hostname: "223.5.5.5",
      path: "/dns-query",
      method: "POST",
      headers: { Host: "223.5.5.5", Accept: "application/dns-message", "Content-Type": "application/dns-message" },
      servername: undefined,
    }), expect.any(Function));
  });

  it("preserves resolver hostname for TLS and pins validated DNS results", async () => {
    await resolveSourceHostname("source.example", "https://dns.example/dns-query", new AbortController().signal);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      hostname: "223.5.5.5",
      servername: "dns.example",
      headers: expect.objectContaining({ Host: "dns.example" }),
    }), expect.any(Function));
  });

  it.each([
    "http://223.5.5.5/dns-query",
    "https://user:pass@223.5.5.5/dns-query",
    "https://223.5.5.5/dns-query#fragment",
    "https://localhost/dns-query",
    "https://localhost./dns-query",
    "https://router.local/dns-query",
    "https://127.0.0.1/dns-query",
    "https://[::1]/dns-query",
    "https://169.254.169.254/dns-query",
    "https://[::ffff:127.0.0.1]/dns-query",
    "not a URL",
  ])("rejects unsafe resolver URL %s before making requests", (url) => {
    expect(() => parseSourceDohUrl(url)).toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects resolvers with any private DNS answer", async () => {
    mocks.lookup.mockResolvedValue([{ address: "223.5.5.5" }, { address: "10.0.0.1" }]);
    await expect(resolveSourceHostname("source.example", "https://dns.example/query", new AbortController().signal))
      .rejects.toThrow("安全的公网地址");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("does not follow DoH redirects or accept oversized/HTML responses", async () => {
    for (const impl of [
      respond(Buffer.from("redirect"), 302),
      respond(Buffer.alloc(65536)),
      respond(Buffer.from("<html>error</html>"), 200, { "content-type": "text/html" }),
    ]) {
      mocks.request.mockImplementation(impl);
      await expect(resolveSourceHostname("source.example", "https://223.5.5.5/dns-query", new AbortController().signal))
        .rejects.toThrow("未回退到默认 DNS");
    }
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(6);
  });

  it("preserves a valid A answer even when the AAAA request fails", async () => {
    mocks.request.mockImplementationOnce(respond()).mockImplementation(() => { throw new Error("network"); });
    await expect(resolveSourceHostname("source.example", "https://223.5.5.5/dns-query", new AbortController().signal))
      .resolves.toEqual(["1.1.1.1"]);
  });

  it("does not start network traffic after cancellation", async () => {
    await expect(resolveSourceHostname("source.example", "https://223.5.5.5/dns-query", AbortSignal.abort()))
      .rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
