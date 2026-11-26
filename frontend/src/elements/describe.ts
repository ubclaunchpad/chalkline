import type { ComponentData } from '../catalog/catalog'

const plural = (count: number, word: string) =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`

/** 86400 -> "1d", 300 -> "5m", 45 -> "45s". */
export function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) return `${String(seconds / 86400)}d`
  if (seconds % 3600 === 0) return `${String(seconds / 3600)}h`
  if (seconds % 60 === 0) return `${String(seconds / 60)}m`
  return `${String(seconds)}s`
}

/** The short technical line shown under a component's name. */
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
      return `${data.props.protocol} · ${plural(data.props.instances, 'instance')}`
    case 'database':
      return `${data.props.engine} · ${plural(data.props.replicas, 'replica')}`
    case 'cache':
      return `${data.props.engine} · TTL ${formatDuration(data.props.ttlSeconds)}`
    case 'queue':
    case 'pubsub':
      return `${data.props.engine} · ${data.props.delivery.toLowerCase()}`
    case 'object_storage':
      return `${data.props.provider} · ${data.props.storageClass}`
    case 'serverless_function':
      return `${data.props.provider} · ${data.props.trigger}`
    case 'auth':
      return `${data.props.protocol} · ${data.props.session}`
    case 'external_service':
      return `${data.props.category} · ${data.props.integration}`
    case 'scheduler':
      return `${data.props.engine} ${data.props.schedule}`
    case 'monitoring':
      return `${data.props.tool} · ${String(data.props.retentionDays)}d`
  }
}

/** The text bound to a component card: its name, then its technical detail. */
export function cardLabel(data: ComponentData): string {
  return `${data.name}\n${describeComponent(data)}`
}
