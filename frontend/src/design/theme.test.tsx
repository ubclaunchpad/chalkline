// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChalklineTheme } from './theme'

afterEach(cleanup)

function ThemeSample({ theme }: { theme: ChalklineTheme }) {
  return (
    <div
      data-testid={`${theme}-sample`}
      data-theme={theme}
      className="grid gap-grid bg-canvas p-4 font-sans text-body text-ink"
    >
      <section className="rounded-lg border border-border bg-surface p-3">
        <p className="text-label text-ink-muted">Secondary label</p>
        <p className="font-handwriting text-handwriting">Handwritten note</p>
        <button
          type="button"
          className="rounded-sm bg-accent px-4 py-2 text-on-accent hover:bg-accent-hover active:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          Sample action
        </button>
      </section>
    </div>
  )
}

describe('theme samples', () => {
  it.each(['dark', 'light'] as const)(
    'renders the %s semantic mapping',
    (theme) => {
      render(<ThemeSample theme={theme} />)

      expect(screen.getByTestId(`${theme}-sample`).dataset.theme).toBe(theme)
      expect(screen.getByRole('button', { name: 'Sample action' })).toBeTruthy()
    },
  )
})
