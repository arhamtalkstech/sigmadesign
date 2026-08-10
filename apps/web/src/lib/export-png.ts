/**
 * Export selected nodes (or full page) to a PNG download via offscreen canvas.
 */
import type { AlteronDocument, NodeId } from "@alteron/document-model";
import { renderScene, type Viewport } from "@/lib/render-engine";

export async function exportDocumentRegionToPng(
  doc: AlteronDocument,
  options?: {
    nodeIds?: NodeId[];
    scale?: number;
    padding?: number;
    fileName?: string;
  }
): Promise<void> {
  const scale = options?.scale ?? 2;
  const pad = options?.padding ?? 16;
  const ids = options?.nodeIds?.length
    ? options.nodeIds
    : (() => {
        const page = doc.pages.find((p) => p.id === doc.currentPageId);
        return page?.children ?? [];
      })();

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of ids) {
    const b = doc.nodes[id]?.absoluteBounds;
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 400;
    maxY = 300;
  }

  const worldW = Math.max(1, maxX - minX + pad * 2);
  const worldH = Math.max(1, maxY - minY + pad * 2);
  const cssW = Math.min(4096, Math.ceil(worldW * scale));
  const cssH = Math.min(4096, Math.ceil(worldH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cssW;
  canvas.height = cssH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas for export");

  const viewport: Viewport = {
    x: -minX * scale + pad * scale,
    y: -minY * scale + pad * scale,
    zoom: scale,
  };

  // White background for export readability
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);

  renderScene(ctx, doc, viewport, cssW, cssH, {
    selection: [],
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("PNG encode failed");

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options?.fileName ?? `${doc.name || "export"}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
