import { NextRequest, NextResponse } from "next/server";
import {
  getLibraryInfo,
  importToLibrary,
} from "@/server/library-service";
import { getLastOpenFileId } from "@/server/db";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** GET — list library + home path + last opened */
export async function GET() {
  try {
    const info = getLibraryInfo();
    return NextResponse.json({
      ok: true,
      ...info,
      lastOpenFileId: getLastOpenFileId(),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST multipart field "file" (.sig or .fig)
 * → import into ~/.sigmadesign/library as .sig + SQLite row + ADM cache
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const name = file.name || "Untitled.sig";
    if (!/\.(fig|sig)$/i.test(name)) {
      return NextResponse.json(
        { error: "Only .sig or .fig files are supported" },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const sourceFormat = /\.sig$/i.test(name) ? "sig" : "fig";
    const item = await importToLibrary(buf, name, {
      sourceFormat: sourceFormat as "sig" | "fig",
    });
    return NextResponse.json({ ok: true, file: item });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
