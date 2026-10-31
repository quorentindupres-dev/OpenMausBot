// The Spaces board's tools. Every note is signed with the calling bot's own name and id, taken from its capability.
import type { ToolCallContext, ToolCallResult } from "./agents-call.ts";
import type { Json } from "./agents-client.ts";

export const SPACE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "space_status",
  "space_note",
  "a01_lookup",
  "c02_project_lookup",
]);

export async function callSpaceTool(name: string, args: Json, context: ToolCallContext): Promise<ToolCallResult> {
  if (name === "space_status") {
    const { ok, body } = await context.client.apiResponse("/api/internal/space/status", { method: "GET" });
    return ok ? { text: String(body.text ?? "") } : { text: String(body.error ?? "Could not read the board."), isError: true };
  }
  if (name === "a01_lookup") {
    const { ok, body } = await context.client.apiResponse("/api/internal/space/a01-lookup", {
      method: "POST",
      body: JSON.stringify({
        action: args.action,
        ...(typeof args.role === "string" ? { role: args.role } : {}),
        ...(typeof args.query === "string" ? { query: args.query } : {}),
      }),
    });
    return ok ? { text: String(body.text ?? "") } : { text: String(body.error ?? "Could not query A01 fleet database."), isError: true };
  }
  if (name === "c02_project_lookup") {
    const { ok, body } = await context.client.apiResponse("/api/internal/space/c02-lookup", {
      method: "POST",
      body: JSON.stringify({
        action: args.action,
        ...(typeof args.slug === "string" ? { slug: args.slug } : {}),
        ...(typeof args.query === "string" ? { query: args.query } : {}),
      }),
    });
    return ok ? { text: String(body.text ?? "") } : { text: String(body.error ?? "Could not query C02 project database."), isError: true };
  }
  const outcome = typeof args.outcome === "number" ? args.outcome - 1 : undefined;
  const { ok, body } = await context.client.apiResponse("/api/internal/space/note", {
    method: "POST",
    body: JSON.stringify({
      text: args.text, kind: args.kind ?? "note",
      ...(outcome === undefined ? {} : { outcomeIndex: outcome }),
      ...(typeof args.space_id === "string" ? { spaceId: args.space_id } : {}),
      ...(typeof args.for_bot_id === "string" ? { forBotId: args.for_bot_id } : {}),
    }),
  });
  if (!ok) return { text: String(body.error ?? "Could not post that note."), isError: true };
  const entry = (body.entry ?? {}) as { signature?: unknown };
  return { text: `Posted to ${String(body.space ?? "the Space")}: ${String(entry.signature ?? "")}`.trim() };
}

export const SPACE_TOOL_DEFINITIONS = [
  {
    name: "space_status",
    description: "Read the person's Spaces board: your Space (goal, outcomes, roadmap, tasks, signed notes), every other Space, and which bot is where.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "space_note",
    description:
      "Post a signed note to your Space (or space_id), visible to every bot and the person. kind: note (progress), handoff, outcome (with outcome, its number, to tick it done), or ask (offer to pick up work: \"I can pick up X. Plan: …\"; the person answers yes or no, and yes assigns it as a task to you or for_bot_id).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string", minLength: 1, maxLength: 500 },
        kind: { type: "string", enum: ["note", "outcome", "handoff", "ask"] },
        outcome: { type: "number", description: "With kind outcome: the outcome's number, from 1." },
        space_id: { type: "string", description: "Another Space, from space_status. Default: yours." },
        for_bot_id: { type: "string", description: "With kind ask: the teammate who would do it." },
      },
      required: ["text"],
    },
  },
  {
    name: "a01_lookup",
    description:
      "Fast SQLite lookup in A01__team/team.db for role cards, EV formulas, standing rules, workflows, or FTS5 search without crawling folders.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["search", "formula", "rules", "card"] },
        role: { type: "string", maxLength: 200, description: "Registered A01 role id (e.g. EA, media-buyer, CREATIVE__scout)." },
        query: { type: "string", maxLength: 500, description: "Search text or formula filter." },
      },
      required: ["action"],
    },
  },
  {
    name: "c02_project_lookup",
    description:
      "Fast SQLite lookup in C02__Project_database for business projects: list all projects, inspect a project's first-principles card, SKUs/offers, acquisition channels, 7-pillar readiness, folder routing (where), or auto-detect a project from a path/URL/job.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "card", "products", "acquisition", "readiness", "where", "detect"] },
        slug: { type: "string", maxLength: 200, description: "C02 project slug (e.g. surge, precision-peptide, x-labs)." },
        query: { type: "string", maxLength: 500, description: "Thing to locate for where, or path/URL/job for detect." },
      },
      required: ["action"],
    },
  },
];
