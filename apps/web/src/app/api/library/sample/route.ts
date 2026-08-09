import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bundled sample import was removed from the product distribution.
 * Users import their own `.sig` / `.fig` files via POST /api/library.
 */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "No bundled sample is shipped with SigmaDesign. Import a .sig or .fig file from the library home.",
    },
    { status: 410 }
  );
}
