import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorized: vi.fn(), claim: vi.fn(), complete: vi.fn(), status: vi.fn(),
}));
vi.mock("@local/lib/api-auth", () => ({ withCurrentAdmin: (fn: () => unknown) => fn() }));
vi.mock("@local/lib/source-fetch-agent", () => ({
  isSourceFetchAgentAuthorized: mocks.authorized, claimSourceFetchJob: mocks.claim,
  completeSourceFetchJob: mocks.complete, getSourceFetchAgentStatus: mocks.status,
}));
import { GET, POST } from "./route";
const request = (body: unknown) => new Request("https://app.example/api/source-fetch-agent", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer token" }, body: JSON.stringify(body),
});
describe("source fetch agent API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authorized.mockReturnValue(true); });
  it("rejects unauthenticated workers before accepting any work", async () => {
    mocks.authorized.mockReturnValue(false);
    expect((await POST(request({ action: "claim" }))).status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("returns only connection status to the admin", async () => {
    mocks.status.mockReturnValue({ connected: true, lastSeenAt: "now" });
    expect(await (await GET()).json()).toEqual({ connected: true, lastSeenAt: "now" });
  });
  it("claims a job and rejects invalid actions and stale results", async () => {
    mocks.claim.mockReturnValue({ id: "job" });
    expect(await (await POST(request({ action: "claim" }))).json()).toEqual({ job: { id: "job" } });
    expect((await POST(request({ action: "other" }))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
    mocks.complete.mockReturnValue(false);
    expect((await POST(request({ action: "result", id: "job", result: {} }))).status).toBe(409);
    mocks.complete.mockReturnValue(true);
    expect((await POST(request({ action: "result", id: "job", result: { ok: true } }))).status).toBe(200);
  });
});
