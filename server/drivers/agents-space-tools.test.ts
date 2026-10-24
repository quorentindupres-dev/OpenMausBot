import { describe, expect, it, vi } from "vitest";

import { availableTools, catalogProfileFromEnv } from "./agents-catalog.ts";
import type { ToolCallContext } from "./agents-call.ts";
import { callTool } from "./agents-call.ts";
import { AGENTS_MCP_ENV } from "./agents-mcp-env.ts";

function context(answer: { ok: boolean; body: Record<string, unknown> }) {
  const apiResponse = vi.fn(async () => ({ ...answer, status: answer.ok ? 200 : 409 }));
  const ctx = { botId: "ea", threadId: "t", depth: 0, externalRuntime: false, sharedComputers: false, client: { apiResponse } } as unknown as ToolCallContext;
  return { ctx, apiResponse };
}

describe("the Spaces tools", () => {
  it("are listed only while the harness says the board has a Space", () => {
    const names = (env: Record<string, string>) => availableTools(catalogProfileFromEnv(env)).map((tool) => tool.name);
    expect(names({})).not.toContain("space_note");
    expect(names({ OMB_SPACE: "1" })).toEqual(expect.arrayContaining(["space_status", "space_note"]));
    expect(AGENTS_MCP_ENV).toContain("OMB_SPACE");
  });

  it("posts a note with the outcome's number from 1, and reports the signature", async () => {
    const { ctx, apiResponse } = context({ ok: true, body: { space: "Web", entry: { signature: "— EA (ea) · Web · 2026-10-23T12:00:00.000Z" } } });
    const result = await callTool("space_note", { text: "done", kind: "outcome", outcome: 2, space_id: "web" }, ctx);
    expect(result).toEqual({ text: "Posted to Web: — EA (ea) · Web · 2026-10-23T12:00:00.000Z" });
    expect(apiResponse).toHaveBeenCalledWith("/api/internal/space/note", { method: "POST", body: JSON.stringify({ text: "done", kind: "outcome", outcomeIndex: 1, spaceId: "web" }) });
  });

  it("reads the board and passes refusals through", async () => {
    expect(await callTool("space_status", {}, context({ ok: true, body: { text: "Your Space: …" } }).ctx)).toEqual({ text: "Your Space: …" });
    expect(await callTool("space_note", { text: "x" }, context({ ok: false, body: { error: "You are not in a Space yet." } }).ctx))
      .toEqual({ text: "You are not in a Space yet.", isError: true });
  });
});
