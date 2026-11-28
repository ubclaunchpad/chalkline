import { describe, expect, it } from 'vitest'
import { canvasColor } from '../design/canvasColor.ts'
import { catalog } from '../sidebar/catalog.ts'
import { cardIconFiles, iconFileId } from './cardIcons.ts'

const decode = (dataURL: string) =>
  atob(dataURL.replace('data:image/svg+xml;base64,', ''))

describe('cardIconFiles', () => {
  const files = cardIconFiles(catalog)

  it('makes one file per kind with a fixed id', () => {
    expect(files.map((file) => file.id)).toEqual(
      catalog.map((entry) => iconFileId(entry.kind)),
    )
    expect(iconFileId('database')).toBe('chalkline-icon-database')
  })

  it('makes the same files every time, so every window agrees', () => {
    expect(cardIconFiles(catalog)).toEqual(files)
  })

  it('draws each icon in its kind’s accent, converted for the canvas', () => {
    catalog.forEach((entry, index) => {
      const svg = decode(files[index].dataURL)
      expect(files[index].mimeType).toBe('image/svg+xml')
      expect(svg).toMatch(/^<svg[\s>]/)
      expect(svg).not.toContain('currentColor')
      expect(svg).toContain(`stroke="${canvasColor(entry.color)}"`)
    })
  })
})
