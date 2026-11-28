# Component catalog

The catalog lists every kind of component Chalkline understands and the settings each one accepts. It lives in [`frontend/src/catalog/catalog.ts`](../frontend/src/catalog/catalog.ts). The `ComponentData` type and `validateComponent` are both derived from it, so adding a kind only means adding an entry there.

## Stored data

Each component is an Excalidraw shape whose `customData` holds:

```json
{
  "v": 1,
  "kind": "database",
  "name": "Users DB",
  "props": { "engine": "PostgreSQL", "replicas": 1 }
}
```

- `v` is the format version. It is always `1` for now.
- `kind` is one of the kinds below.
- `name` is required, cannot be blank, and is at most 100 characters.
- `props` must contain exactly the kind's settings: a missing or unknown setting is a problem. Numbers must be whole and at least their minimum, and choices must be one of their options.

`validateComponent(value)` checks untrusted data, such as data from another client or a saved board, and returns either the data or a list of plain-English problems like `replicas must be at least 1`.

## Component cards

A component added from the sidebar is drawn as a card, built in [`frontend/src/sidebar/createComponent.ts`](../frontend/src/sidebar/createComponent.ts) with the look in [`frontend/src/cards/cardLook.ts`](../frontend/src/cards/cardLook.ts). The card is one Excalidraw group of four elements:

- **Container:** a rectangle holding the component data above. Arrows bind to it, and it is the only part that becomes a graph node.
- **Icon, name and detail line:** a locked image and two locked text elements. Locking keeps arrows from binding to them. Their `customData` marks them as decoration, so the graph skips them:

```json
{ "v": 1, "annotation": "card", "part": "name" }
```

`part` is `icon`, `name` or `detail`. The name line shows the component's name, and the detail line shows `describeComponent` (for example `PostgreSQL · 1 replica`). Both are shortened with "…" by character count, so every browser shows the same text; the full name stays in the component data.

Changing a name or setting goes through `applyComponentChange` in [`frontend/src/cards/applyComponentChange.ts`](../frontend/src/cards/applyComponentChange.ts). It validates the change and rewrites the card's text in the same update. If two people edit one card at once, the board can keep one person's data and the other's text; every browser then rewrites that card's text from its data ([`repairCardText.ts`](../frontend/src/cards/repairCardText.ts)), at most once per version of the data. Double-clicking a card's name opens a small rename box over it. Clicking a card with the Text tool, or pressing Enter with a card selected, does not add a text label inside it; a double-tap on a touch screen and the right-click "Bind text" action still can. Components on boards made before cards (plain coloured rectangles) are left as they are.

Icons are image files that every browser registers when the board opens, because live sync sends elements but not files. In dark theme Excalidraw inverts canvas colours, so card colours go through `canvasColor` in [`frontend/src/design/canvasColor.ts`](../frontend/src/design/canvasColor.ts); colours with a channel above about 237 or below about 18 (out of 255) can only be approximated.

## Kinds

| Kind                                        | Settings (default)                                                                                                                                           | When to use it                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client (`client`)                           | `platform`: Web, Mobile, Desktop (Web)                                                                                                                       | The starting point of every request: a browser, mobile app, or desktop app that calls your system.                                                                                                     |
| CDN (`cdn`)                                 | `mode`: Pull, Push (Pull)<br>`ttlSeconds`: number, min 1 (86400)                                                                                             | Put images, scripts, and video close to users so they load fast and your servers handle fewer requests. Pull CDNs fetch content on the first request; push CDNs suit content you upload ahead of time. |
| Load balancer (`load_balancer`)             | `algorithm`: Round robin, Least connections, IP hash (Round robin)<br>`layer`: Layer 4, Layer 7 (Layer 7)                                                    | Spread traffic across several copies of a service so no single server is overloaded and one can fail without an outage.                                                                                |
| API gateway (`api_gateway`)                 | `basePath`: text (`/api`)<br>`auth`: None, API key, JWT, OAuth (JWT)<br>`rateLimitPerSecond`: number, min 1 (100)                                            | Give clients one entry point that handles authentication, rate limiting, and routing before requests reach your services.                                                                              |
| Service (`service`)                         | `instances`: number, min 1 (1)<br>`protocol`: HTTP, gRPC (HTTP)                                                                                              | Hold your application logic; keep it stateless so you can add instances behind a load balancer as traffic grows.                                                                                       |
| Database (`database`)                       | `engine`: PostgreSQL, MySQL, MongoDB, DynamoDB (PostgreSQL)<br>`replicas`: number, min 1 (1)                                                                 | Store data that must survive restarts; add read replicas when reads outgrow one machine.                                                                                                               |
| Cache (`cache`)                             | `engine`: Redis, Memcached (Redis)<br>`strategy`: Cache-aside, Write-through, Write-behind, Refresh-ahead (Cache-aside)<br>`ttlSeconds`: number, min 1 (300) | Keep frequently read data in memory so hot requests skip the database; the strategy decides how the cache and database stay in sync.                                                                   |
| Queue (`queue`)                             | `engine`: RabbitMQ, Amazon SQS, Redis (RabbitMQ)<br>`delivery`: At-least-once, At-most-once, Exactly-once (At-least-once)                                    | Move slow or bursty work, such as sending email or processing uploads, out of the request path so workers handle it at their own pace.                                                                 |
| Object storage (`object_storage`)           | `provider`: Amazon S3, Google Cloud Storage, Azure Blob Storage, MinIO (Amazon S3)<br>`storageClass`: Standard, Infrequent access, Archive (Standard)        | Store large files like user uploads, images, and backups cheaply, often served to users through a CDN.                                                                                                 |
| Serverless function (`serverless_function`) | `provider`: AWS Lambda, Google Cloud Functions, Azure Functions, Cloudflare Workers (AWS Lambda)<br>`trigger`: HTTP, Queue, Schedule, Event (HTTP)           | Run short pieces of code on demand, such as resizing an upload or handling a webhook, without keeping servers running. The trigger shows what starts it.                                               |
| Pub/sub (`pubsub`)                          | `engine`: Kafka, Amazon SNS, Google Pub/Sub, Redis (Kafka)<br>`delivery`: At-least-once, At-most-once, Exactly-once (At-least-once)                          | Send one event to many subscribers, such as an "order placed" event that billing, email, and analytics each react to. Use a queue instead when each message should go to only one worker.              |
| Auth (`auth`)                               | `protocol`: OpenID Connect, OAuth 2.0, SAML, Password (OpenID Connect)<br>`session`: JWT, Session cookie (JWT)                                               | Sign users in and issue the tokens or sessions that the API gateway and services check on each request.                                                                                                |
| External service (`external_service`)       | `category`: Payments, Email, SMS, Maps, AI, Other (Other)<br>`integration`: API calls, Webhooks, Both (API calls)                                            | Show a third-party service your system depends on, such as Stripe for payments or SendGrid for email. Put the vendor in the component's name.                                                          |
| Scheduler (`scheduler`)                     | `engine`: cron, Kubernetes CronJob, Amazon EventBridge, Celery Beat (cron)<br>`schedule`: cron expression (`0 * * * *`, hourly)                              | Start jobs at set times, such as nightly reports, cleanups, or reminder emails, instead of in response to a request.                                                                                   |
| Monitoring (`monitoring`)                   | `tool`: Prometheus, Datadog, ELK stack, Amazon CloudWatch (Prometheus)<br>`retentionDays`: number, min 1 (15)                                                | Collect metrics and logs from the other components and raise alerts, so you notice failures before users report them.                                                                                  |

## Adding a kind

Add an entry to `CATALOG` in `catalog.ts` with a label, a one-line description, and one to three settings. Each setting needs a type (`text`, `number`, or `choice`), a label, a default, and its limits (`min` for numbers, `options` for choices). The types, validator, and tests pick it up automatically. Then, in [`frontend/src/sidebar/catalog.ts`](../frontend/src/sidebar/catalog.ts), give the kind a placeholder color in `KIND_COLORS` and an icon in `KIND_ICONS`; TypeScript requires both for every kind. Icons are 24×24 SVGs from the Figma icon set, saved in `frontend/src/assets/icons/` with their strokes set to `currentColor`. Also add the kind's detail line (shown under its name on the board) to `describeComponent` in [`frontend/src/cards/describe.ts`](../frontend/src/cards/describe.ts), and add a row to the table above.

`docs/product.md` also mentions DNS, reverse proxies, and streams. They are not in the catalog yet, and the Figma icon set has no icons for them. Pub/sub covers publishing events to Kafka, but not a stream's ordered, replayable log.

## Further reading

The [System Design Primer](https://github.com/donnemartin/system-design-primer) covers each of these components, including CDNs, load balancers, caching strategies, and asynchronism with queues.
