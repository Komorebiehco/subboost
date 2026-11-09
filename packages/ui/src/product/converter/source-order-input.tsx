"use client";

import { Input } from "@subboost/ui/components/ui/input";

export function SourceOrderInput({
  position,
  total,
  onMove,
}: {
  position: number;
  total: number;
  onMove: (position: number) => void;
}) {
  return (
    <Input
      key={position}
      type="text"
      inputMode="numeric"
      defaultValue={String(position)}
      aria-label="节点源排序位置"
      title={`节点源排序位置（1-${total}）`}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => {
        const value = event.currentTarget.value.trim();
        const parsed = /^\d+$/.test(value) ? Number(value) : NaN;
        const next = Number.isSafeInteger(parsed) ? Math.max(1, Math.min(total, parsed)) : position;
        event.currentTarget.value = String(next);
        if (next !== position) onMove(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.value = String(position);
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="h-6 w-11 shrink-0 border-white/10 bg-white/10 px-1 text-center text-[11px]"
    />
  );
}
