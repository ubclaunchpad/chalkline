// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ParticipantAvatars } from './ParticipantAvatars'
import type { Participant } from './presence'

afterEach(cleanup)

const participant = (name: string, color: string): Participant => ({
  name,
  color,
  x: 10,
  y: 20,
  lastSeen: 1,
})

describe('ParticipantAvatars', () => {
  it('shows participants as a labelled horizontal avatar list', () => {
    const participants = new Map<string, Participant>([
      ['remote-a', participant('Ada Vale', '#e03131')],
    ])

    render(
      <ParticipantAvatars
        identity={{ name: 'Anson Chan', color: '#2f9e44' }}
        participants={participants}
      />,
    )

    expect(
      screen.getByRole('list', { name: 'Board participants, 2 present' }),
    ).toBeDefined()
    expect(screen.getByLabelText('Anson Chan (you)')).toBeDefined()
    expect(screen.getByLabelText('Ada Vale')).toBeDefined()
    // Each avatar has a ring in that person's colour.
    expect(screen.getByLabelText('Ada Vale').style.boxShadow).toContain(
      '#e03131',
    )
    expect(
      screen.getByLabelText('Anson Chan (you)').style.backgroundColor,
    ).toBe('')
    expect(screen.getByText('AC')).toBeDefined()
    expect(screen.getByText('AV')).toBeDefined()
    expect(screen.queryByText('A(')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows two avatars and +2 when four people are present', () => {
    const participants = new Map<string, Participant>([
      ['a', participant('Ada Vale', '#e03131')],
      ['b', participant('Jenny Kim', '#74c0fc')],
      ['c', participant('Grace Hopper', '#f08c00')],
    ])

    render(
      <ParticipantAvatars
        identity={{ name: 'Anson Chan', color: '#2f9e44' }}
        participants={participants}
      />,
    )

    expect(
      screen.getByRole('list', { name: 'Board participants, 4 present' }),
    ).toBeDefined()
    expect(screen.getByLabelText('Anson Chan (you)')).toBeDefined()
    expect(screen.getByLabelText('Ada Vale')).toBeDefined()
    expect(screen.getByLabelText('2 additional participants')).toBeDefined()
    expect(screen.queryByLabelText('Jenny Kim')).toBeNull()
    expect(screen.queryByLabelText('Grace Hopper')).toBeNull()
  })
})
