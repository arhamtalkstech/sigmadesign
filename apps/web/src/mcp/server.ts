#!/usr/bin/env node
/**
 * SigmaDesign MCP server (stdio).
 *
 * Local coding agents connect without a third-party design-cloud PAT.
 *
 *   pnpm mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callTool, TOOL_DEFINITIONS } from "./tools.js";

const server = new McpServer({
  name: "sigmadesign",
  version: "0.2.0",
});

/** Accept any documented tool fields; handlers validate required ones. */
const toolInput = {
  fileId: z.string().optional(),
  nodeId: z.string().optional(),
  query: z.string().optional(),
  type: z.string().optional(),
  limit: z.number().optional(),
  depth: z.number().optional(),
  includePaths: z.boolean().optional(),
  scale: z.number().optional(),
  patch: z.record(z.string(), z.unknown()).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  name: z.string().optional(),
  characters: z.string().optional(),
  fontSize: z.number().optional(),
  mode: z.string().optional(),
  gap: z.number().optional(),
  padding: z.number().optional(),
};

for (const def of TOOL_DEFINITIONS) {
  server.registerTool(
    def.name,
    {
      description: def.description,
      inputSchema: toolInput,
    },
    async (args) => {
      const result = await callTool(
        def.name,
        (args ?? {}) as Record<string, unknown>
      );
      return {
        content: result.content.map((c) => {
          if (c.type === "image") {
            return {
              type: "image" as const,
              data: c.data,
              mimeType: c.mimeType,
            };
          }
          return { type: "text" as const, text: c.text };
        }),
        isError: result.isError,
      };
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[sigmadesign-mcp]", err);
  process.exit(1);
});
