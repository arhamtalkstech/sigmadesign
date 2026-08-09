"use client";

import type { Paint, SceneNode, SolidPaint } from "@alteron/document-model";
import { useDocumentStore } from "@/store/document-store";

function solidFill(node: SceneNode): SolidPaint | null {
  const p = node.fills.find(
    (f): f is SolidPaint => f.type === "SOLID" && f.visible !== false
  );
  return p ?? null;
}

function colorToHex(c: { r: number; g: number; b: number }): string {
  const h = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function hexToColor(hex: string): { r: number; g: number; b: number; a: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  const n = parseInt(m[1]!, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: 1,
  };
}

export function PropertiesPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const patchSelected = useDocumentStore((s) => s.patchSelected);
  const moveSelected = useDocumentStore((s) => s.moveSelected);

  const renameNode = useDocumentStore((s) => s.renameNode);
  const node = selection.length === 1 ? doc.nodes[selection[0]!] : null;
  const multi = selection.length > 1;

  return (
    <aside
      className="panel"
      style={{ borderLeft: "1px solid var(--chrome-border)" }}
    >
      <div className="panel-header">Design</div>
      <div className="panel-body" style={{ padding: 12 }}>
        {!node && !multi && (
          <div className="empty-state">
            <strong>Nothing selected</strong>
            Click a layer on the canvas or in the layers panel
          </div>
        )}

        {multi && (
          <div className="empty-state">
            <strong>{selection.length} layers selected</strong>
            Multi-edit coming soon — move with drag or arrow keys
          </div>
        )}

        {node && (
          <>
            <div className="section-title">Layer</div>
            <div className="field-row" style={{ marginBottom: 10 }}>
              <label htmlFor="layer-name">Name</label>
              <input
                id="layer-name"
                className="field-input"
                type="text"
                key={node.id}
                defaultValue={node.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== node.name) {
                    renameNode(node.id, v);
                  } else {
                    e.target.value = node.name;
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                style={{ flex: 1, minWidth: 0, fontWeight: 600 }}
              />
            </div>
            <div
              style={{
                color: "var(--chrome-text-muted)",
                marginBottom: 12,
                fontSize: 11,
              }}
            >
              {node.type} · {node.id}
            </div>

            <div className="section-title">Transform</div>
            <div className="field-row">
              <label>X</label>
              <input
                className="field-input"
                type="number"
                value={Math.round(node.transform.m02)}
                onChange={(e) => {
                  const x = Number(e.target.value);
                  const dx = x - node.transform.m02;
                  moveSelected(dx, 0);
                }}
              />
              <input
                className="field-input"
                type="number"
                value={Math.round(node.transform.m12)}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  const dy = y - node.transform.m12;
                  moveSelected(0, dy);
                }}
                aria-label="Y"
              />
            </div>
            <div className="field-row">
              <label>W</label>
              <input
                className="field-input"
                type="number"
                value={Math.round(node.size.width)}
                onChange={(e) =>
                  patchSelected({
                    size: {
                      ...node.size,
                      width: Math.max(0, Number(e.target.value)),
                    },
                  })
                }
              />
              <input
                className="field-input"
                type="number"
                value={Math.round(node.size.height)}
                onChange={(e) =>
                  patchSelected({
                    size: {
                      ...node.size,
                      height: Math.max(0, Number(e.target.value)),
                    },
                  })
                }
                aria-label="H"
              />
            </div>
            <div className="field-row">
              <label>Op</label>
              <input
                className="field-input"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={node.opacity}
                onChange={(e) =>
                  patchSelected({ opacity: Number(e.target.value) })
                }
                aria-label="Opacity"
              />
              <span />
            </div>
            <div className="field-row">
              <label>Vis</label>
              <button
                type="button"
                className="sigma-topbar-btn"
                style={{ gridColumn: "2 / -1", justifyContent: "flex-start" }}
                onClick={() =>
                  patchSelected({ visible: node.visible === false })
                }
              >
                {node.visible === false ? "Show layer" : "Hide layer"}
              </button>
            </div>

            <div className="section-title">Fill</div>
            <FillEditor node={node} onChange={patchSelected} />

            {node.type === "TEXT" && "characters" in node && (
              <>
                <div className="section-title">Text</div>
                <textarea
                  className="field-input"
                  rows={3}
                  value={node.characters}
                  onChange={(e) =>
                    patchSelected({ characters: e.target.value } as Partial<SceneNode>)
                  }
                  style={{ resize: "vertical", width: "100%" }}
                />
                <div className="field-row" style={{ marginTop: 8 }}>
                  <label>Aa</label>
                  <input
                    className="field-input"
                    type="number"
                    value={node.textStyle.fontSize}
                    onChange={(e) =>
                      patchSelected({
                        textStyle: {
                          ...node.textStyle,
                          fontSize: Number(e.target.value),
                        },
                      } as Partial<SceneNode>)
                    }
                  />
                  <span style={{ color: "var(--chrome-text-muted)" }}>
                    {node.textStyle.fontFamily}
                  </span>
                </div>
              </>
            )}

            {node.layout && (
              <>
                <div className="section-title">Auto layout</div>
                <div style={{ color: "var(--chrome-text-muted)" }}>
                  {node.layout.mode} · gap {node.layout.gap}
                  <br />
                  padding {node.layout.padding.top}/
                  {node.layout.padding.right}/{node.layout.padding.bottom}/
                  {node.layout.padding.left}
                </div>
              </>
            )}

            {node.type === "INSTANCE" && "componentId" in node && (
              <>
                <div className="section-title">Component</div>
                <div style={{ color: "var(--chrome-text-muted)" }}>
                  Instance of {node.componentId ?? node.componentKey ?? "—"}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function FillEditor({
  node,
  onChange,
}: {
  node: SceneNode;
  onChange: (p: Partial<SceneNode>) => void;
}) {
  const solid = solidFill(node);

  if (!solid) {
    return (
      <div style={{ color: "var(--chrome-text-muted)" }}>
        {node.fills.length === 0 ? "No fill" : `${node.fills.length} paint(s)`}
      </div>
    );
  }

  const hex = colorToHex(solid.color);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const color = hexToColor(e.target.value);
          const fills: Paint[] = node.fills.map((f) =>
            f.type === "SOLID" ? { ...f, color } : f
          );
          onChange({ fills });
        }}
        style={{
          width: 28,
          height: 28,
          border: "none",
          padding: 0,
          background: "transparent",
        }}
      />
      <input
        className="field-input"
        value={hex}
        onChange={(e) => {
          const color = hexToColor(e.target.value);
          const fills: Paint[] = node.fills.map((f) =>
            f.type === "SOLID" ? { ...f, color } : f
          );
          onChange({ fills });
        }}
      />
      <input
        className="field-input"
        type="number"
        min={0}
        max={100}
        value={Math.round(solid.opacity * 100)}
        onChange={(e) => {
          const opacity = Number(e.target.value) / 100;
          const fills: Paint[] = node.fills.map((f) =>
            f.type === "SOLID" ? { ...f, opacity } : f
          );
          onChange({ fills });
        }}
        style={{ width: 56 }}
      />
    </div>
  );
}
