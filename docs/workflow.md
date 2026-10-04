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
