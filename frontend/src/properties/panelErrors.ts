import type { ComponentData } from '../catalog/catalog.ts'
import { fieldErrors } from './fieldErrors.ts'
import type { ComponentChange } from './updateComponent.ts'

// The rules for which validation errors the property panel shows. Kept apart
// from the hook so they can be tested without a board.
//
// Fields are named as fieldErrors names them: 'name' or a setting key such as
// 'replicas'.

// A rejected change, remembered with the field's saved value at the time.
// Once that value changes (for example a collaborator sets it), the user's
// rejected draft has been replaced, so the error no longer applies.
interface FieldError {
  message: string
  savedValue: unknown
}

// Errors remember which element they are for, so selecting another component
// does not show the previous one's errors.
export interface PanelErrors {
  elementId: string
  errors: Readonly<Record<string, FieldError>>
}

const NO_ERRORS: Readonly<Record<string, string>> = {}

// The fields a change sets.
function changedFields(change: ComponentChange): string[] {
  const fields: string[] = Object.keys(change.props ?? {})
  if (change.name !== undefined) {
    fields.push('name')
  }
  return fields
}

// A field's saved value.
function fieldValue(data: ComponentData | null, field: string): unknown {
  if (!data) {
    return undefined
  }
  if (field === 'name') {
    return data.name
  }
  const props: Readonly<Record<string, unknown>> = data.props
  return props[field]
}

function withErrors(
  elementId: string,
  errors: Record<string, FieldError>,
): PanelErrors | null {
  return Object.keys(errors).length > 0 ? { elementId, errors } : null
}

// The errors after a save of `change` to an element whose saved data was
// `saved`. `problems` is what the validator rejected, empty when it saved.
//
// A save only decides the errors of the fields it changed. Other fields keep
// theirs, because their boxes may still show a rejected draft.
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

// The errors after the scene changed and `selected` is the selected component
// (or null). Returns `prev` itself when nothing changed, so React can skip the
// re-render on the many scene changes that are only pointer moves.
//
// Errors are dropped, not just hidden, so one cannot come back later if the
// value returns to what it was.
export function errorsAfterSceneChange(
  prev: PanelErrors | null,
  selected: { elementId: string; data: ComponentData } | null,
): PanelErrors | null {
  if (!prev) {
    return null
  }
  // Once something else is selected (or nothing), drop them all, so coming
  // back later starts clean.
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

// The messages to show for the selected element, by field.
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
