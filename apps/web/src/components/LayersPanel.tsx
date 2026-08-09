"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import type { NodeId, SceneNode } from "@alteron/document-model";
import { useDocumentStore } from "@/store/document-store";
import {
  ChromeIcons,
  Icon,
  LAYER_TYPE_ICONS,
} from "@/lib/chrome-icons";

const ROW_H = 28;
const MAX_VISIBLE_ROWS = 80;

interface FlatRow {
  id: NodeId;
  depth: number;
}

/** Flatten only expanded branches — never materialize 50k DOM nodes. */
function flattenVisible(
  doc: { nodes: Record<NodeId, SceneNode> },
  rootIds: NodeId[],
  expanded: Record<NodeId, boolean>,
  maxRows = 2000
): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (ids: NodeId[], depth: number) => {
    // Layers list: top of list = front = last child
    for (let i = ids.length - 1; i >= 0 && out.length < maxRows; i--) {
      const id = ids[i]!;
      const node = doc.nodes[id];
      if (!node) continue;
      out.push({ id, depth });
      if (expanded[id] && node.children.length) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(rootIds, 0);
  return out;
}

export function LayersPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const expanded = useDocumentStore((s) => s.expanded);
  const setSelection = useDocumentStore((s) => s.setSelection);
  const toggleExpanded = useDocumentStore((s) => s.toggleExpanded);
  const setPage = useDocumentStore((s) => s.setPage);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const visiblePages = useMemo(
    () => doc.pages.filter((p) => !p.internal),
    [doc.pages]
  );
  const page = doc.pages.find((p) => p.id === doc.currentPageId);

  const flat = useMemo(
    () =>
      page
        ? flattenVisible(doc, page.children, expanded, 3000)
        : [],
    [doc, page, expanded]
  );

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const totalH = flat.length * ROW_H;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 5);
  const end = Math.min(flat.length, start + MAX_VISIBLE_ROWS);
  const slice = flat.slice(start, end);
  const padTop = start * ROW_H;

  // Scroll selection into view lightly
  useEffect(() => {
    if (!selection[0] || !scrollRef.current) return;
    const idx = flat.findIndex((r) => r.id === selection[0]);
    if (idx < 0) return;
    const y = idx * ROW_H;
    const el = scrollRef.current;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - ROW_H) {
      el.scrollTop = Math.max(0, y - el.clientHeight / 3);
    }
  }, [selection, flat]);

  return (
    <aside
      className="panel"
      style={{ borderRight: "1px solid var(--chrome-border)" }}
    >
      <div className="panel-header">
        <span>Layers</span>
        <span style={{ marginLeft: "auto", fontWeight: 400 }}>
          {flat.length
            ? `${flat.length.toLocaleString()} shown`
            : Object.keys(doc.nodes).length
              ? `${Object.keys(doc.nodes).length.toLocaleString()} nodes`
              : ""}
        </span>
      </div>

      {visiblePages.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "8px 8px 0",
            flexWrap: "wrap",
          }}
        >
          {visiblePages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPage(p.id)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                background:
                  p.id === doc.currentPageId
                    ? "var(--accent)"
                    : "var(--chrome-bg-elevated)",
                fontSize: 11,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="panel-body"
        style={{ padding: 0, overflow: "auto" }}
        onScroll={onScroll}
      >
        {!page || page.children.length === 0 ? (
          <div className="empty-state">
            <strong>No layers yet</strong>
            Open a design file from the library or paste clipboard layers
          </div>
        ) : (
          <div style={{ height: totalH, position: "relative" }}>
            <div style={{ transform: `translateY(${padTop}px)` }}>
              {slice.map((row) => {
                const node = doc.nodes[row.id];
                if (!node) return null;
                const isSelected = selection.includes(row.id);
                const hasChildren = node.children.length > 0;
                const isOpen = expanded[row.id];
                const TypeIcon =
                  LAYER_TYPE_ICONS[node.type] ?? LAYER_TYPE_ICONS.UNKNOWN;
                return (
                  <div
                    key={row.id}
                    role="treeitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelection([row.id]);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      height: ROW_H,
                      paddingLeft: 8 + row.depth * 12,
                      paddingRight: 8,
                      background: isSelected ? "var(--accent)" : "transparent",
                      cursor: "default",
                      userSelect: "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = "var(--chrome-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <button
                      type="button"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasChildren) toggleExpanded(row.id);
                      }}
                      style={{
                        width: 16,
                        height: 16,
                        opacity: hasChildren ? 1 : 0,
                        color: isSelected
                          ? "#fff"
                          : "var(--chrome-text-muted)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon
                        icon={
                          isOpen
                            ? ChromeIcons.ChevronDown
                            : ChromeIcons.ChevronRight
                        }
                        size={12}
                      />
                    </button>
                    <span
                      style={{
                        width: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.9,
                        color: isSelected
                          ? "#fff"
                          : "var(--chrome-text-muted)",
                      }}
                    >
                      <Icon icon={TypeIcon} size={13} />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: node.visible === false ? 0.4 : 1,
                      }}
                    >
                      {node.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
