import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimSourceFetchJob, completeSourceFetchJob, fetchWithSourceAgent,
  getSourceFetchAgentStatus, isSourceFetchAgentAuthorized, sourceFetchAgentToken,
} from "./source-fetch-agent";

const request = { url: "https://source.example/sub", userAgent: "Clash.Meta", purpose: "content" as const, timeoutMs: 1000, maxBytes: 1024 };

describe("source fetch agent queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
    vi.stubEnv("ENCRYPTION_KEY", "test-only-source-agent-key");
  });
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("authenticates a dedicated token without exposing the encryption key", () => {
    expect(sourceFetchAgentToken()).toMatch(/^[a-f0-9]{64}$/);
    expect(isSourceFetchAgentAuthorized("Bearer " + sourceFetchAgentToken())).toBe(true);
    expect(isSourceFetchAgentAuthorized("Bearer " + "0".repeat(64))).toBe(false);
    expect(isSourceFetchAgentAuthorized(null)).toBe(false);
    expect(isSourceFetchAgentAuthorized("test-only-source-agent-key")).toBe(false);
  });

  it("fails quickly when offline and expires a stale heartbeat", async () => {
    vi.advanceTimersByTime(30000);
    expect(getSourceFetchAgentStatus().connected).toBe(false);
    await expect(fetchWithSourceAgent(request)).resolves.toMatchObject({ ok: false, error: expect.stringContaining("未连接") });
    claimSourceFetchJob();
    expect(getSourceFetchAgentStatus().connected).toBe(true);
    vi.advanceTimersByTime(21000);
    expect(getSourceFetchAgentStatus().connected).toBe(false);
  });

  it("claims once and only accepts matching, bounded results and whitelisted headers", async () => {
    claimSourceFetchJob();
    const pending = fetchWithSourceAgent(request, "https://223.5.5.5/dns-query");
    expect(completeSourceFetchJob("unknown", { ok: true, content: "bad" })).toBe(false);
    const job = claimSourceFetchJob()!;
    expect(job.sourceDohUrl).toBe("https://223.5.5.5/dns-query");
    expect(claimSourceFetchJob()).toBeNull();
    expect(completeSourceFetchJob(job.id, { ok: true, content: "payload", headers: {
      "subscription-userinfo": "upload=1", "set-cookie": "secret",
    } })).toBe(true);
    await expect(pending).resolves.toMatchObject({ ok: true, content: "payload", headers: { "subscription-userinfo": "upload=1" } });
    expect(completeSourceFetchJob(job.id, { ok: true, content: "again" })).toBe(false);
  });

  it("does not return oversized or raw agent error details", async () => {
    claimSourceFetchJob();
    const pending = fetchWithSourceAgent(request);
    const job = claimSourceFetchJob()!;
    completeSourceFetchJob(job.id, { ok: true, content: "x".repeat(1025) });
    await expect(pending).resolves.toMatchObject({ ok: false });
    const failed = fetchWithSourceAgent(request);
    const next = claimSourceFetchJob()!;
    completeSourceFetchJob(next.id, { ok: false, error: "https://private.example/token-secret" });
    const result = await failed;
    expect(result.error).not.toContain("token-secret");
  });

  it("releases timed-out jobs and bounds queue size", async () => {
    claimSourceFetchJob();
    const tasks = Array.from({ length: 8 }, () => fetchWithSourceAgent(request));
    await expect(fetchWithSourceAgent(request)).resolves.toMatchObject({ ok: false, error: expect.stringContaining("繁忙") });
    const job = claimSourceFetchJob()!;
    await vi.advanceTimersByTimeAsync(6001);
    const results = await Promise.all(tasks);
    expect(results.every(result => !result.ok)).toBe(true);
    expect(completeSourceFetchJob(job.id, { ok: true, content: "late" })).toBe(false);
    expect(claimSourceFetchJob()).toBeNull();
  });
});
