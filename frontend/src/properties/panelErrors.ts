import type { ComponentData } from '../catalog/catalog.ts'
import { fieldErrors } from './fieldErrors.ts'
import type { ComponentChange } from './updateComponent.ts'

// Which validation errors the panel shows. Fields are 'name' or setting keys.

// Always a primitive, so === compares it.
type FieldValue = string | number | undefined

// An error stops applying once its field's saved value changes.
interface FieldError {
  message: string
  savedValue: FieldValue
}

export interface PanelErrors {
  elementId: string
  errors: Readonly<Record<string, FieldError>>
}

const NO_ERRORS: Readonly<Record<string, string>> = {}

function changedFields(change: ComponentChange): string[] {
  const fields: string[] = Object.keys(change.props ?? {})
  if (change.name !== undefined) {
    fields.push('name')
  }
  return fields
}

function fieldValue(data: ComponentData | null, field: string): FieldValue {
  if (!data) {
    return undefined
  }
  if (field === 'name') {
    return data.name
  }
  // Widened like in validate.ts: each kind has its own setting keys.
  const props: Readonly<Record<string, string | number>> = data.props
  return Object.hasOwn(props, field) ? props[field] : undefined
}

function withErrors(
  elementId: string,
  errors: Record<string, FieldError>,
): PanelErrors | null {
  return Object.keys(errors).length > 0 ? { elementId, errors } : null
}

// A save only replaces the errors of the fields it changed.
export function errorsAfterSave(
  prev: PanelErrors | null,
  elementId: string,
  saved: ComponentData | null,
  change: ComponentChange,
  problems: readonly string[],
): PanelErrors | null {
  const touched: string[] = changedFields(change)
  const errors: Record<string, FieldError> = {}

  if (prev?.elementId === elementId) {
    for (const [field, error] of Object.entries(prev.errors)) {
      if (!touched.includes(field)) {
        errors[field] = error
      }
    }
  }
  for (const [field, message] of Object.entries(fieldErrors(problems))) {
    errors[field] = { message, savedValue: fieldValue(saved, field) }
  }

  return withErrors(elementId, errors)
}

// Drops errors for another element or a replaced value. Returns prev when
// unchanged, so pointer moves don't re-render.
export function errorsAfterSceneChange(
  prev: PanelErrors | null,
  selected: { elementId: string; data: ComponentData } | null,
): PanelErrors | null {
  if (!prev) {
    return null
  }
  if (prev.elementId !== selected?.elementId) {
    return null
  }

  const errors: Record<string, FieldError> = {}
  for (const [field, error] of Object.entries(prev.errors)) {
    if (fieldValue(selected.data, field) === error.savedValue) {
      errors[field] = error
    }
  }
  if (Object.keys(errors).length === Object.keys(prev.errors).length) {
    return prev
  }
  return withErrors(prev.elementId, errors)
}

export function visibleErrors(
  panelErrors: PanelErrors | null,
  elementId: string | undefined,
): Readonly<Record<string, string>> {
  if (!panelErrors || panelErrors.elementId !== elementId) {
    return NO_ERRORS
  }
  const shown: Record<string, string> = {}
  for (const [field, error] of Object.entries(panelErrors.errors)) {
    shown[field] = error.message
  }
  return shown
}
