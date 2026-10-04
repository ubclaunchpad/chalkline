# Coding agent instructions

Apply these instructions to changes in this repository. Use [architecture](docs/architecture.md) for system boundaries, [workflow](docs/workflow.md) for reviews and branches, and [roadmap](docs/roadmap.md) when scoping product work. The roadmap is exploratory; implement the requested task, not an entire proposed feature.

## Implementation contracts

- **Frontend:** Use Bun, React, strict TypeScript, Tailwind, and embedded Excalidraw. Keep one package manager and lockfile. Type and validate semantic `customData`; derive the architecture graph from canvas elements and bindings. Keep transient UI state separate from the shared board document, and follow the designers' established components and accessibility patterns.
- **Backend:** Use Go. Keep HTTP handlers stateless and pass dependencies and request contexts explicitly. The WebSocket server orders edits and may hold active rooms and presence in memory, but that memory is temporary coordination state. Validate messages and permissions on the server; never trust client access claims.
- **Persistence:** PostgreSQL is the durable board store. Restore from snapshots and the operation log after a restart. Use versioned migrations and parameterized queries; keep a containerized database available for local and CI integration tests.
- **Infrastructure:** The cloud provider and production database hosting are undecided. Keep configuration outside code and avoid provider-specific assumptions. Redis may later support caching or multi-process room ownership; do not require it for the first release or use it as the durable board store.

## Verification and CI

- Define observable acceptance criteria for behavior changes. Use Gherkin scenarios for significant user journeys, such as joining a board, concurrent edits, reconnection, and view/edit access. Automate the scenarios where practical.
- Test deterministic logic directly. Add integration tests where boundaries matter, especially WebSocket clients and room state, PostgreSQL recovery, and permissions. Cover failure paths as well as successful ones.
- Use targeted mutation testing for high-risk logic such as graph derivation, conflict resolution, validation, and authorization. Investigate surviving mutants. Run these checks in CI when the tooling is established.
- Treat CI as a gate for code changes: formatting and linting, strict TypeScript checks, Go compilation, static analysis and race checks, automated tests, and builds must pass before a change is ready. CI deployment must depend on those gates. Run relevant local checks, report what ran and what could not run, and never bypass failures or claim checks passed when they did not.

## Agent limits

- Read and understand every change before committing it. Keep changes reviewable. Do not commit, push, merge, deploy, provision cloud resources, or run destructive migrations unless the user explicitly requests that action.
- Stay within the requested scope. If it requires changing a schema, sync protocol, dependency, or architecture decision, explain the tradeoff and update the relevant documentation alongside the implementation. Surface unresolved decisions instead of inventing policy.
- Never commit secrets, credentials, production connection strings, or private user data. Do not send board data to an external AI service without explicit authorization and an access-control design.
