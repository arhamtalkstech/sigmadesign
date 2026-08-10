"use client";

import type {
  ImagePaint,
  Paint,
  SceneNode,
  SolidPaint,
  TextNode,
} from "@alteron/document-model";
import { getVectorPoints } from "@alteron/document-model";
import { useDocumentStore } from "@/store/document-store";

function solidFill(node: SceneNode): SolidPaint | null {
  const p = node.fills.find(
    (f): f is SolidPaint => f.type === "SOLID" && f.visible !== false
  );
  return p ?? null;
}

function imageFill(node: SceneNode): ImagePaint | null {
  const p = node.fills.find(
    (f): f is ImagePaint => f.type === "IMAGE" && f.visible !== false
  );
  return p ?? null;
}

function solidStroke(node: SceneNode): SolidPaint | null {
  const p = node.strokes.find(
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

function isTextNode(node: SceneNode): node is TextNode {
  return node.type === "TEXT" && "characters" in node && "textStyle" in node;
}

export function PropertiesPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const patchSelected = useDocumentStore((s) => s.patchSelected);
  const moveSelected = useDocumentStore((s) => s.moveSelected);
  const rotateSelected = useDocumentStore((s) => s.rotateSelected);
  const alignSelection = useDocumentStore((s) => s.alignSelection);
  const setSelectionAutoLayout = useDocumentStore(
    (s) => s.setSelectionAutoLayout
  );
  const booleanSelection = useDocumentStore((s) => s.booleanSelection);
  const createComponentFromSelection = useDocumentStore(
    (s) => s.createComponentFromSelection
  );
  const instantiateSelectedComponent = useDocumentStore(
    (s) => s.instantiateSelectedComponent
  );
  const createStyleFromSelection = useDocumentStore(
    (s) => s.createStyleFromSelection
  );
  const applyStyleToSelection = useDocumentStore((s) => s.applyStyleToSelection);
  const createVariableFromSelection = useDocumentStore(
    (s) => s.createVariableFromSelection
  );
  const applyVariableToSelection = useDocumentStore(
    (s) => s.applyVariableToSelection
  );
  const setVariableMode = useDocumentStore((s) => s.setVariableMode);
  const addModeToCollection = useDocumentStore((s) => s.addModeToCollection);
  const setVectorPathClosed = useDocumentStore((s) => s.setVectorPathClosed);
  const deleteVectorPointAt = useDocumentStore((s) => s.deleteVectorPointAt);
  const insertVectorPointAt = useDocumentStore((s) => s.insertVectorPointAt);
  const selectedCommentId = useDocumentStore((s) => s.selectedCommentId);
  const resolveSelectedComment = useDocumentStore(
    (s) => s.resolveSelectedComment
  );
  const updateSelectedComment = useDocumentStore((s) => s.updateSelectedComment);
  const deleteSelectedComment = useDocumentStore((s) => s.deleteSelectedComment);
  const renameNode = useDocumentStore((s) => s.renameNode);

  const node = selection.length === 1 ? doc.nodes[selection[0]!] : null;
  const multi = selection.length > 1;
  const styles = Object.values(doc.styles ?? {});
  const variables = Object.values(doc.variables ?? {});
  const collections = Object.values(doc.variableCollections ?? {});
  const components = Object.values(doc.components ?? {});
  const comment =
    selectedCommentId && doc.comments?.[selectedCommentId]
      ? doc.comments[selectedCommentId]
      : null;

  return (
    <aside
      className="panel"
      style={{ borderLeft: "1px solid var(--chrome-border)" }}
    >
      <div className="panel-header">Design</div>
      <div className="panel-body" style={{ padding: 12 }}>
        {comment && (
          <>
            <div className="section-title">Comment</div>
            <textarea
              className="field-input"
              rows={3}
              value={comment.message}
              onChange={(e) =>
                updateSelectedComment(comment.id, e.target.value)
              }
              style={{ width: "100%", resize: "vertical" }}
              aria-label="Comment message"
            />
            <div className="sigma-prop-grid" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="sigma-topbar-btn"
                onClick={() =>
                  resolveSelectedComment(comment.id, !comment.resolved)
                }
              >
                {comment.resolved ? "Reopen" : "Resolve"}
              </button>
              <button
                type="button"
                className="sigma-topbar-btn"
                onClick={() => deleteSelectedComment(comment.id)}
              >
                Delete
              </button>
            </div>
            <div
              style={{
                color: "var(--chrome-text-muted)",
                fontSize: 11,
                marginTop: 6,
              }}
            >
              {comment.author ?? "Author"} ·{" "}
              {comment.resolved ? "Resolved" : "Open"} · ({Math.round(comment.x)}
              , {Math.round(comment.y)})
            </div>
          </>
        )}

        {multi && (
          <>
            <div className="empty-state" style={{ marginBottom: 12 }}>
              <strong>{selection.length} layers selected</strong>
              Align, distribute, or boolean-combine
            </div>
            <div className="section-title">Align</div>
            <div className="sigma-prop-grid">
              {(
                [
                  ["left", "Left"],
                  ["center-h", "Center H"],
                  ["right", "Right"],
                  ["top", "Top"],
                  ["center-v", "Center V"],
                  ["bottom", "Bottom"],
                  ["distribute-h", "Dist H"],
                  ["distribute-v", "Dist V"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className="sigma-topbar-btn"
                  onClick={() => alignSelection(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="section-title">Boolean</div>
            <div className="sigma-prop-grid">
              {(
                [
                  ["UNION", "Union"],
                  ["SUBTRACT", "Subtract"],
                  ["INTERSECT", "Intersect"],
                  ["EXCLUDE", "Exclude"],
                ] as const
              ).map(([op, label]) => (
                <button
                  key={op}
                  type="button"
                  className="sigma-topbar-btn"
                  onClick={() => booleanSelection(op)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
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
                  if (v && v !== node.name) renameNode(node.id, v);
                  else e.target.value = node.name;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    (e.target as HTMLInputElement).blur();
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
                  moveSelected(x - node.transform.m02, 0);
                }}
                aria-label="X position"
              />
              <input
                className="field-input"
                type="number"
                value={Math.round(node.transform.m12)}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  moveSelected(0, y - node.transform.m12);
                }}
                aria-label="Y position"
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
                aria-label="Width"
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
                aria-label="Height"
              />
            </div>
            <div className="field-row">
              <label>Rot</label>
              <input
                className="field-input"
                type="number"
                step={1}
                value={Math.round(node.rotation ?? 0)}
                onChange={(e) => rotateSelected(Number(e.target.value))}
                aria-label="Rotation degrees"
              />
              <span style={{ color: "var(--chrome-text-muted)" }}>deg</span>
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
              <button
                type="button"
                className="sigma-topbar-btn"
                onClick={() =>
                  patchSelected({ visible: node.visible === false })
                }
              >
                {node.visible === false ? "Show" : "Hide"}
              </button>
            </div>

            <div className="field-row">
              <label>Con</label>
              <select
                className="field-input"
                value={node.constraints?.horizontal ?? "MIN"}
                onChange={(e) =>
                  patchSelected({
                    constraints: {
                      horizontal: e.target.value,
                      vertical: node.constraints?.vertical ?? "MIN",
                    },
                  })
                }
                aria-label="Horizontal constraint"
              >
                {["MIN", "CENTER", "MAX", "STRETCH", "SCALE"].map((c) => (
                  <option key={c} value={c}>
                    H {c}
                  </option>
                ))}
              </select>
              <select
                className="field-input"
                value={node.constraints?.vertical ?? "MIN"}
                onChange={(e) =>
                  patchSelected({
                    constraints: {
                      horizontal: node.constraints?.horizontal ?? "MIN",
                      vertical: e.target.value,
                    },
                  })
                }
                aria-label="Vertical constraint"
              >
                {["MIN", "CENTER", "MAX", "STRETCH", "SCALE"].map((c) => (
                  <option key={c} value={c}>
                    V {c}
                  </option>
                ))}
              </select>
            </div>

            {(node.type === "RECTANGLE" ||
              node.type === "FRAME" ||
              node.type === "COMPONENT" ||
              node.type === "INSTANCE") && (
              <>
                <div className="section-title">Corner radius</div>
                <div className="field-row">
                  <label>R</label>
                  <input
                    className="field-input"
                    type="number"
                    min={0}
                    value={
                      typeof node.cornerRadius === "number"
                        ? node.cornerRadius
                        : node.cornerRadius?.topLeft ?? 0
                    }
                    onChange={(e) =>
                      patchSelected({
                        cornerRadius: Math.max(0, Number(e.target.value)),
                      })
                    }
                    aria-label="Corner radius"
                  />
                  <span />
                </div>
              </>
            )}

            <div className="section-title">Fill</div>
            <FillEditor node={node} onChange={patchSelected} />

            <div className="section-title">Stroke</div>
            <StrokeEditor node={node} onChange={patchSelected} />

            {imageFill(node) && (
              <>
                <div className="section-title">Image</div>
                <div className="field-row">
                  <label>Mode</label>
                  <select
                    className="field-input"
                    value={imageFill(node)?.scaleMode ?? "FILL"}
                    onChange={(e) => {
                      const fills = node.fills.map((f) =>
                        f.type === "IMAGE"
                          ? { ...f, scaleMode: e.target.value }
                          : f
                      );
                      patchSelected({ fills });
                    }}
                    aria-label="Image scale mode"
                  >
                    <option value="FILL">Fill</option>
                    <option value="FIT">Fit</option>
                    <option value="CROP">Crop</option>
                    <option value="TILE">Tile</option>
                  </select>
                  <span style={{ color: "var(--chrome-text-muted)", fontSize: 11 }}>
                    {imageFill(node)?.imageHash?.slice(0, 8) ?? "—"}
                  </span>
                </div>
              </>
            )}

            {isTextNode(node) && (
              <>
                <div className="section-title">Text</div>
                <textarea
                  className="field-input"
                  rows={3}
                  value={node.characters}
                  onChange={(e) =>
                    patchSelected({
                      characters: e.target.value,
                    } as Partial<SceneNode>)
                  }
                  style={{ resize: "vertical", width: "100%" }}
                  aria-label="Text content"
                />
                <div className="field-row" style={{ marginTop: 8 }}>
                  <label>Size</label>
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
                    aria-label="Font size"
                  />
                  <input
                    className="field-input"
                    value={node.textStyle.fontFamily}
                    onChange={(e) =>
                      patchSelected({
                        textStyle: {
                          ...node.textStyle,
                          fontFamily: e.target.value,
                        },
                      } as Partial<SceneNode>)
                    }
                    aria-label="Font family"
                  />
                </div>
                <div className="field-row">
                  <label>Style</label>
                  <select
                    className="field-input"
                    value={node.textStyle.fontStyle}
                    onChange={(e) =>
                      patchSelected({
                        textStyle: {
                          ...node.textStyle,
                          fontStyle: e.target.value,
                        },
                      } as Partial<SceneNode>)
                    }
                    aria-label="Font style"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Medium">Medium</option>
                    <option value="SemiBold">SemiBold</option>
                    <option value="Bold">Bold</option>
                    <option value="Italic">Italic</option>
                  </select>
                  <select
                    className="field-input"
                    value={node.textStyle.textAlignHorizontal ?? "LEFT"}
                    onChange={(e) =>
                      patchSelected({
                        textStyle: {
                          ...node.textStyle,
                          textAlignHorizontal: e.target.value,
                        },
                      } as Partial<SceneNode>)
                    }
                    aria-label="Text align"
                  >
                    <option value="LEFT">Left</option>
                    <option value="CENTER">Center</option>
                    <option value="RIGHT">Right</option>
                    <option value="JUSTIFIED">Justify</option>
                  </select>
                </div>
              </>
            )}

            {node.type === "VECTOR" && (
              <>
                <div className="section-title">Vector path</div>
                {(() => {
                  const vp = getVectorPoints(doc, node.id);
                  return (
                    <>
                      <div
                        style={{
                          color: "var(--chrome-text-muted)",
                          fontSize: 11,
                          marginBottom: 8,
                        }}
                      >
                        {vp.points.length} points ·{" "}
                        {vp.closed ? "Closed" : "Open"}
                      </div>
                      <div className="sigma-prop-grid">
                        <button
                          type="button"
                          className="sigma-topbar-btn"
                          onClick={() =>
                            setVectorPathClosed(node.id, !vp.closed)
                          }
                        >
                          {vp.closed ? "Open path" : "Close path"}
                        </button>
                        <button
                          type="button"
                          className="sigma-topbar-btn"
                          onClick={() => {
                            if (vp.points.length < 2) return;
                            const a = vp.points[vp.points.length - 2]!;
                            const b = vp.points[vp.points.length - 1]!;
                            insertVectorPointAt(
                              node.id,
                              vp.points.length - 1,
                              {
                                x: (a.x + b.x) / 2,
                                y: (a.y + b.y) / 2,
                              },
                              vp.closed
                            );
                          }}
                        >
                          Insert point
                        </button>
                        <button
                          type="button"
                          className="sigma-topbar-btn"
                          onClick={() =>
                            deleteVectorPointAt(
                              node.id,
                              vp.points.length - 1,
                              vp.closed
                            )
                          }
                        >
                          Delete last
                        </button>
                      </div>
                    </>
                  );
                })()}
              </>
            )}

            <div className="section-title">Auto layout</div>
            <div className="sigma-prop-grid" style={{ marginBottom: 8 }}>
              {(
                [
                  ["NONE", "None"],
                  ["HORIZONTAL", "Horizontal"],
                  ["VERTICAL", "Vertical"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className="sigma-topbar-btn"
                  onClick={() =>
                    setSelectionAutoLayout({
                      mode,
                      gap: node.layout?.gap ?? 8,
                      padding: node.layout?.padding ?? {
                        top: 8,
                        right: 8,
                        bottom: 8,
                        left: 8,
                      },
                      primarySizing: "FIXED",
                      counterSizing: "HUG",
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {node.layout && node.layout.mode !== "NONE" && (
              <>
                <div className="field-row">
                  <label>Gap</label>
                  <input
                    className="field-input"
                    type="number"
                    value={node.layout.gap}
                    onChange={(e) =>
                      setSelectionAutoLayout({ gap: Number(e.target.value) })
                    }
                    aria-label="Auto layout gap"
                  />
                  <select
                    className="field-input"
                    value={node.layout.primarySizing ?? "FIXED"}
                    onChange={(e) =>
                      setSelectionAutoLayout({
                        primarySizing: e.target.value,
                      })
                    }
                    aria-label="Primary sizing"
                  >
                    <option value="FIXED">Fixed</option>
                    <option value="HUG">Hug</option>
                    <option value="FILL">Fill</option>
                  </select>
                </div>
                <div className="field-row">
                  <label>Pad</label>
                  <input
                    className="field-input"
                    type="number"
                    value={node.layout.padding.top}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSelectionAutoLayout({
                        padding: {
                          top: v,
                          right: v,
                          bottom: v,
                          left: v,
                        },
                      });
                    }}
                    aria-label="Padding"
                  />
                  <span style={{ color: "var(--chrome-text-muted)", fontSize: 11 }}>
                    {node.layout.managed ? "Managed" : "Imported"}
                  </span>
                </div>
              </>
            )}

            <div className="section-title">Components</div>
            <div className="sigma-prop-grid">
              <button
                type="button"
                className="sigma-topbar-btn"
                onClick={() => createComponentFromSelection()}
              >
                Create component
              </button>
              <button
                type="button"
                className="sigma-topbar-btn"
                onClick={() => instantiateSelectedComponent()}
              >
                Create instance
              </button>
            </div>
            {node.type === "INSTANCE" && "componentId" in node && (
              <div
                style={{
                  color: "var(--chrome-text-muted)",
                  marginTop: 8,
                  fontSize: 11,
                }}
              >
                Instance of{" "}
                {String(
                  ("componentId" in node && node.componentId) ||
                    ("componentKey" in node &&
                      (node as { componentKey?: string }).componentKey) ||
                    "—"
                )}
                {components.length > 0 && (
                  <select
                    className="field-input"
                    style={{ marginTop: 6, width: "100%" }}
                    value={String(
                      "componentId" in node && node.componentId
                        ? node.componentId
                        : ""
                    )}
                    onChange={(e) => {
                      useDocumentStore
                        .getState()
                        .swapSelectedInstance(e.target.value);
                    }}
                    aria-label="Swap component"
                  >
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="section-title">Styles</div>
            <div className="sigma-prop-grid">
              <button
                type="button"
                className="sigma-topbar-btn"
                onClick={() => {
                  const name = window.prompt("Style name", "Brand fill");
                  if (name) createStyleFromSelection(name);
                }}
              >
                Save fill style
              </button>
            </div>
            {styles.length > 0 && (
              <select
                className="field-input"
                style={{ width: "100%", marginTop: 6 }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyStyleToSelection(e.target.value);
                  e.target.value = "";
                }}
                aria-label="Apply style"
              >
                <option value="">Apply style…</option>
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <div className="section-title">Variables</div>
            <div className="sigma-prop-grid">
              <button
                type="button"
                className="sigma-topbar-btn"
                onClick={() => {
                  const name = window.prompt("Variable name", "Primary");
                  if (name) createVariableFromSelection(name);
                }}
              >
                Save color token
              </button>
            </div>
            {variables.length > 0 && (
              <select
                className="field-input"
                style={{ width: "100%", marginTop: 6 }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyVariableToSelection(e.target.value);
                  e.target.value = "";
                }}
                aria-label="Apply variable"
              >
                <option value="">Apply variable…</option>
                {variables.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.resolvedType})
                  </option>
                ))}
              </select>
            )}
            {collections.map((coll) => (
              <div key={coll.id} style={{ marginTop: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--chrome-text-muted)",
                    marginBottom: 4,
                  }}
                >
                  {coll.name} mode
                </div>
                <select
                  className="field-input"
                  style={{ width: "100%" }}
                  value={doc.activeModes?.[coll.id] ?? coll.modes[0]?.id}
                  onChange={(e) => setVariableMode(coll.id, e.target.value)}
                  aria-label={`${coll.name} mode`}
                >
                  {coll.modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sigma-topbar-btn"
                  style={{ marginTop: 6, width: "100%" }}
                  onClick={() => {
                    const name = window.prompt("Mode name", "Dark");
                    if (name) addModeToCollection(coll.id, name);
                  }}
                >
                  Add mode
                </button>
              </div>
            ))}
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
  const img = imageFill(node);

  if (img) {
    return (
      <div style={{ color: "var(--chrome-text-muted)", fontSize: 11 }}>
        Image fill · {img.scaleMode ?? "FILL"} · opacity{" "}
        {Math.round((img.opacity ?? 1) * 100)}%
      </div>
    );
  }

  if (!solid) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ color: "var(--chrome-text-muted)" }}>
          {node.fills.length === 0 ? "No fill" : `${node.fills.length} paint(s)`}
        </div>
        <button
          type="button"
          className="sigma-topbar-btn"
          onClick={() =>
            onChange({
              fills: [
                {
                  type: "SOLID",
                  color: { r: 0.85, g: 0.85, b: 0.9, a: 1 },
                  opacity: 1,
                  visible: true,
                  blendMode: "NORMAL",
                },
              ],
            })
          }
        >
          Add solid fill
        </button>
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
        aria-label="Fill color"
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
        aria-label="Fill hex"
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
        aria-label="Fill opacity"
      />
    </div>
  );
}

function StrokeEditor({
  node,
  onChange,
}: {
  node: SceneNode;
  onChange: (p: Partial<SceneNode>) => void;
}) {
  const solid = solidStroke(node);

  if (!solid) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ color: "var(--chrome-text-muted)" }}>No stroke</div>
        <button
          type="button"
          className="sigma-topbar-btn"
          onClick={() =>
            onChange({
              strokes: [
                {
                  type: "SOLID",
                  color: { r: 0.2, g: 0.2, b: 0.25, a: 1 },
                  opacity: 1,
                  visible: true,
                  blendMode: "NORMAL",
                },
              ],
              strokeWeight: node.strokeWeight || 1,
            })
          }
        >
          Add stroke
        </button>
      </div>
    );
  }

  const hex = colorToHex(solid.color);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const color = hexToColor(e.target.value);
            const strokes: Paint[] = node.strokes.map((f) =>
              f.type === "SOLID" ? { ...f, color } : f
            );
            onChange({ strokes });
          }}
          aria-label="Stroke color"
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
            const strokes: Paint[] = node.strokes.map((f) =>
              f.type === "SOLID" ? { ...f, color } : f
            );
            onChange({ strokes });
          }}
          aria-label="Stroke hex"
        />
        <input
          className="field-input"
          type="number"
          min={0}
          value={node.strokeWeight}
          onChange={(e) =>
            onChange({ strokeWeight: Math.max(0, Number(e.target.value)) })
          }
          style={{ width: 56 }}
          aria-label="Stroke weight"
        />
      </div>
      <select
        className="field-input"
        value={node.strokeAlign ?? "CENTER"}
        onChange={(e) => onChange({ strokeAlign: e.target.value })}
        aria-label="Stroke align"
      >
        <option value="CENTER">Center</option>
        <option value="INSIDE">Inside</option>
        <option value="OUTSIDE">Outside</option>
      </select>
    </div>
  );
}
