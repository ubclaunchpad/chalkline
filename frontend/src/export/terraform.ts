// Turns the architecture graph into a readable Terraform starting point for
// the components that map cleanly to AWS. It is a sketch to read and edit,
// never applied: every value Chalkline can't know is marked `# TODO`.

import { CATALOG } from '../catalog/catalog'
import type { Graph, GraphNode } from '../graph/deriveGraph'

/** HCL string literal, with quotes, backslashes and interpolation escaped. */
function hcl(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\$\{/g, '$${')
    .replace(/%\{/g, '%%{')
  return `"${escaped}"`
}

/** A Terraform resource name: lowercase letters, digits and underscores. */
export function resourceName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(slug) ? slug : `c_${slug || 'component'}`
}

/** AWS-style name (letters, digits, hyphens) for `name`/`identifier` fields. */
function awsName(name: string): string {
  return resourceName(name).replace(/_/g, '-')
}

/**
 * Converts a 5-field cron expression to AWS's 6-field form, which needs a
 * `?` in either day-of-month or day-of-week. Returns null if it can't.
 */
export function awsCron(expression: string): string | null {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields
  if (dayOfWeek === '*') {
    return `cron(${minute} ${hour} ${dayOfMonth} ${month} ? *)`
  }
  if (dayOfMonth === '*') {
    return `cron(${minute} ${hour} ? ${month} ${dayOfWeek} *)`
  }
  return null
}

// Comment on one line, so a name with a newline can't end the comment early.
const comment = (text: string) => `# ${text.replace(/\s+/g, ' ')}`

function block(type: string, name: string, body: string[]): string {
  return [
    `resource "${type}" "${name}" {`,
    ...body.map((line) => (line ? `  ${line}` : '')),
    '}',
  ].join('\n')
}

// Returns the resource text, or null when the kind has no clean AWS match.
function resourceFor(node: GraphNode, name: string): string | null {
  const title = comment(`${CATALOG[node.kind].label}: ${node.name}`)
  switch (node.kind) {
    case 'database': {
      const { engine, replicas } = node.props
      if (engine === 'DynamoDB') {
        return `${title}\n${block('aws_dynamodb_table', name, [
          `name         = ${hcl(awsName(node.name))}`,
          'billing_mode = "PAY_PER_REQUEST"',
          'hash_key     = "id" # TODO: choose the partition key',
          '',
          'attribute {',
          '  name = "id"',
          '  type = "S"',
          '}',
        ])}`
      }
      if (engine === 'MongoDB') return null
      const primary = block('aws_db_instance', name, [
        `identifier        = ${hcl(awsName(node.name))}`,
        `engine            = ${engine === 'MySQL' ? '"mysql"' : '"postgres"'}`,
        'instance_class    = "db.t3.micro" # TODO: size for your load',
        'allocated_storage = 20 # TODO: storage in GiB',
        'username          = "app" # TODO: admin user name',
        // AWS generates and stores the password, so none is written here.
        'manage_master_user_password = true',
        'db_subnet_group_name = "" # TODO: your subnet group',
        'skip_final_snapshot  = true # TODO: false for real data',
      ])
      if (replicas < 2) return `${title}\n${primary}`
      const readReplicas = block('aws_db_instance', `${name}_replica`, [
        `count               = ${(replicas - 1).toString()} # ${replicas.toString()} replicas drawn: 1 primary + read replicas`,
        `identifier          = "${awsName(node.name)}-replica-\${count.index + 1}"`,
        `replicate_source_db = aws_db_instance.${name}.identifier`,
        'instance_class      = "db.t3.micro" # TODO: size for your load',
        'skip_final_snapshot = true',
      ])
      return `${title}\n${primary}\n\n${readReplicas}`
    }
    case 'cache':
      return `${title}\n${block('aws_elasticache_cluster', name, [
        `cluster_id      = ${hcl(awsName(node.name))}`,
        `engine          = ${node.props.engine === 'Memcached' ? '"memcached"' : '"redis"'}`,
        'node_type       = "cache.t3.micro" # TODO: size for your data',
        'num_cache_nodes = 1',
        'subnet_group_name = "" # TODO: your subnet group',
      ])}`
    case 'queue':
      return `${title}${node.props.engine === 'Amazon SQS' ? '' : `\n${comment(`Drawn as ${node.props.engine}; SQS is the closest managed AWS queue.`)}`}\n${block(
        'aws_sqs_queue',
        name,
        [
          `name = ${hcl(awsName(node.name))}`,
          'message_retention_seconds = 345600 # TODO: how long to keep messages',
        ],
      )}`
    case 'pubsub':
      return `${title}${node.props.engine === 'Amazon SNS' ? '' : `\n${comment(`Drawn as ${node.props.engine}; SNS is the closest managed AWS topic.`)}`}\n${block(
        'aws_sns_topic',
        name,
        [`name = ${hcl(awsName(node.name))}`],
      )}`
    case 'object_storage':
      return `${title}\n${block('aws_s3_bucket', name, [
        `bucket = "TODO-${awsName(node.name)}" # TODO: a globally unique bucket name`,
      ])}`
    case 'serverless_function':
      return `${title}\n${block('aws_lambda_function', name, [
        `function_name = ${hcl(awsName(node.name))}`,
        'role          = "" # TODO: ARN of the function\'s IAM role',
        'runtime       = "nodejs20.x" # TODO: your runtime',
        'handler       = "index.handler" # TODO: your entry point',
        'filename      = "function.zip" # TODO: path to the built code',
      ])}`
    case 'load_balancer':
      return `${title}\n${block('aws_lb', name, [
        `name               = ${hcl(awsName(node.name))}`,
        `load_balancer_type = ${node.props.layer === 'Layer 4' ? '"network"' : '"application"'}`,
        'subnets            = [] # TODO: public subnet ids',
      ])}`
    case 'cdn':
      return `${title}\n${block('aws_cloudfront_distribution', name, [
        'enabled = true',
        '',
        'origin {',
        '  domain_name = "" # TODO: origin domain, e.g. your load balancer or bucket',
        `  origin_id   = ${hcl(awsName(node.name))}`,
        '}',
        '',
        'default_cache_behavior {',
        `  target_origin_id       = ${hcl(awsName(node.name))}`,
        '  viewer_protocol_policy = "redirect-to-https"',
        '  allowed_methods        = ["GET", "HEAD"]',
        '  cached_methods         = ["GET", "HEAD"]',
        `  default_ttl            = ${node.props.ttlSeconds.toString()}`,
        '  cache_policy_id        = "" # TODO: a cache policy id',
        '}',
        '',
        'restrictions {',
        '  geo_restriction {',
        '    restriction_type = "none"',
        '  }',
        '}',
        '',
        'viewer_certificate {',
        '  cloudfront_default_certificate = true # TODO: your certificate',
        '}',
      ])}`
    case 'api_gateway':
      return `${title}\n${block('aws_apigatewayv2_api', name, [
        `name          = ${hcl(awsName(node.name))}`,
        'protocol_type = "HTTP"',
      ])}`
    case 'scheduler': {
      const cron = awsCron(node.props.schedule)
      return `${title}\n${block('aws_cloudwatch_event_rule', name, [
        `name                = ${hcl(awsName(node.name))}`,
        cron
          ? `schedule_expression = ${hcl(cron)}`
          : `schedule_expression = "" # TODO: AWS cron for ${hcl(node.props.schedule)}`,
      ])}`
    }
    default:
      return null
  }
}

export function toTerraform(graph: Graph): string {
  const used = new Set<string>()
  const resources: string[] = []
  const skipped: string[] = []
  for (const node of Object.values(graph.nodes)) {
    let name = resourceName(node.name)
    for (let n = 2; used.has(name); n++)
      name = `${resourceName(node.name)}_${n.toString()}`
    const text = resourceFor(node, name)
    if (text === null) {
      skipped.push(
        `#   - ${node.name.replace(/\s+/g, ' ')} (${CATALOG[node.kind].label})`,
      )
      continue
    }
    used.add(name)
    resources.push(text)
  }
  const header = [
    '# Terraform sketch exported from Chalkline.',
    '# A starting point to read and edit, not a working configuration:',
    '# fill in every TODO, add networking and IAM, and review before applying.',
    '# Connections between components are not represented.',
  ]
  if (skipped.length > 0) {
    header.push('#', '# Skipped (no clean AWS match):', ...skipped)
  }
  const provider = [
    'terraform {',
    '  required_providers {',
    '    aws = {',
    '      source = "hashicorp/aws"',
    '    }',
    '  }',
    '}',
    '',
    'provider "aws" {',
    '  region = "us-east-1" # TODO: your region',
    '}',
  ].join('\n')
  return `${[header.join('\n'), provider, ...resources].join('\n\n')}\n`
}
