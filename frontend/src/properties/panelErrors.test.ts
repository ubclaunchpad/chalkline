import { describe, expect, it } from 'vitest'
import type { ComponentData } from '../catalog/catalog.ts'
import {
  errorsAfterSave,
  errorsAfterSceneChange,
  visibleErrors,
  type PanelErrors,
} from './panelErrors.ts'

const database: ComponentData = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const withProps = (props: Partial<typeof database.props>): ComponentData => ({
  ...database,
  props: { ...database.props, ...props },
})

// Errors after a rejected replicas 0 and a rejected empty name on 'db'.
const failed: PanelErrors = {
  elementId: 'db',
  errors: {
    replicas: { message: 'must be at least 1', savedValue: 1 },
    name: { message: 'is required', savedValue: 'Users DB' },
  },
}

describe('errorsAfterSave', () => {
  it('records a rejected field with its message and saved value', () => {
    expect(
      errorsAfterSave(null, 'db', database, { props: { replicas: 0 } }, [
        'replicas must be at least 1',
      ]),
    ).toEqual({
      elementId: 'db',
      errors: { replicas: { message: 'must be at least 1', savedValue: 1 } },
    })
  })

  it('clears only the fields the save changed', () => {
    const next = errorsAfterSave(
      failed,
      'db',
      database,
      { props: { replicas: 2 } },
      [],
    )

    expect(visibleErrors(next, 'db')).toEqual({ name: 'is required' })
  })

  it('counts a rename as changing the name', () => {
    const next = errorsAfterSave(
      failed,
      'db',
      database,
      { name: 'Orders DB' },
      [],
    )

    expect(visibleErrors(next, 'db')).toEqual({
      replicas: 'must be at least 1',
    })
  })

  it("does not keep another element's errors", () => {
    expect(
      errorsAfterSave(failed, 'cache', database, { name: 'Cache' }, []),
    ).toBeNull()
  })

  it('returns null once no errors are left', () => {
    expect(
      errorsAfterSave(
        failed,
        'db',
        database,
        { name: 'Orders DB', props: { replicas: 2 } },
        [],
      ),
    ).toBeNull()
  })
})

describe('errorsAfterSceneChange', () => {
  it('returns the same object when nothing changed', () => {
    expect(
      errorsAfterSceneChange(failed, { elementId: 'db', data: database }),
    ).toBe(failed)
  })

  it('drops an error once its saved value changes', () => {
    const next = errorsAfterSceneChange(failed, {
      elementId: 'db',
      data: withProps({ replicas: 4 }),
    })

    expect(visibleErrors(next, 'db')).toEqual({ name: 'is required' })
  })

  it('drops a name error once the name changes', () => {
    const next = errorsAfterSceneChange(failed, {
      elementId: 'db',
      data: { ...database, name: 'Orders DB' },
    })

    expect(visibleErrors(next, 'db')).toEqual({
      replicas: 'must be at least 1',
    })
  })

  it('keeps a dropped error dropped when the value returns', () => {
    const changed = errorsAfterSceneChange(failed, {
      elementId: 'db',
      data: withProps({ replicas: 4 }),
    })
    const returned = errorsAfterSceneChange(changed, {
      elementId: 'db',
      data: database,
    })

    expect(visibleErrors(returned, 'db')).toEqual({ name: 'is required' })
  })

  it('drops everything when another component or nothing is selected', () => {
    expect(
      errorsAfterSceneChange(failed, { elementId: 'cache', data: database }),
    ).toBeNull()
    expect(errorsAfterSceneChange(failed, null)).toBeNull()
  })
})

describe('visibleErrors', () => {
  it('shows messages only for the selected element', () => {
    expect(visibleErrors(failed, 'db')).toEqual({
      replicas: 'must be at least 1',
      name: 'is required',
    })
    expect(visibleErrors(failed, 'cache')).toEqual({})
    expect(visibleErrors(null, 'db')).toEqual({})
  })
})
