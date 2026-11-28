import { describe, expect, it } from 'vitest'
import { fieldErrors } from './fieldErrors.ts'

describe('fieldErrors', () => {
  it('returns no errors for no problems', () => {
    expect(fieldErrors([])).toEqual({})
  })

  it('groups each problem under the field it starts with, without the key', () => {
    expect(
      fieldErrors(['name is required', 'ttlSeconds must be at least 1']),
    ).toEqual({
      name: 'is required',
      ttlSeconds: 'must be at least 1',
    })
  })

  it('keeps the first problem when a field has several', () => {
    expect(
      fieldErrors(['replicas must be a number', 'replicas is required']),
    ).toEqual({ replicas: 'must be a number' })
  })

  it('keeps a one-word problem whole', () => {
    expect(fieldErrors(['invalid'])).toEqual({ invalid: 'invalid' })
  })
})
