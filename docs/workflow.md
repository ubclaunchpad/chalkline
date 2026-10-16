# Team workflow

## Ownership

Work is organized around these areas:

- **Canvas and interaction:** Excalidraw integration, typed components, bindings, editing behavior, and local/remote update reconciliation.
- **Collaboration and infrastructure:** WebSocket protocol, room lifecycle, event ordering, persistence integration, CI, and deployment.
- **Semantics and backend:** Component schema, canvas-to-graph derivation, validation, graph endpoint, and test harnesses.
- **Product design:** Canvas experience, component visual language, configuration panels, collaboration indicators, onboarding, and accessibility.

Ownership identifies the first reviewers and decision makers for a change. Work that crosses areas should involve the affected subteams early.

## Branches and reviews

The planned workflow uses `main` for stable releases and `dev` for integration. Create `feature/<short-name>` from `dev`. At key integration points, including sprint boundaries, open a pull request to merge the feature into `dev`. A relevant subteam member gives the first review; Owen or Alan gives final approval. Owen and Alan merge reviewed releases from `dev` into `main`.

Keep pull requests scoped so reviewers can understand them. Describe the problem, approach, tests run, and any change to the schema, sync protocol, or user experience. Designers should review changes that materially affect the interface.

## Quality expectations

We aim to meet real-world engineering standards through comprehensive static and type checks, automated tests, and CI-based deployment. We recommend the same checks during development and review.

As AI-driven development becomes a primary way to deliver code, careful review matters even more. Read every change before committing it. Do not commit code you cannot explain, test, or maintain, regardless of how it was written.

## Continuous integration

Every pull request into `dev` or `main` runs [CI](../.github/workflows/ci.yml) on GitHub Actions. CI runs again after each merge, because two PRs that pass separately can still break each other once combined. A PR is ready to merge only when every check is green.

| Job | What it checks | Why it matters |
| --- | --- | --- |
| Frontend | ESLint with type-checked strict rules, `tsc` strict, Prettier, Vitest, production build | Catches type errors, risky patterns, and broken builds before review, and keeps formatting out of review comments. |
| Server | `gofmt`, `go mod tidy`, `go vet`, `go build`, `go test -race` | The race detector finds unsafe concurrent access. That matters most for room state shared between WebSocket connections. |
| Workflows | [actionlint](https://github.com/rhysd/actionlint) on `.github/workflows` | CI configuration is code too, and a typo there can silently skip a check. |

**Reproduce CI locally.** Each job runs one Makefile target, so `make check` runs the same checks on your machine. You can also run one job's checks with `make check-web`, `make check-server`, or `make check-workflows`. Run `make fmt` to fix formatting.

**When a check fails:**

1. Open the failing job from the PR's Checks tab. Make prints each command before running it, so the failing command appears just above the error.
2. Run that command locally, fix the cause, and push again. The new push cancels the older run.
3. Don't skip, disable, or loosen a check to get a PR through. If a check is wrong or a test is flaky, open an issue and fix that in its own PR, so reviewers can see the change.

**Supply-chain safety.** Workflows request read-only permissions and pin each third-party action to a full commit SHA. A tag can be moved to point at different code, but a commit SHA can't. [Dependabot](../.github/dependabot.yml) opens one grouped PR each week for GitHub Actions, frontend packages, and Go modules. It waits seven days after each release before proposing it. Review these like any other PR: read the changelog for major versions and let CI run.

**Adding a check.** Add it to the relevant `check-*` Makefile target so local runs and CI stay identical. Then explain in the PR what the check catches and how long it adds to the run. Planned additions include staticcheck, Postgres integration tests, secret scanning, and container builds (#12).
