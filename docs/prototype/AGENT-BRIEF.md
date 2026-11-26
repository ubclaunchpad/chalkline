# Brief shared by every prototype agent

You are one of 7 agents building a full prototype of Chalkline (a collaborative system-design whiteboard on Excalidraw, with typed components and a Go WebSocket server) at the same time, in the same folder, each in your own files.

## Where

- Repo folder: the prototype worktree (branch `prototype/full-chalkline`). Work only there, never in the main checkout.
- Read first: `docs/prototype/VISION.md`, `docs/prototype/CONVENTIONS.md`, `CLAUDE.md`, `docs/design-foundation.md`. Skim `docs/architecture.md`, `docs/catalog.md`, `docs/protocol.md` as needed.
- Existing code worth knowing: `frontend/src/App.tsx` (wiring), `src/app/context.ts` (`useBoard`, `useScene`), `src/app/slots.tsx` (where your components mount), `src/graph/deriveGraph.ts`, `src/catalog/`, `src/sidebar/` (catalog entries now have `icon` and `group`), `src/properties/` (a built but unmounted settings panel), `src/presence/`, `src/realtime/`.

## Hard rules

- **No git commands that change anything** (no commit, add, checkout, switch, stash, reset, restore, branch). Read-only `git status`/`git diff`/`git log` are fine.
- **Edit only files you own** (listed in your task). `App.tsx`, `src/app/*`, `src/graph/*` and other areas' folders are off limits. If something outside is truly unavoidable, keep it to a few lines and list the exact change in your final report.
- **Keep the stub exports and signatures** you were given; other areas import them.
- **No new npm or Go dependencies.**
- Never put secrets in code. Nothing may send board data to an external service; any "AI" runs on local rules.

## Tooling

- Before any bun/vitest command: switch to Node 22.19 or newer (for example `nvm use 24`) (the default Node is too old for vitest).
- From `frontend/`: `bun run typecheck`, `bun run lint`, `bunx vitest run src/<your-folder>`, `bunx prettier --write <your files>`. Other agents are mid-edit, so project-wide errors in _their_ files may appear: fix yours, ignore theirs, and mention it if it blocked you.
- Go (area F only): from `server/`, `gofmt -l .`, `go vet ./...`, `go test -race ./...`.
- To try the app: Go server `cd server && PORT=<your server port> go run .` (no `DATABASE_URL` means in-memory boards), and frontend `cd frontend && CHALKLINE_SERVER_URL=http://localhost:<your server port> bun run dev -- --port <your web port> --strictPort`, then open `http://localhost:<web port>/?board=test1`. If you have browser tools, use them to click through your feature. Stop your servers when done.

## Excalidraw 0.18.1 cheat sheet

- `api` (from `useBoard()`): `updateScene({ elements, appState, captureUpdate })`, `getSceneElements()`, `getSceneElementsIncludingDeleted()`, `getAppState()`, `onChange(cb)`, `onScrollChange(cb)`, `scrollToContent(elements, opts)`, `setActiveTool({ type })`, `getFiles()`, `addFiles()`.
- From `@excalidraw/excalidraw`: `convertToExcalidrawElements`, `sceneCoordsToViewportCoords`, `viewportCoordsToSceneCoords`, `exportToBlob`, `exportToSvg`, `serializeAsJSON`, `CaptureUpdateAction`, `FONT_FAMILY`, `newElementWith`.
- Changing elements: build new versions (spread plus `version: v + 1`, new `versionNonce`, or use `newElementWith`) and `updateScene` with the full element list. The existing sync sends changed elements to everyone on the board. Use `CaptureUpdateAction.IMMEDIATELY` for user actions so undo works, and `CaptureUpdateAction.NEVER` for background restyling.
- Overlays on the canvas: an absolutely positioned layer inside the board area (the canvas is offset by the top bar and side panel), using `sceneCoordsToViewportCoords({ sceneX, sceneY }, appState)` minus `appState.offsetLeft/offsetTop`. Redraw on `onScrollChange` and `onChange`. A working version of this exists in a flow prototype: an SVG with `pointer-events: none`.

## Design (Figma "Visual Direction", summarized)

- Dark navy UI. Tokens in `src/index.css`: canvas `#121826`, surface `#1f2839`, raised `#283349`, border `#2b3650`, ink `#f2f6fd`, muted `#a9b6cf`, accent Blue 1 `#81a6ee`. Teammate pastels: blue, teal, amber, pink, violet. Status: green/amber/red, always with an icon or word, never colour alone.
- Nunito for UI text, Gaegu (bundled, see design-foundation) for sticky notes and handwritten hints only, monospace for technical details. Tabler icons through `src/design/Icon.tsx` (stroke 1.75).
- One primary blue button per view; others outlined or plain. Sentence-case verb labels. Menus show icon, label and shortcut, with destructive actions last in red. Panels are raised cards with rounded corners and generous padding.
- Layout: a thin top bar (logo, board name you can click to rename, who's here, Share as primary, export); a canvas filling the window with a dot grid; a floating vertical toolbar on the left; the right panel slides in only when needed; zoom bottom right.

## When you finish

Reply with under 300 words: what a user can now do, files created or changed, any edits outside your area (exact), checks you ran and their results, and known gaps.
