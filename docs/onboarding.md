# Developer onboarding: about three hours

Start with the project orientation and CI section, then choose **one** tier in your subteam's track. 

## Project orientation 

Chalkline is a collaborative whiteboard for practicing software architecture. Unlike a general diagramming tool, its components will have a bit more meaning baked into it. For example, a database is represented as a database in the data, not just as a labeled rectangle. People should be able to build a design together, share it, and eventually receive feedback tied to its structure.

The Excalidraw document is the source of truth. Typed component data lives on canvas elements, and a graph of components and connections is derived from those elements. A Go server will manage live with a PostgreSQL database will hold snapshots and an operation log, while cursors and presence remain temporary. We are building the sync layer ourselves because it is a valuable learning opportunity as opposed to a framework that just does everything for us.... The product scope is still open for debate, including how far to take exercises, AI review, exports, and agent access.

Our goals are to: 1. make something cool as hell, 2. build job-ready skills, and 3. attract real users and GitHub stars.

 After reading this brief, sketch the path an edit takes from one browser to another and into durable storage. Be ready to explain why the derived graph matters and which product direction you want to explore.

## Subteam tracks

Choose the tier matching your experience as these are meant to be for learning purposes!

### Canvas and interaction 

| Tier | Main resource | Chalkline exercise |
| --- | --- | --- |
| Beginner | [Excalidraw package README](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/README.md) | Sketch a React component that embeds the canvas. Mark where typed components, app state, and scene changes enter or leave the wrapper. |
| Intermediate | [Excalidraw element types](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts) | Find `ExcalidrawElement`, `customData`, and arrow bindings. Define a typed database component and identify the fields needed to connect it to a service. |
| Advanced | [Writing WebSocket client applications](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications) | Draw the client state flow for an optimistic move, server acknowledgement, remote edit, disconnect, and reconnect. Identify what must be reconciled before applying a server update to Excalidraw. |

### Collaboration and Go 

| Tier | Main resource | Chalkline exercise |
| --- | --- | --- |
| Beginner | [A Tour of Go](https://go.dev/tour/welcome/1) | Spend up to an hour on Go basics and methods/interfaces. Draft a small in-memory `Room` type with an operation method, then explain where a mutex would be needed. |
| Intermediate | [Writing WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers) | Sketch the connection lifecycle: authenticate a board link, join a room, receive an edit, broadcast it, and clean up presence on disconnect. Note handshake and message-level checks. |
| Advanced | [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) | Define an operation order and last-write-wins rule for two simultaneous edits. Then sketch how a PostgreSQL op log and periodic snapshot restore that order after a server restart. |

### Semantics and backend 

| Tier | Main resource | Chalkline exercise |
| --- | --- | --- |
| Beginner | [Excalidraw JSON schema](https://docs.excalidraw.com/docs/codebase/json-schema/) | Draw a tiny service-to-database board and list which element fields are needed to derive two nodes and one edge. |
| Intermediate | [Excalidraw component props](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/@excalidraw/excalidraw/api/props/props.mdx) | Design the typed `customData` shape for a database and a queue. Specify how missing, unknown, or malformed properties affect graph derivation. |
| Advanced | [Go fuzzing tutorial](https://go.dev/doc/tutorial/fuzz) | Focus on the fuzz-test sections, then specify a pure canvas-to-graph function and seed cases for deleted elements, dangling arrows, malformed `customData`, and duplicate IDs. State the invariants a fuzz test should preserve. |


## CI practices 

Read the [GitHub Actions quickstart](https://docs.github.com/en/actions/get-started/quickstart). Sketch the checks a pull request to `dev` should run: frontend type checks and tests, Go checks and tests, database-backed integration tests, and a build. 

If you already know Actions, use the same time on GitHub's [secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) and propose least-privilege workflow permissions instead. Whoever coordinates CI can turn these sketches into a first pipeline once the codebase has runnable checks.
