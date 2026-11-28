import { describe, expect, it } from 'vitest'
import { CATALOG } from '../catalog/catalog'
import { catalog } from './catalog'

describe('catalog icons', () => {
  it('gives every kind in the catalog an entry', () => {
    expect(catalog.map((entry) => entry.kind).sort()).toEqual(
      Object.keys(CATALOG).sort(),
    )
  })

  it.each(catalog.map((entry) => [entry.kind, entry.icon] as const))(
    'gives %s a 24x24 SVG icon drawn in currentColor',
    (_kind, icon) => {
      expect(icon.trim()).toMatch(/^<svg[\s>]/)
      expect(icon).toContain('viewBox="0 0 24 24"')
      expect(icon).toContain('currentColor')
    },
  )

  it('gives each kind a different icon', () => {
    const icons = new Set(catalog.map((entry) => entry.icon))
    expect(icons.size).toBe(catalog.length)
  })
})
