import { describe, expect, it } from "vitest";
import type { ParsedNode } from "../types/node";
import { orderDialerGroupsByNodes, orderNodesBySources } from "./node-source-order";

const node = (name: string, ids: string[] = []): ParsedNode => ({
  name, type: "trojan", server: "example.com", port: 443, password: "secret", _sourceIds: ids,
} as unknown as ParsedNode);

describe("source node ordering", () => {
  it("orders by earliest source while preserving within-source order and unowned nodes", () => {
    const nodes = [
      node("B2", ["b"]), node("Manual"), node("A2", ["a"]),
      node("Shared", ["b", "a"]), node("B1", ["b"]), node("A1", ["a"]),
      node("Unknown", ["missing"]),
    ];
    const ordered = orderNodesBySources(nodes, [{ id: "a" }, { id: "b" }]);
    expect(ordered.map((item) => item.name)).toEqual([
      "A2", "Shared", "A1", "B2", "B1", "Manual", "Unknown",
    ]);
    expect(new Set(ordered)).toEqual(new Set(nodes));
    expect(orderNodesBySources(ordered, [{ id: "a" }, { id: "b" }])).toBe(ordered);
    expect(orderNodesBySources(nodes, undefined)).toBe(nodes);
  });

  it("orders selected members without moving builtins or group references", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const groups = [{
      id: "relay", name: "Relay", type: "select" as const,
      relayNodes: ["C", "DIRECT", "Other group", "A", "B"],
      targetNodes: ["C", "B"],
    }];
    const ordered = orderDialerGroupsByNodes(groups, nodes);
    expect(ordered[0]).toMatchObject({
      relayNodes: ["A", "DIRECT", "Other group", "B", "C"], targetNodes: ["B", "C"],
    });
    expect(orderDialerGroupsByNodes(ordered, nodes)).toBe(ordered);
  });
});
