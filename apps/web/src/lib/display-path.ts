/**
 * Format library home for UI — never show raw `/Users/<name>/...` in chrome.
 * Full path remains available via title/tooltip when needed.
 */
export function formatLibraryHomeDisplay(
  absoluteHome: string,
  homeDir?: string
): string {
  const home = (homeDir ?? "").replace(/\/+$/, "");
  const path = absoluteHome.trim();
  if (!path) return "~/.sigmadesign";

  // Default product home
  if (home && (path === `${home}/.sigmadesign` || path === `${home}/.sigmadesign/`)) {
    return "~/.sigmadesign";
  }
  if (path.endsWith("/.sigmadesign") || path.endsWith("/.sigmadesign/")) {
    return "~/.sigmadesign";
  }

  // Any path under the user home → collapse to ~/...
  if (home && (path === home || path.startsWith(home + "/"))) {
    const rest = path.slice(home.length);
    return rest ? `~${rest}` : "~";
  }

  // Generic Unix home collapse when homeDir not provided
  const m = path.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (m) {
    const rest = m[1] ?? "";
    return rest ? `~${rest}` : "~";
  }
  const m2 = path.match(/^\/home\/[^/]+(\/.*)?$/);
  if (m2) {
    const rest = m2[1] ?? "";
    return rest ? `~${rest}` : "~";
  }

  return path;
}
