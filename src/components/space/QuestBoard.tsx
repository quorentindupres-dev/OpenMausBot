import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Download, Plus, ScanSearch, Server, StickyNote, Users, X } from "lucide-react";
import {
  AGENT_ROLE_ACCESSORIES,
  getPinnedState,
  pinSession,
  readCustomEmojiFile,
  unpinSession,
  type A01SpawnRequest,
  type C02ProjectSummary,
  type DraggableSessionSummary,
  type PinnedSession,
  type PinnedSessionBodyRenderOpts,
  type SpaceAgent,
  type SpaceCanvasHostAdapter,
  type SpaceGoal as WhiteboardGoal,
  type SpaceState as WhiteboardSpaceState,
} from "@xlabs/space-canvas";
import { useStore, type Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Point } from "@/lib/team-canvas";
import { ChatView } from "../ChatView";
import type { SpaceGoal, SpaceLayout, SpaceLevel } from "../../../shared/space";
import { AgentComputersModal } from "./AgentComputersModal";
import { GoalEditor } from "./GoalEditor";
import { HireA01AgentModal } from "./HireA01AgentModal";
import { LevelChip } from "./LevelChip";
import { SpaceCanvas } from "./SpaceCanvas";
import { SpaceCard, type SpaceCardActions } from "./SpaceCard";
import { ZoneContextMenu, type ZoneMenuTarget } from "./ZoneContextMenu";
import {
  addTask,
  answerAsk,
  applyWhiteboardBatch,
  askChiefToScan,
  bindBotA01Role,
  createCanvasNode,
  createCanvasNote,
  createGoal,
  createGoalThread,
  deleteGoal,
  deleteTask,
  fetchA01Roles,
  fetchC02ProjectDetail,
  fetchC02Projects,
  hireA01Agent,
  importKanban,
  linkThread,
  loadThread,
  newAgentInSpace,
  patchTask,
  placeBot,
  savePinnedSessions,
  setBench,
  setVisualFirst,
  spaceSlots,
  spaceThreads,
  updateCanvasNode,
  updateGoal,
  useSpace,
  zoneBots,
  type A01RoleListItem,
  type BoardState,
  type C02ProjectDetail,
  type C02ProjectSummaryItem,
  type HireA01AgentResult,
  type KnownThread,
} from "./space-api";
import { showQuestBoard, useQuestBoard } from "./space-ui-state";
import {
  applyWhiteboardOptimisticBoard,
  buildC02ProjectSummaries,
  buildC02ProjectSummary,
  buildDraggableSessions,
  buildSpaceAgents,
  canvasComputerToProvider,
  diffWhiteboardSyncPlan,
  formatBotSessionId,
  parseBotSessionId,
  roleIdToA01Role,
  spawnModeToA01Mode,
  toWhiteboardSpaceState,
} from "./whiteboard-bridge";

export { useQuestBoard };

const NOTES_ON_CARD = 3;

export function QuestBoardToggle() {
  const on = useQuestBoard();
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={on === value}
      onClick={() => showQuestBoard(value)}
      className={cn(
        "rounded-md px-2.5 py-1 text-[12px] font-medium",
        on === value ? "bg-panel text-ink shadow-sm" : "text-ink-secondary hover:text-ink",
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={t("quest.toggleAria")} className="flex items-center gap-0.5 rounded-lg bg-control p-0.5">
      {option(false, t("quest.toggle.map"))}
      {option(true, t("quest.toggle.board"))}
    </div>
  );
}

type Editing = { goal?: SpaceGoal; level?: SpaceLevel; at?: Point } | null;
type ActiveSpaceChat = { botId: string; threadId?: string; goalId?: string; title?: string };
type SpaceMenu = { kind: "space"; threadId?: string } & ZoneMenuTarget;

function withPlacement(space: BoardState, botId: string, goalId: string | null): BoardState {
  const { [botId]: _previous, ...rest } = space.placements;
  return { ...space, placements: goalId ? { ...rest, [botId]: goalId } : rest };
}

function withThreadGoal(space: BoardState, threadId: string, goalId: string | null): BoardState {
  const { [threadId]: _previous, ...rest } = space.threadGoals;
  return { ...space, threadGoals: goalId ? { ...rest, [threadId]: goalId } : rest };
}

function nextThreadTitle(goalTitle: string, existingTitles: readonly (string | undefined)[]): string {
  if (existingTitles.length === 0) return goalTitle;
  const used = new Set(existingTitles.filter(Boolean));
  let n = existingTitles.length + 1;
  while (used.has(`${goalTitle} #${n}`)) n += 1;
  return `${goalTitle} #${n}`;
}

const BUTTON =
  "flex items-center gap-1.5 rounded-lg border border-hairline/60 bg-panel px-3 py-1.5 text-[12px] font-medium hover:bg-control disabled:opacity-50";

export function QuestBoard({ bots }: { bots: Bot[] }) {
  const { state, dispatch } = useStore();
  const { space, error: loadError, refresh, setSpace } = useSpace();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [menu, setMenu] = useState<SpaceMenu | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chat, setChat] = useState<ActiveSpaceChat | null>(null);
  const [knownThreads, setKnownThreads] = useState<Record<string, KnownThread>>({});
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [computersModal, setComputersModal] = useState<{
    open: boolean;
    nodeId?: string;
    targetLabel?: string;
    currentProvider?: string;
  }>({ open: false });

  // Live A01 roles + C02 projects enrichment state
  const [a01Roles, setA01Roles] = useState<A01RoleListItem[]>([]);
  const [c02Catalog, setC02Catalog] = useState<C02ProjectSummaryItem[]>([]);
  const [c02Details, setC02Details] = useState<Map<string, C02ProjectDetail>>(() => new Map());
  const [activeProjectSlug, setActiveProjectSlug] = useState<string>("");
  const [whiteboardRev, setWhiteboardRev] = useState(1);

  const spaceRef = useRef(space);
  spaceRef.current = space;
  const c02DetailsRef = useRef(c02Details);
  c02DetailsRef.current = c02Details;
  const fetchingC02SlugsRef = useRef<Set<string>>(new Set());
  const inFlightBatchRef = useRef<Promise<unknown> | null>(null);
  const pendingSeq = useRef(0);
  const loadSeq = useRef(0);
  const chatRef = useRef<ActiveSpaceChat | null>(null);
  chatRef.current = chat;

  const chief = bots.find((bot) => bot.chiefOfStaff);
  const opened = space.goals.find((goal) => goal.id === openId);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (state.settingsOpen) setChat(null);
  }, [state.settingsOpen]);

  // Load A01 roles & C02 projects catalog once on mount
  useEffect(() => {
    let cancelled = false;
    void fetchA01Roles()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.roles)) {
          setA01Roles(res.roles);
        }
      })
      .catch(() => {});
    void fetchC02Projects()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.projects)) {
          setC02Catalog(res.projects);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedC02List = useMemo<readonly C02ProjectSummaryItem[]>(
    () => (space.c02Projects && space.c02Projects.length > 0 ? space.c02Projects : c02Catalog),
    [c02Catalog, space.c02Projects],
  );

  const resolvedActiveProjectSlug = useMemo(() => {
    if (activeProjectSlug) return activeProjectSlug;
    const fromOpen = opened?.projectSlug;
    if (fromOpen) return fromOpen;
    const fromGoal = space.goals.find((g) => g.projectSlug)?.projectSlug;
    if (fromGoal) return fromGoal;
    return mergedC02List[0]?.slug ?? "x-labs";
  }, [activeProjectSlug, mergedC02List, opened?.projectSlug, space.goals]);

  const ensureC02Detail = useCallback((slug: string) => {
    const clean = slug.trim();
    if (!clean || c02DetailsRef.current.has(clean) || fetchingC02SlugsRef.current.has(clean)) {
      return;
    }
    fetchingC02SlugsRef.current.add(clean);
    void fetchC02ProjectDetail(clean)
      .then((res) => {
        if (res?.project?.slug) {
          setC02Details((prev) => {
            const next = new Map(prev);
            next.set(res.project.slug, res.project);
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        fetchingC02SlugsRef.current.delete(clean);
      });
  }, []);

  // Lazily enrich active C02 project + any dropped C02 project nodes with 7-pillar details
  useEffect(() => {
    if (resolvedActiveProjectSlug) {
      ensureC02Detail(resolvedActiveProjectSlug);
    }
    for (const node of space.canvasNodes ?? []) {
      if (node.kind === "c02-project" && node.projectSlug) {
        ensureC02Detail(node.projectSlug);
      }
    }
  }, [ensureC02Detail, resolvedActiveProjectSlug, space.canvasNodes]);

  // Hydrate @xlabs/space-canvas PinnedSessionsLayer from server pinnedSessions
  useEffect(() => {
    const pinnedIds = space.pinnedSessions ?? [];
    if (pinnedIds.length === 0) return;
    const current = new Set(getPinnedState().pins.map((p) => p.tabId));
    for (const sessionId of pinnedIds) {
      if (current.has(sessionId)) continue;
      const { botId } = parseBotSessionId(sessionId);
      const matchedBot = bots.find((b) => b.id === botId);
      pinSession({
        tabId: sessionId,
        worktreeId: resolvedActiveProjectSlug || "openmaus",
        kind: "agent",
        name: matchedBot?.name || sessionId,
      });
    }
  }, [bots, resolvedActiveProjectSlug, space.pinnedSessions]);

  const c02Summaries = useMemo<C02ProjectSummary[]>(
    () => buildC02ProjectSummaries(mergedC02List, c02Details),
    [c02Details, mergedC02List],
  );

  const c02BySlug = useMemo<ReadonlyMap<string, C02ProjectSummary>>(
    () => new Map(c02Summaries.map((item) => [item.slug, item])),
    [c02Summaries],
  );

  const draggableSessions = useMemo<DraggableSessionSummary[]>(
    () => buildDraggableSessions(space, bots, a01Roles),
    [a01Roles, bots, space],
  );

  const spaceAgents = useMemo<SpaceAgent[]>(
    () => buildSpaceAgents(space, bots, a01Roles),
    [a01Roles, bots, space],
  );

  const whiteboardState = useMemo<WhiteboardSpaceState>(
    () =>
      toWhiteboardSpaceState({
        board: space,
        bots,
        activeProjectSlug: resolvedActiveProjectSlug,
        rolesCatalog: a01Roles,
        c02BySlug,
        rev: whiteboardRev,
      }),
    [a01Roles, bots, c02BySlug, resolvedActiveProjectSlug, space, whiteboardRev],
  );

  const whiteboardStateRef = useRef(whiteboardState);
  whiteboardStateRef.current = whiteboardState;

  const fail = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);

  const act = useCallback(
    (work: Promise<unknown>) => {
      setError(null);
      void work.catch(fail).finally(() => void refresh());
    },
    [fail, refresh],
  );

  const openSessionConversation = useCallback(
    (sessionId: string) => {
      const { botId: parsedBotId, threadId: parsedThreadId } = parseBotSessionId(sessionId);
      let targetBot = bots.find((b) => b.id === parsedBotId);
      let targetThreadId = parsedThreadId;

      if (!targetBot) {
        const node = (spaceRef.current.canvasNodes ?? []).find(
          (n) => n.id === sessionId || (n.meta && n.meta.sessionId === sessionId),
        );
        if (node?.botId) {
          targetBot = bots.find((b) => b.id === node.botId);
          targetThreadId = targetThreadId ?? node.threadId;
        }
      }
      if (!targetBot) return;

      const resolvedThread = targetThreadId ?? targetBot.threadId;
      const goalId =
        (resolvedThread ? spaceRef.current.threadGoals[resolvedThread] : undefined) ??
        spaceRef.current.placements[targetBot.id];
      const goal = goalId ? spaceRef.current.goals.find((g) => g.id === goalId) : undefined;
      const taskTitle = resolvedThread
        ? targetBot.tasks?.find((item) => item.threadId === resolvedThread)?.title
        : undefined;

      setOpenId(null);
      setError(null);
      dispatch({ type: "toggleSettings", botId: targetBot.id, open: false });

      const seq = ++loadSeq.current;
      if (resolvedThread) {
        setChat({
          botId: targetBot.id,
          threadId: resolvedThread,
          ...(goal ? { goalId: goal.id } : {}),
          title: taskTitle ?? goal?.title ?? targetBot.title ?? targetBot.name,
        });
        if (!resolvedThread.startsWith("pending-")) {
          void loadThread(targetBot.id, resolvedThread)
            .then((res) => {
              if (loadSeq.current === seq && res?.bot?.id) {
                dispatch({ type: "taskSwitched", bot: res.bot });
              }
            })
            .catch(fail);
        }
        return;
      }

      if (goal) {
        setChat({ botId: targetBot.id, goalId: goal.id, title: goal.title });
        void createGoalThread(targetBot.id, goal, goal.title)
          .then(({ threadId, bot: updated, title }) => {
            if (updated?.id) dispatch({ type: "botPatched", bot: updated });
            setKnownThreads((prev) => ({ ...prev, [threadId]: { botId: targetBot!.id, title, goalId: goal.id } }));
            setSpace((prev) => withThreadGoal(prev, threadId, goal.id));
            if (loadSeq.current === seq) {
              setChat({ botId: targetBot!.id, threadId, goalId: goal.id, title });
            }
            return loadThread(targetBot!.id, threadId);
          })
          .then((res) => {
            if (loadSeq.current === seq && res?.bot?.id) {
              dispatch({ type: "taskSwitched", bot: res.bot });
            }
          })
          .catch(fail);
        return;
      }

      setChat({ botId: targetBot.id, title: targetBot.title || targetBot.name });
    },
    [bots, dispatch, fail, setSpace],
  );

  const handleWhiteboardChange = useCallback(
    (updater: WhiteboardSpaceState | ((prev: WhiteboardSpaceState) => WhiteboardSpaceState)) => {
      const nextCanvas = typeof updater === "function" ? updater(whiteboardStateRef.current) : updater;
      whiteboardStateRef.current = nextCanvas;

      if (nextCanvas.projectSlug && nextCanvas.projectSlug !== activeProjectSlug) {
        setActiveProjectSlug(nextCanvas.projectSlug);
      }

      const prevBoard = spaceRef.current;
      const plan = diffWhiteboardSyncPlan(prevBoard, nextCanvas);

      setWhiteboardRev((r) => r + 1);
      setSpace((prev) => applyWhiteboardOptimisticBoard(prev, nextCanvas));

      const tasks: Promise<unknown>[] = [];
      for (const created of plan.createdGoals) {
        tasks.push(createGoal(created.input));
      }
      for (const patched of plan.patchedGoals) {
        tasks.push(updateGoal(patched.id, patched.patch));
      }
      for (const deletedId of plan.deletedGoalIds) {
        tasks.push(deleteGoal(deletedId));
      }
      for (const placement of plan.placementChanges) {
        tasks.push(placeBot(placement.botId, placement.goalId));
      }
      if (plan.benchPatch) {
        tasks.push(setBench(plan.benchPatch));
      }
      if (plan.batch) {
        const batchPromise = applyWhiteboardBatch(plan.batch);
        inFlightBatchRef.current = batchPromise;
        tasks.push(
          batchPromise.finally(() => {
            if (inFlightBatchRef.current === batchPromise) {
              inFlightBatchRef.current = null;
            }
          }),
        );
      }

      // Enrich newly dropped C02 project cards with GET /api/space/c02/projects/:slug
      for (const addedNode of plan.batch?.addNodes ?? []) {
        if (addedNode.kind === "c02-project" && addedNode.projectSlug && addedNode.id) {
          const slug = addedNode.projectSlug;
          const nodeId = addedNode.id;
          void fetchC02ProjectDetail(slug)
            .then((res) => {
              if (!res?.project?.slug) return;
              setC02Details((prev) => {
                const next = new Map(prev);
                next.set(res.project.slug, res.project);
                return next;
              });
              const baseSummary = mergedC02List.find((item) => item.slug === slug);
              if (baseSummary) {
                const enriched = buildC02ProjectSummary(baseSummary, res.project);
                void updateCanvasNode(nodeId, {
                  title: enriched.title,
                  meta: {
                    readiness: enriched.readiness,
                    ...(enriched.readinessScore !== undefined ? { readinessScore: enriched.readinessScore } : {}),
                    productsCount: enriched.productsCount,
                    channels: enriched.channels,
                    liveRefs: enriched.liveRefs,
                  },
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      }

      if (tasks.length > 0) {
        setError(null);
        void Promise.all(tasks)
          .catch(fail)
          .finally(() => void refresh());
      }
    },
    [activeProjectSlug, fail, mergedC02List, refresh, setSpace],
  );

  const handleSpawnA01Agent = useCallback(
    async (req: A01SpawnRequest) => {
      setError(null);
      try {
        const role = roleIdToA01Role(req.roleId);
        const mode = spawnModeToA01Mode(req.spawnMode);
        const computerProvider = canvasComputerToProvider(req.computer);
        const roleMeta = AGENT_ROLE_ACCESSORIES[req.roleId];

        const hired = await hireA01Agent({
          role,
          mode,
          ...(req.projectSlug ? { projectSlug: req.projectSlug } : {}),
          computerProvider,
          fallbackTitle: roleMeta.label,
          fallbackTagline: roleMeta.tagline,
          ...(req.goalId ? { goalId: req.goalId } : {}),
          ...(req.modelId ? { modelId: req.modelId } : {}),
          persistNode: false,
        });

        dispatch({ type: "botAdded", bot: hired.bot, preserveSelection: true });

        if (inFlightBatchRef.current) {
          await inFlightBatchRef.current.catch(() => {});
        }

        const sessionId = formatBotSessionId(hired.bot.id, hired.bot.threadId);
        const resolvedProject = hired.binding.projectSlug ?? (req.projectSlug || undefined);
        const resolvedProvider = hired.binding.computerProvider ?? computerProvider;
        const nodeMeta: Record<string, unknown> = {
          status: "idle",
          sessionId,
          ...(req.modelId ? { modelId: req.modelId } : {}),
        };

        const alreadyOnBoard = (spaceRef.current.canvasNodes ?? []).some((n) => n.id === req.nodeId);
        if (alreadyOnBoard) {
          await updateCanvasNode(req.nodeId, {
            title: hired.bot.name,
            botId: hired.bot.id,
            threadId: hired.bot.threadId ?? null,
            a01Role: hired.binding.role,
            a01Mode: hired.binding.mode,
            projectSlug: resolvedProject ?? null,
            computerProvider: resolvedProvider,
            computerLeaseId: hired.binding.computerLeaseId ?? null,
            meta: nodeMeta,
          }).catch(async () => {
            await createCanvasNode({
              id: req.nodeId,
              kind: "a01-agent",
              title: hired.bot.name,
              layout: { x: Math.round(req.position.x), y: Math.round(req.position.y), w: 312, h: 184 },
              botId: hired.bot.id,
              ...(hired.bot.threadId ? { threadId: hired.bot.threadId } : {}),
              a01Role: hired.binding.role,
              a01Mode: hired.binding.mode,
              ...(resolvedProject ? { projectSlug: resolvedProject } : {}),
              computerProvider: resolvedProvider,
              ...(hired.binding.computerLeaseId ? { computerLeaseId: hired.binding.computerLeaseId } : {}),
              meta: nodeMeta,
            });
          });
        } else {
          await createCanvasNode({
            id: req.nodeId,
            kind: "a01-agent",
            title: hired.bot.name,
            layout: { x: Math.round(req.position.x), y: Math.round(req.position.y), w: 312, h: 184 },
            botId: hired.bot.id,
            ...(hired.bot.threadId ? { threadId: hired.bot.threadId } : {}),
            a01Role: hired.binding.role,
            a01Mode: hired.binding.mode,
            ...(resolvedProject ? { projectSlug: resolvedProject } : {}),
            computerProvider: resolvedProvider,
            ...(hired.binding.computerLeaseId ? { computerLeaseId: hired.binding.computerLeaseId } : {}),
            meta: nodeMeta,
          });
        }

        setNotice(
          `Spawned ${hired.bot.name} (${hired.binding.role} · ${
            hired.binding.mode === "long-term" ? "🧠 Long-Term" : "⚡ Temporary"
          })`,
        );
        await refresh();
      } catch (cause) {
        fail(cause);
      }
    },
    [dispatch, fail, refresh],
  );

  const handleBindProjectToNode = useCallback(
    (nodeId: string, projectSlug: string) => {
      const serverNode = (spaceRef.current.canvasNodes ?? []).find((n) => n.id === nodeId);
      const wbNode = (whiteboardStateRef.current.nodes ?? []).find((n) => n.id === nodeId);
      const botId =
        serverNode?.botId ??
        (wbNode?.kind === "session" ? parseBotSessionId(wbNode.sessionId).botId : undefined);
      const existingBinding = botId ? spaceRef.current.botBindings?.[botId] : undefined;
      const role =
        existingBinding?.role ??
        serverNode?.a01Role ??
        (wbNode?.kind === "agent"
          ? roleIdToA01Role(wbNode.roleId)
          : wbNode?.kind === "session" && wbNode.roleId
            ? roleIdToA01Role(wbNode.roleId)
            : undefined);

      const run = (async () => {
        if (inFlightBatchRef.current) {
          await inFlightBatchRef.current.catch(() => {});
        }
        await Promise.all([
          updateCanvasNode(nodeId, { projectSlug }).catch(() => {}),
          ...(botId && role && bots.some((b) => b.id === botId)
            ? [
                bindBotA01Role(botId, {
                  role,
                  mode: existingBinding?.mode ?? serverNode?.a01Mode ?? "temporary",
                  projectSlug,
                  ...((existingBinding?.computerProvider ?? serverNode?.computerProvider)
                    ? { computerProvider: existingBinding?.computerProvider ?? serverNode?.computerProvider }
                    : {}),
                }),
              ]
            : []),
        ]);
      })();
      act(run);
    },
    [act, bots],
  );

  const handleSwitchNodeComputer = useCallback(
    (nodeId: string, nextComputer: Parameters<NonNullable<SpaceCanvasHostAdapter["onSwitchNodeComputer"]>>[1]) => {
      const provider = canvasComputerToProvider(nextComputer);
      const serverNode = (spaceRef.current.canvasNodes ?? []).find((n) => n.id === nodeId);
      const wbNode = (whiteboardStateRef.current.nodes ?? []).find((n) => n.id === nodeId);
      const botId =
        serverNode?.botId ??
        (wbNode?.kind === "session" ? parseBotSessionId(wbNode.sessionId).botId : undefined);
      const existingBinding = botId ? spaceRef.current.botBindings?.[botId] : undefined;
      const role =
        existingBinding?.role ??
        serverNode?.a01Role ??
        (wbNode?.kind === "agent" ? roleIdToA01Role(wbNode.roleId) : undefined);

      const run = (async () => {
        if (inFlightBatchRef.current) {
          await inFlightBatchRef.current.catch(() => {});
        }
        await Promise.all([
          updateCanvasNode(nodeId, { computerProvider: provider }).catch(() => {}),
          ...(botId && role && bots.some((b) => b.id === botId)
            ? [
                bindBotA01Role(botId, {
                  role,
                  mode: existingBinding?.mode ?? serverNode?.a01Mode ?? "temporary",
                  ...((existingBinding?.projectSlug ?? serverNode?.projectSlug)
                    ? { projectSlug: existingBinding?.projectSlug ?? serverNode?.projectSlug }
                    : {}),
                  computerProvider: provider,
                }),
              ]
            : []),
        ]);
      })();
      act(run);
    },
    [act, bots],
  );

  const handlePinSession = useCallback(
    (sessionId: string, pinned: boolean, summary?: DraggableSessionSummary) => {
      if (pinned) {
        pinSession({
          tabId: sessionId,
          worktreeId: summary?.projectSlug || resolvedActiveProjectSlug || "openmaus",
          kind: "agent",
          name: summary?.title || sessionId,
        });
      } else {
        unpinSession(sessionId);
      }
      const prevIds = spaceRef.current.pinnedSessions ?? [];
      const nextIds = pinned
        ? [...new Set([...prevIds, sessionId])]
        : prevIds.filter((id) => id !== sessionId);
      setSpace((prev) => ({ ...prev, pinnedSessions: nextIds }));
      act(savePinnedSessions(nextIds));
    },
    [act, resolvedActiveProjectSlug, setSpace],
  );

  const renderPinnedSessionBody = useCallback(
    (pin: PinnedSession, _agent: SpaceAgent | null, opts: PinnedSessionBodyRenderOpts) => {
      const { botId, threadId } = parseBotSessionId(pin.tabId);
      const pinnedBot = bots.find((b) => b.id === botId);
      if (!pinnedBot) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-[12px] text-ink-secondary">
            <p>Session {pin.name}</p>
            <button
              type="button"
              onClick={opts.onOpenFull}
              className="rounded-lg border border-hairline/60 bg-panel px-3 py-1.5 text-[11.5px] font-medium text-ink hover:bg-control"
            >
              Open Session
            </button>
          </div>
        );
      }
      const effectiveThread = threadId ?? pinnedBot.threadId;
      const ready = !effectiveThread || pinnedBot.threadId === effectiveThread;
      const viewBot: Bot = effectiveThread
        ? {
            ...pinnedBot,
            threadId: effectiveThread,
            messages: ready ? pinnedBot.messages : [],
            awaitingThreadSnapshot: !ready || pinnedBot.awaitingThreadSnapshot,
          }
        : pinnedBot;
      return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app text-ink">
          <ChatView key={`${viewBot.id}:${viewBot.threadId ?? ""}`} bot={viewBot} />
        </div>
      );
    },
    [bots],
  );

  const pickEmojiImageDataUrl = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        if (typeof document === "undefined") {
          resolve(null);
          return;
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          void readCustomEmojiFile(file)
            .then((url) => resolve(url))
            .catch(() => resolve(null));
        };
        input.click();
      }),
    [],
  );

  const hostAdapter = useMemo<SpaceCanvasHostAdapter>(
    () => ({
      sessions: draggableSessions,
      projects: c02Summaries,
      activeProjectSlug: resolvedActiveProjectSlug,
      activeWorktreeId: resolvedActiveProjectSlug || "openmaus",
      onSelectSpaceProject: (slug) => {
        setActiveProjectSlug(slug);
        ensureC02Detail(slug);
        if (opened) {
          setSpace((prev) => ({
            ...prev,
            goals: prev.goals.map((g) => (g.id === opened.id ? { ...g, projectSlug: slug } : g)),
          }));
          act(updateGoal(opened.id, { projectSlug: slug }));
        }
      },
      onOpenSession: (sessionId) => openSessionConversation(sessionId),
      onPinSession: handlePinSession,
      onSpawnA01Agent: handleSpawnA01Agent,
      onBindProjectToNode: handleBindProjectToNode,
      onSwitchNodeComputer: handleSwitchNodeComputer,
      onConnectNodes: (_fromId, _toId) => {
        setNotice("Linked agent handoff arrow on whiteboard.");
      },
      onOpenProjectRef: (_slug, ref) => {
        if (ref.url) {
          window.open(ref.url, "_blank", "noopener,noreferrer");
          return;
        }
        if (ref.path) {
          void navigator.clipboard?.writeText(ref.path).catch(() => {});
          setNotice(`Project path: ${ref.path}`);
        }
      },
      onAnswerAsk: (goalId, askId, answer) => {
        act(answerAsk(goalId, askId, answer));
      },
      renderPinnedSessionBody,
      onPickImageDataUrl: pickEmojiImageDataUrl,
      onNotify: (message) => setNotice(message),
    }),
    [
      act,
      c02Summaries,
      draggableSessions,
      ensureC02Detail,
      handleBindProjectToNode,
      handlePinSession,
      handleSpawnA01Agent,
      handleSwitchNodeComputer,
      openSessionConversation,
      opened,
      pickEmojiImageDataUrl,
      renderPinnedSessionBody,
      resolvedActiveProjectSlug,
      setSpace,
    ],
  );

  // Legacy SpaceCard drawer helpers (outcomes, asks, tasks, threads, context menu)
  const place = (botId: string, goalId: string | null) => {
    if (!bots.some((bot) => bot.id === botId) || (space.placements[botId] ?? null) === goalId) return;
    setSpace(withPlacement(space, botId, goalId));
    act(placeBot(botId, goalId));
  };

  const spawnThreadInSpace = (botId: string, goal: SpaceGoal) => {
    if (!bots.some((bot) => bot.id === botId)) return;
    const currentSlots = spaceSlots(space, bots, goal.id, knownThreads).filter((slot) => slot.bot.id === botId);
    const existingGoalId = space.placements[botId];
    const hasOtherUnthreadedPlacement = Boolean(
      existingGoalId &&
        existingGoalId !== goal.id &&
        space.goals.some((candidate) => candidate.id === existingGoalId) &&
        spaceThreads(space, bots, existingGoalId, knownThreads).every((item) => item.bot.id !== botId),
    );
    const needsPlacement = !hasOtherUnthreadedPlacement && (existingGoalId ?? null) !== goal.id;
    if (needsPlacement) setSpace(withPlacement(space, botId, goal.id));
    const existingTitles = currentSlots.map((slot) => slot.title ?? goal.title);
    const entries = (
      currentSlots.length === 1 && !currentSlots[0]!.threadId
        ? [goal.title, `${goal.title} #2`]
        : [nextThreadTitle(goal.title, existingTitles)]
    ).map((title) => ({ pendingId: `pending-${++pendingSeq.current}`, title }));
    setKnownThreads((prev) => {
      const next = { ...prev };
      for (const entry of entries) next[entry.pendingId] = { botId, title: entry.title, goalId: goal.id };
      return next;
    });
    const work = Promise.all([
      ...(needsPlacement ? [placeBot(botId, goal.id)] : []),
      ...entries.map(({ pendingId, title }) =>
        createGoalThread(botId, goal, title).then(({ threadId, bot: updated, title: finalTitle }) => {
          const openingPending = chatRef.current?.threadId === pendingId;
          if (updated?.id) {
            dispatch(
              openingPending
                ? { type: "taskSwitched", bot: { ...updated, threadId, messages: updated.messages ?? [] } }
                : { type: "botPatched", bot: updated },
            );
          }
          setKnownThreads((prev) => {
            const { [pendingId]: _temp, ...rest } = prev;
            return { ...rest, [threadId]: { botId, title: finalTitle, goalId: goal.id } };
          });
          setSpace((prev) => withThreadGoal(needsPlacement ? withPlacement(prev, botId, goal.id) : prev, threadId, goal.id));
          if (openingPending) {
            setChat((current) => (current?.threadId === pendingId ? { ...current, threadId, title: finalTitle } : current));
            const seq = ++loadSeq.current;
            void loadThread(botId, threadId)
              .then((res) => {
                if (loadSeq.current === seq && res?.bot?.id) dispatch({ type: "taskSwitched", bot: res.bot });
              })
              .catch(fail);
          }
        }),
      ),
    ]);
    act(work);
  };

  const moveCard = (botId: string, threadId: string | undefined, fromGoalId: string | undefined, goalId: string | null) => {
    if (!bots.some((bot) => bot.id === botId)) return;
    if (goalId !== null) {
      const targetGoal = space.goals.find((goal) => goal.id === goalId);
      if (!targetGoal || fromGoalId === goalId) return;
      if (!fromGoalId) {
        spawnThreadInSpace(botId, targetGoal);
        return;
      }
      if (threadId) {
        const fromSlots = spaceSlots(space, bots, fromGoalId, knownThreads);
        const current = fromSlots.find((slot) => slot.threadId === threadId);
        const othersInSource = fromSlots.filter((slot) => slot.bot.id === botId && slot.threadId !== threadId);
        const moveBotPlacement =
          othersInSource.length === 0 && (space.placements[botId] === fromGoalId || !space.placements[botId]);
        setKnownThreads((prev) => ({ ...prev, [threadId]: { botId, title: current?.title ?? targetGoal.title, goalId } }));
        setSpace(withThreadGoal(moveBotPlacement ? withPlacement(space, botId, goalId) : space, threadId, goalId));
        act(Promise.all([linkThread(threadId, goalId), ...(moveBotPlacement ? [placeBot(botId, goalId)] : [])]));
        return;
      }
      place(botId, goalId);
      return;
    }
    const targetThreads = threadId
      ? [threadId]
      : fromGoalId
        ? spaceThreads(space, bots, fromGoalId, knownThreads)
            .filter((item) => item.bot.id === botId)
            .map((item) => item.threadId)
        : [];
    if (targetThreads.length > 0) {
      const removed = new Set(targetThreads);
      const remaining = space.goals
        .flatMap((goal) => spaceSlots(space, bots, goal.id, knownThreads).map((slot) => ({ slot, goalId: goal.id })))
        .find((entry) => entry.slot.bot.id === botId && entry.slot.threadId && !removed.has(entry.slot.threadId));
      const nextGoalId = remaining?.goalId ?? null;
      const updatePlacement =
        (space.placements[botId] ?? null) !== nextGoalId &&
        (!fromGoalId || space.placements[botId] === fromGoalId || !remaining);
      setKnownThreads((prev) => {
        const next = { ...prev };
        for (const id of targetThreads) next[id] = { botId, title: prev[id]?.title ?? "", goalId: null };
        return next;
      });
      setSpace((prev) => {
        let next = updatePlacement ? withPlacement(prev, botId, nextGoalId) : prev;
        for (const id of targetThreads) next = withThreadGoal(next, id, null);
        return next;
      });
      if (chat?.threadId && removed.has(chat.threadId)) setChat(null);
      act(
        Promise.all([
          ...targetThreads.map((id) => linkThread(id, null)),
          ...(updatePlacement ? [placeBot(botId, nextGoalId)] : []),
        ]),
      );
      return;
    }
    place(botId, null);
  };

  const addCanvasNoteAt = (at?: Point) => {
    const count = space.canvasNotes?.length ?? 0;
    const layout: SpaceLayout = at
      ? { x: Math.round(at.x - 110), y: Math.round(at.y - 24), w: 220, h: 160 }
      : { x: 140 + ((count * 28) % 280), y: 140 + ((count * 24) % 200), w: 220, h: 160 };
    setError(null);
    void createCanvasNote({ text: "", color: "yellow", layout })
      .then(({ note }) => {
        if (note) {
          setWhiteboardRev((r) => r + 1);
          setSpace((prev) => ({ ...prev, canvasNotes: [...(prev.canvasNotes ?? []), note] }));
        }
      })
      .catch(fail)
      .finally(() => void refresh());
  };

  const setGoalIcon = (goal: SpaceGoal, icon: string | null) => {
    setWhiteboardRev((r) => r + 1);
    setSpace((prev) => ({
      ...prev,
      goals: prev.goals.map((candidate) => {
        if (candidate.id !== goal.id) return candidate;
        const { icon: _old, ...rest } = candidate;
        return icon ? { ...rest, icon } : rest;
      }),
    }));
    act(updateGoal(goal.id, { icon }));
  };

  const newAgent = (name: string, goal: SpaceGoal) =>
    act(newAgentInSpace(name, goal.id).then((bot) => dispatch({ type: "botAdded", bot, preserveSelection: true })));

  const cardActions = (goal: SpaceGoal): SpaceCardActions => ({
    menu: (event: MouseEvent, bot?: Bot) =>
      setMenu({ kind: "space", x: event.clientX, y: event.clientY, goal, ...(bot ? { bot } : {}) }),
    edit: () => setEditing({ goal }),
    setIcon: (icon) => setGoalIcon(goal, icon),
    toggleOutcome: (index) =>
      act(
        updateGoal(goal.id, {
          outcomes: goal.outcomes.map((outcome, at) => (at === index ? { ...outcome, done: !outcome.done } : outcome)),
        }),
      ),
    newAgent: (name) => newAgent(name, goal),
    addTask: (text, botId) => act(addTask(goal.id, text, botId)),
    patchTask: (taskId, patch) => act(patchTask(goal.id, taskId, patch)),
    deleteTask: (taskId) => act(deleteTask(goal.id, taskId)),
    answerAsk: (askId, answer) => act(answerAsk(goal.id, askId, answer)),
    openThread: (thread) => dispatch({ type: "switchTask", botId: thread.bot.id, threadId: thread.threadId }),
    closeThread: (thread) => {
      dispatch({ type: "updateTask", botId: thread.bot.id, threadId: thread.threadId, patch: { archivedAt: Date.now() } });
      moveCard(thread.bot.id, thread.threadId, goal.id, null);
    },
  });

  const handleOpenGoal = useCallback((wbGoal: WhiteboardGoal) => {
    setChat(null);
    setOpenId(wbGoal.id);
  }, []);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      const bot = bots.find((b) => b.id === agentId);
      if (!bot) return;
      openSessionConversation(formatBotSessionId(bot.id, bot.threadId));
    },
    [bots, openSessionConversation],
  );

  const handleHiredFromModal = useCallback(
    (result: HireA01AgentResult) => {
      dispatch({ type: "botAdded", bot: result.bot, preserveSelection: true });
      setNotice(
        `Hired ${result.bot.name} (${result.binding.role} · ${
          result.binding.mode === "long-term" ? "🧠 Long-Term Employee" : "⚡ Temporary Worker"
        })`,
      );
      void refresh();
    },
    [dispatch, refresh],
  );

  const shownError = error || loadError;
  const activeChatBot = chat ? bots.find((bot) => bot.id === chat.botId) : undefined;
  const chatReady = Boolean(activeChatBot && (!chat?.threadId || activeChatBot.threadId === chat.threadId));
  const chatBot =
    activeChatBot && chat?.threadId
      ? {
          ...activeChatBot,
          threadId: chat.threadId,
          messages: chatReady ? activeChatBot.messages : [],
          awaitingThreadSnapshot: !chatReady || activeChatBot.awaitingThreadSnapshot,
        }
      : activeChatBot;
  const chatGoal = chat?.goalId ? space.goals.find((goal) => goal.id === chat.goalId) : undefined;
  const boundLeasesCount = Object.values(space.botBindings ?? {}).filter((b) => Boolean(b.computerLeaseId)).length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-quest-board>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline/40 px-6 py-3">
        <button type="button" data-new-space-btn onClick={() => setEditing({ level: "general" })} className={BUTTON}>
          <Plus size={14} />
          {t("quest.newQuest")}
        </button>
        <button
          type="button"
          data-hire-a01-btn
          onClick={() => setHireModalOpen(true)}
          className={cn(BUTTON, "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20")}
        >
          <Users size={14} />
          + Hire A01 Agent
        </button>
        <button
          type="button"
          data-open-computers-btn
          onClick={() => setComputersModal({ open: true })}
          className={BUTTON}
        >
          <Server size={14} className="text-sky-400" />
          Computers
          {boundLeasesCount > 0 && (
            <span className="rounded-full bg-sky-500/20 px-1.5 py-0.2 text-[10.5px] font-semibold text-sky-300">
              {boundLeasesCount}
            </span>
          )}
        </button>
        <button type="button" data-add-canvas-note onClick={() => addCanvasNoteAt()} className={BUTTON}>
          <StickyNote size={14} />
          {t("quest.newNote")}
        </button>
        <button
          type="button"
          disabled={!chief}
          title={chief ? undefined : t("quest.scanNoChief")}
          className={BUTTON}
          onClick={() => {
            if (!chief) return;
            setError(null);
            void askChiefToScan(chief)
              .then((threadId) => dispatch({ type: "switchTask", botId: chief.id, threadId }))
              .catch(fail);
          }}
        >
          <ScanSearch size={14} />
          {t("quest.scan")}
        </button>
        {space.kanban && (
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              setError(null);
              void importKanban()
                .then((result) => setNotice(t("quest.importDone", { created: result.created, updated: result.updated })))
                .catch(fail)
                .finally(() => void refresh());
            }}
          >
            <Download size={14} />
            {t("quest.import")}
          </button>
        )}
        <span
          data-space-plugin-badge
          className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[11px] font-medium text-ink-secondary"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          {t("quest.pluginActive")}
        </span>
        <label
          className="ml-auto flex cursor-pointer items-center gap-2 text-[12px] text-ink-secondary"
          title={t("quest.visualFirstHint")}
        >
          <input
            type="checkbox"
            checked={space.visualFirst}
            onChange={(event) => {
              const on = event.target.checked;
              setSpace({ ...space, visualFirst: on });
              act(setVisualFirst(on));
            }}
            className="accent-accent"
          />
          {t("quest.visualFirst")}
        </label>
      </div>

      {(shownError || notice) && (
        <div
          role={shownError ? "alert" : "status"}
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b px-6 py-2 text-[12px]",
            shownError ? "border-danger/20 bg-danger/10 text-danger" : "border-hairline/40 bg-panel text-ink-secondary",
          )}
        >
          {shownError || notice}
          <button
            type="button"
            aria-label={t("common.close")}
            className="rounded p-1 hover:bg-control"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <SpaceCanvas
          space={whiteboardState}
          agents={spaceAgents}
          host={hostAdapter}
          onChangeSpace={handleWhiteboardChange}
          onOpenGoal={handleOpenGoal}
          onSelectAgent={handleSelectAgent}
        />

        {opened && (
          <aside
            aria-label={t("quest.space.aria", { title: opened.title })}
            data-space-drawer="goal-details"
            data-space-goal-drawer={opened.id}
            className="absolute inset-y-0 right-0 z-30 flex w-[400px] max-w-full flex-col gap-2 border-l border-hairline/50 bg-app/95 p-3 shadow-xl backdrop-blur"
          >
            <div className="flex justify-end">
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setOpenId(null)}
                className="rounded p-1 text-ink-secondary hover:bg-control hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <SpaceCard
                fill
                goal={opened}
                bots={zoneBots(space, bots, opened.id, knownThreads)}
                allBots={bots}
                threads={spaceThreads(space, bots, opened.id, knownThreads)}
                notes={space.log
                  .filter((entry) => entry.goalId === opened.id)
                  .slice(-NOTES_ON_CARD)
                  .reverse()}
                actions={cardActions(opened)}
              />
            </div>
          </aside>
        )}

        {chatBot && (
          <aside
            aria-label={t("chat.conversationWith", { name: chatBot.name })}
            data-space-chat={chatBot.id}
            data-space-chat-thread={chat?.threadId ?? chatBot.threadId ?? ""}
            className="relative z-30 flex h-full w-[480px] max-w-full shrink-0 flex-col border-l border-hairline/50 bg-app shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline/40 bg-panel px-4 py-2 text-[12px]">
              <div className="flex min-w-0 items-center gap-2">
                {chatGoal && <LevelChip level={chatGoal.level} />}
                <span className="truncate font-semibold text-ink">
                  {chat?.title || chatGoal?.title || chatBot.name}
                </span>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setChat(null)}
                className="rounded p-1 text-ink-secondary hover:bg-control hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <ChatView key={`${chatBot.id}:${chatBot.threadId}`} bot={chatBot} />
            </div>
          </aside>
        )}
      </div>

      {menu?.kind === "space" && (
        <ZoneContextMenu
          target={menu}
          zoneBots={zoneBots(space, bots, menu.goal.id, knownThreads)}
          allBots={bots}
          onNewThread={(bot) => {
            spawnThreadInSpace(bot.id, menu.goal);
            setMenu(null);
          }}
          onEdit={() => {
            setEditing({ goal: menu.goal });
            setMenu(null);
          }}
          onBench={(bot) => {
            moveCard(bot.id, menu.threadId, menu.goal.id, null);
            setMenu(null);
          }}
          onClose={closeMenu}
        />
      )}

      {editing && (
        <GoalEditor
          {...editing}
          initialProjects={mergedC02List}
          defaultProjectSlug={resolvedActiveProjectSlug}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      )}

      {hireModalOpen && (
        <HireA01AgentModal
          goals={space.goals}
          initialProjects={mergedC02List}
          defaultProjectSlug={resolvedActiveProjectSlug}
          {...(opened ? { defaultGoalId: opened.id } : {})}
          onClose={() => setHireModalOpen(false)}
          onHired={handleHiredFromModal}
        />
      )}

      {computersModal.open && (
        <AgentComputersModal
          onClose={() => setComputersModal({ open: false })}
          {...(computersModal.targetLabel ? { targetLabel: computersModal.targetLabel } : {})}
          {...(computersModal.currentProvider ? { currentProvider: computersModal.currentProvider } : {})}
          {...(computersModal.nodeId
            ? {
                onSelectProvider: async (provider) => {
                  const nodeId = computersModal.nodeId!;
                  const serverNode = (spaceRef.current.canvasNodes ?? []).find((n) => n.id === nodeId);
                  await updateCanvasNode(nodeId, { computerProvider: provider }).catch(() => {});
                  const botId = serverNode?.botId;
                  const binding = botId ? spaceRef.current.botBindings?.[botId] : undefined;
                  const role = binding?.role ?? serverNode?.a01Role;
                  if (botId && role) {
                    await bindBotA01Role(botId, {
                      role,
                      mode: binding?.mode ?? serverNode?.a01Mode ?? "temporary",
                      ...(binding?.projectSlug ?? serverNode?.projectSlug
                        ? { projectSlug: binding?.projectSlug ?? serverNode?.projectSlug }
                        : {}),
                      computerProvider: provider,
                    });
                  }
                  await refresh();
                },
              }
            : {})}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  );
}
