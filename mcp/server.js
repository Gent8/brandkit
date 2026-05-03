#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { recolorSvg, verifySvg } from "./palette.js";
import { runPipeline, describePipeline } from "./pipeline.js";

const server = new Server(
  { name: "brandkit", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

const TOOLS = [
  {
    name: "brandkit_recolor",
    description:
      "Snap every hex color in an SVG to the nearest color in the brand palette. Returns the recolored SVG as text. Errors if the SVG contains rgb()/hsl()/named colors — convert those upstream first.",
    inputSchema: {
      type: "object",
      required: ["svg", "palette"],
      properties: {
        svg: { type: "string", description: "Full SVG source" },
        palette: {
          type: "array",
          items: { type: "string" },
          description: "Locked brand palette as hex strings (e.g. \"#1F7A55\")",
        },
      },
    },
  },
  {
    name: "brandkit_verify",
    description:
      "Verify that every color in an SVG is in the brand palette. Returns JSON { ok, offenders }. offenders[].kind is 'off-palette' (with suggestion) or 'non-hex'.",
    inputSchema: {
      type: "object",
      required: ["svg", "palette"],
      properties: {
        svg: { type: "string" },
        palette: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "brandkit_gen",
    description:
      "End-to-end logo-candidate pipeline: prompt + brand palette → fal.ai Ideogram v3 generate → Recraft vectorize → palette-snap recolor → palette-gate verify. Returns palette-locked survivor SVGs inline as text — no shared filesystem needed.\n\nResult shape: { provider, vectorize, count, palette, negative, survivors: [{name, svg, raster_base64?}], dropped: [{name, reason, error?, offenders?}] }. Survivors are guaranteed-clean — no offenders, every color in palette.\n\nRequires FAL_KEY and RECRAFT_API_KEY in the MCP server's environment. Soft-cap count at 6 to keep response payloads sane. Set dryRun=true to preview the requests without sending them.",
    inputSchema: {
      type: "object",
      required: ["prompt", "palette"],
      properties: {
        prompt: { type: "string", description: "Image prompt for the brand mark" },
        palette: {
          type: "array",
          items: { type: "string" },
          description: "Locked brand palette as hex strings",
        },
        extraNegative: {
          type: "array",
          items: { type: "string" },
          description: "Brand-specific terms to add to the default negative list (leaves, plants, sparkles, location pins, dollar signs, snowflakes, spreadsheet grid, text, watermark, faces, characters, hands, money symbols)",
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 6,
          description: "Number of candidates (default 4, max 6)",
        },
        provider: {
          type: "string",
          enum: ["fal", "replicate"],
          description: "Image provider (default fal). Replicate is a stub.",
        },
        vectorize: {
          type: "string",
          enum: ["recraft", "vectorizer"],
          description: "Vectorize provider (default recraft). Vectorizer.ai is a stub.",
        },
        includeRasters: {
          type: "boolean",
          description: "If true, attach base64 PNGs of each raster to survivors. Bloats response — only enable if you specifically need the pre-vectorize image.",
        },
        dryRun: {
          type: "boolean",
          description: "Preview the requests without sending them. Returns the planned generate + vectorize calls.",
        },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === "brandkit_recolor") {
      const out = recolorSvg(args.svg, args.palette);
      return { content: [{ type: "text", text: out }] };
    }
    if (name === "brandkit_verify") {
      const result = verifySvg(args.svg, args.palette);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    if (name === "brandkit_gen") {
      const opts = {
        prompt: args.prompt,
        palette: args.palette,
        extraNegative: args.extraNegative || [],
        count: Math.min(6, Math.max(1, Number(args.count) || 4)),
        provider: args.provider || "fal",
        vectorize: args.vectorize || "recraft",
        includeRasters: !!args.includeRasters,
      };
      if (args.dryRun) {
        const desc = describePipeline(opts);
        return { content: [{ type: "text", text: JSON.stringify(desc, null, 2) }] };
      }
      // sanity-check creds early so the error is clear before the API call
      const missing = [];
      if (opts.provider === "fal" && !process.env.FAL_KEY) missing.push("FAL_KEY");
      if (opts.vectorize === "recraft" && !(process.env.RECRAFT_API_KEY || process.env.RECRAFT_API_TOKEN)) missing.push("RECRAFT_API_KEY");
      if (missing.length) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `brandkit_gen: missing credentials in MCP environment: ${missing.join(", ")}. Set them in the MCP server config (e.g. claude_desktop_config.json or claude code settings) before calling this tool.`,
          }],
        };
      }
      const result = await runPipeline(opts);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `unknown tool: ${name}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: "text", text: e.message || String(e) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
