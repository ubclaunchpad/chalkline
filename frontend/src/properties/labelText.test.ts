import { describe, expect, it } from 'vitest'
import { componentLabelText } from './labelText.ts'

describe('componentLabelText', () => {
  it('puts the name on the first line and the kind on the second', () => {
    expect(componentLabelText('Orders DB', 'database')).toBe(
      'Orders DB\ndatabase',
    )
  })
})
