import {
  A01_ROLE_IDS,
  AGENT_ROLE_ACCESSORIES,
  isSpaceComputerTarget,
  type A01SpawnMode,
  type AgentCanvasNode,
  type AgentRoleId,
  type C02ProjectLiveRef,
  type C02ProjectReadiness,
  type C02ProjectSummary,
  type DraggableSessionSummary,
  type ProjectCanvasNode,
  type SessionCanvasNode,
  type SpaceAgent,
  type SpaceArrow,
  type SpaceCanvasNode as WhiteboardCanvasNode,
  type SpaceComputerTarget,
  type SpaceGoal as WhiteboardGoal,
  type SpaceNodeLiveStatus,
  type SpaceState as WhiteboardSpaceState,
  type SpaceStickyNote,
  type StickyColor,
} from "@xlabs/space-canvas";
import type { Bot } from "@/state/store";
import type { AgentComputerProviderId } from "../../../shared/agent-computers";
import type {
  A01BindingMode,
  BotA01Binding,
  CanvasArrowInput,
  CanvasArrowPatch,
  CanvasNodeInput,
  CanvasNodePatch,
  CanvasNoteColor,
  CanvasNoteInput,
  CanvasNotePatch,
  GoalInput,
  GoalPatch,
  SpaceCanvasArrow,
  SpaceCanvasNode,
  SpaceCanvasNote,
  SpaceGoal,
  WhiteboardBatchInput,
} from "../../../shared/space";
import type {
  A01RoleListItem,
  BoardState,
  C02ProjectDetail,
  C02ProjectSummaryItem,
  C02ReadinessStatus,
} from "./space-api";

export const FREE_ARROW_SENTINEL = "__point__";

const NOTE_TO_STICKY_COLOR: Record<CanvasNoteColor, StickyColor> = {
  yellow: "amber",
  blue: "sky",
  green: "emerald",
  pink: "rose",
  neutral: "zinc",
};

const STICKY_TO_NOTE_COLOR: Record<StickyColor, CanvasNoteColor> = {
  amber: "yellow",
  sky: "blue",
  emerald: "green",
  rose: "pink",
  violet: "pink",
  indigo: "blue",
  paper: "neutral",
  zinc: "neutral",
};

export function noteColorToStickyColor(color: CanvasNoteColor | undefined): StickyColor {
  return color && color in NOTE_TO_STICKY_COLOR ? NOTE_TO_STICKY_COLOR[color] : "amber";
}

export function stickyColorToNoteColor(color: StickyColor | undefined): CanvasNoteColor {
  return color && color in STICKY_TO_NOTE_COLOR ? STICKY_TO_NOTE_COLOR[color] : "yellow";
}

/** Converts a `@xlabs/space-canvas` `AgentRoleId` (`media-buyer`, `ea`, ...) into a strict `A01__team/team.db` role ID. */
export function roleIdToA01Role(roleId: AgentRoleId): string {
  const meta = AGENT_ROLE_ACCESSORIES[roleId];
  if (meta?.a01 && meta.a01.trim()) {
    return meta.a01.trim();
  }
  return "WORKER__generalist";
}

/** Maps any `A01__team/team.db` role ID (main S3 or mini S2) back onto one of the 18 sprite `AgentRoleId`s. */
export function a01RoleToRoleId(
  a01Role: string | undefined | null,
  rolesCatalog?: readonly A01RoleListItem[],
): AgentRoleId {
  if (!a01Role || !a01Role.trim()) return "agent";
  const trimmed = a01Role.trim();
  const lower = trimmed.toLowerCase();

  if ((A01_ROLE_IDS as readonly string[]).includes(lower)) {
    return lower as AgentRoleId;
  }

  for (const roleId of A01_ROLE_IDS) {
    const meta = AGENT_ROLE_ACCESSORIES[roleId];
    if (meta.a01 && meta.a01.toLowerCase() === lower) return roleId;
    if (meta.a01Also.some((alias) => alias.toLowerCase() === lower)) return roleId;
    if (meta.aliases.some((alias) => alias.toLowerCase() === lower)) return roleId;
  }

  if (rolesCatalog) {
    const match = rolesCatalog.find(
      (item) => item.id.toLowerCase() === lower || (item.openmausId && item.openmausId.toLowerCase() === lower),
    );
    if (match && (A01_ROLE_IDS as readonly string[]).includes(match.look)) {
      return match.look as AgentRoleId;
    }
  }

  return "worker";
}

export function spawnModeToA01Mode(spawnMode: A01SpawnMode): A01BindingMode {
  return spawnMode === "long-term-employee" ? "long-term" : "temporary";
}

export function a01ModeToSpawnMode(mode: A01BindingMode | undefined): A01SpawnMode {
  return mode === "long-term" ? "long-term-employee" : "temporary-worker";
}

/** Maps a canonical server `AgentComputerProviderId` to a `@xlabs/space-canvas` `SpaceComputerTarget`. */
export function providerToCanvasComputer(provider: string | undefined | null): SpaceComputerTarget {
  if (!provider) return "local-ax";
  const trimmed = provider.trim();
  if (isSpaceComputerTarget(trimmed)) return trimmed;
  switch (trimmed) {
    case "mac2-lume-vm":
      return "mac2-lume-isolated";
    case "local-cua-ax":
      return "local-ax";
    case "mac2-shared":
      return "mac2-shared";
    case "cua-cloud":
    case "daytona":
    case "orgo":
      return "cua-cloud";
    default:
      return "local-ax";
  }
}

/** Maps a `@xlabs/space-canvas` `SpaceComputerTarget` to a canonical `AgentComputerProviderId`. */
export function canvasComputerToProvider(target: SpaceComputerTarget | string | undefined): AgentComputerProviderId {
  switch (target) {
    case "mac2-lume-isolated":
    case "mac2-lume-vm":
      return "mac2-lume-vm";
    case "mac2-shared":
      return "mac2-shared";
    case "cua-cloud":
      return "cua-cloud";
    case "daytona":
      return "daytona";
    case "orgo":
      return "orgo";
    case "local-ax":
    case "local-cua-ax":
    default:
      return "local-cua-ax";
  }
}

export function mapC02Readiness(status: C02ReadinessStatus | undefined): C02ProjectReadiness {
  if (status === "red") return "red";
  if (status === "amber") return "orange";
  return "green";
}

/** Converts a fraction score like `"6/7"` or `"86%"` into an integer percentage `0..100`. */
export function parseReadinessPercent(score: string | number | undefined | null): number | undefined {
  if (typeof score === "number" && Number.isFinite(score)) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  if (typeof score !== "string" || !score.trim()) return undefined;
  const fraction = score.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den > 0) return Math.max(0, Math.min(100, Math.round((num / den) * 100)));
  }
  const pct = score.trim().match(/^(\d+(?:\.\d+)?)%?$/);
  if (pct) {
    return Math.max(0, Math.min(100, Math.round(Number(pct[1]))));
  }
  return undefined;
}

export function buildC02ProjectSummary(
  summary: C02ProjectSummaryItem,
  detail?: C02ProjectDetail,
): C02ProjectSummary {
  const channels: string[] = [];
  if (detail && detail.acquisitionChannels.length > 0) {
    for (const ch of detail.acquisitionChannels) {
      const label = (ch.channel || ch.howWeGetClients || "").trim();
      if (label && !channels.includes(label)) channels.push(label);
    }
  }
  if (channels.length === 0 && summary.counts.acquisitionChannels > 0) {
    channels.push(`${summary.counts.acquisitionChannels} channel${summary.counts.acquisitionChannels === 1 ? "" : "s"}`);
  }

  const liveRefs: C02ProjectLiveRef[] = [];
  const siteUrl = detail?.siteUrl ?? summary.siteUrl;
  const folderPath = detail?.folderPath ?? summary.folderPath;
  if (siteUrl) {
    liveRefs.push({ label: "Live Site", url: siteUrl });
  }
  if (detail?.funnels) {
    for (const funnel of detail.funnels) {
      if (funnel.entryUrl && funnel.entryUrl !== siteUrl) {
        liveRefs.push({ label: funnel.name || "Funnel", url: funnel.entryUrl });
      }
    }
  }
  if (folderPath) {
    liveRefs.push({ label: "C02 Folder", path: folderPath });
  }
  for (const wsRoot of summary.workspaceRoots.slice(0, 2)) {
    if (wsRoot && wsRoot !== folderPath) {
      const base = wsRoot.split("/").filter(Boolean).at(-1) || "Repo";
      liveRefs.push({ label: base, path: wsRoot });
    }
  }

  const readinessScore = parseReadinessPercent(detail?.readiness.score ?? summary.readinessScore);
  const productsCount = detail ? detail.products.length : summary.counts.products;

  return {
    slug: summary.slug,
    title: detail?.title || summary.title,
    readiness: mapC02Readiness(detail?.readiness.status ?? summary.readinessStatus),
    ...(readinessScore !== undefined ? { readinessScore } : {}),
    productsCount,
    channels,
    liveRefs: liveRefs.slice(0, 6),
  };
}

export function buildC02ProjectSummaries(
  projects: readonly C02ProjectSummaryItem[],
  detailsBySlug: ReadonlyMap<string, C02ProjectDetail>,
): C02ProjectSummary[] {
  return projects.map((item) => buildC02ProjectSummary(item, detailsBySlug.get(item.slug)));
}

function botHasOpenAsk(board: BoardState, botId: string): { hasAsk: boolean; askText?: string } {
  for (const goal of board.goals) {
    const openAsk = goal.asks.find((ask) => ask.status === "open" && ask.botId === botId);
    if (openAsk) {
      return { hasAsk: true, askText: openAsk.text };
    }
  }
  return { hasAsk: false };
}

function inferBotRoleId(
  bot: Bot,
  binding: BotA01Binding | undefined,
  rolesCatalog?: readonly A01RoleListItem[],
): AgentRoleId {
  if (binding?.role) {
    return a01RoleToRoleId(binding.role, rolesCatalog);
  }
  if (bot.chiefOfStaff) return "ea";
  const hint = `${bot.title ?? ""} ${bot.name ?? ""}`.trim();
  const matched = a01RoleToRoleId(hint, rolesCatalog);
  return matched === "worker" && !hint.toLowerCase().includes("worker") ? "agent" : matched;
}

export function buildSpaceAgents(
  board: BoardState,
  bots: readonly Bot[],
  rolesCatalog?: readonly A01RoleListItem[],
): SpaceAgent[] {
  return bots.map((bot) => {
    const binding = board.botBindings?.[bot.id];
    const roleId = inferBotRoleId(bot, binding, rolesCatalog);
    const { hasAsk, askText } = botHasOpenAsk(board, bot.id);
    const liveBusy = Boolean(bot.busy);
    const liveAttention = !liveBusy && hasAsk;
    return {
      id: bot.id,
      unifiedTabId: bot.id,
      name: bot.name,
      role: roleId,
      agent: binding?.role ?? roleId,
      kind: "agent",
      busy: liveBusy,
      attention: liveAttention,
      liveBusy,
      liveAttention,
      ...(bot.activity ? { activity: bot.activity } : {}),
      ...(askText ? { askText } : {}),
    };
  });
}

/** Encodes a bot/thread pair into a stable `sessionId` for `SessionNodeCard` and `PinnedSessionsLayer`. */
export function formatBotSessionId(botId: string, threadId?: string): string {
  return threadId ? `${botId}::${threadId}` : botId;
}

export function parseBotSessionId(sessionId: string): { botId: string; threadId?: string } {
  const sep = sessionId.indexOf("::");
  if (sep < 0) return { botId: sessionId };
  return {
    botId: sessionId.slice(0, sep),
    threadId: sessionId.slice(sep + 2) || undefined,
  };
}

export function buildDraggableSessions(
  board: BoardState,
  bots: readonly Bot[],
  rolesCatalog?: readonly A01RoleListItem[],
): DraggableSessionSummary[] {
  const pinnedSet = new Set(board.pinnedSessions ?? []);
  const sessions: DraggableSessionSummary[] = [];

  for (const bot of bots) {
    const binding = board.botBindings?.[bot.id];
    const roleId = inferBotRoleId(bot, binding, rolesCatalog);
    const { hasAsk, askText } = botHasOpenAsk(board, bot.id);
    const placedGoalId = board.placements[bot.id];
    const placedGoal = placedGoalId ? board.goals.find((g) => g.id === placedGoalId) : undefined;
    const projectSlug = binding?.projectSlug ?? placedGoal?.projectSlug;
    const computer = providerToCanvasComputer(binding?.computerProvider ?? placedGoal?.defaultComputerProvider);
    const modePrefix = binding
      ? binding.mode === "long-term"
        ? "🧠 Long-Term"
        : "⚡ Temporary"
      : undefined;

    const openTasks = (bot.tasks ?? []).filter((task) => !task.archivedAt);
    if (openTasks.length === 0) {
      const sessionId = formatBotSessionId(bot.id, bot.threadId);
      const status: SpaceNodeLiveStatus = bot.busy ? "working" : hasAsk ? "waiting" : "idle";
      const activityText = askText || bot.activity || (placedGoal ? `In ${placedGoal.title}` : "Ready on bench");
      sessions.push({
        sessionId,
        sessionKind: "openmanus-thread",
        title: bot.name,
        roleId,
        agentName: bot.name,
        status,
        workingLine: modePrefix ? `${modePrefix} · ${activityText}` : activityText,
        ...(projectSlug ? { projectSlug } : {}),
        computer,
        pinned: pinnedSet.has(sessionId) || pinnedSet.has(bot.id),
      });
      continue;
    }

    for (const task of openTasks) {
      const sessionId = formatBotSessionId(bot.id, task.threadId);
      const threadGoalId = board.threadGoals[task.threadId] ?? placedGoalId;
      const threadGoal = threadGoalId ? board.goals.find((g) => g.id === threadGoalId) : undefined;
      const busy = task.busy ?? (bot.threadId === task.threadId ? bot.busy : false);
      const status: SpaceNodeLiveStatus = busy ? "working" : hasAsk ? "waiting" : "idle";
      const lineBase =
        askText ||
        task.activity ||
        (threadGoal ? `Space: ${threadGoal.title}` : `${bot.name} thread`);
      sessions.push({
        sessionId,
        sessionKind: "openmanus-thread",
        title: task.title ? `${bot.name} · ${task.title}` : bot.name,
        roleId,
        agentName: bot.name,
        status,
        workingLine: modePrefix ? `${modePrefix} · ${lineBase}` : lineBase,
        ...((binding?.projectSlug ?? threadGoal?.projectSlug)
          ? { projectSlug: binding?.projectSlug ?? threadGoal?.projectSlug }
          : {}),
        computer,
        pinned: pinnedSet.has(sessionId) || pinnedSet.has(task.threadId),
      });
    }
  }

  return sessions;
}

export function serverNodeToWhiteboardNode(
  node: SpaceCanvasNode,
  opts: {
    board: BoardState;
    bots: readonly Bot[];
    rolesCatalog?: readonly A01RoleListItem[];
    c02BySlug?: ReadonlyMap<string, C02ProjectSummary>;
  },
): WhiteboardCanvasNode | null {
  const { board, bots, rolesCatalog, c02BySlug } = opts;
  const pinnedSet = new Set(board.pinnedSessions ?? []);
  const meta = (node.meta ?? {}) as Record<string, unknown>;

  if (node.kind === "session") {
    const bot = node.botId ? bots.find((b) => b.id === node.botId) : undefined;
    const binding = node.botId ? board.botBindings?.[node.botId] : undefined;
    const sessionId =
      typeof meta.sessionId === "string" && meta.sessionId
        ? meta.sessionId
        : node.botId
          ? formatBotSessionId(node.botId, node.threadId)
          : node.id;
    const roleId =
      node.a01Role || binding?.role
        ? a01RoleToRoleId(node.a01Role ?? binding?.role, rolesCatalog)
        : bot
          ? inferBotRoleId(bot, binding, rolesCatalog)
          : undefined;
    const { hasAsk, askText } = bot ? botHasOpenAsk(board, bot.id) : { hasAsk: false, askText: undefined };
    const status: SpaceNodeLiveStatus = bot?.busy
      ? "working"
      : hasAsk
        ? "waiting"
        : meta.status === "working" || meta.status === "waiting" || meta.status === "done"
          ? meta.status
          : "idle";
    const sessionNode: SessionCanvasNode = {
      id: node.id,
      kind: "session",
      x: node.layout.x,
      y: node.layout.y,
      w: node.layout.w,
      h: node.layout.h,
      sessionId,
      sessionKind:
        meta.sessionKind === "orca-terminal" || meta.sessionKind === "orca-agent"
          ? meta.sessionKind
          : "openmanus-thread",
      title: node.title || bot?.name || sessionId,
      ...(roleId ? { roleId } : {}),
      ...(bot?.name ? { agentName: bot.name } : typeof meta.agentName === "string" ? { agentName: meta.agentName } : {}),
      status,
      workingLine:
        askText ||
        bot?.activity ||
        (typeof meta.workingLine === "string" ? meta.workingLine : undefined),
      ...((node.projectSlug ?? binding?.projectSlug)
        ? { projectSlug: node.projectSlug ?? binding?.projectSlug }
        : {}),
      computer: providerToCanvasComputer(node.computerProvider ?? binding?.computerProvider),
      pinned: pinnedSet.has(sessionId) || Boolean(meta.pinned),
      createdAt: node.createdAt,
    };
    return sessionNode;
  }

  if (node.kind === "a01-agent") {
    const bot = node.botId ? bots.find((b) => b.id === node.botId) : undefined;
    const binding = node.botId ? board.botBindings?.[node.botId] : undefined;
    const roleId = a01RoleToRoleId(node.a01Role ?? binding?.role, rolesCatalog);
    const mode = node.a01Mode ?? binding?.mode ?? "temporary";
    const { hasAsk, askText } = bot ? botHasOpenAsk(board, bot.id) : { hasAsk: false, askText: undefined };
    const status: SpaceNodeLiveStatus = bot?.busy
      ? "working"
      : hasAsk
        ? "waiting"
        : meta.status === "working" || meta.status === "waiting" || meta.status === "done"
          ? meta.status
          : "idle";
    const sessionId = node.botId
      ? formatBotSessionId(node.botId, node.threadId ?? bot?.threadId)
      : typeof meta.sessionId === "string"
        ? meta.sessionId
        : undefined;
    const agentNode: AgentCanvasNode = {
      id: node.id,
      kind: "agent",
      x: node.layout.x,
      y: node.layout.y,
      w: node.layout.w,
      h: node.layout.h,
      roleId,
      title: node.title || bot?.name || AGENT_ROLE_ACCESSORIES[roleId].label,
      spawnMode: a01ModeToSpawnMode(mode),
      ...((node.projectSlug ?? binding?.projectSlug)
        ? { projectSlug: node.projectSlug ?? binding?.projectSlug }
        : {}),
      computer: providerToCanvasComputer(node.computerProvider ?? binding?.computerProvider),
      status,
      workingLine:
        askText ||
        bot?.activity ||
        (typeof meta.workingLine === "string"
          ? meta.workingLine
          : mode === "long-term"
            ? `A01/${binding?.role ?? node.a01Role ?? roleIdToA01Role(roleId)} + fleet.db Hindsight ready`
            : "Ephemeral C01 worker ready"),
      ...(sessionId ? { sessionId } : {}),
      ...(typeof meta.modelId === "string" ? { modelId: meta.modelId } : {}),
      createdAt: node.createdAt,
    };
    return agentNode;
  }

  if (node.kind === "c02-project") {
    const slug = node.projectSlug || "x-labs";
    const enriched = c02BySlug?.get(slug);
    const readiness: C02ProjectReadiness =
      enriched?.readiness ??
      (meta.readiness === "orange" || meta.readiness === "red" ? meta.readiness : "green");
    const readinessScore =
      enriched?.readinessScore ??
      (typeof meta.readinessScore === "number" ? meta.readinessScore : undefined);
    const productsCount =
      enriched?.productsCount ??
      (typeof meta.productsCount === "number" ? meta.productsCount : 0);
    const channels =
      enriched && enriched.channels.length > 0
        ? [...enriched.channels]
        : Array.isArray(meta.channels)
          ? meta.channels.filter((c): c is string => typeof c === "string")
          : [];
    const liveRefs: C02ProjectLiveRef[] =
      enriched && enriched.liveRefs.length > 0
        ? enriched.liveRefs.map((ref) => ({ ...ref }))
        : Array.isArray(meta.liveRefs)
          ? (meta.liveRefs as C02ProjectLiveRef[])
          : [];

    const projectNode: ProjectCanvasNode = {
      id: node.id,
      kind: "project",
      x: node.layout.x,
      y: node.layout.y,
      w: node.layout.w,
      h: node.layout.h,
      projectSlug: slug,
      title: enriched?.title || node.title || slug,
      readiness,
      ...(readinessScore !== undefined ? { readinessScore } : {}),
      productsCount,
      channels,
      liveRefs,
      createdAt: node.createdAt,
    };
    return projectNode;
  }

  return null;
}

export function whiteboardNodeToServerInput(
  node: WhiteboardCanvasNode,
  prevServerNode?: SpaceCanvasNode,
): CanvasNodeInput {
  const layout = { x: node.x, y: node.y, w: node.w, h: node.h };
  if (node.kind === "session") {
    const parsed = parseBotSessionId(node.sessionId);
    const botId = prevServerNode?.botId ?? (/^[\w-]{1,80}$/.test(parsed.botId) ? parsed.botId : undefined);
    const threadId = prevServerNode?.threadId ?? parsed.threadId;
    return {
      id: node.id,
      kind: "session",
      title: node.title,
      layout,
      ...(botId ? { botId } : {}),
      ...(threadId ? { threadId } : {}),
      ...(node.roleId ? { a01Role: prevServerNode?.a01Role ?? roleIdToA01Role(node.roleId) } : {}),
      ...(node.projectSlug ? { projectSlug: node.projectSlug } : {}),
      computerProvider:
        prevServerNode?.computerProvider &&
        providerToCanvasComputer(prevServerNode.computerProvider) === node.computer
          ? prevServerNode.computerProvider
          : canvasComputerToProvider(node.computer),
      ...(prevServerNode?.computerLeaseId ? { computerLeaseId: prevServerNode.computerLeaseId } : {}),
      meta: {
        ...prevServerNode?.meta,
        sessionId: node.sessionId,
        sessionKind: node.sessionKind,
        ...(node.agentName ? { agentName: node.agentName } : {}),
        status: node.status,
        ...(node.workingLine ? { workingLine: node.workingLine } : {}),
        ...(node.pinned !== undefined ? { pinned: node.pinned } : {}),
      },
    };
  }

  if (node.kind === "agent") {
    return {
      id: node.id,
      kind: "a01-agent",
      title: node.title,
      layout,
      ...(prevServerNode?.botId ? { botId: prevServerNode.botId } : {}),
      ...(prevServerNode?.threadId ? { threadId: prevServerNode.threadId } : {}),
      a01Role: prevServerNode?.a01Role ?? roleIdToA01Role(node.roleId),
      a01Mode: spawnModeToA01Mode(node.spawnMode),
      ...(node.projectSlug ? { projectSlug: node.projectSlug } : {}),
      computerProvider:
        prevServerNode?.computerProvider &&
        providerToCanvasComputer(prevServerNode.computerProvider) === node.computer
          ? prevServerNode.computerProvider
          : canvasComputerToProvider(node.computer),
      ...(prevServerNode?.computerLeaseId ? { computerLeaseId: prevServerNode.computerLeaseId } : {}),
      meta: {
        ...prevServerNode?.meta,
        status: node.status,
        ...(node.workingLine ? { workingLine: node.workingLine } : {}),
        ...(node.sessionId ? { sessionId: node.sessionId } : {}),
        ...(node.modelId ? { modelId: node.modelId } : {}),
      },
    };
  }

  return {
    id: node.id,
    kind: "c02-project",
    title: node.title,
    layout,
    projectSlug: node.projectSlug,
    meta: {
      ...prevServerNode?.meta,
      readiness: node.readiness,
      ...(node.readinessScore !== undefined ? { readinessScore: node.readinessScore } : {}),
      productsCount: node.productsCount,
      channels: node.channels,
      liveRefs: node.liveRefs,
    },
  };
}

export function serverGoalToWhiteboardGoal(goal: SpaceGoal): WhiteboardGoal {
  return {
    id: goal.id,
    title: goal.title,
    ...(goal.icon ? { emoji: goal.icon } : {}),
    goal: goal.goal,
    level: goal.level,
    outcomes: goal.outcomes.map((o) => ({ text: o.text, done: o.done })),
    roadmap: [...goal.roadmap],
    tasks: goal.tasks.map((task) => ({
      id: task.id,
      text: task.text,
      ...(task.botId ? { botId: task.botId } : {}),
      done: task.done,
      createdAt: task.createdAt,
    })),
    asks: goal.asks.map((ask) => ({
      id: ask.id,
      botId: ask.botId,
      goalId: goal.id,
      ...(ask.forBotId ? { forBotId: ask.forBotId } : {}),
      text: ask.text,
      at: ask.at,
      status: ask.status,
      ...(ask.taskId ? { taskId: ask.taskId } : {}),
    })),
    status: goal.status,
    sortOrder: goal.sortOrder,
    ...(goal.kanbanCard ? { kanbanCard: goal.kanbanCard } : {}),
    ...(goal.jobPath ? { jobPath: goal.jobPath } : {}),
    ...(goal.layout ? { layout: goal.layout } : {}),
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

export function serverNoteToSticky(note: SpaceCanvasNote): SpaceStickyNote {
  return {
    id: note.id,
    text: note.text,
    color: noteColorToStickyColor(note.color),
    kind: "note",
    x: note.layout.x,
    y: note.layout.y,
    w: note.layout.w,
    h: note.layout.h,
    createdAt: note.createdAt,
  };
}

export function stickyToServerNoteInput(sticky: SpaceStickyNote): CanvasNoteInput {
  return {
    id: sticky.id,
    text: sticky.text.slice(0, 2000),
    color: stickyColorToNoteColor(sticky.color),
    layout: {
      x: Math.round(sticky.x),
      y: Math.round(sticky.y),
      w: Math.max(80, Math.round(sticky.w)),
      h: Math.max(60, Math.round(sticky.h)),
    },
  };
}

export function serverArrowToWhiteboardArrow(arrow: SpaceCanvasArrow): SpaceArrow {
  const validColor: StickyColor | undefined =
    arrow.color &&
    (["amber", "emerald", "sky", "rose", "violet", "indigo", "paper", "zinc"] as const).includes(
      arrow.color as StickyColor,
    )
      ? (arrow.color as StickyColor)
      : undefined;
  return {
    id: arrow.id,
    ...(arrow.fromId && arrow.fromId !== FREE_ARROW_SENTINEL ? { fromId: arrow.fromId } : {}),
    ...(arrow.toId && arrow.toId !== FREE_ARROW_SENTINEL ? { toId: arrow.toId } : {}),
    ...(arrow.fromPoint ? { fromPoint: arrow.fromPoint } : {}),
    ...(arrow.toPoint ? { toPoint: arrow.toPoint } : {}),
    ...(arrow.label ? { label: arrow.label } : {}),
    ...(validColor ? { color: validColor } : {}),
    createdAt: arrow.createdAt,
  };
}

export function whiteboardArrowToServerInput(arrow: SpaceArrow): CanvasArrowInput {
  return {
    id: arrow.id,
    fromId: arrow.fromId || FREE_ARROW_SENTINEL,
    toId: arrow.toId || FREE_ARROW_SENTINEL,
    ...(arrow.fromPoint ? { fromPoint: arrow.fromPoint } : {}),
    ...(arrow.toPoint ? { toPoint: arrow.toPoint } : {}),
    ...(arrow.label ? { label: arrow.label } : {}),
    ...(arrow.color ? { color: arrow.color } : {}),
  };
}

export function toWhiteboardSpaceState(opts: {
  board: BoardState;
  bots: readonly Bot[];
  activeProjectSlug?: string;
  rolesCatalog?: readonly A01RoleListItem[];
  c02BySlug?: ReadonlyMap<string, C02ProjectSummary>;
  rev?: number;
}): WhiteboardSpaceState {
  const { board, bots, activeProjectSlug, rolesCatalog, c02BySlug, rev = 1 } = opts;
  const placementNames: Record<string, string> = {};
  const agentRoles: Record<string, string> = {};
  for (const bot of bots) {
    placementNames[bot.id] = bot.name;
    const binding = board.botBindings?.[bot.id];
    agentRoles[bot.id] = inferBotRoleId(bot, binding, rolesCatalog);
  }

  const resolvedProjectSlug =
    activeProjectSlug ||
    board.goals.find((g) => g.projectSlug)?.projectSlug ||
    board.c02Projects?.[0]?.slug ||
    "x-labs";

  return {
    rev,
    projectSlug: resolvedProjectSlug,
    goals: board.goals.map(serverGoalToWhiteboardGoal),
    placements: { ...board.placements },
    placementNames,
    agentRoles,
    threadGoals: { ...board.threadGoals },
    log: board.log.map((entry) => ({ ...entry })),
    visualFirst: board.visualFirst,
    ...(board.bench ? { bench: board.bench } : {}),
    stickies: (board.canvasNotes ?? []).map(serverNoteToSticky),
    arrows: (board.canvasArrows ?? []).map(serverArrowToWhiteboardArrow),
    nodes: (board.canvasNodes ?? [])
      .map((node) => serverNodeToWhiteboardNode(node, { board, bots, rolesCatalog, c02BySlug }))
      .filter((node): node is WhiteboardCanvasNode => node !== null),
  };
}

function sameLayout(
  a?: { x: number; y: number; w: number; h: number },
  b?: { x: number; y: number; w: number; h: number },
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export interface WhiteboardSyncPlan {
  createdGoals: Array<{ tempId: string; input: GoalInput }>;
  patchedGoals: Array<{ id: string; patch: GoalPatch }>;
  deletedGoalIds: string[];
  placementChanges: Array<{ botId: string; goalId: string | null }>;
  benchPatch?: { x: number; y: number; w: number; h: number };
  batch: WhiteboardBatchInput | null;
}

/**
 * Computes the minimal set of server mutations between `prevBoard` and `nextCanvas`
 * when `<SpaceWhiteboard />` commits an edit, drag, resize, undo, or redo.
 */
export function diffWhiteboardSyncPlan(
  prevBoard: BoardState,
  nextCanvas: WhiteboardSpaceState,
  opts?: { skipNodeIds?: ReadonlySet<string> },
): WhiteboardSyncPlan {
  const skipNodeIds = opts?.skipNodeIds;
  const prevGoalsById = new Map(prevBoard.goals.map((g) => [g.id, g]));
  const nextGoalIds = new Set(nextCanvas.goals.map((g) => g.id));

  const createdGoals: Array<{ tempId: string; input: GoalInput }> = [];
  const patchedGoals: Array<{ id: string; patch: GoalPatch }> = [];
  const deletedGoalIds: string[] = [];

  for (const g of nextCanvas.goals) {
    const prev = prevGoalsById.get(g.id);
    if (!prev) {
      createdGoals.push({
        tempId: g.id,
        input: {
          title: g.title || "New Space",
          goal: g.goal || "",
          level: g.level,
          status: g.status,
          outcomes: g.outcomes.map((o) => ({ text: o.text, done: o.done })),
          roadmap: [...g.roadmap],
          ...(g.emoji ? { icon: g.emoji } : {}),
          ...(nextCanvas.projectSlug ? { projectSlug: nextCanvas.projectSlug } : {}),
          ...(g.jobPath ? { jobPath: g.jobPath } : {}),
          ...(g.layout ? { layout: g.layout } : {}),
        },
      });
      continue;
    }
    const patch: GoalPatch = {};
    if (g.title !== prev.title && g.title.trim()) patch.title = g.title.trim();
    if (g.goal !== prev.goal) patch.goal = g.goal;
    if (g.level !== prev.level) patch.level = g.level;
    if (g.status !== prev.status) patch.status = g.status;
    if ((g.emoji ?? null) !== (prev.icon ?? null)) patch.icon = g.emoji ?? null;
    if (!sameLayout(g.layout, prev.layout) && g.layout) patch.layout = g.layout;
    if (JSON.stringify(g.outcomes) !== JSON.stringify(prev.outcomes)) {
      patch.outcomes = g.outcomes.map((o) => ({ text: o.text, done: o.done }));
    }
    if (JSON.stringify(g.roadmap) !== JSON.stringify(prev.roadmap)) {
      patch.roadmap = [...g.roadmap];
    }
    if (Object.keys(patch).length > 0) {
      patchedGoals.push({ id: g.id, patch });
    }
  }

  for (const prev of prevBoard.goals) {
    if (!nextGoalIds.has(prev.id)) {
      deletedGoalIds.push(prev.id);
    }
  }

  const placementChanges: Array<{ botId: string; goalId: string | null }> = [];
  const allBotIds = new Set([
    ...Object.keys(prevBoard.placements),
    ...Object.keys(nextCanvas.placements),
  ]);
  for (const botId of allBotIds) {
    const before = prevBoard.placements[botId] ?? null;
    const after = nextCanvas.placements[botId] ?? null;
    if (before !== after) {
      // Skip placement onto an unsaved client-minted goal until that goal has its server ID
      if (after && !prevGoalsById.has(after)) continue;
      placementChanges.push({ botId, goalId: after });
    }
  }

  const benchPatch =
    nextCanvas.bench && !sameLayout(nextCanvas.bench, prevBoard.bench)
      ? nextCanvas.bench
      : undefined;

  // Notes <-> Stickies
  const prevNotesById = new Map((prevBoard.canvasNotes ?? []).map((n) => [n.id, n]));
  const nextStickies = nextCanvas.stickies ?? [];
  const nextStickyIds = new Set(nextStickies.map((s) => s.id));
  const addNotes: CanvasNoteInput[] = [];
  const patchNotes: Array<{ id: string; patch: CanvasNotePatch }> = [];
  const deleteNoteIds: string[] = [];

  for (const sticky of nextStickies) {
    const input = stickyToServerNoteInput(sticky);
    const prev = prevNotesById.get(sticky.id);
    if (!prev) {
      addNotes.push(input);
      continue;
    }
    const patch: CanvasNotePatch = {};
    if (input.text !== prev.text) patch.text = input.text;
    if (input.color !== prev.color) patch.color = input.color;
    if (!sameLayout(input.layout, prev.layout)) patch.layout = input.layout;
    if (Object.keys(patch).length > 0) {
      patchNotes.push({ id: sticky.id, patch });
    }
  }
  for (const prev of prevBoard.canvasNotes ?? []) {
    if (!nextStickyIds.has(prev.id)) deleteNoteIds.push(prev.id);
  }

  // Arrows
  const prevArrowsById = new Map((prevBoard.canvasArrows ?? []).map((a) => [a.id, a]));
  const nextArrows = nextCanvas.arrows ?? [];
  const nextArrowIds = new Set(nextArrows.map((a) => a.id));
  const addArrows: CanvasArrowInput[] = [];
  const patchArrows: Array<{ id: string; patch: CanvasArrowPatch }> = [];
  const deleteArrowIds: string[] = [];

  for (const arrow of nextArrows) {
    const input = whiteboardArrowToServerInput(arrow);
    const prev = prevArrowsById.get(arrow.id);
    if (!prev) {
      addArrows.push(input);
      continue;
    }
    const patch: CanvasArrowPatch = {};
    if (input.fromId !== prev.fromId) patch.fromId = input.fromId;
    if (input.toId !== prev.toId) patch.toId = input.toId;
    if ((input.label ?? null) !== (prev.label ?? null)) patch.label = input.label ?? null;
    if ((input.color ?? null) !== (prev.color ?? null)) patch.color = input.color ?? null;
    if (JSON.stringify(input.fromPoint ?? null) !== JSON.stringify(prev.fromPoint ?? null)) {
      patch.fromPoint = input.fromPoint ?? null;
    }
    if (JSON.stringify(input.toPoint ?? null) !== JSON.stringify(prev.toPoint ?? null)) {
      patch.toPoint = input.toPoint ?? null;
    }
    if (Object.keys(patch).length > 0) {
      patchArrows.push({ id: arrow.id, patch });
    }
  }
  for (const prev of prevBoard.canvasArrows ?? []) {
    if (!nextArrowIds.has(prev.id)) deleteArrowIds.push(prev.id);
  }

  // Nodes
  const prevNodesById = new Map((prevBoard.canvasNodes ?? []).map((n) => [n.id, n]));
  const nextNodes = nextCanvas.nodes ?? [];
  const nextNodeIds = new Set(nextNodes.map((n) => n.id));
  const addNodes: CanvasNodeInput[] = [];
  const patchNodes: Array<{ id: string; patch: CanvasNodePatch }> = [];
  const deleteNodeIds: string[] = [];

  for (const node of nextNodes) {
    if (skipNodeIds?.has(node.id)) continue;
    const prev = prevNodesById.get(node.id);
    const input = whiteboardNodeToServerInput(node, prev);
    if (!prev) {
      addNodes.push(input);
      continue;
    }
    const patch: CanvasNodePatch = {};
    if ((input.title ?? "") !== prev.title) patch.title = input.title ?? "";
    if (!sameLayout(input.layout, prev.layout)) patch.layout = input.layout;
    if ((input.projectSlug ?? null) !== (prev.projectSlug ?? null)) {
      patch.projectSlug = input.projectSlug ?? null;
    }
    if ((input.computerProvider ?? null) !== (prev.computerProvider ?? null)) {
      patch.computerProvider = input.computerProvider ?? null;
    }
    if ((input.a01Mode ?? null) !== (prev.a01Mode ?? null) && input.a01Mode) {
      patch.a01Mode = input.a01Mode;
    }
    if (JSON.stringify(input.meta ?? {}) !== JSON.stringify(prev.meta ?? {})) {
      patch.meta = input.meta ?? null;
    }
    if (Object.keys(patch).length > 0) {
      patchNodes.push({ id: node.id, patch });
    }
  }
  for (const prev of prevBoard.canvasNodes ?? []) {
    if (skipNodeIds?.has(prev.id)) continue;
    if (!nextNodeIds.has(prev.id)) deleteNodeIds.push(prev.id);
  }

  const hasBatch =
    addNotes.length > 0 ||
    patchNotes.length > 0 ||
    deleteNoteIds.length > 0 ||
    addArrows.length > 0 ||
    patchArrows.length > 0 ||
    deleteArrowIds.length > 0 ||
    addNodes.length > 0 ||
    patchNodes.length > 0 ||
    deleteNodeIds.length > 0;

  const batch: WhiteboardBatchInput | null = hasBatch
    ? {
        ...(addNotes.length > 0 ? { addNotes } : {}),
        ...(patchNotes.length > 0 ? { patchNotes } : {}),
        ...(deleteNoteIds.length > 0 ? { deleteNoteIds } : {}),
        ...(addArrows.length > 0 ? { addArrows } : {}),
        ...(patchArrows.length > 0 ? { patchArrows } : {}),
        ...(deleteArrowIds.length > 0 ? { deleteArrowIds } : {}),
        ...(addNodes.length > 0 ? { addNodes } : {}),
        ...(patchNodes.length > 0 ? { patchNodes } : {}),
        ...(deleteNodeIds.length > 0 ? { deleteNodeIds } : {}),
      }
    : null;

  return {
    createdGoals,
    patchedGoals,
    deletedGoalIds,
    placementChanges,
    ...(benchPatch ? { benchPatch } : {}),
    batch,
  };
}

/** Optimistically projects a `WhiteboardSpaceState` back onto `BoardState` so UI updates feel instantaneous. */
export function applyWhiteboardOptimisticBoard(
  prevBoard: BoardState,
  nextCanvas: WhiteboardSpaceState,
): BoardState {
  const prevGoalsById = new Map(prevBoard.goals.map((g) => [g.id, g]));
  const prevNotesById = new Map((prevBoard.canvasNotes ?? []).map((n) => [n.id, n]));
  const prevArrowsById = new Map((prevBoard.canvasArrows ?? []).map((a) => [a.id, a]));
  const prevNodesById = new Map((prevBoard.canvasNodes ?? []).map((n) => [n.id, n]));
  const now = Date.now();

  const goals: SpaceGoal[] = nextCanvas.goals.map((g) => {
    const existing = prevGoalsById.get(g.id);
    return {
      id: g.id,
      title: g.title,
      goal: g.goal,
      ...(g.emoji ? { icon: g.emoji } : {}),
      level: g.level,
      outcomes: g.outcomes.map((o) => ({ text: o.text, done: o.done })),
      roadmap: [...g.roadmap],
      tasks: existing?.tasks ?? [],
      asks: existing?.asks ?? [],
      status: g.status,
      sortOrder: g.sortOrder,
      ...(g.kanbanCard ? { kanbanCard: g.kanbanCard } : existing?.kanbanCard ? { kanbanCard: existing.kanbanCard } : {}),
      ...(g.jobPath ? { jobPath: g.jobPath } : existing?.jobPath ? { jobPath: existing.jobPath } : {}),
      ...(existing?.projectSlug
        ? { projectSlug: existing.projectSlug }
        : nextCanvas.projectSlug
          ? { projectSlug: nextCanvas.projectSlug }
          : {}),
      ...(existing?.defaultComputerProvider ? { defaultComputerProvider: existing.defaultComputerProvider } : {}),
      ...(g.layout ? { layout: g.layout } : {}),
      createdAt: existing?.createdAt ?? g.createdAt ?? now,
      updatedAt: now,
    };
  });

  const canvasNotes: SpaceCanvasNote[] = (nextCanvas.stickies ?? []).map((s) => {
    const existing = prevNotesById.get(s.id);
    const input = stickyToServerNoteInput(s);
    return {
      id: s.id,
      text: input.text ?? "",
      color: input.color ?? "yellow",
      layout: input.layout,
      createdAt: existing?.createdAt ?? s.createdAt ?? now,
      updatedAt: now,
    };
  });

  const canvasArrows: SpaceCanvasArrow[] = (nextCanvas.arrows ?? []).map((a) => {
    const existing = prevArrowsById.get(a.id);
    const input = whiteboardArrowToServerInput(a);
    return {
      id: a.id,
      fromId: input.fromId,
      toId: input.toId,
      ...(input.fromPoint ? { fromPoint: input.fromPoint } : {}),
      ...(input.toPoint ? { toPoint: input.toPoint } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.color ? { color: input.color } : {}),
      createdAt: existing?.createdAt ?? a.createdAt ?? now,
      updatedAt: now,
    };
  });

  const canvasNodes: SpaceCanvasNode[] = (nextCanvas.nodes ?? []).map((n) => {
    const existing = prevNodesById.get(n.id);
    const input = whiteboardNodeToServerInput(n, existing);
    return {
      id: n.id,
      kind: input.kind,
      title: input.title ?? "",
      layout: input.layout,
      ...(input.botId ? { botId: input.botId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.a01Role ? { a01Role: input.a01Role } : {}),
      ...(input.a01Mode ? { a01Mode: input.a01Mode } : {}),
      ...(input.projectSlug ? { projectSlug: input.projectSlug } : {}),
      ...(input.computerProvider ? { computerProvider: input.computerProvider } : {}),
      ...(input.computerLeaseId ? { computerLeaseId: input.computerLeaseId } : {}),
      ...(input.meta ? { meta: input.meta } : {}),
      createdAt: existing?.createdAt ?? n.createdAt ?? now,
      updatedAt: now,
    };
  });

  return {
    ...prevBoard,
    goals,
    placements: { ...nextCanvas.placements },
    ...(nextCanvas.bench ? { bench: nextCanvas.bench } : {}),
    canvasNotes,
    canvasArrows,
    canvasNodes,
  };
}
