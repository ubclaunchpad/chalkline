# UX prototype

A clickable prototype for exploring Chalkline's core flows. It is meant for
seeing and iterating on UX, not as the start of the real implementation.

Run it with `bun install && bun run dev` from `frontend/`.

## What you can try

- **Home:** create a blank board or start from the URL-shortener example.
- **Palette:** drag a component onto the canvas, or click to add it.
- **Connect:** use Excalidraw's arrow tool from one component to another.
- **Properties:** select one component to rename it, change its type, or edit its fields.
- **Review:** see placeholder structural feedback; click a finding to jump to it.
- **Share:** copy edit and view-only links; open the view link to see read-only mode.
- **Sync status:** click the status pill to simulate going offline and reconnecting.

## What is fake

- Teammates (Priya and Sam) are animated locally; there is no server.
- Boards live in this browser's `localStorage`, so share links only work here.
- Review rules in `graph.ts` are illustrative, not a reviewed rule set.

## Where to change things

| To change                           | Edit                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| Component kinds, colors, fields     | `catalog.ts`                                            |
| How a component looks on the canvas | `componentSkeleton` in `elements.ts`                    |
| Review rules                        | `reviewGraph` in `graph.ts`                             |
| Example board                       | `example.ts`                                            |
| Fake teammates                      | `teammates.ts`                                          |
| Layout and flows                    | `Board.tsx`, `SidePanel.tsx`, `Palette.tsx`, `Home.tsx` |
