// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

// Adding needs the real editor; these tests only cover the panel itself.
vi.mock('@excalidraw/excalidraw', () => ({
  FONT_FAMILY: { Virgil: 1, Helvetica: 2, Cascadia: 3, Nunito: 6 },
}))

afterEach(cleanup)

const search = () =>
  screen.getByRole('searchbox', { name: 'Search components' })

describe('Sidebar', () => {
  it('lists every kind as a tile under its group', () => {
    render(<Sidebar excalidrawAPI={null} onClose={vi.fn()} />)
    const data = screen.getByRole('region', { name: 'Data' })
    expect(data.textContent).toContain('Database')
    expect(screen.getByRole('button', { name: /Add Client:/ })).toBeDefined()
  })

  it('filters by name and hides empty groups', () => {
    render(<Sidebar excalidrawAPI={null} onClose={vi.fn()} />)
    fireEvent.change(search(), { target: { value: 'cache' } })
    expect(screen.getByRole('button', { name: /Add Cache:/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Add Client:/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Compute' })).toBeNull()
  })

  it('says when nothing matches', () => {
    render(<Sidebar excalidrawAPI={null} onClose={vi.fn()} />)
    fireEvent.change(search(), { target: { value: 'zzz' } })
    expect(screen.getByText('No components match “zzz”')).toBeDefined()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Sidebar excalidrawAPI={null} onClose={onClose} />)
    fireEvent.keyDown(search(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
