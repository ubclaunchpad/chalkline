# Component catalog

The catalog lists every kind of component Chalkline understands and the settings each one accepts. It lives in [`frontend/src/catalog/catalog.ts`](../frontend/src/catalog/catalog.ts). The `ComponentData` type and `validateComponent` are both derived from it, so adding a kind only means adding an entry there.

## Stored data

Each component is an Excalidraw shape whose `customData` holds:

```json
{ "v": 1, "kind": "database", "name": "Users DB", "props": { "engine": "PostgreSQL", "replicas": 1 } }
```

- `v` is the format version. It is always `1` for now.
- `kind` is one of the kinds below.
- `name` is required, cannot be blank, and is at most 100 characters.
- `props` must contain exactly the kind's settings: a missing or unknown setting is a problem. Numbers must be whole and at least their minimum, and choices must be one of their options.

`validateComponent(value)` checks untrusted data, such as data from another client or a saved board, and returns either the data or a list of plain-English problems like `replicas must be at least 1`.

## Kinds

| Kind | Settings (default) | When to use it |
| --- | --- | --- |
| Client (`client`) | `platform`: Web, Mobile, Desktop (Web) | The starting point of every request: a browser, mobile app, or desktop app that calls your system. |
| CDN (`cdn`) | `mode`: Pull, Push (Pull)<br>`ttlSeconds`: number, min 1 (86400) | Put images, scripts, and video close to users so they load fast and your servers handle fewer requests. Pull CDNs fetch content on the first request; push CDNs suit content you upload ahead of time. |
| Load balancer (`load_balancer`) | `algorithm`: Round robin, Least connections, IP hash (Round robin)<br>`layer`: Layer 4, Layer 7 (Layer 7) | Spread traffic across several copies of a service so no single server is overloaded and one can fail without an outage. |
| API gateway (`api_gateway`) | `basePath`: text (`/api`)<br>`auth`: None, API key, JWT, OAuth (JWT)<br>`rateLimitPerSecond`: number, min 1 (100) | Give clients one entry point that handles authentication, rate limiting, and routing before requests reach your services. |
| Service (`service`) | `instances`: number, min 1 (1)<br>`protocol`: HTTP, gRPC (HTTP) | Hold your application logic; keep it stateless so you can add instances behind a load balancer as traffic grows. |
| Database (`database`) | `engine`: PostgreSQL, MySQL, MongoDB, DynamoDB (PostgreSQL)<br>`replicas`: number, min 1 (1) | Store data that must survive restarts; add read replicas when reads outgrow one machine. |
| Cache (`cache`) | `engine`: Redis, Memcached (Redis)<br>`strategy`: Cache-aside, Write-through, Write-behind, Refresh-ahead (Cache-aside)<br>`ttlSeconds`: number, min 1 (300) | Keep frequently read data in memory so hot requests skip the database; the strategy decides how the cache and database stay in sync. |
| Queue (`queue`) | `engine`: RabbitMQ, Amazon SQS, Redis (RabbitMQ)<br>`delivery`: At-least-once, At-most-once, Exactly-once (At-least-once) | Move slow or bursty work, such as sending email or processing uploads, out of the request path so workers handle it at their own pace. |
| Object storage (`object_storage`) | `provider`: Amazon S3, Google Cloud Storage, Azure Blob Storage, MinIO (Amazon S3)<br>`storageClass`: Standard, Infrequent access, Archive (Standard) | Store large files like user uploads, images, and backups cheaply, often served to users through a CDN. |

## Adding a kind

Add an entry to `CATALOG` in `catalog.ts` with a label, a one-line description, and one to three settings. Each setting needs a type (`text`, `number`, or `choice`), a label, a default, and its limits (`min` for numbers, `options` for choices). The types, validator, and tests pick it up automatically. Then add a row to the table above.

`docs/product.md` also mentions DNS, reverse proxies, and streams. They are not in the catalog yet.

## Further reading

The [System Design Primer](https://github.com/donnemartin/system-design-primer) covers each of these components, including CDNs, load balancers, caching strategies, and asynchronism with queues.
