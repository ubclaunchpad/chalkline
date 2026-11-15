// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentData } from '../catalog/catalog.ts'
import { NAME_COMMIT_DELAY_MS, PropertyPanel } from './PropertyPanel.tsx'

// PropertyPanel only imports a type from updateComponent.ts, which is removed
// when compiling, so Excalidraw is never loaded and needs no mock here.

const database: ComponentData = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 2 },
}

const cache: ComponentData = {
  v: 1,
  kind: 'cache',
  name: 'Session cache',
  props: { engine: 'Redis', strategy: 'Cache-aside', ttlSeconds: 300 },
}

function inputValue(label: string): string {
  return screen.getByLabelText<HTMLInputElement | HTMLSelectElement>(label)
    .value
}

afterEach(() => {
  cleanup()
})

describe('PropertyPanel', () => {
  it("shows a database's kind, name and settings with current values", () => {
    render(
      <PropertyPanel
        elementId="db"
        elementKey="db-1"
        data={database}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('complementary', { name: 'Component settings' }),
    ).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Database' })).toBeDefined()
    expect(inputValue('Name')).toBe('Users DB')
    expect(inputValue('Engine')).toBe('PostgreSQL')
    expect(inputValue('Replicas')).toBe('2')
  })

  it("builds the inputs from the kind's catalog settings", () => {
    render(
      <PropertyPanel
        elementId="cache"
        elementKey="cache-1"
        data={cache}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Cache' })).toBeDefined()
    expect(inputValue('Engine')).toBe('Redis')
    expect(inputValue('Strategy')).toBe('Cache-aside')
    expect(inputValue('TTL (seconds)')).toBe('300')
    expect(screen.queryByLabelText('Replicas')).toBeNull()
  })

  it('reports a setting change', () => {
    const onChange = vi.fn()
    render(
      <PropertyPanel
        elementId="db"
        elementKey="db-1"
        data={database}
        errors={{}}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Engine'), {
      target: { value: 'MySQL' },
    })

    expect(onChange).toHaveBeenCalledWith({ props: { engine: 'MySQL' } })
  })

  it('reports a rename', () => {
    const onChange = vi.fn()
    render(
      <PropertyPanel
        elementId="db"
        elementKey="db-1"
        data={database}
        errors={{}}
        onChange={onChange}
      />,
    )

    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Orders DB' } })
    fireEvent.blur(name)

    expect(onChange).toHaveBeenCalledWith({ name: 'Orders DB' })
  })

  it('reports a rename after a pause in typing, keeping focus on the name', () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      const { rerender } = render(
        <PropertyPanel
          elementId="db"
          elementKey="db-1"
          data={database}
          errors={{}}
          onChange={onChange}
        />,
      )

      const name = screen.getByLabelText('Name')
      name.focus()
      fireEvent.change(name, { target: { value: 'Orders DB' } })
      vi.advanceTimersByTime(NAME_COMMIT_DELAY_MS)

      expect(onChange).toHaveBeenCalledWith({ name: 'Orders DB' })

      // The save comes back as a new version of the same element. The name
      // box must survive it, or the user would lose their place mid-word.
      rerender(
        <PropertyPanel
          elementId="db"
          elementKey="db-2"
          data={{ ...database, name: 'Orders DB' }}
          errors={{}}
          onChange={onChange}
        />,
      )

      expect(screen.getByLabelText('Name')).toBe(name)
      expect(document.activeElement).toBe(name)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows each error next to its input', () => {
    render(
      <PropertyPanel
        elementId="db"
        elementKey="db-1"
        data={database}
        errors={{ replicas: 'replicas must be at least 1' }}
        onChange={vi.fn()}
      />,
    )

    const replicas = screen.getByLabelText('Replicas')
    const message = screen.getByText('replicas must be at least 1')

    expect(replicas.getAttribute('aria-describedby')).toBe(message.id)
    expect(screen.getByLabelText('Engine').hasAttribute('aria-invalid')).toBe(
      false,
    )
  })
})
