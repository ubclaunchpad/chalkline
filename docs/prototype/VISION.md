# Chalkline: full prototype vision

A local, end-to-end prototype of everything Chalkline could be, built to answer "is this the product we want?" It lives on the `prototype/full-chalkline` branch and is not the team's sprint work.

Sources: the onboarding doc ("a sketch becomes more useful when its components and connections have structured meaning"), `docs/product.md` (semantic before intelligent, collaboration before simulation), `docs/roadmap.md` directions, the designers' Figma "Visual Direction" and "User Flow" pages, and Miro, Eraser, tldraw, Excalidraw+ and Whimsical as references.

## Who it's for

Students and engineers who design systems together: team projects, system-design interview practice, and design reviews.

## The product in one flow

1. **Home:** recent boards, "New board", and a template gallery (three-tier web app, microservices, event-driven, blank).
2. **Start:** an empty board shows a handwritten hint and two buttons: Browse templates, Add component. Or describe the system in a sentence and Chalkline drafts it.
3. **Build:** a floating left toolbar (select, hand, rectangle, arrow, text, sticky note, component). A searchable components panel with icon tiles grouped by type. Components are dark cards with an icon, a name and one monospace detail line.
4. **Connect and group:** arrows carry meaning: solid for a call, dashed for async, two heads for two-way, with an optional label like `gRPC` or `orders.created`. Groups draw VPCs, clusters and regions as dashed boxes.
5. **Configure:** click a component or arrow and a panel slides in on the right with its settings (engine, replicas, port, protocol...).
6. **Collaborate:** live cursors with name tags, selection outlines in each person's colour, avatars, sticky notes, comment threads pinned to components, and share links that are either edit or view-only (enforced by the server).
7. **Understand:** Checks flag mistakes as you draw. An architecture review explains weak points (single points of failure, missing caches, unbounded queues) with plain-language reasons. Press ▶ on a component to watch a request travel through the system.
8. **Practise:** system-design exercises ("Design a URL shortener") with requirements, a timer, and a checklist graded from the diagram.
9. **Ship it:** export PNG, SVG, JSON, Mermaid (paste into a GitHub README), and an inspectable Terraform sketch for the components that map cleanly.

## AI, responsibly

Every "assistant" feature (draft from a sentence, explain this diagram, suggest improvements) runs on **local rules** in this prototype, behind a small provider interface. Nothing leaves the browser. `CLAUDE.md` requires explicit approval and an access-control design before board data goes to an external AI service. Swapping in a real model is a separate decision for Alan and Owen.

## Out of scope for the prototype

Accounts and sign-in, billing, real infrastructure deployment, codebase sync, mobile layouts beyond "doesn't break", and horizontal scaling.

## Areas (how the prototype was built in parallel)

| Area                   | Owns                                                                                                       | Delivers                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A. Shell and layout    | `src/shell/`, `src/layout/`, `src/sidebar/Sidebar.tsx`, `src/index.css`, `src/home/`                       | Home page, top bar, floating toolbar, components panel, canvas look, empty state, board name |
| B. Elements            | `src/catalog/`, `src/sidebar/catalog.ts`, `src/sidebar/createComponent.ts`, `src/elements/`, `src/design/` | Cards, connection kinds and labels, groups, sticky notes, catalog                            |
| C. Inspector           | `src/properties/`                                                                                          | Settings panel for components, connections and groups; colour and size                       |
| D. Understanding       | `src/checks/`, `src/flow/`, `src/review/`                                                                  | Checks, request flow, architecture review                                                    |
| E. Generate            | `src/templates/`, `src/generate/`, `src/assistant/`                                                        | Template gallery, draft-from-a-sentence, explain, auto-layout                                |
| F. Collaboration       | `src/collab/`, `src/presence/`, `src/realtime/`, `server/`                                                 | Comments, selection presence, share dialog, view-only enforced by the server                 |
| G. Export and practice | `src/export/`, `src/practice/`                                                                             | Export menu (PNG, SVG, JSON, Mermaid, Terraform), practice exercises                         |

`src/app/` (board context and slots) and `src/graph/` are shared and owned by the integrator.
