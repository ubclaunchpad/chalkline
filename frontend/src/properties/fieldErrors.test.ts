import { describe, expect, it } from 'vitest'
import { fieldErrors } from './fieldErrors.ts'

describe('fieldErrors', () => {
  it('returns no errors for no problems', () => {
    expect(fieldErrors([])).toEqual({})
  })

  it('groups each problem under the field it starts with', () => {
    expect(
      fieldErrors(['name is required', 'replicas must be at least 1']),
    ).toEqual({
      name: 'name is required',
      replicas: 'replicas must be at least 1',
    })
  })

  it('keeps the first problem when a field has several', () => {
    expect(
      fieldErrors(['replicas must be a number', 'replicas is required']),
    ).toEqual({ replicas: 'replicas must be a number' })
  })
})
