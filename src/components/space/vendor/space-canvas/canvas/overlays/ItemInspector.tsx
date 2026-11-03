// WS-0 (TASK_16 wave 2): floating inspector for one selected note / shape / text card,
// moved verbatim from space-canvas.tsx. Owner: WS-E (color picker lands here).
// WS-E: a second row under the inspector: fill colour + opacity (controls/ColorField.tsx; no x/y/w/h).
// The selection context menu (overlays/ContextMenus.tsx) renders here too; nothing while closed.
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import { ClampedFloatingToolbar } from '../canvas-parts'
import type { SpaceStickyNote } from '../../core/space'
import { WhiteboardItemInspector } from '../../whiteboard-toolbar'
import { ColorField } from '../controls/ColorField'
import { CanvasContextMenu } from './ContextMenus'

export function ItemInspector({
  ctx,
  g
}: {
  ctx: CanvasCtx
  g: CanvasHandlers
}): React.JSX.Element {
  const {
    boxMap,
    drawingArrow,
    editingStickyId,
    marqueeRect,
    onChangeToolMode,
    onUpdateStickyNote,
    panning,
    rootRef,
    setActiveFillStyle,
    setActiveShapeColor,
    setActiveShapeType,
    setEditingStickyId,
    singleSelectedSticky,
    view
  } = ctx
  const { bringIdsToFront, sendIdsToBack, duplicateSelected, deleteSelected, startArrowDrag } = g
  return (
    <>
      {/* Crisp 1:1 Screen-Space Floating Item Inspector above (or below near top edge) single selected item */}
      {singleSelectedSticky && !panning && !marqueeRect && !drawingArrow
        ? (() => {
            const selBox = boxMap.get(singleSelectedSticky.id)
            if (!selBox) {
              return null
            }
            const kind = singleSelectedSticky.kind ?? 'note'
            const hasBg = Boolean(
              singleSelectedSticky.fillStyle && singleSelectedSticky.fillStyle !== 'none'
            )
            const defaultBold = kind === 'text' && !hasBg
            const defaultFontSize = kind === 'text' ? (hasBg ? 18 : 36) : kind === 'shape' ? 16 : 14
            const curBold =
              (singleSelectedSticky.fontWeight ??
                (defaultBold ? 'bold' : kind === 'shape' ? 'semibold' : 'normal')) === 'bold'

            return (
              <ClampedFloatingToolbar anchorRect={selBox} view={view} containerRef={rootRef}>
                <div className="flex max-w-full flex-col items-center gap-1">
                  <WhiteboardItemInspector
                    kind={kind}
                    shapeType={singleSelectedSticky.shapeType ?? 'rounded'}
                    fillStyle={
                      singleSelectedSticky.fillStyle ?? (kind === 'text' ? 'none' : 'soft')
                    }
                    borderStyle={
                      singleSelectedSticky.borderStyle ??
                      (kind === 'text' && !hasBg ? 'none' : 'solid')
                    }
                    color={singleSelectedSticky.color ?? 'amber'}
                    fontSize={singleSelectedSticky.fontSize ?? defaultFontSize}
                    fontFamily={singleSelectedSticky.fontFamily ?? 'sans'}
                    bold={curBold}
                    textAlign={
                      singleSelectedSticky.textAlign ?? (kind === 'shape' ? 'center' : 'left')
                    }
                    locked={Boolean(singleSelectedSticky.locked)}
                    isEditing={editingStickyId === singleSelectedSticky.id}
                    onChangeShapeType={(st) => {
                      setActiveShapeType(st)
                      onUpdateStickyNote?.(singleSelectedSticky.id, { shapeType: st })
                    }}
                    onConvertToShape={(st = 'rounded') => {
                      const curFill = singleSelectedSticky.fillStyle
                      const nextFill = !curFill || curFill === 'none' ? 'soft' : curFill
                      onUpdateStickyNote?.(singleSelectedSticky.id, {
                        kind: 'shape',
                        shapeType: st,
                        fillStyle: nextFill,
                        borderStyle: 'solid',
                        textAlign: 'center',
                        w: Math.max(180, selBox.w),
                        h: Math.max(88, selBox.h),
                        fontSize: Math.min(36, singleSelectedSticky.fontSize ?? 20)
                      })
                    }}
                    onChangeFillStyle={(fs) => {
                      setActiveFillStyle(fs)
                      const patch: Partial<SpaceStickyNote> = { fillStyle: fs }
                      if (fs === 'paper' || fs === 'paper-light') {
                        patch.color = 'paper'
                      }
                      if (
                        kind === 'text' &&
                        fs !== 'none' &&
                        (!singleSelectedSticky.borderStyle ||
                          singleSelectedSticky.borderStyle === 'none')
                      ) {
                        patch.borderStyle = 'solid'
                      }
                      onUpdateStickyNote?.(singleSelectedSticky.id, patch)
                    }}
                    onChangeBorderStyle={(bs) =>
                      onUpdateStickyNote?.(singleSelectedSticky.id, { borderStyle: bs })
                    }
                    onChangeColor={(c) => {
                      setActiveShapeColor(c)
                      onUpdateStickyNote?.(singleSelectedSticky.id, { color: c })
                    }}
                    onChangeFontSize={(sz) =>
                      onUpdateStickyNote?.(singleSelectedSticky.id, { fontSize: sz })
                    }
                    onChangeFontFamily={(ff) =>
                      onUpdateStickyNote?.(singleSelectedSticky.id, { fontFamily: ff })
                    }
                    onToggleBold={(b) =>
                      onUpdateStickyNote?.(singleSelectedSticky.id, {
                        fontWeight: b ? 'bold' : 'normal'
                      })
                    }
                    onChangeTextAlign={(al) =>
                      onUpdateStickyNote?.(singleSelectedSticky.id, { textAlign: al })
                    }
                    onBringToFront={() => bringIdsToFront([singleSelectedSticky.id])}
                    onSendToBack={() => sendIdsToBack([singleSelectedSticky.id])}
                    onToggleLock={(lk) => {
                      if (lk) {
                        setEditingStickyId(null)
                      }
                      onUpdateStickyNote?.(singleSelectedSticky.id, { locked: lk })
                    }}
                    onEditText={() =>
                      setEditingStickyId((cur) =>
                        cur === singleSelectedSticky.id ? null : singleSelectedSticky.id
                      )
                    }
                    onDuplicate={duplicateSelected}
                    onStartConnectDrag={(ev) => startArrowDrag(ev, singleSelectedSticky.id)}
                    onConnect={() => onChangeToolMode?.('arrow')}
                    onDelete={() => {
                      deleteSelected()
                    }}
                  />
                  {singleSelectedSticky.locked ? null : (
                    <ColorField
                      color={singleSelectedSticky.color ?? 'amber'}
                      opacity={singleSelectedSticky.opacity}
                      onChangeColor={(c) => {
                        setActiveShapeColor(c)
                        onUpdateStickyNote?.(singleSelectedSticky.id, { color: c })
                      }}
                      onChangeOpacity={(op) =>
                        onUpdateStickyNote?.(singleSelectedSticky.id, { opacity: op })
                      }
                    />
                  )}
                </div>
              </ClampedFloatingToolbar>
            )
          })()
        : null}
      <CanvasContextMenu ctx={ctx} g={g} />
    </>
  )
}
