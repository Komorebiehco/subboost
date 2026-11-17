import type { ClashConfig, ProxyGroup } from "../types/config";
import { canonicalizeProxy } from "./yaml";

function exactPattern(names: string[]): string {
  return `^(?:${names.map((name) => name
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/`/g, "\\x60")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")).join("|")})$`;
}

function orderedFilter(names: string[], special: string[], positions: Map<string, number>): string {
  const runs: string[][] = [];
  let previous = -1;
  for (const name of names) {
    const position = positions.get(name)!;
    if (!runs.length || position <= previous) runs.push([]);
    runs[runs.length - 1].push(name);
    previous = position;
  }
  // Mihomo sorts multiple filter segments globally. Keep explicit policies first.
  if (runs.length > 1 && special.length) runs.unshift(special);
  return runs.map(exactPattern).join("`");
}

export function withSharedNodeProvider(config: ClashConfig): ClashConfig {
  const nodes = config.proxies ?? [];
  if (!nodes.length) return config;
  const positions = new Map(nodes.map((node, index) => [node.name, index]));
  const existing = config["proxy-providers"] ?? {};
  const reservedNames = new Set([
    ...Object.keys(existing),
    ...positions.keys(),
    ...(config["proxy-groups"] ?? []).map((group) => group.name),
  ]);
  let poolName = "all_nodes";
  for (let suffix = 2; reservedNames.has(poolName); suffix += 1) poolName = `all_nodes_${suffix}`;

  let changed = false;
  const groups = (config["proxy-groups"] ?? []).map((group): ProxyGroup => {
    // Existing dynamic providers own their filters; preserve their membership.
    if (group.use?.length || group["include-all"] || group["include-all-proxies"] || group["include-all-providers"]) {
      return group;
    }
    const members = group.proxies ?? [];
    const selected = members.filter((name) => positions.has(name));
    if (!selected.length) return group;
    const special = members.filter((name) => !positions.has(name));
    const allInOrder = selected.length === nodes.length && selected.every((name, index) => nodes[index].name === name);
    const { proxies: _proxies, filter: _filter, ...rest } = group;
    changed = true;
    return {
      ...rest,
      ...(special.length ? { proxies: special } : {}),
      use: [poolName],
      ...(!allInOrder ? { filter: orderedFilter(selected, special, positions) } : {}),
    };
  });
  if (!changed) return config;
  return {
    ...config,
    "proxy-providers": {
      ...existing,
      [poolName]: {
        type: "inline",
        payload: nodes.map((node) => canonicalizeProxy(node as unknown as Record<string, unknown>)),
        "health-check": { enable: false },
      },
    },
    "proxy-groups": groups,
  };
}
