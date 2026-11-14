import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import type { Collaborator } from '@excalidraw/excalidraw/types'
import { describe, expect, it } from 'vitest'
import { COLORS, createIdentity } from './identity'
import { toCollaborators } from './presence'

// Exercise the actual patched dependency helpers without loading the canvas/DOM.
// These names belong to the version-specific 0.18.1 patch, including its
// minified production entry point. A dependency upgrade must revisit the patch.
describe.each([
  {
    mode: 'dev',
    hash: 'hashToInteger',
    color: 'getClientColor',
    end: 'var getNameInitial =',
  },
  { mode: 'prod', hash: 'uI', color: 'Tn', end: ',lv=' },
])('Excalidraw $mode cursor colors', ({ mode, hash, color, end }) => {
  const source = readFileSync(
    new URL(
      `../../node_modules/@excalidraw/excalidraw/dist/${mode}/index.js`,
      import.meta.url,
    ),
    'utf8',
  )
  const start = source.indexOf(`function ${hash}(`)
  const finish = source.indexOf(end, start)
  const patch = source.indexOf(
    '// Chalkline: honor the public Collaborator.color field',
  )
  if (start < 0 || finish < 0 || patch < 0)
    throw new Error('Excalidraw color patch is missing or needs an upgrade')
  const resolve = compileFunction(
    `${source.slice(start, finish)};\n${source.slice(patch)}\nreturn ${color}(socketId, collaborator);`,
    ['socketId', 'collaborator'],
  ) as (socketId: string, collaborator: Collaborator) => unknown

  it('renders every assigned palette color independently of clientId', () => {
    for (const background of COLORS) {
      const collaborator = { color: { background, stroke: background } }
      const first: unknown = resolve('first-client', collaborator)
      const second: unknown = resolve('second-client', collaborator)
      expect(first).toBe(background)
      expect(second).toBe(background)
    }
  })

  it('preserves the upstream fallback when no color was supplied', () => {
    const fallback: unknown = resolve('client', {})
    expect(fallback).toMatch(/^hsl\(/)
  })

  it('renders the same color as the participant identity through the collaborators API', () => {
    const identity = createIdentity('Alice')
    const collaborators = toCollaborators(
      new Map([['alice', { ...identity, x: 120, y: 80, lastSeen: 0 }]]),
    )
    const [clientId, collaborator] = [...collaborators][0]
    const rendered: unknown = resolve(clientId, collaborator)
    expect(rendered).toBe(identity.color)
  })
})
