// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  elapsed,
  formatClock,
  loadProgress,
  saveProgress,
  toggleTimer,
  type Progress,
} from './progress'

const start: Progress = {
  exerciseId: 'url-shortener',
  elapsedMs: 0,
  runningSince: null,
  hintsShown: 0,
}

afterEach(() => {
  localStorage.clear()
})

describe('timer', () => {
  it('counts only while running', () => {
    const running = toggleTimer(start, 1000)
    expect(elapsed(running, 4000)).toBe(3000)
    const paused = toggleTimer(running, 5000)
    expect(paused).toMatchObject({ elapsedMs: 4000, runningSince: null })
    expect(elapsed(paused, 99_000)).toBe(4000)
  })

  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65_999)).toBe('1:05')
    expect(formatClock(3_723_000)).toBe('1:02:03')
  })
})

describe('storage', () => {
  it('saves per board and clears', () => {
    saveProgress('a', start)
    expect(loadProgress('a')).toEqual(start)
    expect(loadProgress('b')).toBeNull()
    saveProgress('a', null)
    expect(loadProgress('a')).toBeNull()
  })

  it('ignores corrupt data', () => {
    localStorage.setItem('chalkline:practice:a', '{"exerciseId":3}')
    expect(loadProgress('a')).toBeNull()
    localStorage.setItem('chalkline:practice:a', 'not json')
    expect(loadProgress('a')).toBeNull()
  })
})
