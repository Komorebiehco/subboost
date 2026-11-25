"use client";

import { AlertCircle, Server } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { AddSourceMenu } from "@subboost/ui/product/converter/source-controls";
import { SourceRow } from "@subboost/ui/product/converter/source-row";
import { useSubscriptionSourcesController } from "@subboost/ui/product/converter/use-subscription-sources-controller";
import { sourceTypeInfo } from "../constants";
import { SectionHeader } from "../section-header";
import { InputSourceEditorDialog } from "./input-source-editor-dialog";

export function InputSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const editor = useSubscriptionSourcesController({ mode: "advanced" });
  const { sources } = editor;

  return (
    <div>
      <SectionHeader
        icon={Server}
        title="节点导入"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          sources.length > 0 && (
            <Badge variant="outline" className="ml-auto border-blue-500/50 bg-blue-500/10 text-blue-300">
              {sources.length} 个导入源
            </Badge>
          )
        }
      />
      {isExpanded && (
        <div className="mt-2 space-y-2 pl-6">
          {sources.map((source, index) => (
            <SourceRow
              key={source.id}
              source={source}
              inputContent={editor.getInlineSourceContent(source)}
              typeInfo={sourceTypeInfo[source.type]}
              nodes={editor.nodesBySourceId.get(source.id)}
              position={index + 1}
              total={sources.length}
              compact
              updateSourceType={editor.updateSourceType}
              moveSource={editor.moveSource}
              openSourceEditor={editor.openSourceEditor}
              handleImportSource={editor.handleImportSource}
              removeSource={editor.removeSource}
              updateSource={editor.updateSource}
            />
          ))}
          {editor.error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="break-all">{editor.error}</span>
            </div>
          )}
          <AddSourceMenu open={editor.showAddMenu} onOpenChange={editor.setShowAddMenu} onAdd={editor.addSource} compact />
        </div>
      )}
      <InputSourceEditorDialog
        source={editor.expandedSource}
        previewName={editor.expandedSourcePreviewName}
        onClose={editor.closeExpandedSourceEditor}
        onUpdateContent={editor.updateSource}
        onUpdateMeta={editor.updateSourceMeta}
      />
    </div>
  );
}
