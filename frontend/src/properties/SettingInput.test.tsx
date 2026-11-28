// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG } from '../catalog/catalog.ts'
import { SettingInput } from './SettingInput.tsx'

const engine = CATALOG.database.settings.engine
const replicas = CATALOG.database.settings.replicas
const basePath = CATALOG.api_gateway.settings.basePath

afterEach(() => {
  cleanup()
})

describe('SettingInput', () => {
  describe('choice setting', () => {
    it('shows a labelled dropdown of the options', () => {
      render(
        <SettingInput
          id="engine"
          setting={engine}
          value="PostgreSQL"
          onCommit={vi.fn()}
        />,
      )

      const select = screen.getByLabelText<HTMLSelectElement>('Engine')
      const options = Array.from(select.options).map((option) => option.value)

      expect(select.tagName).toBe('SELECT')
      expect(select.value).toBe('PostgreSQL')
      expect(options).toEqual(['PostgreSQL', 'MySQL', 'MongoDB', 'DynamoDB'])
    })

    it('commits a new option straight away', () => {
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="engine"
          setting={engine}
          value="PostgreSQL"
          onCommit={onCommit}
        />,
      )

      fireEvent.change(screen.getByLabelText('Engine'), {
        target: { value: 'MySQL' },
      })

      expect(onCommit).toHaveBeenCalledWith('MySQL')
    })
  })

  describe('number setting', () => {
    it('shows a number box with the minimum', () => {
      render(
        <SettingInput
          id="replicas"
          setting={replicas}
          value={1}
          onCommit={vi.fn()}
        />,
      )

      const input = screen.getByLabelText<HTMLInputElement>('Replicas')

      expect(input.type).toBe('number')
      expect(input.min).toBe('1')
      expect(input.value).toBe('1')
    })

    it('does not commit while typing', () => {
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="replicas"
          setting={replicas}
          value={1}
          onCommit={onCommit}
        />,
      )

      fireEvent.change(screen.getByLabelText('Replicas'), {
        target: { value: '3' },
      })

      expect(onCommit).not.toHaveBeenCalled()
    })

    it('commits a number when the box loses focus', () => {
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="replicas"
          setting={replicas}
          value={1}
          onCommit={onCommit}
        />,
      )

      const input = screen.getByLabelText('Replicas')
      fireEvent.change(input, { target: { value: '3' } })
      fireEvent.blur(input)

      expect(onCommit).toHaveBeenCalledWith(3)
    })

    it('commits an empty box as NaN, not 0, so it is never saved', () => {
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="replicas"
          setting={replicas}
          value={1}
          onCommit={onCommit}
        />,
      )

      const input = screen.getByLabelText('Replicas')
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)

      expect(onCommit).toHaveBeenCalledWith(Number.NaN)
    })
  })

  describe('text setting', () => {
    it('commits when Enter is pressed', () => {
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="basePath"
          setting={basePath}
          value="/api"
          onCommit={onCommit}
        />,
      )

      const input = screen.getByLabelText<HTMLInputElement>('Base path')
      fireEvent.change(input, { target: { value: '/v2' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(input.type).toBe('text')
      expect(onCommit).toHaveBeenCalledWith('/v2')
    })

    it('does not commit when the value did not change', () => {
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="basePath"
          setting={basePath}
          value="/api"
          onCommit={onCommit}
        />,
      )

      const input = screen.getByLabelText('Base path')
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.blur(input)

      expect(onCommit).not.toHaveBeenCalled()
    })
  })

  describe('errors', () => {
    it('shows the error and links it to the input', () => {
      render(
        <SettingInput
          id="replicas"
          setting={replicas}
          value={1}
          error="replicas must be at least 1"
          onCommit={vi.fn()}
        />,
      )

      const input = screen.getByLabelText('Replicas')
      const message = screen.getByText('replicas must be at least 1')

      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(input.getAttribute('aria-describedby')).toBe(message.id)
    })

    it('commits the saved value again so a stale error can clear', () => {
      // After a rejected 0, the user types the saved value back.
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="replicas"
          setting={replicas}
          value={1}
          error="must be at least 1"
          onCommit={onCommit}
        />,
      )

      const input = screen.getByLabelText('Replicas')
      fireEvent.change(input, { target: { value: '1' } })
      fireEvent.blur(input)

      expect(onCommit).toHaveBeenCalledWith(1)
    })

    it('is not marked invalid without an error', () => {
      render(
        <SettingInput
          id="replicas"
          setting={replicas}
          value={1}
          onCommit={vi.fn()}
        />,
      )

      const input = screen.getByLabelText('Replicas')

      expect(input.hasAttribute('aria-invalid')).toBe(false)
      expect(input.hasAttribute('aria-describedby')).toBe(false)
    })
  })

  describe('delayed commit', () => {
    const DELAY_MS = 300

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function renderDelayed(onCommit: (value: string | number) => void) {
      return render(
        <SettingInput
          id="basePath"
          setting={basePath}
          value="/api"
          onCommit={onCommit}
          commitDelayMs={DELAY_MS}
        />,
      )
    }

    it('does not commit before the pause ends', () => {
      const onCommit = vi.fn()
      renderDelayed(onCommit)

      fireEvent.change(screen.getByLabelText('Base path'), {
        target: { value: '/v2' },
      })
      vi.advanceTimersByTime(DELAY_MS - 1)

      expect(onCommit).not.toHaveBeenCalled()
    })

    it('commits once after the pause', () => {
      const onCommit = vi.fn()
      renderDelayed(onCommit)

      fireEvent.change(screen.getByLabelText('Base path'), {
        target: { value: '/v2' },
      })
      vi.advanceTimersByTime(DELAY_MS)

      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(onCommit).toHaveBeenCalledWith('/v2')
    })

    it('restarts the wait when the user keeps typing', () => {
      const onCommit = vi.fn()
      renderDelayed(onCommit)
      const input = screen.getByLabelText('Base path')

      fireEvent.change(input, { target: { value: '/v' } })
      vi.advanceTimersByTime(DELAY_MS - 100)
      fireEvent.change(input, { target: { value: '/v2' } })
      vi.advanceTimersByTime(DELAY_MS - 100)

      expect(onCommit).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)

      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(onCommit).toHaveBeenCalledWith('/v2')
    })

    it('does not retry a failed commit while the user is idle', () => {
      // Rejected: same value, but a new error and onCommit.
      const onCommit = vi.fn()
      const { rerender } = renderDelayed(onCommit)

      fireEvent.change(screen.getByLabelText('Base path'), {
        target: { value: '' },
      })
      vi.advanceTimersByTime(DELAY_MS)
      rerender(
        <SettingInput
          id="basePath"
          setting={basePath}
          value="/api"
          error="basePath is required"
          onCommit={(value: string | number) => {
            onCommit(value)
          }}
          commitDelayMs={DELAY_MS}
        />,
      )
      vi.advanceTimersByTime(DELAY_MS * 5)

      expect(onCommit).toHaveBeenCalledTimes(1)
    })

    it('does not commit after it is removed', () => {
      const onCommit = vi.fn()
      const { unmount } = renderDelayed(onCommit)

      fireEvent.change(screen.getByLabelText('Base path'), {
        target: { value: '/v2' },
      })
      unmount()
      vi.advanceTimersByTime(DELAY_MS)

      expect(onCommit).not.toHaveBeenCalled()
    })

    it('shows a new saved value from outside', () => {
      const { rerender } = renderDelayed(vi.fn())

      rerender(
        <SettingInput
          id="basePath"
          setting={basePath}
          value="/v3"
          onCommit={vi.fn()}
          commitDelayMs={DELAY_MS}
        />,
      )

      expect(screen.getByLabelText<HTMLInputElement>('Base path').value).toBe(
        '/v3',
      )
    })

    it('waits for blur or Enter when no delay is given', () => {
      const onCommit = vi.fn()
      render(
        <SettingInput
          id="basePath"
          setting={basePath}
          value="/api"
          onCommit={onCommit}
        />,
      )

      fireEvent.change(screen.getByLabelText('Base path'), {
        target: { value: '/v2' },
      })
      vi.advanceTimersByTime(DELAY_MS * 10)

      expect(onCommit).not.toHaveBeenCalled()
    })
  })
})
