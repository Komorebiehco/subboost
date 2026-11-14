"use client";

import * as React from "react";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { HelpPopover } from "@subboost/ui/components/ui/popover";
import { useProductApiAdapter } from "@subboost/ui/product/api-adapter";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";

export function SourceFetchModeField({ source, onChange }: {
  source: SubscriptionSource;
  onChange: (mode: SubscriptionSource["sourceFetchMode"]) => void;
}) {
  const { sourceImport } = useProductApiAdapter();
  const [connected, setConnected] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (source.sourceFetchMode !== "agent" || !sourceImport?.getAgentStatus) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await sourceImport.getAgentStatus!();
        if (!cancelled) setConnected(status.connected);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [source.sourceFetchMode, sourceImport]);

  return (
    <FormField label={
      <span className="inline-flex items-center gap-2">
        订阅拉取出口
        <HelpPopover label="订阅拉取出口说明" side="bottom" align="start">
          <p className="text-xs leading-relaxed">
            国内拉取助手使用运行助手的电脑网络，支持来源 DoH、User-Agent 和后台刷新，电脑及助手需保持在线。
            浏览器当前网络仅支持允许跨域读取的 HTTPS 订阅，使用浏览器自身的 DNS 和 User-Agent，
            后台刷新保留已有节点。两种方式都需要上游认可的国内出口，代理和 VPN 会影响实际出口。
          </p>
        </HelpPopover>
      </span>
    } description={source.sourceFetchMode === "agent" ? (
      <span role="status" className={connected ? "text-emerald-400" : "text-amber-300"}>
        {connected === null ? "正在检查助手连接" : connected ? "助手已连接" : "助手未连接，已有节点保留"}
      </span>
    ) : undefined}>
      <select
        className="h-10 w-full rounded-lg border border-white/10 bg-background px-3 text-xs"
        aria-label="订阅拉取出口"
        value={source.sourceFetchMode ?? "server"}
        onChange={(event) => onChange(event.target.value === "server" ? undefined : event.target.value as "browser" | "agent")}
      >
        <option value="server">服务端</option>
        <option value="agent">国内拉取助手</option>
        <option value="browser">浏览器当前网络</option>
      </select>
    </FormField>
  );
}
