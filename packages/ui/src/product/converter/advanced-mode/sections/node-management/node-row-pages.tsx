"use client";

import * as React from "react";

const PAGE_SIZE = 12;
const ROW_GAP = 4;

type PageProps<T> = {
  rows: readonly T[];
  estimatedRowHeight: number;
  renderRow: (row: T) => React.ReactNode;
};

function NodeRowPages<T>({ rows, estimatedRowHeight, renderRow }: PageProps<T>) {
  const container = React.useRef<HTMLDivElement>(null);
  const bottomAnchor = React.useRef<{ viewport: HTMLElement; scrollTop: number } | null>(null);
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const [visible, setVisible] = React.useState<Set<number> | null>(() => new Set([0]));
  const [focusedPage, setFocusedPage] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const pages = container.current;
    if (!pages) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(null);
      return;
    }

    const viewport = pages.closest<HTMLElement>("[data-node-list-viewport]");
    const observer = new IntersectionObserver((entries) => {
      bottomAnchor.current =
        viewport && viewport.scrollTop > 0 && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1
          ? { viewport, scrollTop: viewport.scrollTop }
          : null;
      // Remember the measured height before removing rows, including wrapped text.
      for (const { target, isIntersecting, boundingClientRect } of entries) {
        if (!isIntersecting && target.firstElementChild) {
          const height = boundingClientRect.height;
          if (height > 0) (target as HTMLElement).style.setProperty("--node-page-height", `${height}px`);
        }
      }
      setVisible(previous => {
        const next = new Set(previous);
        let changed = false;
        for (const { target, isIntersecting } of entries) {
          const page = Number((target as HTMLElement).dataset.nodePage);
          if (next.has(page) === isIntersecting) continue;
          changed = true;
          if (isIntersecting) next.add(page);
          else next.delete(page);
        }
        return changed ? next : previous;
      });
    }, { root: viewport, rootMargin: "384px 0px" });
    for (const page of pages.children) observer.observe(page);
    return () => observer.disconnect();
  }, [pageCount]);

  React.useLayoutEffect(() => {
    // Newly measured rows can be taller than their placeholders at the end.
    const anchor = bottomAnchor.current;
    if (anchor && Math.abs(anchor.viewport.scrollTop - anchor.scrollTop) <= 1) {
      anchor.viewport.scrollTop = anchor.viewport.scrollHeight;
    }
    bottomAnchor.current = null;
  }, [visible]);

  return (
    <div
      ref={container}
      className="space-y-1"
      onFocusCapture={event => {
        const page = event.target.closest<HTMLElement>("[data-node-page]");
        if (page) setFocusedPage(Number(page.dataset.nodePage));
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedPage(null);
      }}
    >
      {Array.from({ length: pageCount }, (_, page) => {
        const start = page * PAGE_SIZE;
        const count = Math.min(PAGE_SIZE, rows.length - start);
        const mounted = visible === null || visible.has(page) || page === focusedPage;
        const estimate = count * estimatedRowHeight + (count - 1) * ROW_GAP;
        return (
          <div
            key={page}
            data-node-page={page}
            className="space-y-1"
            style={mounted ? undefined : { height: `var(--node-page-height, ${estimate}px)` }}
          >
            {mounted && rows.slice(start, start + count).map(renderRow)}
          </div>
        );
      })}
    </div>
  );
}

export function renderNodeRows<T>(
  rows: readonly T[],
  estimatedRowHeight: number,
  renderRow: (row: T) => React.ReactNode,
) {
  if (rows.length <= PAGE_SIZE * 2) return rows.map(renderRow);
  return <NodeRowPages rows={rows} estimatedRowHeight={estimatedRowHeight} renderRow={renderRow} />;
}
