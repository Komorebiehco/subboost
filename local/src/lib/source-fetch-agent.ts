import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SourceImportTransportRequest, SourceImportTransportResult } from "@subboost/server-core/subscription/source-import";
import { requireEnv } from "./env";

const HEARTBEAT_TTL_MS = 20000;
const MAX_PENDING = 8;
const MAX_CONTENT_BYTES = 10 * 1024 * 1024;
const RESPONSE_HEADERS = ["subscription-userinfo", "profile-web-page-url", "profile-title", "plan-name", "content-type"];

export type SourceFetchJob = SourceImportTransportRequest & {
  id: string;
  sourceDohUrl?: string;
  expiresAt: number;
};

type PendingJob = {
  job: SourceFetchJob;
  claimed: boolean;
  finish: (result: SourceImportTransportResult) => void;
};

type AgentState = { lastSeenAt: number; jobs: Map<string, PendingJob> };
const globalAgent = globalThis as typeof globalThis & { subboostSourceFetchAgent?: AgentState };
const state = globalAgent.subboostSourceFetchAgent ??= { lastSeenAt: 0, jobs: new Map() };

export function sourceFetchAgentToken(): string {
  return createHmac("sha256", requireEnv("ENCRYPTION_KEY"))
    .update("subboost/source-fetch-agent/v1")
    .digest("hex");
}

export function isSourceFetchAgentAuthorized(authorization: string | null): boolean {
  const token = authorization?.replace(/^Bearer /, "") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(sourceFetchAgentToken()));
}

export function getSourceFetchAgentStatus() {
  return {
    connected: state.lastSeenAt > 0 && Date.now() - state.lastSeenAt < HEARTBEAT_TTL_MS,
    lastSeenAt: state.lastSeenAt ? new Date(state.lastSeenAt).toISOString() : null,
  };
}

export function claimSourceFetchJob(): SourceFetchJob | null {
  state.lastSeenAt = Date.now();
  for (const pending of state.jobs.values()) {
    if (pending.claimed || pending.job.expiresAt <= Date.now()) continue;
    pending.claimed = true;
    return pending.job;
  }
  return null;
}

export function completeSourceFetchJob(id: unknown, result: unknown): boolean {
  if (typeof id !== "string" || !result || typeof result !== "object") return false;
  const pending = state.jobs.get(id);
  if (!pending?.claimed || pending.job.expiresAt <= Date.now()) return false;
  const raw = result as Record<string, unknown>;
  if (typeof raw.ok !== "boolean") return false;
  if (!raw.ok) {
    pending.finish({ ok: false, error: "国内拉取助手访问上游失败，请检查直连网络和 DoH。" });
    return true;
  }
  if (typeof raw.content !== "string" || Buffer.byteLength(raw.content) > Math.min(pending.job.maxBytes, MAX_CONTENT_BYTES)) {
    pending.finish({ ok: false, error: "国内拉取助手返回的内容无效或过大。" });
    return true;
  }
  const headers: Record<string, string> = {};
  if (raw.headers && typeof raw.headers === "object") {
    for (const key of RESPONSE_HEADERS) {
      const value = (raw.headers as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length <= 8192) headers[key] = value;
    }
  }
  pending.finish({ ok: true, content: raw.content, headers, responseStatus: 200 });
  return true;
}

export function fetchWithSourceAgent(
  request: SourceImportTransportRequest,
  sourceDohUrl?: string
): Promise<SourceImportTransportResult> {
  if (!getSourceFetchAgentStatus().connected) {
    return Promise.resolve({ ok: false, error: "国内拉取助手未连接，已保留原有节点。请启动国内网络中的拉取助手。" });
  }
  if (state.jobs.size >= MAX_PENDING) {
    return Promise.resolve({ ok: false, error: "国内拉取助手繁忙，请稍后重试。" });
  }
  return new Promise((resolve) => {
    const timeoutMs = Math.min(Math.max(request.timeoutMs, 1000), 30000);
    const job: SourceFetchJob = {
      ...request,
      maxBytes: Math.min(request.maxBytes, MAX_CONTENT_BYTES),
      timeoutMs,
      id: randomUUID(),
      sourceDohUrl,
      expiresAt: Date.now() + timeoutMs + 5000,
    };
    const timer = setTimeout(() => finish({ ok: false, error: "国内拉取助手响应超时，已保留原有节点。" }), timeoutMs + 5000);
    function finish(result: SourceImportTransportResult) {
      clearTimeout(timer);
      state.jobs.delete(job.id);
      resolve(result);
    }
    state.jobs.set(job.id, { job, claimed: false, finish });
  });
}
