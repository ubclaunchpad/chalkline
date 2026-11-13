// @vitest-environment jsdom
import { IconPencil } from '@tabler/icons-react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChalklineIcon, ICON_STROKE_WIDTH } from './Icon'

afterEach(cleanup)

describe('ChalklineIcon', () => {
  it('uses the shared stroke and hides decorative icons', () => {
    const { container } = render(<ChalklineIcon icon={IconPencil} />)
    const icon = container.querySelector('svg')

    expect(icon?.getAttribute('stroke-width')).toBe(String(ICON_STROKE_WIDTH))
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.hasAttribute('role')).toBe(false)
  })

  it('gives informative icons an accessible name', () => {
    render(
      <ChalklineIcon
        icon={IconPencil}
        decorative={false}
        label="Edit board title"
      />,
    )

    expect(screen.getByRole('img', { name: 'Edit board title' })).toBeTruthy()
  })
})
