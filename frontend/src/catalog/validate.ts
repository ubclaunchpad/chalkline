// Checks untrusted data (from the network or a saved board) against the
// catalog. Nothing here names a specific kind, so new kinds need no changes.

import {
  CATALOG,
  type ComponentData,
  type ComponentKind,
  type KindDefinition,
  type SettingDefinition,
} from './catalog.ts'

const MAX_NAME_LENGTH = 100
const KINDS = Object.keys(CATALOG)

export type ValidationResult =
  { ok: true; data: ComponentData } | { ok: false; problems: string[] }

export function validateComponent(value: unknown): ValidationResult {
  if (!isObject(value)) {
    return { ok: false, problems: ['component data must be an object'] }
  }

  const problems: string[] = []

  if (value.v !== 1) {
    problems.push('v must be 1')
  }

  const nameProblem = checkName(value.name)
  if (nameProblem) {
    problems.push(nameProblem)
  }

  // Props can only be checked once we know which kind's settings apply.
  if (!isKind(value.kind)) {
    problems.push(`kind must be one of: ${KINDS.join(', ')}`)
  } else if (!isObject(value.props)) {
    problems.push('props must be an object')
  } else {
    problems.push(...checkProps(value.kind, value.props))
  }

  if (problems.length > 0) {
    return { ok: false, problems }
  }
  // Every field was checked above, so the data matches ComponentData.
  return { ok: true, data: value as ComponentData }
}

// Plain objects only: typeof also reports 'object' for null and arrays.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// hasOwn ignores inherited keys, so 'toString' is not mistaken for a kind.
function isKind(value: unknown): value is ComponentKind {
  return typeof value === 'string' && Object.hasOwn(CATALOG, value)
}

function checkName(name: unknown): string | undefined {
  if (name === undefined) {
    return 'name is required'
  }
  if (typeof name !== 'string') {
    return 'name must be text'
  }
  if (name.trim() === '') {
    return 'name is required'
  }
  if (name.length > MAX_NAME_LENGTH) {
    return `name must be at most ${String(MAX_NAME_LENGTH)} characters`
  }
  return undefined
}

function checkProps(
  kind: ComponentKind,
  props: Record<string, unknown>,
): string[] {
  const settings: KindDefinition['settings'] = CATALOG[kind].settings
  const problems: string[] = []

  for (const [key, setting] of Object.entries(settings)) {
    const problem = checkSetting(key, setting, props[key])
    if (problem) {
      problems.push(problem)
    }
  }

  for (const key of Object.keys(props)) {
    if (!Object.hasOwn(settings, key)) {
      problems.push(`unknown setting: ${key}`)
    }
  }

  return problems
}

function checkSetting(
  key: string,
  setting: SettingDefinition,
  value: unknown,
): string | undefined {
  if (value === undefined) {
    return `${key} is required`
  }

  switch (setting.type) {
    case 'text':
      return typeof value === 'string' ? undefined : `${key} must be text`

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${key} must be a number`
      }
      if (!Number.isInteger(value)) {
        return `${key} must be a whole number`
      }
      if (value < setting.min) {
        return `${key} must be at least ${String(setting.min)}`
      }
      return undefined

    case 'choice':
      if (typeof value === 'string' && setting.options.includes(value)) {
        return undefined
      }
      return `${key} must be one of: ${setting.options.join(', ')}`
  }
}
