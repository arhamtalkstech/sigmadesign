import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

/**
 * SigmaDesign local data root.
 * Override with SIGMADESIGN_HOME for custom library location.
 * Default: ~/.sigmadesign
 */
export function getSigmaHome(): string {
  const env = process.env.SIGMADESIGN_HOME?.trim();
  if (env) return env;
  return join(homedir(), ".sigmadesign");
}

export function getLibraryDir(): string {
  return join(getSigmaHome(), "library");
}

export function getCacheDir(): string {
  return join(getSigmaHome(), "cache");
}

export function getThumbDir(): string {
  return join(getSigmaHome(), "thumbnails");
}

export function getDbPath(): string {
  return join(getSigmaHome(), "sigmadesign.db");
}

export function ensureSigmaDirs(): void {
  for (const dir of [getSigmaHome(), getLibraryDir(), getCacheDir(), getThumbDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

export function sigPathForId(id: string): string {
  return join(getLibraryDir(), `${id}.sig`);
}

export function cachePathForId(id: string): string {
  return join(getCacheDir(), `${id}.adm.json`);
}
