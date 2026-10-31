import { useSyncExternalStore } from "react";
import {
  SpaceCanvasHostProvider,
  SpaceWhiteboard,
  type SpaceAgent,
  type SpaceCanvasHostAdapter,
  type SpaceGoal as WhiteboardGoal,
  type SpaceState as WhiteboardSpaceState,
} from "@xlabs/space-canvas";
import { readSkin, subscribeSkin, type SkinId } from "@/lib/skins";

export {
  A01RosterDrawer,
  A01SpawnPopover,
  AgentNodeCard,
  PIN_LAYER_Z,
  PinnedSessionsLayer,
  ProjectNodeCard,
  SPACE_NODE_DRAG_MIME,
  SessionDrawer,
  SessionNodeCard,
  SpaceCanvasHostProvider,
  SpaceProjectBadge,
  SpaceWhiteboard,
  parseNodeDropPayload,
  pinSession,
  resetPinnedStoreForTests,
  serializeNodeDropPayload,
  unpinSession,
  usePinnedState,
  useSpaceCanvasHost,
  type A01SpawnRequest,
  type SpaceCanvasHostAdapter,
} from "@xlabs/space-canvas";

const DARK_SKINS = new Set<SkinId>(["midnight", "foundry", "graphite", "dusk", "halloween"]);

export function useIsDarkSkin(): boolean {
  const skin = useSyncExternalStore<SkinId>(subscribeSkin, readSkin, () => "midnight");
  return DARK_SKINS.has(skin);
}

export interface OpenMausSpaceCanvasProps {
  space: WhiteboardSpaceState;
  agents: readonly SpaceAgent[];
  host: SpaceCanvasHostAdapter;
  dark?: boolean;
  showProjectHeader?: boolean;
  showPinnedLayer?: boolean;
  onChangeSpace: (
    updater: WhiteboardSpaceState | ((prev: WhiteboardSpaceState) => WhiteboardSpaceState),
  ) => void;
  onSelectAgent?: (agentId: string) => void;
  onOpenGoal?: (goal: WhiteboardGoal) => void;
}

/**
 * OpenMausBot Penpot-grade Spaces Whiteboard powered by `@xlabs/space-canvas`.
 * Wraps `<SpaceWhiteboard />` inside `<SpaceCanvasHostProvider>` so both the canvas
 * and `<PinnedSessionsLayer />` receive the live OpenMausBot host adapter.
 */
export function SpaceCanvas({
  space,
  agents,
  host,
  dark,
  showProjectHeader = true,
  showPinnedLayer = true,
  onChangeSpace,
  onSelectAgent,
  onOpenGoal,
}: OpenMausSpaceCanvasProps) {
  const detectedDark = useIsDarkSkin();
  const isDark = dark ?? detectedDark;

  return (
    <SpaceCanvasHostProvider adapter={host}>
      <SpaceWhiteboard
        space={space}
        agents={agents}
        host={host}
        dark={isDark}
        showProjectHeader={showProjectHeader}
        showPinnedLayer={showPinnedLayer}
        onChangeSpace={onChangeSpace}
        onSelectAgent={onSelectAgent}
        onOpenGoal={onOpenGoal}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      />
    </SpaceCanvasHostProvider>
  );
}
