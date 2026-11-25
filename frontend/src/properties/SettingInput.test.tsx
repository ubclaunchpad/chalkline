// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

    it('commits an empty box as 0 so the validator can reject it', () => {
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

      expect(onCommit).toHaveBeenCalledWith(0)
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
})
