import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import type { ClashConfig, ProxyGroup } from "../types/config";
import type { ParsedNode } from "../types/node";
import { generateClashYaml } from "./index";
import { withSharedNodeProvider } from "./shared-node-provider";
import { configToYaml } from "./yaml";
import { buildGenerateOptionsFromConfig } from "../subscription/config-utils";

const node = (name: string): ParsedNode => ({
  name, type: "ss", server: "example.com", port: 443,
  cipher: "aes-128-gcm", password: "test", _sourceIds: ["source-1"],
} as ParsedNode);

function members(group: ProxyGroup, names: string[]): string[] {
  const explicit = group.proxies ?? [];
  if (!group.use?.length) return explicit;
  if (!group.filter) return [...explicit, ...names];
  const filters = group.filter.split("`").map((filter) => new RegExp(filter));
  const selected = [...new Set(filters.flatMap((filter) => names.filter((name) => filter.test(name))))];
  if (filters.length === 1) return [...explicit, ...selected];
  const all = [...explicit, ...selected];
  return [...new Set([...filters.flatMap((filter) => all.filter((name) => filter.test(name))), ...all])];
}

describe("shared inline node provider", () => {
  it("preserves nodes and non-group settings while replacing repeated group nodes", () => {
    const original: ClashConfig = {
      proxies: [node("HK [A]+"), { ...node("JP"), "dialer-proxy": "Relay" }],
      "proxy-groups": [
        { name: "Auto", type: "url-test", url: "https://example.com/204", interval: 300, tolerance: 50, proxies: ["HK [A]+", "JP"] },
        { name: "Relay", type: "select", proxies: ["HK [A]+", "DIRECT"] },
        { name: "Block", type: "select", proxies: ["REJECT", "DIRECT"] },
      ],
      rules: ["MATCH,Auto"], dns: { enable: true }, tun: { enable: true },
    };
    const optimized = withSharedNodeProvider(original);
    expect(optimized.proxies).toBe(original.proxies);
    expect(optimized.rules).toBe(original.rules);
    expect(optimized.dns).toBe(original.dns);
    expect(optimized.tun).toBe(original.tun);
    const groups = optimized["proxy-groups"]!;
    expect(groups.map((g) => g.name)).toEqual(["Auto", "Relay", "Block"]);
    expect(groups[0]).toEqual({ name: "Auto", type: "url-test", url: "https://example.com/204", interval: 300, tolerance: 50, use: ["all_nodes"] });
    expect(members(groups[1], ["HK [A]+", "HK AAAAA", "JP"])).toEqual(["DIRECT", "HK [A]+"]);
    expect(groups[2]).toBe(original["proxy-groups"]![2]);
    const serialized = yaml.load(configToYaml(optimized)) as ClashConfig;
    expect(serialized["proxy-providers"]).toEqual({ all_nodes: {
      type: "inline", payload: serialized.proxies, "health-check": { enable: false },
    } });
    expect(JSON.stringify(serialized["proxy-providers"])).not.toContain("_sourceIds");
  });

  it("retains selected node order and leading policies with multi-segment filters", () => {
    const names = ["A`literal", "B", "C", "D"];
    const config = withSharedNodeProvider({ proxies: names.map(node), "proxy-groups": [
      { name: "Ordered", type: "fallback", proxies: ["C", "DIRECT", "A`literal", "B", "REJECT"] },
    ] });
    expect(members(config["proxy-groups"]![0], names)).toEqual(["DIRECT", "REJECT", "C", "A`literal", "B"]);
    expect(config["proxy-groups"]![0].filter).toContain("\\x60");
  });

  it("does not overwrite existing providers or alter dynamic provider membership", () => {
    const remote = { type: "http", url: "https://example.com/sub" };
    const dynamic: ProxyGroup = { name: "Dynamic", type: "select", proxies: ["A"], use: ["all_nodes"], filter: "HK" };
    const config = withSharedNodeProvider({ proxies: [node("A")], "proxy-providers": { all_nodes: remote }, "proxy-groups": [
      dynamic, { name: "Local", type: "select", proxies: ["A"] },
    ] });
    expect(config["proxy-providers"]!.all_nodes).toBe(remote);
    expect(config["proxy-groups"]![0]).toBe(dynamic);
    expect(config["proxy-groups"]![1].use).toEqual(["all_nodes_2"]);
  });

  it("leaves manual-only and empty configs unchanged", () => {
    const config: ClashConfig = { proxies: [node("A")], "proxy-groups": [{ name: "Block", type: "select", proxies: ["REJECT", "DIRECT"] }] };
    expect(withSharedNodeProvider(config)).toBe(config);
    const empty: ClashConfig = { proxies: [] };
    expect(withSharedNodeProvider(empty)).toBe(empty);
  });

  it("is opt-in through saved config and does not change legacy YAML", () => {
    const raw = { dnsYaml: "", enabledGroups: ["select", "auto"] };
    const options = { nodes: [node("A"), node("B")] };
    const original = generateClashYaml(buildGenerateOptionsFromConfig(raw, options));
    expect(generateClashYaml(buildGenerateOptionsFromConfig({ ...raw, sharedNodeProvider: false }, options))).toBe(original);
    expect(generateClashYaml(buildGenerateOptionsFromConfig({ ...raw, sharedNodeProvider: "true" }, options))).toBe(original);
    const optimized = yaml.load(generateClashYaml(buildGenerateOptionsFromConfig({ ...raw, sharedNodeProvider: true }, options))) as ClashConfig;
    expect(optimized["proxy-providers"]).toHaveProperty("all_nodes");
    expect(optimized.proxies).toEqual((yaml.load(original) as ClashConfig).proxies);
  });
});
