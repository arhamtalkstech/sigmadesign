import { NextResponse } from "next/server";
import { TOOL_CATALOG } from "@/mcp/tool-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public catalog of agent tools (for the Connect page). Browser-safe module. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    server: "sigmadesign",
    transport: "stdio via `pnpm mcp`",
    tools: TOOL_CATALOG.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });
}
