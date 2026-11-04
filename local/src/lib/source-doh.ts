import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { resolveHostnameByDoh, type DohTransportRequest } from "@subboost/server-core/subscription/doh-resolver";
import {
  isPrivateOrReservedIp,
  normalizeResolvedIpAddresses,
  shouldRecheckFakeIpDnsAnswers,
} from "@subboost/server-core/subscription/ssrf-ip";

const TIMEOUT_MS = 4000;
const MAX_DNS_BYTES = 65535;

export class SourceDohError extends Error {}

function publicHostname(raw: string): string {
  const hostname = raw.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || isPrivateOrReservedIp(hostname)) {
    throw new SourceDohError("DoH 地址必须是公网 HTTPS 地址");
  }
  return hostname;
}

export function parseSourceDohUrl(value: string): URL {
  let endpoint: URL;
  try {
    if (value.length > 2048) throw new Error();
    endpoint = new URL(value.trim());
  } catch {
    throw new SourceDohError("无效的 DoH URL");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) {
    throw new SourceDohError("DoH 仅支持无用户名、密码及片段的 HTTPS URL");
  }
  publicHostname(endpoint.hostname);
  return endpoint;
}

async function endpointAddresses(hostname: string, signal: AbortSignal): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const timer = new AbortController();
  try {
    const records = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      delay(TIMEOUT_MS, null, { signal: AbortSignal.any([signal, timer.signal]) }).then(() => {
        throw new SourceDohError("DoH 服务地址解析超时");
      }),
    ]);
    let addresses = normalizeResolvedIpAddresses(records.map((record) => record.address));
    if (shouldRecheckFakeIpDnsAnswers(addresses)) {
      addresses = await resolveHostnameByDoh(hostname, { timeoutMs: TIMEOUT_MS, signal });
    }
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(isPrivateOrReservedIp)) {
      throw new SourceDohError("DoH 服务未解析到安全的公网地址");
    }
    return addresses;
  } finally {
    timer.abort();
  }
}

function queryPinnedEndpoint(
  endpoint: URL,
  address: string,
  request: DohTransportRequest,
  signal: AbortSignal
): Promise<{ statusCode: number; body: Uint8Array }> {
  return new Promise((resolve, reject) => {
    // Pin the validated resolver IP while preserving HTTPS identity and Host.
    const req = httpsRequest({
      hostname: address,
      family: isIP(address) || undefined,
      port: endpoint.port || 443,
      path: endpoint.pathname + endpoint.search,
      method: "POST",
      headers: { ...request.headers, Host: endpoint.host },
      servername: isIP(publicHostname(endpoint.hostname)) ? undefined : endpoint.hostname,
      signal,
    }, async (response) => {
      try {
        const contentType = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (response.statusCode !== 200 || contentType !== "application/dns-message") {
          response.destroy();
          reject(new SourceDohError("DoH 服务未返回有效的 DNS 响应"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const raw of response) {
          const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          size += chunk.length;
          if (size > MAX_DNS_BYTES) throw new SourceDohError("DoH 响应过大");
          chunks.push(chunk);
        }
        resolve({ statusCode: 200, body: Buffer.concat(chunks, size) });
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    req.once("error", reject);
    req.end(request.body);
  });
}

export async function resolveSourceHostname(
  hostname: string,
  dohUrl: string,
  signal: AbortSignal
): Promise<string[]> {
  const endpoint = parseSourceDohUrl(dohUrl);
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS * 2)]);
  const addresses = await endpointAddresses(publicHostname(endpoint.hostname), boundedSignal);
  const result = await resolveHostnameByDoh(hostname, {
    endpoints: [endpoint.href],
    timeoutMs: TIMEOUT_MS,
    signal: boundedSignal,
    transport: async (request) => {
      for (const address of addresses) {
        boundedSignal.throwIfAborted();
        try {
          return await queryPinnedEndpoint(endpoint, address, request,
            AbortSignal.any([boundedSignal, AbortSignal.timeout(request.timeoutMs)]));
        } catch {
          boundedSignal.throwIfAborted();
        }
      }
      throw new SourceDohError("无法连接指定的 DoH 服务");
    },
  });
  if (!result.length) throw new SourceDohError("指定的 DoH 解析失败，未回退到默认 DNS");
  return result;
}
