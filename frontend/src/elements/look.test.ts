import { describe, expect, it } from 'vitest'
import { canvasColor } from '../design/canvasColor'
import {
  GROUP_LABEL_SPACE,
  GROUP_PADDING,
  connectionSkeleton,
  connectionStyle,
  groupSkeleton,
  readConnectionKind,
  stickySkeleton,
} from './look'

describe('connectionStyle', () => {
  it('draws a call as a solid one-way arrow', () => {
    expect(connectionStyle('call')).toEqual({
      strokeStyle: 'solid',
      startArrowhead: null,
      endArrowhead: 'arrow',
    })
  })

  it('draws async as dashed', () => {
    expect(connectionStyle('async').strokeStyle).toBe('dashed')
    expect(connectionStyle('async').startArrowhead).toBeNull()
  })

  it('puts heads on both ends of a two-way connection', () => {
    expect(connectionStyle('two-way')).toEqual({
      strokeStyle: 'solid',
      startArrowhead: 'arrow',
      endArrowhead: 'arrow',
    })
  })
})

describe('readConnectionKind', () => {
  it('reads a known kind and treats anything else as a call', () => {
    expect(readConnectionKind({ kind: 'async' })).toBe('async')
    expect(readConnectionKind({ kind: 'teleport' })).toBe('call')
    expect(readConnectionKind(undefined)).toBe('call')
  })
})

describe('connectionSkeleton', () => {
  it('binds both ends and stores the kind', () => {
    const skeleton = connectionSkeleton('a', 'b', 'async')
    expect(skeleton).toMatchObject({
      type: 'arrow',
      start: { id: 'a' },
      end: { id: 'b' },
      strokeStyle: 'dashed',
      customData: { v: 1, annotation: 'connection', kind: 'async' },
    })
    expect(skeleton).not.toHaveProperty('label')
    expect(skeleton.customData).not.toHaveProperty('label')
  })

  it('shows a label as monospace text on the arrow', () => {
    const skeleton = connectionSkeleton('a', 'b', 'call', 'gRPC')
    expect(skeleton).toMatchObject({
      label: { text: 'gRPC', fontFamily: 3 },
      customData: { label: 'gRPC' },
    })
  })
})

describe('stickySkeleton', () => {
  it('is a pale blue note centred on the point', () => {
    expect(stickySkeleton({ x: 0, y: 0 })).toMatchObject({
      type: 'rectangle',
      x: -100,
      y: -80,
      backgroundColor: canvasColor('#d8e3fa'),
      customData: { v: 1, annotation: 'sticky' },
    })
  })
})

describe('groupSkeleton', () => {
  it('pads the bounds, with room on top for the label', () => {
    const skeleton = groupSkeleton([0, 0, 100, 50], 'vpc')
    expect(skeleton).toMatchObject({
      x: -GROUP_PADDING,
      y: -(GROUP_PADDING + GROUP_LABEL_SPACE),
      width: 100 + GROUP_PADDING * 2,
      height: 50 + GROUP_PADDING * 2 + GROUP_LABEL_SPACE,
      strokeStyle: 'dashed',
      backgroundColor: 'transparent',
      label: { text: 'VPC', textAlign: 'left', verticalAlign: 'top' },
      customData: { v: 1, annotation: 'group', kind: 'vpc', name: 'VPC' },
    })
  })

  it('takes a custom name', () => {
    expect(groupSkeleton([0, 0, 1, 1], 'region', 'us-east-1')).toMatchObject({
      customData: { kind: 'region', name: 'us-east-1' },
    })
  })
})
