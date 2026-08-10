/**
 * Self-contained `.sig` ADM payload format (SIGMABLANK header + JSON).
 * Used for blank files and full writeback after edits.
 */
import { writeFileSync, statSync } from "node:fs";
import {
  createEmptyDocument,
  type AlteronDocument,
} from "@alteron/document-model";

export const BLANK_SIG_MAGIC = Buffer.from("SIGMABLANK\n", "utf8");

export function isAdmSigFile(bytes: Buffer | Uint8Array): boolean {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return (
    b.length >= BLANK_SIG_MAGIC.length &&
    b.subarray(0, BLANK_SIG_MAGIC.length).equals(BLANK_SIG_MAGIC)
  );
}

export function readAdmSigDocument(
  bytes: Buffer | Uint8Array,
  fallbackName: string
): AlteronDocument {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const rest = b.subarray(BLANK_SIG_MAGIC.length).toString("utf8").trim();
  if (!rest) {
    const doc = createEmptyDocument(fallbackName);
    doc.meta = { ...doc.meta, source: "blank" };
    return doc;
  }
  try {
    const doc = JSON.parse(rest) as AlteronDocument;
    if (!doc?.nodes || !doc?.pages) throw new Error("invalid ADM payload");
    return doc;
  } catch {
    const doc = createEmptyDocument(fallbackName);
    doc.meta = { ...doc.meta, source: "blank" };
    return doc;
  }
}

export function writeAdmSigDocument(
  path: string,
  doc: AlteronDocument
): number {
  const payload = Buffer.from(JSON.stringify(doc), "utf8");
  writeFileSync(path, Buffer.concat([BLANK_SIG_MAGIC, payload]));
  return statSync(path).mtimeMs;
}

/** Encode ADM to bytes (no disk) — for tests and transport. */
export function encodeAdmSig(doc: AlteronDocument): Buffer {
  return Buffer.concat([
    BLANK_SIG_MAGIC,
    Buffer.from(JSON.stringify(doc), "utf8"),
  ]);
}
