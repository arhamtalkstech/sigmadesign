import { NextRequest, NextResponse } from "next/server";
import type { AlteronDocument } from "@alteron/document-model";
import {
  openLibraryFile,
  removeLibraryFile,
  renameLibraryFile,
  saveLibraryDocument,
  saveLibrarySession,
} from "@/server/library-service";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Open file: returns full ADM document + restored session state */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const result = await openLibraryFile(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not found") || msg.includes("Missing") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * PATCH — session state, rename, and/or full document auto-save.
 * Body may include viewport/selection (session), name (rename), and/or doc (ADM).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      viewport?: { x: number; y: number; zoom: number };
      currentPageId?: string | null;
      expanded?: string[];
      selection?: string[];
      name?: string;
      /** Full document snapshot for auto-save after paste/edits */
      doc?: AlteronDocument;
    };
    if (body.name) {
      const file = renameLibraryFile(id, body.name);
      if (!file) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, file });
    }

    let saved: { ok: true; nodeCount: number; savedAt: number } | undefined;
    if (body.doc?.nodes && body.doc?.pages) {
      saved = saveLibraryDocument(id, body.doc);
    }

    if (
      body.viewport ||
      body.currentPageId !== undefined ||
      body.expanded ||
      body.selection
    ) {
      saveLibrarySession(id, body);
    }

    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const ok = removeLibraryFile(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
