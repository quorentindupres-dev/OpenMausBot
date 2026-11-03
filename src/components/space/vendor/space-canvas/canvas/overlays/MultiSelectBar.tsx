// WS-0 (TASK_16 wave 2): floating multi-selection bar (align, distribute, batch fill / color, lock,
// layer, duplicate, delete), moved verbatim from space-canvas.tsx. Owner: WS-B.
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import type { BoxRect } from '../canvas-ctx'
import { ClampedFloatingToolbar } from '../canvas-parts'
import type { SpaceStickyNote } from '../../core/space'
import { WhiteboardMultiSelectBar } from '../../whiteboard-toolbar'

export function MultiSelectBar({
  ctx,
  g
}: {
  ctx: CanvasCtx
  g: CanvasHandlers
}): React.JSX.Element {
  const {
    activeFillStyle,
    activeShapeColor,
    boxMap,
    drawingArrow,
    effectiveSelectedIds,
    marqueeRect,
    onBatchUpdateStickyNotes,
    panning,
    rootRef,
    setActiveFillStyle,
    setActiveShapeColor,
    setEditingStickyId,
    setSelectedStickyIds,
    stickiesById,
    view
  } = ctx
  const {
    bringIdsToFront,
    sendIdsToBack,
    duplicateSelected,
    deleteSelected,
    handleMultiAlign,
    handleMultiDistribute
  } = g
  return (
    <>
      {/* Screen-Space Floating Multi-Selection Alignment, Distribution, Batch Fill/Color, Lock & Layer Bar */}
      {effectiveSelectedIds.length >= 2 && !panning && !marqueeRect && !drawingArrow
        ? (() => {
            let minX = Number.POSITIVE_INFINITY
            let minY = Number.POSITIVE_INFINITY
            let maxX = Number.NEGATIVE_INFINITY
            let maxY = Number.NEGATIVE_INFINITY
            let allLocked = true
            for (const id of effectiveSelectedIds) {
              const b = boxMap.get(id)
              if (b) {
                minX = Math.min(minX, b.x)
                minY = Math.min(minY, b.y)
                maxX = Math.max(maxX, b.x + b.w)
                maxY = Math.max(maxY, b.y + b.h)
              }
              if (!stickiesById.get(id)?.locked) {
                allLocked = false
              }
            }
            const groupAnchor: BoxRect = Number.isFinite(minX)
              ? {
                  x: minX - 10,
                  y: minY - 10,
                  w: maxX - minX + 20,
                  h: maxY - minY + 20
                }
              : { x: 240, y: 180, w: 320, h: 120 }

            return (
              <ClampedFloatingToolbar anchorRect={groupAnchor} view={view} containerRef={rootRef}>
                <WhiteboardMultiSelectBar
                  selectedCount={effectiveSelectedIds.length}
                  activeColor={activeShapeColor}
                  activeFillStyle={activeFillStyle}
                  allLocked={allLocked}
                  onAlign={handleMultiAlign}
                  onDistribute={handleMultiDistribute}
                  onBatchColor={(c) => {
                    setActiveShapeColor(c)
                    const patches: Record<string, Partial<SpaceStickyNote>> = {}
                    for (const id of effectiveSelectedIds) {
                      if (!stickiesById.get(id)?.locked) {
                        patches[id] = { color: c }
                      }
                    }
                    onBatchUpdateStickyNotes?.(patches)
                  }}
                  onBatchFillStyle={(fs) => {
                    setActiveFillStyle(fs)
                    const patches: Record<string, Partial<SpaceStickyNote>> = {}
                    for (const id of effectiveSelectedIds) {
                      const it = stickiesById.get(id)
                      if (it && !it.locked) {
                        patches[id] = {
                          fillStyle: fs,
                          ...(fs === 'paper' || fs === 'paper-light' ? { color: 'paper' } : {}),
                          ...(it.kind === 'text' &&
                          fs !== 'none' &&
                          (!it.borderStyle || it.borderStyle === 'none')
                            ? { borderStyle: 'solid' }
                            : {})
                        }
                      }
                    }
                    onBatchUpdateStickyNotes?.(patches)
                  }}
                  onBringToFront={() => bringIdsToFront(effectiveSelectedIds)}
                  onSendToBack={() => sendIdsToBack(effectiveSelectedIds)}
                  onDuplicate={duplicateSelected}
                  onToggleLock={(nextLocked) => {
                    if (nextLocked) {
                      setEditingStickyId(null)
                    }
                    const patches: Record<string, Partial<SpaceStickyNote>> = {}
                    for (const id of effectiveSelectedIds) {
                      patches[id] = { locked: nextLocked }
                    }
                    onBatchUpdateStickyNotes?.(patches)
                  }}
                  onDelete={() => {
                    deleteSelected()
                  }}
                  onClearSelection={() => setSelectedStickyIds([])}
                />
              </ClampedFloatingToolbar>
            )
          })()
        : null}
    </>
  )
}
