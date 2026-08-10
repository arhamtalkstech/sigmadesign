"use client";

import { useDocumentStore, type Tool } from "@/store/document-store";
import { Icon, TOOL_ICONS } from "@/lib/chrome-icons";

const TOOLS: Array<{ id: Tool; label: string; shortcut: string }> = [
  { id: "move", label: "Move", shortcut: "V" },
  { id: "hand", label: "Hand", shortcut: "H" },
  { id: "frame", label: "Frame", shortcut: "F" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "pen", label: "Pen", shortcut: "P" },
  { id: "image", label: "Image", shortcut: "I" },
  { id: "comment", label: "Comment", shortcut: "C" },
];

export function ToolRail() {
  const tool = useDocumentStore((s) => s.tool);
  const setTool = useDocumentStore((s) => s.setTool);

  return (
    <aside
      className="tool-rail"
      aria-label="Tools"
      style={{
        background: "var(--chrome-bg)",
        borderRight: "1px solid var(--chrome-border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        gap: 4,
      }}
    >
      {TOOLS.map((t) => {
        const Ico = TOOL_ICONS[t.id];
        return (
          <button
            key={t.id}
            type="button"
            title={`${t.label} (${t.shortcut})`}
            aria-label={`${t.label} (${t.shortcut})`}
            aria-pressed={tool === t.id}
            className={`icon-btn ${tool === t.id ? "active" : ""}`}
            onClick={() => setTool(t.id)}
          >
            <Icon icon={Ico} size={18} />
          </button>
        );
      })}
    </aside>
  );
}
