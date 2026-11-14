import { withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import {
  claimSourceFetchJob,
  completeSourceFetchJob,
  getSourceFetchAgentStatus,
  isSourceFetchAgentAuthorized,
} from "@local/lib/source-fetch-agent";

export const runtime = "nodejs";

export async function GET() {
  return withCurrentAdmin(() => json(getSourceFetchAgentStatus()));
}

export async function POST(request: Request) {
  if (!isSourceFetchAgentAuthorized(request.headers.get("authorization"))) {
    return apiError("Authentication required.", "UNAUTHORIZED", 401);
  }
  const body = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.subscription);
  if (!body.ok) return jsonBodyError(body);
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
    return apiError("Invalid request.", "BAD_REQUEST", 400);
  }
  const value = body.value as Record<string, unknown>;
  if (value.action === "claim") return json({ job: claimSourceFetchJob() });
  if (value.action === "result") {
    return completeSourceFetchJob(value.id, value.result)
      ? json({ accepted: true })
      : apiError("Job expired or result invalid.", "CONFLICT", 409);
  }
  return apiError("Invalid action.", "BAD_REQUEST", 400);
}
