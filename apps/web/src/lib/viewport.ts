/**
 * Shared canvas zoom limits for SigmaDesign.
 * Wide range so large boards and pixel work both fit (similar to design-tool norms).
 */
export const MIN_ZOOM = 0.0001; // 0.01%
export const MAX_ZOOM = 256; // 25600%

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Display string for zoom control (handles sub-1% values). */
export function formatZoomPercent(zoom: number): string {
  const pct = zoom * 100;
  if (pct < 1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}
