// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

// Renaming needs the real editor; these tests render the bar on its own.
vi.mock('@excalidraw/excalidraw', () => ({}))

afterEach(cleanup)

describe('TopBar', () => {
  it('shows the real board identity and supplied working slots', () => {
    render(
      <TopBar
        boardId="architecture-team"
        componentsOpen
        onToggleComponents={vi.fn()}
        status={<span>Connected</span>}
        participants={<span>Participant avatars</span>}
      />,
    )

    expect(screen.getByAltText('Chalkline')).toBeDefined()
    expect(screen.getByText('architecture-team').className).toContain(
      'text-ink-muted',
    )
    expect(screen.getByText('Connected')).toBeDefined()
    expect(screen.getByText('Participant avatars')).toBeDefined()
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /theme/i })).toBeNull()
  })

  it('reports and toggles the component-panel state', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <TopBar
        boardId="demo"
        componentsOpen
        onToggleComponents={onToggle}
        status={null}
        participants={null}
      />,
    )

    const hide = screen.getByRole('button', {
      name: 'Hide components panel',
    })
    expect(hide.getAttribute('aria-controls')).toBe('component-sidebar')
    expect(hide.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(hide)
    expect(onToggle).toHaveBeenCalledOnce()

    rerender(
      <TopBar
        boardId="demo"
        componentsOpen={false}
        onToggleComponents={onToggle}
        status={null}
        participants={null}
      />,
    )
    expect(
      screen
        .getByRole('button', { name: 'Show components panel' })
        .getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('renders a future action only when a working action is supplied', () => {
    render(
      <TopBar
        boardId="demo"
        componentsOpen={false}
        onToggleComponents={vi.fn()}
        status={null}
        participants={null}
        actions={<button type="button">Working action</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Working action' })).toBeDefined()
  })
})
