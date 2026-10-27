import { describe, expect, it } from 'vitest'
import { parseServerMessage } from './messages'

describe('parseServerMessage', () => {
  describe('valid messages', () => {
    it('parses welcome', () => {
      const message = { type: 'welcome', clientId: 'c_7f3a' }
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message)
    })

    it('parses change', () => {
      const message = {
        type: 'change',
        from: 'c_91bd',
        elements: [{ id: 'shape-1', version: 3 }],
      }
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message)
    })

    it('parses change with no elements', () => {
      const message = { type: 'change', from: 'c_91bd', elements: [] }
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message)
    })

    it('parses cursor', () => {
      const message = {
        type: 'cursor',
        from: 'c_91bd',
        x: 120.5,
        y: 88,
        name: 'Kathy',
        color: '#e03131',
      }
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message)
    })

    it('parses leave', () => {
      const message = { type: 'leave', clientId: 'c_91bd' }
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message)
    })

    it('parses error', () => {
      const message = { type: 'error', message: 'message too large' }
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message)
    })

    it('drops fields it does not know about', () => {
      const text = JSON.stringify({
        type: 'leave',
        clientId: 'c_91bd',
        extra: true,
      })
      expect(parseServerMessage(text)).toEqual({
        type: 'leave',
        clientId: 'c_91bd',
      })
    })
  })

  describe('invalid input', () => {
    it.each([
      ['not JSON', 'hello'],
      ['empty string', ''],
      ['null', 'null'],
      ['a number', '42'],
      ['a string', '"welcome"'],
      ['an array', '[]'],
      ['an object with no type', '{}'],
      ['an unknown type', '{"type":"dance"}'],
      ['a type that is not a string', '{"type":1}'],
      ['welcome without clientId', '{"type":"welcome"}'],
      ['welcome with a numeric clientId', '{"type":"welcome","clientId":7}'],
      ['change without from', '{"type":"change","elements":[]}'],
      ['change without elements', '{"type":"change","from":"c_1"}'],
      [
        'change with elements that are not an array',
        '{"type":"change","from":"c_1","elements":{}}',
      ],
      [
        'cursor with a string x',
        '{"type":"cursor","from":"c_1","x":"5","y":1,"name":"A","color":"#000"}',
      ],
      [
        'cursor without color',
        '{"type":"cursor","from":"c_1","x":5,"y":1,"name":"A"}',
      ],
      ['leave without clientId', '{"type":"leave"}'],
      ['error without message', '{"type":"error"}'],
    ])('returns null for %s', (_label, text) => {
      expect(parseServerMessage(text)).toBeNull()
    })
  })
})
