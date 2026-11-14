import { parseSubscription } from "@subboost/core/parser";
import {
  hasClientUpdatePlaceholderError,
  hasDocumentationPlaceholderNodes,
  looksLikeClientUpdatePlaceholderNodes,
} from "@subboost/core/parser/placeholder";
import {
  createSubscriptionImportErrorInfo,
  isSubscriptionImportError,
  SubscriptionImportError,
} from "@subboost/core/subscription/import-error";
import type { SourceImportRequest, SourceImportResponse } from "@subboost/ui/product/api-adapter";

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 25000;

function importError(message: string, category: "format" | "network" | "parse" = "network") {
  return new SubscriptionImportError(createSubscriptionImportErrorInfo({ category, message }));
}

function validateUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw importError("无效的订阅 URL", "format");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw importError("浏览器直连仅支持不含用户名和密码的 HTTPS 订阅 URL", "format");
  }
  return url.href;
}

async function readLimitedContent(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel();
    throw importError("订阅响应过大");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw importError("订阅响应过大");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

export async function importSourceInBrowser(
  request: SourceImportRequest,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<SourceImportResponse> {
  const url = validateUrl(request.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: { Accept: "text/plain, application/yaml, */*;q=0.8" },
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw importError(`浏览器直连拉取失败：HTTP ${response.status}`);
    }
    const content = await readLimitedContent(response);
    const parseResult = parseSubscription(content);
    if (hasDocumentationPlaceholderNodes(parseResult.nodes)) {
      throw importError("当前浏览器出口仍被上游返回占位 IP。请使用可用的国内网络，并将订阅域名设为直连后重试。", "parse");
    }
    if (looksLikeClientUpdatePlaceholderNodes(parseResult.nodes) ||
        hasClientUpdatePlaceholderError(parseResult.errors)) {
      throw importError("上游不接受浏览器请求，返回了客户端更新提示，已保留原有节点。", "parse");
    }
    if (!parseResult.nodes.length) {
      throw importError("浏览器已取得响应，但未解析到有效节点。", "parse");
    }
    const headers = Object.fromEntries(response.headers.entries());
    if (request.userinfoUrl) {
      // Metadata failure must not discard a valid node response.
      try {
        const info = await fetchImpl(validateUrl(request.userinfoUrl), {
          method: "HEAD",
          mode: "cors",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          signal: controller.signal,
        });
        const userinfo = info.ok ? info.headers.get("subscription-userinfo") : null;
        if (userinfo) headers["subscription-userinfo"] = userinfo;
      } catch {
        // Cross-origin response headers are exposed only when the upstream permits it.
      }
    }
    return { content, headers, parseResult };
  } catch (error) {
    if (isSubscriptionImportError(error)) throw error;
    throw importError(controller.signal.aborted
      ? "浏览器直连拉取超时，已保留原有节点。请检查当前网络。"
      : "浏览器直连失败，已保留原有节点。请检查当前网络，以及订阅是否允许跨域读取。");
  } finally {
    clearTimeout(timer);
  }
}
