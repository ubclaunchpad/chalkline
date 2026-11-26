import { describe, expect, it } from 'vitest'
import { graphOf } from './graphFixture'
import { awsCron, resourceName, toTerraform } from './terraform'

describe('toTerraform', () => {
  it('maps clean kinds to AWS resources and lists the rest as skipped', () => {
    const tf = toTerraform(
      graphOf([
        ['1', 'client', 'Web app'],
        ['2', 'database', 'Orders DB', { engine: 'MySQL', replicas: 3 }],
        ['3', 'cache', 'Hot cache'],
        ['4', 'queue', 'Jobs'],
        ['5', 'pubsub', 'Events', { engine: 'Amazon SNS' }],
        ['6', 'object_storage', 'Uploads'],
        ['7', 'serverless_function', 'Resize'],
        ['8', 'load_balancer', 'Edge LB', { layer: 'Layer 4' }],
        ['9', 'cdn', 'CDN'],
        ['10', 'api_gateway', 'Gateway'],
        ['11', 'scheduler', 'Nightly', { schedule: '0 2 * * *' }],
        ['12', 'service', 'API'],
      ]),
    )
    for (const type of [
      'resource "aws_db_instance" "orders_db"',
      'resource "aws_db_instance" "orders_db_replica"',
      'resource "aws_elasticache_cluster" "hot_cache"',
      'resource "aws_sqs_queue" "jobs"',
      'resource "aws_sns_topic" "events"',
      'resource "aws_s3_bucket" "uploads"',
      'resource "aws_lambda_function" "resize"',
      'resource "aws_lb" "edge_lb"',
      'resource "aws_cloudfront_distribution" "cdn"',
      'resource "aws_apigatewayv2_api" "gateway"',
      'resource "aws_cloudwatch_event_rule" "nightly"',
    ]) {
      expect(tf).toContain(type)
    }
    expect(tf).toContain('engine            = "mysql"')
    expect(tf).toMatch(/count\s+= 2 /)
    expect(tf).toContain('load_balancer_type = "network"')
    expect(tf).toContain('schedule_expression = "cron(0 2 * * ? *)"')
    // Queue drawn as RabbitMQ (the default) gets a note; SNS does not.
    expect(tf).toContain('Drawn as RabbitMQ')
    expect(tf).not.toContain('Drawn as Amazon SNS')
    expect(tf).toContain('# Skipped (no clean AWS match):')
    expect(tf).toContain('#   - Web app (Client)')
    expect(tf).toContain('#   - API (Service)')
    expect(tf).toContain('# TODO')
    expect(tf).not.toMatch(/^\s*password\s*=/m)
  })

  it('has no replica block for a single database and no skipped list when nothing is skipped', () => {
    const tf = toTerraform(graphOf([['1', 'database', 'Main']]))
    expect(tf).not.toContain('_replica')
    expect(tf).not.toContain('Skipped')
    expect(tf).toContain('engine            = "postgres"')
  })

  it('skips MongoDB and maps DynamoDB to a table', () => {
    const tf = toTerraform(
      graphOf([
        ['1', 'database', 'Docs', { engine: 'MongoDB' }],
        ['2', 'database', 'Keys', { engine: 'DynamoDB' }],
      ]),
    )
    expect(tf).toContain('#   - Docs (Database)')
    expect(tf).toContain('resource "aws_dynamodb_table" "keys"')
  })

  it('makes unique, valid resource names and safe strings', () => {
    const tf = toTerraform(
      graphOf([
        ['1', 'queue', 'Jobs'],
        ['2', 'queue', 'jobs!'],
        ['3', 'queue', '42 "quoted" ${x}\nnext'],
      ]),
    )
    expect(tf).toContain('resource "aws_sqs_queue" "jobs"')
    expect(tf).toContain('resource "aws_sqs_queue" "jobs_2"')
    expect(tf).toContain('resource "aws_sqs_queue" "c_42_quoted_x_next"')
    // The name comment stays on one line.
    expect(tf).toContain('# Queue: 42 "quoted" ${x} next')
  })

  it('leaves a TODO for cron it cannot convert', () => {
    const tf = toTerraform(
      graphOf([['1', 'scheduler', 'Odd', { schedule: '0 0 1 * 1' }]]),
    )
    expect(tf).toContain(
      'schedule_expression = "" # TODO: AWS cron for "0 0 1 * 1"',
    )
  })
})

describe('resourceName', () => {
  it('lowercases and replaces symbols, and never starts with a digit', () => {
    expect(resourceName('Orders DB')).toBe('orders_db')
    expect(resourceName('--Hi--')).toBe('hi')
    expect(resourceName('3rd party')).toBe('c_3rd_party')
    expect(resourceName('!!!')).toBe('c_component')
  })
})

describe('awsCron', () => {
  it('adds the year field and a ? in the right place', () => {
    expect(awsCron('0 * * * *')).toBe('cron(0 * * * ? *)')
    expect(awsCron('30 9 * * 1-5')).toBe('cron(30 9 ? * 1-5 *)')
    expect(awsCron('0 0 1 * 1')).toBeNull()
    expect(awsCron('@daily')).toBeNull()
  })
})
