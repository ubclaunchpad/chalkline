import { describe, expect, it } from 'vitest'
import { graphOf } from './graphFixture'
import { mermaidText, toMermaid } from './mermaid'

describe('toMermaid', () => {
  it('draws shapes by kind and arrows by connection kind', () => {
    const graph = graphOf(
      [
        ['a', 'client', 'Browser'],
        ['b', 'service', 'API'],
        ['c', 'database', 'Orders'],
        ['d', 'queue', 'Jobs'],
        ['e', 'cache', 'Redis'],
      ],
      [
        ['a', 'b', 'two-way', 'WebSocket'],
        ['b', 'c'],
        ['b', 'd', 'async', 'orders.created'],
        ['b', 'e'],
      ],
    )
    expect(toMermaid(graph)).toBe(
      [
        'flowchart LR',
        '  n1(["Browser"])',
        '  n2["API"]',
        '  n3[("Orders")]',
        '  n4[["Jobs"]]',
        '  n5[("Redis")]',
        '  n1 <-->|"WebSocket"| n2',
        '  n2 --> n3',
        '  n2 -.->|"orders.created"| n4',
        '  n2 --> n5',
        '',
      ].join('\n'),
    )
  })

  it('escapes names that would break Mermaid syntax', () => {
    const graph = graphOf(
      [
        ['x', 'service', 'Say "hi" <b> #1 | `tick`\nnext'],
        ['y', 'service', 'end'],
      ],
      [['x', 'y', 'call', 'a|b"c']],
    )
    const text = toMermaid(graph)
    expect(text).toContain(
      'n1["Say #quot;hi#quot; #lt;b#gt; #35;1 #124; #96;tick#96; next"]',
    )
    // "end" is a Mermaid keyword, but it is safe inside quotes.
    expect(text).toContain('n2["end"]')
    expect(text).toContain('n1 -->|"a#124;b#quot;c"| n2')
  })

  it('never emits a raw quote, bracket or newline in a label', () => {
    expect(mermaidText('a"]\n[b')).toBe('a#quot;] [b')
  })

  it('gives an empty board just the header', () => {
    expect(toMermaid(graphOf([]))).toBe('flowchart LR\n')
  })
})
