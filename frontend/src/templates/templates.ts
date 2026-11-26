// Starter boards, kept as plain data so they can be laid out, previewed and
// inserted by the same code that inserts assistant drafts.
import type { Draft } from '../generate/board'

export interface Template extends Draft {
  id: string
  name: string
  /** One line about what's inside. */
  summary: string
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'three-tier',
    name: 'Three-tier web app',
    summary: 'Browser, CDN, load balancer, app servers, cache and Postgres.',
    components: [
      { key: 'browser', kind: 'client', name: 'Browser' },
      { key: 'cdn', kind: 'cdn', name: 'CDN' },
      { key: 'assets', kind: 'object_storage', name: 'Static assets' },
      { key: 'lb', kind: 'load_balancer', name: 'Load balancer' },
      {
        key: 'app',
        kind: 'service',
        name: 'App server',
        props: { instances: 3 },
      },
      { key: 'cache', kind: 'cache', name: 'Session cache' },
      {
        key: 'db',
        kind: 'database',
        name: 'App DB',
        props: { replicas: 2 },
      },
    ],
    connections: [
      { from: 'browser', to: 'cdn', kind: 'call', label: 'static files' },
      { from: 'cdn', to: 'assets', kind: 'call' },
      { from: 'browser', to: 'lb', kind: 'call', label: 'HTTPS' },
      { from: 'lb', to: 'app', kind: 'call' },
      { from: 'app', to: 'cache', kind: 'call' },
      { from: 'app', to: 'db', kind: 'call', label: 'SQL' },
    ],
  },
  {
    id: 'microservices',
    name: 'Microservices with API gateway',
    summary: 'Web and mobile clients, a gateway, auth and three services.',
    components: [
      {
        key: 'web',
        kind: 'client',
        name: 'Web app',
      },
      {
        key: 'mobile',
        kind: 'client',
        name: 'Mobile app',
        props: { platform: 'Mobile' },
      },
      { key: 'gateway', kind: 'api_gateway', name: 'API gateway' },
      { key: 'auth', kind: 'auth', name: 'Auth' },
      { key: 'users', kind: 'service', name: 'Users service' },
      {
        key: 'orders',
        kind: 'service',
        name: 'Orders service',
        props: { protocol: 'gRPC' },
      },
      { key: 'payments', kind: 'service', name: 'Payments service' },
      { key: 'usersDb', kind: 'database', name: 'Users DB' },
      { key: 'ordersDb', kind: 'database', name: 'Orders DB' },
      {
        key: 'stripe',
        kind: 'external_service',
        name: 'Stripe',
        props: { category: 'Payments' },
      },
    ],
    connections: [
      { from: 'web', to: 'gateway', kind: 'call' },
      { from: 'mobile', to: 'gateway', kind: 'call' },
      { from: 'gateway', to: 'auth', kind: 'call', label: 'verify token' },
      { from: 'gateway', to: 'users', kind: 'call' },
      { from: 'gateway', to: 'orders', kind: 'call' },
      { from: 'orders', to: 'payments', kind: 'call', label: 'gRPC' },
      { from: 'users', to: 'usersDb', kind: 'call' },
      { from: 'orders', to: 'ordersDb', kind: 'call' },
      { from: 'payments', to: 'stripe', kind: 'call' },
    ],
  },
  {
    id: 'event-driven',
    name: 'Event-driven',
    summary: 'An orders API publishes events that three workers consume.',
    components: [
      { key: 'client', kind: 'client', name: 'Shop front' },
      { key: 'api', kind: 'service', name: 'Orders API' },
      { key: 'db', kind: 'database', name: 'Orders DB' },
      { key: 'bus', kind: 'pubsub', name: 'Order events' },
      { key: 'email', kind: 'service', name: 'Email worker' },
      { key: 'stock', kind: 'service', name: 'Inventory worker' },
      { key: 'analytics', kind: 'serverless_function', name: 'Analytics' },
      {
        key: 'sendgrid',
        kind: 'external_service',
        name: 'SendGrid',
        props: { category: 'Email' },
      },
      { key: 'stockDb', kind: 'database', name: 'Inventory DB' },
    ],
    connections: [
      { from: 'client', to: 'api', kind: 'call' },
      { from: 'api', to: 'db', kind: 'call' },
      { from: 'api', to: 'bus', kind: 'async', label: 'order.created' },
      { from: 'bus', to: 'email', kind: 'async' },
      { from: 'bus', to: 'stock', kind: 'async' },
      { from: 'bus', to: 'analytics', kind: 'async' },
      { from: 'email', to: 'sendgrid', kind: 'call' },
      { from: 'stock', to: 'stockDb', kind: 'call' },
    ],
  },
  {
    id: 'url-shortener',
    name: 'URL shortener',
    summary: 'Short links served from a cache, stored in a DB, clicks counted.',
    components: [
      { key: 'client', kind: 'client', name: 'Browser' },
      { key: 'lb', kind: 'load_balancer', name: 'Load balancer' },
      {
        key: 'api',
        kind: 'service',
        name: 'Shortener service',
        props: { instances: 3 },
      },
      { key: 'cache', kind: 'cache', name: 'Link cache' },
      {
        key: 'db',
        kind: 'database',
        name: 'Links DB',
        props: { engine: 'DynamoDB' },
      },
      { key: 'queue', kind: 'queue', name: 'Click queue' },
      { key: 'counter', kind: 'service', name: 'Click counter' },
      { key: 'stats', kind: 'database', name: 'Stats DB' },
    ],
    connections: [
      { from: 'client', to: 'lb', kind: 'call' },
      { from: 'lb', to: 'api', kind: 'call' },
      { from: 'api', to: 'cache', kind: 'call', label: 'look up' },
      { from: 'api', to: 'db', kind: 'call' },
      { from: 'api', to: 'queue', kind: 'async', label: 'click' },
      { from: 'queue', to: 'counter', kind: 'async' },
      { from: 'counter', to: 'stats', kind: 'call' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank board',
    summary: 'Start from an empty canvas.',
    components: [],
    connections: [],
  },
]

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id)
}
