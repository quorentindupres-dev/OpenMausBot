import React from 'react'
import { isImageEmoji } from './core/space'

export const MAX_SPACE_ICON_FILE_BYTES = 5 * 1024 * 1024
export const MAX_SPACE_ICON_RAW_BYTES = 30_000

export function SpaceEmojiGraphic({
  value,
  className = 'size-5'
}: {
  value: string
  className?: string
}): React.JSX.Element {
  if (isImageEmoji(value)) {
    return (
      <img
        src={value}
        alt=""
        draggable={false}
        className={`${className} rounded-sm object-contain select-none`}
      />
    )
  }
  return <span className="leading-none select-none">{value}</span>
}

export async function readCustomEmojiFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file')
  }
  if (file.size > MAX_SPACE_ICON_FILE_BYTES) {
    throw new Error('Image is over 5 MB')
  }
  if (file.type === 'image/svg+xml' && file.size > MAX_SPACE_ICON_RAW_BYTES) {
    throw new Error('SVG icon is over 30 KB')
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!rawDataUrl) {
        reject(new Error('Empty image'))
        return
      }
      if (
        (file.type === 'image/svg+xml' || file.type === 'image/gif') &&
        rawDataUrl.length <= MAX_SPACE_ICON_RAW_BYTES
      ) {
        resolve(rawDataUrl)
        return
      }
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image'))
      img.onload = () => {
        const maxDim = 64
        const scale = Math.min(1, maxDim / Math.max(img.width || 64, img.height || 64))
        const w = Math.max(16, Math.round((img.width || 64) * scale))
        const h = Math.max(16, Math.round((img.height || 64) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not decode image'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const webp = canvas.toDataURL('image/webp', 0.88)
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'))
      }
      img.src = rawDataUrl
    }
    reader.readAsDataURL(file)
  })
}
