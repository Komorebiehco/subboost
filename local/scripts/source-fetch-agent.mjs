import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "../../node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const inputChunks = [];
for await (const chunk of process.stdin) inputChunks.push(chunk);
const raw = Buffer.concat(inputChunks).toString("utf8");
const config = JSON.parse(raw);
const endpoint = new URL(config.endpoint);
if (endpoint.protocol !== "https:" || !/^[a-f0-9]{64}$/.test(config.token)) {
  throw new Error("Invalid fetch agent configuration.");
}
const allowedHosts = new Set(config.allowedHosts || []);
const runtimeDir = config.runtimeDir;
if (typeof runtimeDir !== "string" || !path.isAbsolute(runtimeDir)) {
  throw new Error("An absolute runtime directory is required.");
}
const loader = await createServer({
  configFile: false,
  root,
  cacheDir: path.join(runtimeDir, "vite"),
  server: { middlewareMode: true, watch: null },
  resolve: {
    alias: {
      "@local": path.join(root, "local/src"),
      "@subboost/core": path.join(root, "packages/core/src"),
      "@subboost/server-core": path.join(root, "packages/server-core/src"),
    },
  },
  appType: "custom",
});
const { fetchTextDirect } = await loader.ssrLoadModule("/local/src/lib/source-import.ts");
const active = new Set();
let stopped = false;
let failures = 0;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });

async function send(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Agent API HTTP ${response.status}`);
  return response.json();
}

async function execute(job) {
  let result;
  try {
    const target = new URL(job.url);
    if (allowedHosts.size && !allowedHosts.has(target.hostname)) throw new Error("Host not permitted");
    if (job.expiresAt <= Date.now()) throw new Error("Job expired");
    result = await fetchTextDirect({
      url: target.href,
      userAgent: job.userAgent,
      purpose: job.purpose === "userinfo" ? "userinfo" : "content",
      timeoutMs: Math.min(15000, job.timeoutMs),
      maxBytes: Math.min(10 * 1024 * 1024, job.maxBytes),
    }, false, job.sourceDohUrl || "https://223.5.5.5/dns-query");
  } catch {
    result = { ok: false, error: "Direct fetch failed" };
  }
  try {
    await send({ action: "result", id: job.id, result });
    console.log(JSON.stringify({ at: new Date().toISOString(), event: "fetched", ok: result.ok }));
  } catch {
    console.log(JSON.stringify({ at: new Date().toISOString(), event: "result-not-accepted" }));
  }
}

console.log(JSON.stringify({ at: new Date().toISOString(), event: "started" }));
try {
  while (!stopped) {
    try {
      if (active.size < 2) {
        const { job } = await send({ action: "claim" });
        if (failures) console.log(JSON.stringify({ at: new Date().toISOString(), event: "reconnected" }));
        failures = 0;
        if (job) {
          const task = execute(job).finally(() => active.delete(task));
          active.add(task);
        }
      }
    } catch {
      if (failures++ === 0) console.log(JSON.stringify({ at: new Date().toISOString(), event: "connection-unavailable" }));
    }
    await delay(failures ? 10000 : 2000);
  }
  await Promise.allSettled(active);
} finally {
  await loader.close();
}
