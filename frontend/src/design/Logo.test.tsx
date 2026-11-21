// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Logo } from './Logo'

afterEach(cleanup)

describe('Logo', () => {
  it('renders the approved wordmark with an accessible name and proportions', () => {
    render(<Logo />)

    const logo = screen.getByRole('img', { name: 'Chalkline' })
    expect(logo.getAttribute('width')).toBe('619')
    expect(logo.getAttribute('height')).toBe('109')
    expect(logo.getAttribute('src')).toContain('chalkline-wordmark.svg')
  })

  it('can be marked decorative', () => {
    render(<Logo decorative data-testid="logo" />)

    expect(screen.getByTestId('logo').getAttribute('alt')).toBe('')
  })
})
