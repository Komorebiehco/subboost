import { describe, expect, it } from "vitest";
import { moveSubscriptionSource } from "./source-order";

describe("moveSubscriptionSource", () => {
  const sources = [
    { id: "a", content: "A" },
    { id: "b", content: "B" },
    { id: "c", content: "C" },
  ] as any[];

  it("moves sources up and down without mutating the input array", () => {
    expect(moveSubscriptionSource(sources, "b", "up").map((source) => source.id)).toEqual(["b", "a", "c"]);
    expect(moveSubscriptionSource(sources, "b", "down").map((source) => source.id)).toEqual(["a", "c", "b"]);
    expect(sources.map((source) => source.id)).toEqual(["a", "b", "c"]);
  });

  it("returns the original array for missing or boundary moves", () => {
    expect(moveSubscriptionSource(sources, "missing", "up")).toBe(sources);
    expect(moveSubscriptionSource(sources, "a", "up")).toBe(sources);
    expect(moveSubscriptionSource(sources, "c", "down")).toBe(sources);
  });

  it("inserts a source at a one-based position while retaining other sources' order", () => {
    expect(moveSubscriptionSource(sources, "c", 1).map((source) => source.id)).toEqual(["c", "a", "b"]);
    expect(moveSubscriptionSource(sources, "a", 3).map((source) => source.id)).toEqual(["b", "c", "a"]);
    expect(moveSubscriptionSource(sources, "c", 2).map((source) => source.id)).toEqual(["a", "c", "b"]);
    expect(sources.map((source) => source.id)).toEqual(["a", "b", "c"]);
  });

  it("clamps positions and ignores invalid or unchanged positions", () => {
    expect(moveSubscriptionSource(sources, "c", 0)[0]).toBe(sources[2]);
    expect(moveSubscriptionSource(sources, "a", 999)[2]).toBe(sources[0]);
    for (const position of [NaN, Infinity, 1.5, 2]) {
      expect(moveSubscriptionSource(sources, "b", position)).toBe(sources);
    }
    expect(moveSubscriptionSource(sources, "missing", 1)).toBe(sources);
  });
});
