# Prototype conventions

Everything on a board is an Excalidraw element, so it syncs, saves and replays through the existing pipeline with no protocol change. Meaning lives in `customData`.

## customData shapes

| Element        | Excalidraw type                                                 | `customData`                                                                                                                                                 |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Component      | `rectangle` (with a bound text label)                           | `{ v: 1, kind, name, props }` (existing; see `src/catalog/`)                                                                                                 |
| Connection     | `arrow` bound at both ends                                      | `{ v: 1, annotation: 'connection', kind: 'call' \| 'async' \| 'two-way', label?: string, props?: Record<string, string \| number \| boolean> }`              |
| Group          | `rectangle`, dashed, no fill, sent to back                      | `{ v: 1, annotation: 'group', kind: 'vpc' \| 'cluster' \| 'region' \| 'zone' \| 'boundary', name: string }`                                                  |
| Sticky note    | `rectangle` + bound text                                        | `{ v: 1, annotation: 'sticky' }`                                                                                                                             |
| Comment thread | small `ellipse` pin                                             | `{ v: 1, annotation: 'comment', targetId?: string, resolved: boolean, messages: { id: string, author: string, color: string, text: string, at: number }[] }` |
| Board info     | one hidden, locked 1×1 `rectangle` at the origin (`opacity: 0`) | `{ v: 1, annotation: 'board', name: string, template?: string }`                                                                                             |

Rules:

- Anything with `customData.annotation` is **not** a component. `deriveGraph` skips it as a node, and reads connection data onto `GraphEdge.connection`.
- An arrow without connection data is a plain `call`.
- Never put secrets or personal data in `customData`. It is visible to everyone on the board.

## Shared code (integrator-owned, ask before changing)

- `src/app/board.tsx`: `BoardProvider`. `src/app/context.ts`: `useBoard()` for `{ api, boardId, access, panel, openPanel, closePanel }`, and `useScene()` for `{ elements, selectedIds }`, updated on every change.
- `src/app/slots.tsx`: where each area's components are mounted. Areas fill in their own stub files; they do not edit `App.tsx` or `slots.tsx`.
- `src/graph/deriveGraph.ts`: the graph.

## Right-side panel

Only one right-side panel is open at a time: `openPanel('inspector' | 'checks' | 'review' | 'assistant' | 'comments' | 'practice')`. Each area renders its panel only when `panel` matches its id.

## Rules for every area

- Stay inside your folders. If you truly need a change elsewhere, keep it to a few lines and list it in your final report.
- No new npm or Go dependencies.
- Dark theme tokens from `src/index.css` (`bg-surface`, `text-ink`, `border-border`, `bg-accent` ...). Nunito for UI text, Gaegu only for sticky notes and hints. Tabler icons via `src/design/Icon.tsx`.
- Every control is a real `<button>`/`<input>` with a label, reachable by keyboard.
- Tests for pure logic. `bun run typecheck`, `bun run lint`, `bun run test` and `bunx prettier --check` must pass for your files.
