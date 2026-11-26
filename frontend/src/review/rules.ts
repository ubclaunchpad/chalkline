// Architecture review on local rules only: nothing leaves the browser. Each
// rule reads the graph and component settings and explains what it found.

import type { Graph, GraphEdge, GraphNode } from '../graph/deriveGraph.ts'

export type Area = 'reliability' | 'scalability' | 'security'
export type Score = 'Good' | 'Fair' | 'Needs work'

export interface Finding {
  key: string
  area: Area
  /** High findings alone are enough for "Needs work". */
  high: boolean
  title: string
  why: string
  tryThis: string
  elementIds: string[]
}

export interface Review {
  scores: Record<Area, Score>
  findings: Finding[]
}

interface Context {
  nodes: GraphNode[]
  edges: GraphEdge[]
  node: (id: string) => GraphNode | undefined
}

type Rule = (context: Context) => Finding[]

const ofKind = (context: Context, kind: GraphNode['kind']) =>
  context.nodes.filter((node) => node.kind === kind)

/** Nodes this one sends to (two-way arrows count both ways). */
const outgoing = (context: Context, id: string) =>
  context.edges.flatMap((edge) =>
    edge.source === id
      ? [edge.target]
      : edge.target === id && edge.connection.kind === 'two-way'
        ? [edge.source]
        : [],
  )

/** Nodes that send to this one (two-way arrows count both ways). */
const incoming = (context: Context, id: string) =>
  context.edges.flatMap((edge) =>
    edge.target === id
      ? [edge.source]
      : edge.source === id && edge.connection.kind === 'two-way'
        ? [edge.target]
        : [],
  )

const kindOf = (context: Context, id: string) => context.node(id)?.kind

const singleDatabase: Rule = (context) =>
  ofKind(context, 'database')
    .filter((node) => node.kind === 'database' && node.props.replicas < 2)
    .map((node) => ({
      key: `db-replica:${node.id}`,
      area: 'reliability',
      high: true,
      title: `${node.name} is a single point of failure`,
      why: 'With only one copy of the database, one crashed server takes down every feature that needs this data, and recent writes can be lost.',
      tryThis: 'Set Replicas to 2 or more so a standby can take over.',
      elementIds: [node.id],
    }))

const lonelyBehindBalancer: Rule = (context) =>
  ofKind(context, 'load_balancer').flatMap((balancer) =>
    outgoing(context, balancer.id)
      .map((id) => context.node(id))
      .filter(
        (node): node is GraphNode & { kind: 'service' } =>
          node?.kind === 'service' && node.props.instances < 2,
      )
      .map((service) => ({
        key: `lb-single:${balancer.id}:${service.id}`,
        area: 'scalability' as const,
        high: false,
        title: `${balancer.name} has only one ${service.name} to send to`,
        why: 'A load balancer helps by spreading traffic across several copies. With one instance it adds a hop but no extra capacity, and no backup if it fails.',
        tryThis: `Set ${service.name}'s Instances to 2 or more.`,
        elementIds: [balancer.id, service.id],
      })),
  )

const BACKEND_KINDS = new Set(['service', 'serverless_function'])

const clientsSkipEntry: Rule = (context) =>
  ofKind(context, 'client').flatMap((client) =>
    outgoing(context, client.id)
      .filter((id) => BACKEND_KINDS.has(kindOf(context, id) ?? ''))
      .map((id) => ({
        key: `direct:${client.id}:${id}`,
        area: 'scalability' as const,
        high: false,
        title: `${client.name} calls ${context.node(id)?.name ?? 'a service'} directly`,
        why: 'Without a gateway or load balancer in front, you cannot add more copies of the service, rate-limit abusive callers, or move the service without updating every client.',
        tryThis:
          'Put an API gateway or load balancer between the client and the service.',
        elementIds: [client.id, id],
      })),
  )

const READERS = new Set(['service', 'serverless_function', 'api_gateway'])

const noCache: Rule = (context) =>
  ofKind(context, 'database').flatMap((database) => {
    const readers = incoming(context, database.id).filter((id) =>
      READERS.has(kindOf(context, id) ?? ''),
    )
    const cached = readers.some((id) =>
      outgoing(context, id).some((next) => kindOf(context, next) === 'cache'),
    )
    if (readers.length === 0 || cached) return []
    return [
      {
        key: `no-cache:${database.id}`,
        area: 'scalability' as const,
        high: false,
        title: `Every read goes straight to ${database.name}`,
        why: 'Most apps read the same data far more often than they change it. Without a cache, each of those reads costs a database query, and the database becomes the first thing to slow down.',
        tryThis:
          'Add a cache next to the service that reads from this database (cache-aside is a good default).',
        elementIds: [database.id, ...readers],
      },
    ]
  })

const QUEUE_KINDS = ['queue', 'pubsub'] as const

const unconsumedQueue: Rule = (context) =>
  QUEUE_KINDS.flatMap((kind) => ofKind(context, kind))
    .filter((queue) => outgoing(context, queue.id).length === 0)
    .map((queue) => ({
      key: `no-consumer:${queue.id}`,
      area: 'reliability',
      high: true,
      title: `Nothing takes messages off ${queue.name}`,
      why: 'Messages pile up when nobody reads them. The queue grows until it runs out of space, and the work it was meant to trigger never happens.',
      tryThis:
        'Draw an arrow from the queue to the worker or service that handles its messages.',
      elementIds: [queue.id],
    }))

const SAFETY_NOTE = /timeout|retr(y|ies)|circuit/i

const mentionsSafety = (edge: GraphEdge) =>
  SAFETY_NOTE.test(
    [
      edge.connection.label ?? '',
      ...Object.entries(edge.connection.props ?? {})
        .flat()
        .map(String),
    ].join(' '),
  )

const unguardedExternalCalls: Rule = (context) =>
  context.edges
    .filter(
      (edge) =>
        kindOf(context, edge.target) === 'external_service' &&
        !mentionsSafety(edge),
    )
    .map((edge) => ({
      key: `external:${edge.id}`,
      area: 'reliability',
      high: false,
      title: `${context.node(edge.source)?.name ?? 'A component'} calls ${context.node(edge.target)?.name ?? 'an external service'} with no timeout or retry`,
      why: 'Outside services slow down and fail on their own schedule. Without a timeout, a slow reply ties up your service; without retries, one blip becomes a user-facing error.',
      tryThis:
        'Label the arrow with how failures are handled, for example "timeout 2s, 3 retries".',
      elementIds: [edge.source, edge.target],
    }))

const noMonitoring: Rule = (context) =>
  context.nodes.length >= 3 && ofKind(context, 'monitoring').length === 0
    ? [
        {
          key: 'no-monitoring',
          area: 'reliability',
          high: false,
          title: 'Nothing is watching the system',
          why: "Without metrics, logs and alerts you find out something broke when users complain, and you can't tell which part failed.",
          tryThis:
            'Add a monitoring component and connect it to the services it watches.',
          elementIds: [],
        },
      ]
    : []

const openGateway: Rule = (context) =>
  ofKind(context, 'api_gateway')
    .filter(
      (gateway) =>
        gateway.kind === 'api_gateway' &&
        gateway.props.auth === 'None' &&
        incoming(context, gateway.id).some(
          (id) => kindOf(context, id) === 'client',
        ),
    )
    .map((gateway) => ({
      key: `open-gateway:${gateway.id}`,
      area: 'security',
      high: true,
      title: `${gateway.name} lets anyone in`,
      why: 'This gateway is reachable from clients but has Authentication set to None, so anyone who finds the address can call every API behind it.',
      tryThis: 'Set Authentication to JWT or OAuth, or add an auth component.',
      elementIds: [gateway.id],
    }))

const unprotectedBackend: Rule = (context) => {
  const protectedBoard =
    ofKind(context, 'auth').length > 0 ||
    context.nodes.some(
      (node) => node.kind === 'api_gateway' && node.props.auth !== 'None',
    )
  if (protectedBoard) return []
  return ofKind(context, 'client').flatMap((client) =>
    outgoing(context, client.id)
      .filter((id) =>
        [...BACKEND_KINDS, 'load_balancer'].includes(kindOf(context, id) ?? ''),
      )
      .map((id) => ({
        key: `no-auth:${client.id}:${id}`,
        area: 'security' as const,
        high: true,
        title: `Nothing checks who is calling ${context.node(id)?.name ?? 'this API'}`,
        why: 'Clients reach this API with no gateway authentication or auth service on the board, so there is no clear place where callers prove who they are.',
        tryThis:
          'Add an auth component, or route clients through an API gateway with authentication turned on.',
        elementIds: [client.id, id],
      })),
  )
}

export const REVIEW_RULES: readonly Rule[] = [
  singleDatabase,
  lonelyBehindBalancer,
  clientsSkipEntry,
  noCache,
  unconsumedQueue,
  unguardedExternalCalls,
  noMonitoring,
  openGateway,
  unprotectedBackend,
]

export const AREAS: readonly Area[] = ['reliability', 'scalability', 'security']

export function scoreFor(findings: readonly Finding[]): Score {
  if (findings.length === 0) return 'Good'
  return findings.length === 1 && !findings[0]?.high ? 'Fair' : 'Needs work'
}

export function reviewDiagram(graph: Graph): Review {
  const context: Context = {
    nodes: Object.values(graph.nodes),
    edges: Object.values(graph.edges),
    node: (id) =>
      Object.hasOwn(graph.nodes, id) ? graph.nodes[id] : undefined,
  }
  const findings = REVIEW_RULES.flatMap((rule) => rule(context))
  findings.sort((left, right) => Number(right.high) - Number(left.high))
  const scores = Object.fromEntries(
    AREAS.map((area) => [
      area,
      scoreFor(findings.filter((finding) => finding.area === area)),
    ]),
  ) as Record<Area, Score>
  return { scores, findings }
}
