import type { ParsedNode } from "../types/node";
import type { DialerProxyGroup } from "../types/template-config";
import { getNodeSourceIds } from "./node-source-state";

export function orderNodesBySources(nodes: ParsedNode[], sources: unknown): ParsedNode[] {
  if (!Array.isArray(sources) || sources.length === 0 || nodes.length < 2) return nodes;
  const ranks = new Map<string, number>();
  for (const source of sources) {
    if (!source || typeof source.id !== "string") continue;
    const id = source.id.trim();
    if (id && !ranks.has(id)) ranks.set(id, ranks.size);
  }
  const rank = (node: ParsedNode) => Math.min(
    ranks.size,
    ...getNodeSourceIds(node).map((id) => ranks.get(id) ?? ranks.size)
  );
  // Stable sorting preserves manual ordering within each source.
  const ordered = nodes.map((node, index) => ({ node, index, rank: rank(node) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ node }) => node);
  return ordered.every((node, index) => node === nodes[index]) ? nodes : ordered;
}

export function orderNodeNamesByNodes(names: string[], nodes: ParsedNode[]): string[] {
  const ranks = new Map(nodes.map((node, index) => [node.name, index]));
  const ordered = names.filter((name) => ranks.has(name))
    .sort((a, b) => ranks.get(a)! - ranks.get(b)!);
  let index = 0;
  // Builtins and references to other groups keep their existing positions.
  const result = names.map((name) => ranks.has(name) ? ordered[index++] : name);
  return result.every((name, offset) => name === names[offset]) ? names : result;
}

export function orderDialerGroupsByNodes(
  groups: DialerProxyGroup[],
  nodes: ParsedNode[]
): DialerProxyGroup[] {
  const result = groups.map((group) => {
    if (!group || !Array.isArray(group.relayNodes) || !Array.isArray(group.targetNodes)) return group;
    const relayNodes = orderNodeNamesByNodes(group.relayNodes, nodes);
    const targetNodes = orderNodeNamesByNodes(group.targetNodes, nodes);
    return relayNodes === group.relayNodes && targetNodes === group.targetNodes
      ? group
      : { ...group, relayNodes, targetNodes };
  });
  return result.every((group, index) => group === groups[index]) ? groups : result;
}
