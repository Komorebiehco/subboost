import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";

export const DEFAULT_PROXY_PROVIDER_USER_AGENT = "Clash.Meta/1.19.24";

/**
 * 从订阅的结构化配置里提取 proxy-providers（proxy-providers模式）。
 *
 * 注意：
 * - 仅对 sources 里标记 useProxyProviders=true 的 URL 源生效
 * - 不触发任何出站请求
 * - provider key 需是安全字符串（避免 YAML key 解析问题）
 */

export function buildProxyProvidersFromConfig(
  config: Record<string, unknown>,
  opts: { testUrl: string; testInterval: number }
): Record<string, unknown> | undefined {
  const rawSources = Array.isArray(config.sources) ? config.sources : [];
  if (rawSources.length === 0) return undefined;

  const out: Record<string, unknown> = {};
  let fallbackIndex = 0;

  for (const raw of rawSources) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.type !== "url") continue;
    if (item.useProxyProviders !== true) continue;

    const url =
      typeof item.content === "string"
        ? (tryNormalizeSubscriptionUrlInput(item.content) ?? item.content.trim())
        : "";
    if (!url) continue;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) continue;

    const rawId = typeof item.id === "string" ? item.id.trim() : "";
    const id = rawId || String(++fallbackIndex);
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const name = `url_${safeId}`;
    if (Object.prototype.hasOwnProperty.call(out, name)) continue;
    const proxyProviderUserAgent =
      typeof item.proxyProviderUserAgent === "string" && item.proxyProviderUserAgent.trim()
        ? item.proxyProviderUserAgent.trim()
        : DEFAULT_PROXY_PROVIDER_USER_AGENT;

    out[name] = {
      type: "http",
      url,
      header: {
        "User-Agent": [proxyProviderUserAgent],
      },
      interval: 3600,
      path: `./proxy_providers/${name}.yaml`,
      "health-check": {
        enable: true,
        url: opts.testUrl,
        interval: opts.testInterval,
      },
    };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

