import { describe, expect, it } from 'vitest'
import { CATALOG, type ComponentKind } from './catalog.ts'
import { validateComponent } from './validate.ts'

const validDatabase = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const kinds = Object.keys(CATALOG) as ComponentKind[]

function problemsFor(value: unknown): string[] {
  const result = validateComponent(value)
  return result.ok ? [] : result.problems
}

function withoutField(key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(validDatabase).filter(([field]) => field !== key),
  )
}

function withProps(props: Record<string, unknown>) {
  return { ...validDatabase, props }
}

describe('validateComponent', () => {
  it('accepts valid data and returns it', () => {
    expect(validateComponent(validDatabase)).toEqual({
      ok: true,
      data: validDatabase,
    })
  })

  it('rejects an unknown kind', () => {
    expect(problemsFor({ ...validDatabase, kind: 'blockchain' })).toEqual([
      `kind must be one of: ${kinds.join(', ')}`,
    ])
  })

  it('rejects a missing name', () => {
    expect(problemsFor(withoutField('name'))).toEqual(['name is required'])
  })

  it('rejects a setting with the wrong type', () => {
    expect(
      problemsFor(withProps({ engine: 'PostgreSQL', replicas: '2' })),
    ).toEqual(['replicas must be a number'])
  })

  it('rejects a number below its minimum', () => {
    expect(
      problemsFor(withProps({ engine: 'PostgreSQL', replicas: 0 })),
    ).toEqual(['replicas must be at least 1'])
  })

  it('rejects a choice that is not in its options', () => {
    expect(problemsFor(withProps({ engine: 'Oracle', replicas: 1 }))).toEqual([
      'engine must be one of: PostgreSQL, MySQL, MongoDB, DynamoDB',
    ])
  })

  it('rejects a missing v', () => {
    expect(problemsFor(withoutField('v'))).toEqual(['v must be 1'])
  })

  it('rejects an unsupported version', () => {
    expect(problemsFor({ ...validDatabase, v: 2 })).toEqual(['v must be 1'])
  })
})

describe('rules', () => {
  it('rejects a missing setting', () => {
    expect(problemsFor(withProps({ engine: 'PostgreSQL' }))).toEqual([
      'replicas is required',
    ])
  })

  it('rejects an unknown setting', () => {
    expect(
      problemsFor(
        withProps({ engine: 'PostgreSQL', replicas: 1, color: 'blue' }),
      ),
    ).toEqual(['unknown setting: color'])
  })

  it('rejects a number that is not whole', () => {
    expect(
      problemsFor(withProps({ engine: 'PostgreSQL', replicas: 1.5 })),
    ).toEqual(['replicas must be a whole number'])
  })

  it('rejects a blank name', () => {
    expect(problemsFor({ ...validDatabase, name: '   ' })).toEqual([
      'name is required',
    ])
  })

  it('accepts a name of exactly 100 characters', () => {
    expect(problemsFor({ ...validDatabase, name: 'a'.repeat(100) })).toEqual([])
  })

  it('rejects a name longer than 100 characters', () => {
    expect(problemsFor({ ...validDatabase, name: 'a'.repeat(101) })).toEqual([
      'name must be at most 100 characters',
    ])
  })
})

describe('untrusted input', () => {
  it.each([null, undefined, 'database', 42, []])(
    'rejects %j as not an object',
    (value) => {
      expect(problemsFor(value)).toEqual(['component data must be an object'])
    },
  )

  it('rejects props that are not an object', () => {
    expect(problemsFor({ ...validDatabase, props: null })).toEqual([
      'props must be an object',
    ])
  })

  it('reports every problem at once', () => {
    const value = {
      v: 2,
      kind: 'database',
      name: '',
      props: { engine: 'Oracle', replicas: 0 },
    }
    expect(problemsFor(value)).toEqual([
      'v must be 1',
      'name is required',
      'engine must be one of: PostgreSQL, MySQL, MongoDB, DynamoDB',
      'replicas must be at least 1',
    ])
  })
})
