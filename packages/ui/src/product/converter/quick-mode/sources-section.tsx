import { AlertCircle } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { AddSourceMenu } from "@subboost/ui/product/converter/source-controls";
import { SourceEditorDialog } from "@subboost/ui/product/converter/source-editor-dialog";
import { SourceRow } from "@subboost/ui/product/converter/source-row";
import { useSubscriptionSourcesController } from "@subboost/ui/product/converter/use-subscription-sources-controller";
import { sourceTypeInfo } from "./constants";

export function SourcesSection() {
  const editor = useSubscriptionSourcesController({ mode: "quick" });
  const { sources } = editor;

  return (
    <>
      <div className="flex flex-col gap-2">
        {sources.map((source, index) => (
          <SourceRow
            key={source.id}
            source={source}
            inputContent={editor.getInlineSourceContent(source)}
            typeInfo={sourceTypeInfo[source.type]}
            nodes={editor.nodesBySourceId.get(source.id)}
            position={index + 1}
            total={sources.length}
            updateSourceType={editor.updateSourceType}
            moveSource={editor.moveSource}
            openSourceEditor={editor.openSourceEditor}
            handleImportSource={editor.handleImportSource}
            removeSource={editor.removeSource}
            updateSource={editor.updateSource}
          />
        ))}
        <div className="flex-shrink-0">
          <AddSourceMenu open={editor.showAddMenu} onOpenChange={editor.setShowAddMenu} onAdd={editor.addSource} />
        </div>
        {editor.error && (
          <div className="flex items-center gap-2 text-xs text-red-400 flex-shrink-0">
            <AlertCircle className="h-3.5 w-3.5" />
            {editor.error}
          </div>
        )}
        {editor.nodeCount > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="success">{editor.nodeCount} 个节点已解析</Badge>
          </div>
        )}
      </div>
      <SourceEditorDialog
        source={editor.expandedSource}
        previewName={editor.expandedSourcePreviewName}
        onClose={editor.closeExpandedSourceEditor}
        onUpdateContent={editor.updateSource}
        onUpdateMeta={editor.updateSourceMeta}
      />
    </>
  );
}
