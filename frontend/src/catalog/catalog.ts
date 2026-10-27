/*  
    The component catalog: every kind of box Chalkline understands and the
    settings it accepts. The validator and the ComponentData type are derived
    from CATALOG, so adding a kind only means adding an entry here.
*/

interface TextSetting {
  type: 'text'
  label: string
  default: string
}

interface NumberSetting {
  type: 'number'
  label: string
  default: number
  min: number
}

interface ChoiceSetting {
  type: 'choice'
  label: string
  default: string
  options: readonly string[]
}

export type SettingDefinition = TextSetting | NumberSetting | ChoiceSetting

export interface KindDefinition {
  label: string
  description: string
  settings: Readonly<Record<string, SettingDefinition>>
}

export const CATALOG = {
  client: {
    label: 'Client',
    description: 'Where requests start, such as a browser or mobile app.',
    settings: {
      platform: {
        type: 'choice',
        label: 'Platform',
        default: 'Web',
        options: ['Web', 'Mobile', 'Desktop'],
      },
    },
  },
  cdn: {
    label: 'CDN',
    description: 'Serves static content from servers close to users.',
    settings: {
      mode: {
        type: 'choice',
        label: 'Mode',
        default: 'Pull',
        options: ['Pull', 'Push'],
      },
      ttlSeconds: {
        type: 'number',
        label: 'TTL (seconds)',
        default: 86400,
        min: 1,
      },
    },
  },
  load_balancer: {
    label: 'Load balancer',
    description: 'Spreads incoming traffic across several servers.',
    settings: {
      algorithm: {
        type: 'choice',
        label: 'Algorithm',
        default: 'Round robin',
        options: ['Round robin', 'Least connections', 'IP hash'],
      },
      layer: {
        type: 'choice',
        label: 'Layer',
        default: 'Layer 7',
        options: ['Layer 4', 'Layer 7'],
      },
    },
  },
  api_gateway: {
    label: 'API gateway',
    description:
      'Single entry point that routes, authenticates and rate-limits API calls.',
    settings: {
      basePath: {
        type: 'text',
        label: 'Base path',
        default: '/api',
      },
      auth: {
        type: 'choice',
        label: 'Authentication',
        default: 'JWT',
        options: ['None', 'API key', 'JWT', 'OAuth'],
      },
      rateLimitPerSecond: {
        type: 'number',
        label: 'Rate limit (per second)',
        default: 100,
        min: 1,
      },
    },
  },
  service: {
    label: 'Service',
    description:
      'Runs application logic, usually stateless so it can scale out behind a load balancer.',
    settings: {
      instances: {
        type: 'number',
        label: 'Instances',
        default: 1,
        min: 1,
      },
      protocol: {
        type: 'choice',
        label: 'Protocol',
        default: 'HTTP',
        options: ['HTTP', 'gRPC'],
      },
    },
  },
  database: {
    label: 'Database',
    description: 'Stores data durably and answers queries about it.',
    settings: {
      engine: {
        type: 'choice',
        label: 'Engine',
        default: 'PostgreSQL',
        options: ['PostgreSQL', 'MySQL', 'MongoDB', 'DynamoDB'],
      },
      replicas: {
        type: 'number',
        label: 'Replicas',
        default: 1,
        min: 1,
      },
    },
  },
  cache: {
    label: 'Cache',
    description:
      'Keeps frequently read data in memory so requests skip slower storage.',
    settings: {
      engine: {
        type: 'choice',
        label: 'Engine',
        default: 'Redis',
        options: ['Redis', 'Memcached'],
      },
      strategy: {
        type: 'choice',
        label: 'Strategy',
        default: 'Cache-aside',
        options: [
          'Cache-aside',
          'Write-through',
          'Write-behind',
          'Refresh-ahead',
        ],
      },
      ttlSeconds: {
        type: 'number',
        label: 'TTL (seconds)',
        default: 300,
        min: 1,
      },
    },
  },
  queue: {
    label: 'Queue',
    description:
      'Holds messages so producers and consumers can work at their own pace.',
    settings: {
      engine: {
        type: 'choice',
        label: 'Engine',
        default: 'RabbitMQ',
        options: ['RabbitMQ', 'Amazon SQS', 'Redis'],
      },
      delivery: {
        type: 'choice',
        label: 'Delivery',
        default: 'At-least-once',
        options: ['At-least-once', 'At-most-once', 'Exactly-once'],
      },
    },
  },
  object_storage: {
    label: 'Object storage',
    description: 'Stores large files like images and backups cheaply.',
    settings: {
      provider: {
        type: 'choice',
        label: 'Provider',
        default: 'Amazon S3',
        options: [
          'Amazon S3',
          'Google Cloud Storage',
          'Azure Blob Storage',
          'MinIO',
        ],
      },
      storageClass: {
        type: 'choice',
        label: 'Storage class',
        default: 'Standard',
        options: ['Standard', 'Infrequent access', 'Archive'],
      },
    },
  },
} as const satisfies Readonly<Record<string, KindDefinition>>

export type ComponentKind = keyof typeof CATALOG

// The value a setting holds in props: a number setting holds a number, a
// choice holds one of its options, and a text setting holds any string.
type SettingValue<S> = S extends { type: 'number' }
  ? number
  : S extends { options: readonly (infer Option)[] }
    ? Option
    : string

// The props object for one kind, e.g. { engine: 'Redis' | 'Memcached', ... }.
type Settings<K extends ComponentKind> = (typeof CATALOG)[K]['settings']
export type ComponentProps<K extends ComponentKind> = {
  [Key in keyof Settings<K>]: SettingValue<Settings<K>[Key]>
}

// What is stored in an Excalidraw element's customData. It is a union with
// one variant per kind, so checking `kind` tells TypeScript which props exist.
export type ComponentData = {
  [K in ComponentKind]: {
    v: 1
    kind: K
    name: string
    props: ComponentProps<K>
  }
}[ComponentKind]
