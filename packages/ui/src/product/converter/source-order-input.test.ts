import { describe, expect, it, vi } from "vitest";
import { SourceOrderInput } from "./source-order-input";

describe("SourceOrderInput", () => {
  function harness(position = 27) {
    const onMove = vi.fn();
    const { props } = SourceOrderInput({ position, total: 27, onMove });
    return { props, onMove };
  }

  it("moves directly to the requested position when editing finishes", () => {
    const { props, onMove } = harness();
    props.onBlur({ currentTarget: { value: "2" } });
    expect(onMove).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("clamps out-of-range input and resets empty or invalid values", () => {
    for (const [value, expected] of [["0", 1], ["999", 27]] as const) {
      const { props, onMove } = harness(12);
      const input = { value };
      props.onBlur({ currentTarget: input });
      expect(input.value).toBe(String(expected));
      expect(onMove).toHaveBeenCalledExactlyOnceWith(expected);
    }
    for (const value of ["", "abc", "2.5", "2e1", "27"]) {
      const { props, onMove } = harness();
      const input = { value };
      props.onBlur({ currentTarget: input });
      expect(onMove).not.toHaveBeenCalled();
      expect(input.value).toBe("27");
    }
  });

  it("commits on Enter and cancels on Escape without moving", () => {
    for (const key of ["Enter", "Escape"]) {
      const { props, onMove } = harness();
      const input = { value: "2", blur: vi.fn() };
      input.blur.mockImplementation(() => props.onBlur({ currentTarget: input }));
      const preventDefault = vi.fn();
      props.onKeyDown({ key, currentTarget: input, preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(input.blur).toHaveBeenCalledOnce();
      if (key === "Enter") expect(onMove).toHaveBeenCalledExactlyOnceWith(2);
      else expect(onMove).not.toHaveBeenCalled();
    }
  });
});
