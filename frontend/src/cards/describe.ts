// The one-line technical summary shown under a component's name on its card,
// built only from the component's validated settings.

import type { ComponentData } from '../catalog/catalog.ts'

const SECONDS_PER_DAY = 86400
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60

/** "1 replica", "3 replicas". */
function count(amount: number, noun: string): string {
  return `${String(amount)} ${noun}${amount === 1 ? '' : 's'}`
}

/** The largest whole unit: 86400 -> "1d", 7200 -> "2h", 300 -> "5m", 45 -> "45s". */
export function formatDuration(seconds: number): string {
  if (seconds % SECONDS_PER_DAY === 0) {
    return `${String(seconds / SECONDS_PER_DAY)}d`
  }
  if (seconds % SECONDS_PER_HOUR === 0) {
    return `${String(seconds / SECONDS_PER_HOUR)}h`
  }
  if (seconds % SECONDS_PER_MINUTE === 0) {
    return `${String(seconds / SECONDS_PER_MINUTE)}m`
  }
  return `${String(seconds)}s`
}

/** The card's detail line, e.g. "PostgreSQL · 1 replica". */
export function describeComponent(data: ComponentData): string {
  switch (data.kind) {
    case 'client':
      return data.props.platform
    case 'cdn':
      return `${data.props.mode} · TTL ${formatDuration(data.props.ttlSeconds)}`
    case 'load_balancer':
      return `${data.props.layer === 'Layer 4' ? 'L4' : 'L7'} · ${data.props.algorithm}`
    case 'api_gateway':
      return `${data.props.basePath} · ${data.props.auth} · ${String(data.props.rateLimitPerSecond)}/s`
    case 'service':
      return `${data.props.protocol} · ${count(data.props.instances, 'instance')}`
    case 'database':
      return `${data.props.engine} · ${count(data.props.replicas, 'replica')}`
    case 'cache':
      return `${data.props.engine} · TTL ${formatDuration(data.props.ttlSeconds)}`
    case 'queue':
    case 'pubsub':
      return `${data.props.engine} · ${data.props.delivery}`
    case 'object_storage':
      return `${data.props.provider} · ${data.props.storageClass}`
    case 'serverless_function':
      return `${data.props.provider} · ${data.props.trigger}`
    case 'auth':
      return `${data.props.protocol} · ${data.props.session}`
    case 'external_service':
      return `${data.props.category} · ${data.props.integration}`
    case 'scheduler':
      return `${data.props.engine} · ${data.props.schedule}`
    case 'monitoring':
      return `${data.props.tool} · ${String(data.props.retentionDays)}d`
  }
}
