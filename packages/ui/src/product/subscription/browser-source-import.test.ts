import { afterEach, describe, expect, it, vi } from "vitest";
import { importSourceInBrowser } from "./browser-source-import";

const content = "proxies:\n  - { name: node, type: trojan, server: node.example, port: 443, password: secret }";

describe("browser source import", () => {
  afterEach(() => vi.useRealTimers());

  it("fetches directly without cookies, referrers, or server-only headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(content));
    const result = await importSourceInBrowser({
      url: "https://source.example/sub", sourceUserAgent: "custom", sourceDohUrl: "https://resolver.example/dns-query",
    }, fetcher);
    expect(result.parseResult?.nodes).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("https://source.example/sub", expect.objectContaining({
      credentials: "omit", mode: "cors", referrerPolicy: "no-referrer",
    }));
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("User-Agent");
  });

  it("rejects placeholders rather than treating HTTP 200 as usable nodes", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(content.replace("node.example", "203.0.113.17")));
    await expect(importSourceInBrowser({ url: "https://source.example/sub" }, fetcher)).rejects.toThrow("占位 IP");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not fall back to a server when CORS or network access fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(importSourceInBrowser({ url: "https://source.example/sub" }, fetcher)).rejects.toThrow("跨域");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects unsafe schemes, URL credentials, empty responses and oversized content", async () => {
    const fetcher = vi.fn();
    for (const url of ["http://source.example/sub", "file:///secret", "https://user:password@source.example/sub"]) {
      await expect(importSourceInBrowser({ url }, fetcher)).rejects.toThrow("HTTPS");
    }
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(new Response("not a subscription"));
    await expect(importSourceInBrowser({ url: "https://source.example/sub" }, fetcher)).rejects.toThrow("未解析");
    fetcher.mockResolvedValueOnce(new Response("", { headers: { "Content-Length": String(11 * 1024 * 1024) } }));
    await expect(importSourceInBrowser({ url: "https://source.example/sub" }, fetcher)).rejects.toThrow("过大");
  });

  it("bounds the request and retains usable nodes when optional metadata is blocked", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(content)).mockRejectedValueOnce(new TypeError("CORS"));
    const result = await importSourceInBrowser({
      url: "https://source.example/sub", userinfoUrl: "https://source.example/info",
    }, fetcher);
    expect(result.parseResult?.nodes).toHaveLength(1);
    expect(fetcher.mock.calls[1][1].method).toBe("HEAD");
    vi.useFakeTimers();
    const stalled = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const pending = expect(importSourceInBrowser({ url: "https://source.example/sub" }, stalled)).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(25001);
    await pending;
  });
});
