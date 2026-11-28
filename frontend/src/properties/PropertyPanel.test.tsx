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

      // The save returns as a new version; the box must survive it.
      rerender(
        <PropertyPanel
          elementId="db"
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

  it('keeps focus on a setting after it saves', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <PropertyPanel
        elementId="db"
        data={database}
        errors={{}}
        onChange={onChange}
      />,
    )

    const replicas = screen.getByLabelText('Replicas')
    replicas.focus()
    fireEvent.change(replicas, { target: { value: '3' } })
    fireEvent.keyDown(replicas, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith({ props: { replicas: 3 } })

    // The save comes back as a new version of the same element.
    rerender(
      <PropertyPanel
        elementId="db"
        data={{ ...database, props: { ...database.props, replicas: 3 } }}
        errors={{}}
        onChange={onChange}
      />,
    )

    expect(screen.getByLabelText('Replicas')).toBe(replicas)
    expect(document.activeElement).toBe(replicas)
    expect(inputValue('Replicas')).toBe('3')
  })

  it('keeps a half-typed draft when someone else changes another setting', () => {
    const { rerender } = render(
      <PropertyPanel
        elementId="db"
        data={database}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    const replicas = screen.getByLabelText('Replicas')
    replicas.focus()
    fireEvent.change(replicas, { target: { value: '5' } })

    // A collaborator switches the engine before this box is saved.
    rerender(
      <PropertyPanel
        elementId="db"
        data={{ ...database, props: { ...database.props, engine: 'MySQL' } }}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    expect(inputValue('Engine')).toBe('MySQL')
    expect(inputValue('Replicas')).toBe('5')
    expect(document.activeElement).toBe(replicas)
  })

  it('shows a collaborator change to the setting itself', () => {
    const { rerender } = render(
      <PropertyPanel
        elementId="db"
        data={database}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    rerender(
      <PropertyPanel
        elementId="db"
        data={{ ...database, props: { ...database.props, replicas: 4 } }}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    expect(inputValue('Replicas')).toBe('4')
  })

  it('starts fresh drafts when another component is selected', () => {
    const { rerender } = render(
      <PropertyPanel
        elementId="db"
        data={database}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Replicas'), {
      target: { value: '9' },
    })

    rerender(
      <PropertyPanel
        elementId="db-other"
        data={database}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    expect(inputValue('Replicas')).toBe('2')
  })

  it('shows each error next to its input', () => {
    render(
      <PropertyPanel
        elementId="db"
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
