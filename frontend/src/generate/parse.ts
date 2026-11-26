// Turns a plain-English description into a draft board with fixed rules:
// known words become component kinds, nearby words become names, and verbs
// between components become connections. No model, nothing leaves the page.
import type { ComponentKind } from '../catalog/catalog'
import type { ConnectionKind } from '../graph/deriveGraph'
import type { Draft, DraftComponent, DraftConnection } from './board'

interface Head {
  kind: ComponentKind
  props?: Record<string, unknown>
  /** "service", "server"... let a more specific word before them win. */
  generic?: boolean
}

const h = (kind: ComponentKind, props?: Record<string, unknown>): Head => ({
  kind,
  props,
})

// Lower-case words or phrases (up to three words) that name a component.
const HEADS: Record<string, Head> = {
  client: h('client'),
  browser: h('client'),
  frontend: h('client'),
  'front end': h('client'),
  website: h('client'),
  app: h('client'),
  'mobile app': h('client', { platform: 'Mobile' }),
  'ios app': h('client', { platform: 'Mobile' }),
  'android app': h('client', { platform: 'Mobile' }),
  'desktop app': h('client', { platform: 'Desktop' }),
  spa: h('client'),
  user: h('client'),
  customer: h('client'),
  cdn: h('cdn'),
  cloudfront: h('cdn'),
  cloudflare: h('cdn'),
  'load balancer': h('load_balancer'),
  lb: h('load_balancer'),
  alb: h('load_balancer'),
  elb: h('load_balancer'),
  nginx: h('load_balancer'),
  gateway: h('api_gateway'),
  'api gateway': h('api_gateway'),
  auth: h('auth'),
  authentication: h('auth'),
  login: h('auth'),
  sso: h('auth'),
  oauth: h('auth', { protocol: 'OAuth 2.0' }),
  auth0: h('auth'),
  okta: h('auth'),
  cognito: h('auth'),
  'identity provider': h('auth'),
  service: { kind: 'service', generic: true },
  microservice: { kind: 'service', generic: true },
  server: { kind: 'service', generic: true },
  backend: { kind: 'service', generic: true },
  api: { kind: 'service', generic: true },
  worker: h('service'),
  consumer: h('service'),
  database: h('database'),
  db: h('database'),
  postgres: h('database', { engine: 'PostgreSQL' }),
  postgresql: h('database', { engine: 'PostgreSQL' }),
  mysql: h('database', { engine: 'MySQL' }),
  mongo: h('database', { engine: 'MongoDB' }),
  mongodb: h('database', { engine: 'MongoDB' }),
  dynamodb: h('database', { engine: 'DynamoDB' }),
  elasticsearch: h('database'),
  cache: h('cache'),
  redis: h('cache', { engine: 'Redis' }),
  memcached: h('cache', { engine: 'Memcached' }),
  queue: h('queue'),
  'message queue': h('queue'),
  rabbitmq: h('queue', { engine: 'RabbitMQ' }),
  sqs: h('queue', { engine: 'Amazon SQS' }),
  kafka: h('pubsub', { engine: 'Kafka' }),
  sns: h('pubsub', { engine: 'Amazon SNS' }),
  'pub/sub': h('pubsub'),
  pubsub: h('pubsub'),
  topic: h('pubsub'),
  'event bus': h('pubsub'),
  'event stream': h('pubsub'),
  s3: h('object_storage', { provider: 'Amazon S3' }),
  bucket: h('object_storage'),
  'object storage': h('object_storage'),
  'blob storage': h('object_storage', { provider: 'Azure Blob Storage' }),
  lambda: h('serverless_function', { provider: 'AWS Lambda' }),
  function: h('serverless_function'),
  'serverless function': h('serverless_function'),
  'cloud function': h('serverless_function', {
    provider: 'Google Cloud Functions',
  }),
  cron: h('scheduler', { engine: 'cron' }),
  'cron job': h('scheduler', { engine: 'cron' }),
  scheduler: h('scheduler'),
  stripe: h('external_service', { category: 'Payments' }),
  paypal: h('external_service', { category: 'Payments' }),
  twilio: h('external_service', { category: 'SMS' }),
  sendgrid: h('external_service', { category: 'Email' }),
  mailgun: h('external_service', { category: 'Email' }),
  'google maps': h('external_service', { category: 'Maps' }),
  firebase: h('external_service'),
  'apple push': h('external_service'),
  openai: h('external_service', { category: 'AI' }),
  'external service': h('external_service'),
  'third-party service': h('external_service'),
  monitoring: h('monitoring'),
  prometheus: h('monitoring', { tool: 'Prometheus' }),
  datadog: h('monitoring', { tool: 'Datadog' }),
  grafana: h('monitoring'),
}

interface Verb {
  kind: ConnectionKind
  reverse?: boolean
  chain?: boolean
}

const CALL: Verb = { kind: 'call' }
const ASYNC: Verb = { kind: 'async' }
const CONSUME: Verb = { kind: 'async', reverse: true }
const verbs = (verb: Verb, phrases: string[]) =>
  phrases.map((phrase) => [phrase, verb] as const)

const VERBS = new Map<string, Verb>([
  ...verbs({ kind: 'call', chain: true }, ['->', '→', '=>']),
  ...verbs(CALL, [
    'talks to',
    'talk to',
    'calls',
    'call',
    'hits',
    'hit',
    'uses',
    'use',
    'queries',
    'query',
    'reads from',
    'read from',
    'reads',
    'writes to',
    'write to',
    'writes',
    'stores data in',
    'stores in',
    'store in',
    'saves to',
    'save to',
    'connects to',
    'connect to',
    'goes through',
    'go through',
    'goes to',
    'go to',
    'forwards to',
    'forward to',
    'routes to',
    'route to',
    'proxies to',
    'fetches from',
    'fetch from',
    'loads from',
    'uploads to',
    'upload to',
    'depends on',
    'checks',
    'caches in',
    'authenticates with',
    'authenticate with',
    'logs in with',
    'charges',
    'sends requests to',
    'sends',
    'send',
    'invokes',
    'invoke',
    'serves',
    'looks up',
    'requests',
    'stores',
    'store',
    'uploads',
    'saves',
    'caches',
  ]),
  ...verbs(ASYNC, [
    'publishes to',
    'publish to',
    'publishes',
    'publish',
    'emits',
    'emit',
    'pushes to',
    'push to',
    'pushes',
    'enqueues',
    'enqueue',
    'produces to',
    'produces',
    'produce',
    'streams to',
    'triggers',
    'trigger',
    'notifies',
    'schedules',
    'fires',
  ]),
  ...verbs(CONSUME, [
    'consumes from',
    'consume from',
    'consumes',
    'consume',
    'subscribes to',
    'subscribe to',
    'listens to',
    'listen to',
    'listens on',
    'pulls from',
    'pull from',
    'polls',
    'processes',
  ]),
  ...verbs({ kind: 'two-way' }, ['syncs with', 'sync with', 'chats with']),
])

const STOP = new Set(
  `a an the and or but to from in on into onto with by for of at as via
  through is are was were be been has have had will would can could should
  when where while so then also both each all some any every its their our
  my your using directly asynchronously synchronously too there here`.split(
    /\s+/,
  ),
)
const RELATIVE = new Set(['which', 'that', 'who'])
const PRONOUNS = new Set(['it', 'them', 'they', 'this', 'these', 'those'])
// Kept as written when they show up lower-case.
const DISPLAY: Record<string, string> = {
  api: 'API',
  cdn: 'CDN',
  db: 'DB',
  s3: 'S3',
  sqs: 'SQS',
  sns: 'SNS',
  lb: 'LB',
  alb: 'ALB',
  elb: 'ELB',
  sso: 'SSO',
  ios: 'iOS',
  spa: 'SPA',
  rabbitmq: 'RabbitMQ',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  postgresql: 'PostgreSQL',
  dynamodb: 'DynamoDB',
  sendgrid: 'SendGrid',
  cloudfront: 'CloudFront',
  oauth: 'OAuth',
}
const MAX_MODIFIERS = 2
const MESSAGING: readonly ComponentKind[] = ['queue', 'pubsub']

interface Token {
  text: string
  lower: string
}

function tokenize(sentence: string): Token[] {
  const words = sentence.match(/->|→|=>|,|[\p{L}\p{N}][\p{L}\p{N}/_.+-]*/gu)
  return (words ?? []).map((text) => {
    const trimmed = text.replace(/[.-]+$/, '')
    return { text: trimmed, lower: trimmed.toLowerCase() }
  })
}

/** Longest phrase from `table` starting at token `i`, as [length, value]. */
function matchAt<T>(
  tokens: Token[],
  i: number,
  table: { get(key: string): T | undefined },
): [number, T] | null {
  for (let length = 3; length >= 1; length--) {
    if (i + length > tokens.length) continue
    const words = tokens.slice(i, i + length).map((t) => t.lower)
    const phrase = words.join(' ')
    const found =
      table.get(phrase) ??
      (phrase.endsWith('s') ? table.get(phrase.slice(0, -1)) : undefined)
    if (found !== undefined) return [length, found]
  }
  return null
}

const headTable = {
  get: (key: string) => (Object.hasOwn(HEADS, key) ? HEADS[key] : undefined),
}

function displayName(words: Token[]): string {
  const text = words
    .map((w) => (w.text === w.lower ? (DISPLAY[w.lower] ?? w.text) : w.text))
    .join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Builds a draft from a description. Deterministic: same text, same draft. */
export function parseDescription(text: string): Draft {
  const components: DraftComponent[] = []
  const connections: DraftConnection[] = []

  const named = (name: string) =>
    components.find((c) => c.name.toLowerCase() === name.toLowerCase())

  // A noun phrase (run of content words) as a component, if it names one.
  const resolve = (chunk: Token[]): DraftComponent | null => {
    let head: { at: number; length: number; head: Head } | null = null
    for (let i = 0; i < chunk.length; i++) {
      const found = matchAt(chunk, i, headTable)
      if (found) {
        head = { at: i, length: found[0], head: found[1] }
        i += found[0] - 1
      }
    }
    if (!head) {
      // "Orders" refers back to "Orders service".
      return (
        components.find((c) =>
          chunk.some(
            (w) =>
              w.lower.length > 2 &&
              c.name.toLowerCase().split(' ')[0] === w.lower,
          ),
        ) ?? null
      )
    }
    const start = Math.max(0, head.at - MAX_MODIFIERS)
    const words = chunk.slice(start, head.at + head.length)
    let { kind, props } = head.head
    for (let i = start; i < head.at; i++) {
      const found = matchAt(chunk, i, headTable)?.[1]
      if (!found) continue
      // "auth service" is auth and "redis server" a cache, but "orders
      // service" and "users service" stay services.
      if (head.head.generic && !found.generic && found.kind !== 'client') {
        ;({ kind, props } = found)
      } else if (found.kind === kind) {
        // "Redis cache" picks up Redis as the engine.
        props = { ...found.props, ...props }
      }
    }
    const name = displayName(words)
    const existing = named(name)
    if (existing) return existing
    // "the gateway" after "an API gateway" means the same one.
    if (head.at === start) {
      const sameKind = components.filter((c) => c.kind === kind)
      if (sameKind.length === 1) return sameKind[0]
    }
    const component: DraftComponent = {
      key: `c${String(components.length + 1)}`,
      kind,
      name,
      ...(props && { props: { ...props } }),
    }
    components.push(component)
    return component
  }

  const connect = (from: DraftComponent, to: DraftComponent, verb: Verb) => {
    const [source, target] = verb.reverse ? [to, from] : [from, to]
    if (source === target) return
    if (connections.some((c) => c.from === source.key && c.to === target.key))
      return
    const touchesMessaging =
      MESSAGING.includes(source.kind) || MESSAGING.includes(target.kind)
    connections.push({
      from: source.key,
      to: target.key,
      kind: verb.kind === 'call' && touchesMessaging ? 'async' : verb.kind,
    })
  }

  // What "it"/"them" can mean: the most recent component, the most recent
  // queue or topic, and the previous sentence's subject.
  const seen: {
    last: DraftComponent | null
    messaging: DraftComponent | null
    subjects: DraftComponent[]
  } = { last: null, messaging: null, subjects: [] }
  const sentences = text.split(/[.;!?]+(?=\s|$)|\n+/)
  for (const sentence of sentences) {
    const tokens = tokenize(sentence)
    let subjects: DraftComponent[] = []
    let verb: Verb | null = null
    // Objects of the current verb; the first one doesn't come after "and".
    let objects: DraftComponent[] = []
    // An object, not two lets: TypeScript would wrongly narrow lets that
    // the mention() closure also changes.
    const clause: {
      previous: 'mention' | 'and' | 'relative' | 'verb' | 'other'
      lastMention: DraftComponent | null
    } = { previous: 'other', lastMention: null }

    const mention = (component: DraftComponent) => {
      if (verb) {
        for (const subject of subjects) connect(subject, component, verb)
        objects.push(component)
        if (verb.chain) {
          subjects = [component]
          verb = null
          objects = []
        }
      } else if (clause.previous === 'and' && subjects.length > 0) {
        subjects.push(component)
      } else {
        subjects = [component]
      }
      clause.lastMention = component
      seen.last = component
      if (MESSAGING.includes(component.kind)) seen.messaging = component
      clause.previous = 'mention'
    }

    let i = 0
    while (i < tokens.length) {
      const token = tokens[i]
      const verbMatch = matchAt(tokens, i, VERBS)
      if (verbMatch) {
        const [length, found] = verbMatch
        if (clause.previous === 'relative' && clause.lastMention) {
          subjects = [clause.lastMention]
        } else if (
          clause.previous === 'mention' &&
          verb &&
          clause.lastMention
        ) {
          // "A calls B and C writes to D": C starts a new clause.
          const mentioned = clause.lastMention
          if (objects.length > 1) {
            const lastEdge = connections.at(-1)
            if (
              lastEdge?.to === mentioned.key ||
              lastEdge?.from === mentioned.key
            )
              connections.pop()
          }
          subjects = [mentioned]
        } else if (subjects.length === 0 && seen.last) {
          subjects = [seen.last]
        }
        verb = found
        objects = []
        clause.previous = 'verb'
        i += length
        continue
      }
      if (token.lower === 'and' || token.text === ',') {
        if (clause.previous !== 'verb') clause.previous = 'and'
        i++
        continue
      }
      if (RELATIVE.has(token.lower)) {
        clause.previous = 'relative'
        i++
        continue
      }
      if (PRONOUNS.has(token.lower)) {
        const target: DraftComponent | null =
          verb?.reverse && seen.messaging ? seen.messaging : seen.last
        // "It writes to X" at the start of a sentence: the last subject.
        if (verb && target) mention(target)
        else if (!verb && seen.subjects.length > 0) subjects = seen.subjects
        else if (!verb && target) subjects = [target]
        i++
        continue
      }
      if (STOP.has(token.lower)) {
        i++
        continue
      }
      // Gather the noun phrase up to the next stop word, verb or comma.
      let end = i
      while (
        end < tokens.length &&
        !STOP.has(tokens[end].lower) &&
        !RELATIVE.has(tokens[end].lower) &&
        !PRONOUNS.has(tokens[end].lower) &&
        tokens[end].text !== ',' &&
        !matchAt(tokens, end, VERBS)
      ) {
        end++
      }
      const component = resolve(tokens.slice(i, end))
      if (component) mention(component)
      else if (clause.previous !== 'verb') clause.previous = 'other'
      i = end
    }
    if (subjects.length > 0) seen.subjects = subjects
  }
  return { components, connections }
}
