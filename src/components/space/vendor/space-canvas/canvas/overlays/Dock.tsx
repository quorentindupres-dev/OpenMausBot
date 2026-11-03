// WS-0 (TASK_16 wave 2): the bottom dock (WhiteboardEdgelessDock wiring), moved verbatim from
// space-canvas.tsx. Owner: none. The drag ghost is DockGhost.tsx.
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import { WhiteboardEdgelessDock } from '../../whiteboard-toolbar'
import { cornerStacked, dockMaxWidthFor } from '../corner-layout'
import { useCanvasWidth } from '../use-canvas-width'

export function Dock({ ctx, g }: { ctx: CanvasCtx; g: CanvasHandlers }): React.JSX.Element {
  const {
    activeArrowDash,
    activeArrowRouting,
    activeFillStyle,
    activeShapeColor,
    activeShapeType,
    activeTextPreset,
    askModelOnDrop,
    dockNoteColor,
    dockSpaceLevel,
    drag,
    onChangeToolMode,
    onSelectModelId,
    onStartDrag,
    onToggleAskModelOnDrop,
    selectedModelId,
    setActiveArrowDash,
    setActiveArrowRouting,
    setActiveFillStyle,
    setActiveShapeColor,
    setActiveShapeType,
    setActiveTextPreset,
    setDockNoteColor,
    setDockSpaceLevel,
    toolMode
  } = ctx
  const { handleStartDockItemDrag } = g
  const canvasWidth = useCanvasWidth(ctx.rootRef)
  return (
    <>
      {/* AFFiNE Edgeless Matte-Dark Floating Dock */}
      <div
        style={{ maxWidth: dockMaxWidthFor(canvasWidth) }}
        className="op-dock-wrap pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center"
      >
        <WhiteboardEdgelessDock
          narrow={cornerStacked(canvasWidth) || (canvasWidth > 0 && canvasWidth < 420)}
          toolMode={toolMode}
          onChangeToolMode={onChangeToolMode}
          activeShapeType={activeShapeType}
          onChangeShapeType={setActiveShapeType}
          activeShapeColor={activeShapeColor}
          onChangeShapeColor={setActiveShapeColor}
          activeFillStyle={activeFillStyle}
          onChangeFillStyle={setActiveFillStyle}
          activeArrowRouting={activeArrowRouting}
          onChangeArrowRouting={setActiveArrowRouting}
          activeArrowDash={activeArrowDash}
          onChangeArrowDash={setActiveArrowDash}
          dockSpaceLevel={dockSpaceLevel}
          onChangeDockSpaceLevel={setDockSpaceLevel}
          dockNoteColor={dockNoteColor}
          onChangeDockNoteColor={setDockNoteColor}
          selectedModelId={selectedModelId}
          onSelectModelId={onSelectModelId}
          askModelOnDrop={askModelOnDrop}
          onToggleAskModelOnDrop={onToggleAskModelOnDrop}
          onStartDockItemDrag={handleStartDockItemDrag}
          onStartAgentSpawnDrag={(spawnerId, ev) => onStartDrag({ kind: 'spawn', spawnerId })(ev)}
          isDraggingBot={drag?.item.kind === 'bot'}
          isOverTrash={drag?.over?.kind === 'palette-remove'}
          activeTextPreset={activeTextPreset}
          onSelectTextPreset={(preset) => {
            setActiveTextPreset(preset.id)
            setActiveFillStyle(preset.fillStyle)
            if (preset.id !== 'backed-label') {
              setActiveShapeColor(preset.color)
            }
            onChangeToolMode?.('text')
          }}
        />
      </div>
    </>
  )
}
