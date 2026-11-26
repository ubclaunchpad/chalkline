# Chalkline full prototype

A local, end-to-end version of everything Chalkline could be, built in one day to answer "is this the product we want?". It lives on the experimental branch `experimental/full-chalkline-prototype`. It is not merged into `dev` and is not the team's sprint work. See [VISION.md](VISION.md) for the plan and [CONVENTIONS.md](CONVENTIONS.md) for how board data is stored.

## Run it

No Postgres needed: without `DATABASE_URL` the server keeps boards in memory (lost on restart).

```bash
cd server && PORT=8299 go run .
```

```bash
cd frontend && CHALKLINE_SERVER_URL=http://localhost:8299 bun run dev -- --port 5299 --strictPort
```

Open http://localhost:5299. Tests need Node 22.19 or newer (`nvm use 24`); the default Node 22.13 fails to start vitest's workers.

## Try this path (about 5 minutes)

1. **Home:** pick "Microservices with API gateway". Enter your name.
2. **Configure:** click _Orders DB_. The settings panel opens; set Replicas to 3 and watch the card update.
3. **Understand:** open **Review** (single points of failure, missing caches, with why and what to try). Select _Web app_ and press **▶ Send request** to watch a request travel through the system.
4. **Check:** add a Cache from the components panel without connecting it. **Checks** shows "Cache has no connections" and outlines it.
5. **Collaborate:** **Share** → copy the view link → open it in another window. It sees everything live, including a **Comment** you add in the first window, but cannot change anything (the server refuses).
6. **Generate:** on a new board, open **Assistant**, describe a system in a sentence, preview, **Add to board**. Try **Tidy up** and **Explain this diagram**.
7. **Ship:** **Export** → PNG, SVG, JSON, Mermaid (paste into a GitHub README), or a Terraform sketch. **Practice** has four graded system-design exercises.

## What's in it, by area

| Area                | Built                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell               | Home with recent boards and templates; navy canvas with grid; floating toolbar; zoom; empty-board hint; dark, searchable components panel; rename board |
| Elements            | Dark cards (icon, name, detail line from settings); call / async / two-way arrows with labels; groups (VPC, cluster...); sticky notes                   |
| Inspector           | Settings for components, connections and groups; notes; colour and size; multi-select delete                                                            |
| Understanding       | 9 live checks with outlines; request-flow animation; architecture review with score card                                                                |
| Generate            | 5 templates; draft from a sentence; tidy up (auto-layout); explain; suggested next steps                                                                |
| Collaboration       | Comments pinned to components; selection and cursor presence; share links with **server-enforced view-only**                                            |
| Export and practice | PNG, SVG, JSON (open and save), Mermaid, Terraform sketch, copy link; 4 practice exercises graded from the diagram                                      |

Checks at the end: 474 frontend tests, all Go tests with `-race`, strict typecheck, eslint and prettier pass.

## Decisions Alan and Owen need to make before any of this goes to `dev`

- **AI:** every "assistant" feature uses local rules. Using a real model means sending board data to an outside service, which `CLAUDE.md` forbids without approval and an access-control design.
- **Share keys** live in server memory. A restart forgets them and the next visitor becomes the board's creator. Production needs a Postgres table and migration.
- **Protocol changes** (documented in `docs/protocol.md`): `welcome` carries access and keys, new `forbidden` / `key_required` errors, a `claim` parameter, cursor messages carry selection, and the browser now merges the join snapshot (part of #51).
- **Canvas colours:** Excalidraw's dark theme inverts colours on the canvas, so stored colours go through `src/design/canvasColor.ts`. Worth a team decision before #87/#88 build on it.

## Known gaps

- The grid is Excalidraw's faint lines, not dots; undo/redo have no buttons yet.
- A card's detail line is Nunito, not monospace; the card icon lags one frame behind a drag.
- Grouped elements don't move together; tidy up ignores groups and sticky notes.
- Two people replying to the same comment at the same instant can lose one reply.
- The sentence parser follows fixed rules; the preview is the safety check.
- Excalidraw's own Shift+1 "fit" and anything else that fits every element still includes the 1×1 board-info element at the origin.

## How it was built

Seven agents worked in parallel, each in its own folders (see the areas table in [VISION.md](VISION.md)), on top of a small shared foundation: `src/app/` (board context and mount points), `src/graph/` (annotations and connection data) and an in-memory store on the server. [AGENT-BRIEF.md](AGENT-BRIEF.md) is the brief each agent received.
