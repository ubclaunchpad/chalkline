import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COLORS,
  IDENTITY_KEY,
  colorForName,
  createIdentity,
  guestName,
  loadIdentity,
  saveIdentity,
} from './identity'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('identity', () => {
  it('starts a first visit without an identity and persists the chosen name', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
      },
    })
    expect(loadIdentity()).toBeNull()
    const identity = createIdentity('  Kathy  ')
    saveIdentity(identity)
    expect(storage.get(IDENTITY_KEY)).toBe('Kathy')
    expect(loadIdentity()).toEqual(identity)
  })

  it('rejects blank names and ignores blank stored identities', () => {
    expect(() => createIdentity('  ')).toThrow('Enter a display name')
    vi.stubGlobal('window', { localStorage: { getItem: () => '  ' } })
    expect(loadIdentity()).toBeNull()
  })

  it('continues when reading or writing storage is denied', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('denied')
      },
    })
    expect(loadIdentity()).toBeNull()
    expect(() => {
      saveIdentity(createIdentity('Kathy'))
    }).not.toThrow()
  })

  it('generates exactly four digits, including leading zeroes', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99999)
    expect(guestName()).toBe('Guest0000')
    expect(guestName()).toBe('Guest9999')
  })
})

describe('name colors', () => {
  it('uses a fixed palette of eight distinct colors', () => {
    expect(new Set(COLORS).size).toBe(8)
    const assigned = new Set(
      Array.from({ length: 100 }, (_, i) => colorForName(`Guest${String(i)}`)),
    )
    expect(assigned).toEqual(new Set(COLORS))
  })

  it('assigns deterministic colors for normal, Unicode, and long names', () => {
    // Polynomial hash modulo eight: 75 - 97 + 116 - 104 + 121 = 111.
    expect(colorForName('Kathy')).toBe('#ffc078')
    for (const name of ['Kathy', '你好 👋', 'a'.repeat(1000)]) {
      expect(COLORS).toContain(colorForName(name))
      expect(createIdentity(name).color).toBe(colorForName(name))
    }
  })
})
