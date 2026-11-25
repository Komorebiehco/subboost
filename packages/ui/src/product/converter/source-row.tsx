"use client";

import { memo } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, Maximize2, X } from "lucide-react";
import type { ParsedNode } from "@subboost/core/types/node";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input } from "@subboost/ui/components/ui/input";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { cn } from "@subboost/ui/lib/utils";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { SourceStatusPopover, SourceTypeChoices } from "./source-controls";
import { buildSourceDisplayLabel } from "./source-display-label";
import { SourceOrderInput } from "./source-order-input";
import type { SourceTypeInfo } from "./source-type-info";
import { SubscriptionImportErrorBadge } from "./subscription-import-error";
import type { useSubscriptionSourcesController } from "./use-subscription-sources-controller";

type RowActions = Pick<ReturnType<typeof useSubscriptionSourcesController>,
  "updateSourceType" | "moveSource" | "openSourceEditor" | "handleImportSource" | "removeSource" | "updateSource">;

type Props = RowActions & {
  source: SubscriptionSource;
  inputContent?: string;
  typeInfo: SourceTypeInfo;
  nodes?: ParsedNode[];
  position: number;
  total: number;
  compact?: boolean;
};

const EMPTY_NODES: ParsedNode[] = [];
const arrowClass = "flex h-3.5 w-4 items-center justify-center text-white/30 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30";

export const SourceRow = memo(function SourceRow({
  source, inputContent = source.content, typeInfo, nodes = EMPTY_NODES, position, total, compact = false,
  updateSourceType, moveSource, openSourceEditor, handleImportSource, removeSource, updateSource,
}: Props) {
  const label = buildSourceDisplayLabel({ typeLabel: typeInfo.label, tag: source.tag, order: position, total });
  const hasContent = Boolean(source.content.trim());
  const importLabel = source.parsing ? "导入中" : source.parsed ? "重新导入" : "导入此源";
  const contentProps = {
    value: inputContent, placeholder: typeInfo.placeholder, spellCheck: false, autoCapitalize: "none",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateSource(source.id, event.target.value),
  };
  return (
    <div className={compact ? "space-y-1" : "flex flex-col gap-1.5 flex-shrink-0"}>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SourceTypeChoices value={source.type} compact={compact} onChange={(type) => updateSourceType(source.id, type)} />
          <span className="min-w-0 break-words text-xs text-white/50">{label}</span>
          <SourceStatusPopover source={source} nodes={nodes} />
          {(source.errorInfo || source.error) && (
            <SubscriptionImportErrorBadge errorInfo={source.errorInfo} errorMessage={source.error} />
          )}
        </div>
        <div className={cn("ml-auto flex shrink-0 items-center", compact ? "gap-0.5" : "gap-1")}>
          <SourceOrderInput position={position} total={total} onMove={(next) => moveSource(source.id, next)} />
          <div className="flex flex-col">
            <IconButton label="上移" variant="ghost" onClick={() => moveSource(source.id, "up")} disabled={position === 1} className={arrowClass}>
              <ChevronUp className="h-2.5 w-2.5" aria-hidden="true" />
            </IconButton>
            <IconButton label="下移" variant="ghost" onClick={() => moveSource(source.id, "down")} disabled={position === total} className={arrowClass}>
              <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
            </IconButton>
          </div>
          <IconButton label="高级编辑" variant="ghost" onClick={() => openSourceEditor(source.id)}
            className={cn("h-6 w-6 rounded p-1 text-white/30 hover:bg-white/5", compact ? "hover:text-white/50" : "hover:text-white/60")}>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton label={importLabel} title={source.parsing ? "导入中..." : importLabel} variant="ghost"
            onClick={() => void handleImportSource(source.id)} disabled={!hasContent || source.parsing}
            className={cn("h-6 w-6 rounded p-1 transition-colors disabled:opacity-100", source.parsing
              ? "text-indigo-400" : source.parsed ? "text-green-400 hover:text-green-300"
                : hasContent ? "text-white/50 hover:text-indigo-400 hover:bg-indigo-500/10" : "text-white/50 cursor-not-allowed")}>
            {source.parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          </IconButton>
          {total > 1 && (
            <IconButton label="删除导入源" variant="ghost" onClick={() => removeSource(source.id)}
              className="h-6 w-6 rounded p-1 text-white/50 transition-colors hover:text-red-400">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </div>
      {source.type === "url" ? (
        <Input {...contentProps} className={compact ? "text-xs h-8" : "text-xs h-9"} />
      ) : (
        <Textarea {...contentProps} className={cn("text-xs resize-none", compact ? "min-h-[60px]"
          : total === 1 ? "flex-1 min-h-[100px]" : "min-h-[140px] md:min-h-[180px] xl:min-h-[80px]")} />
      )}
    </div>
  );
});
