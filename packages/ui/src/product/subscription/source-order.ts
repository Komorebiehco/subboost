import type { SubscriptionSource } from "@subboost/ui/store/config-store";

export type SourceOrderDirection = "up" | "down";

export function moveSubscriptionSource(
  sources: SubscriptionSource[],
  sourceId: string,
  direction: SourceOrderDirection | number
): SubscriptionSource[] {
  const currentIndex = sources.findIndex((source) => source.id === sourceId);
  if (currentIndex < 0) return sources;

  if (typeof direction === "number" && !Number.isInteger(direction)) return sources;
  const targetIndex = typeof direction === "number"
    ? Math.max(0, Math.min(sources.length - 1, direction - 1))
    : direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= sources.length || targetIndex === currentIndex) return sources;

  const nextSources = [...sources];
  const [source] = nextSources.splice(currentIndex, 1);
  nextSources.splice(targetIndex, 0, source);
  return nextSources;
}
