import { NextRequest, NextResponse } from "next/server";
import { importFigFile } from "@alteron/fig-import";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST multipart file field "file" → AlteronDocument JSON (dev/import helper).
 * No bundled sample is shipped; import real archives via POST /api/library.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const doc = await importFigFile(buf);
    if (file.name) doc.name = file.name.replace(/\.fig$/i, "");
    // strip heavy dataUrls from response if huge — keep hashes
    slimAssets(doc);
    return NextResponse.json(doc);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST multipart file field `file` with a .sig or .fig archive",
  });
}

function slimAssets(doc: {
  assets: Record<
    string,
    { hash: string; mimeType: string; dataUrl?: string; byteLength: number }
  >;
}) {
  // Keep dataUrls — needed for canvas images. Cap only if extreme.
  const keys = Object.keys(doc.assets);
  if (keys.length > 200) {
    for (const k of keys) {
      delete doc.assets[k]!.dataUrl;
    }
  }
}
