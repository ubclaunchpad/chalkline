# Chalkline

Chalkline is a collaborative workspace for practicing software architecture. It
combines an infinite whiteboard with typed components, so a database, cache, or
queue is more than a labeled shape. Teams can build a system diagram together,
share it through a link, and eventually receive feedback based on the
architecture they created.

## Documentation

- [Onboarding](docs/onboarding.md): Start here. The whole system in five
  minutes and a reading path for each subteam.
- [Product and team goals](docs/product.md): The problem, intended experience,
  principles, and what the team wants to achieve.
- [Architecture](docs/architecture.md): The canvas, semantic graph,
  synchronization, and persistence plan.
- [Roadmap](docs/roadmap.md): Product directions and questions for scoping the
  two terms.
- [Team workflow](docs/workflow.md): Subteam ownership, branches, pull requests,
  reviews, and quality expectations.
- [Coding agent guidance](AGENTS.md): Implementation expectations and agent
  boundaries.

Most decisions are open to debate and change. We want everyone to get the most
from the experience and enjoy building the project together.

## Run it locally

You need Bun 1.3.4, Go 1.25, and Docker (only for the database). From the
repository root:

```sh
make install
make dev
```

`make dev` starts the frontend on Vite's default port and the Go server on
port 8080. Open the frontend URL to see the canvas; `curl localhost:8080/healthz`
should return `{"status":"ok"}`. In development, Vite proxies `/api` and `/ws`
to the server, so frontend code can use same-origin URLs.

To start or stop the local Postgres database, run `make db-up` or
`make db-down`. The server does not connect to it yet. Copy `.env.example` to
`.env` if you need to change ports or credentials.

### Checks

Run `make check` before opening a pull request. It runs the same code checks as
CI:

- **Frontend:** ESLint (type-checked strict rules), `tsc` (strict), Prettier,
  Vitest, and a production build.
- **Server:** `gofmt`, `go vet`, `go build`, and `go test -race`.

`make fmt` formats both. You can also run individual frontend scripts from
`frontend/`, such as `bun run lint` or `bun run test`.

We plan to work from `feature/<short-name>` branches into `dev` at key
integration points. Owen and Alan will merge releases from `dev` into `main`.
See the [team workflow](docs/workflow.md) for details.
