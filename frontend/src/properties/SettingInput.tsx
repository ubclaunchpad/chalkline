import { useState, type KeyboardEvent } from 'react'
import type { SettingDefinition } from '../catalog/catalog.ts'

interface SettingInputProps {
  id: string
  setting: SettingDefinition
  value: string | number
  error?: string
  onCommit: (value: string | number) => void
}

const controlClass =
  'h-8 w-full rounded-md border border-border-strong bg-surface px-3 text-label text-ink focus-visible:outline-2 focus-visible:outline-focus-ring aria-invalid:border-danger'

// One labelled input for one catalog setting. The input type comes from the
// setting, so new settings need no changes here.
export function SettingInput({
  id,
  setting,
  value,
  error,
  onCommit,
}: SettingInputProps) {
  // What the user is typing, kept separate from the saved value so that a
  // half-typed number (such as an empty box) is not saved.
  const [draft, setDraft] = useState<string>(String(value))
  const errorId = `${id}-error`

  // Only send real changes: committing an unchanged value would still bump
  // the element's version and sync an edit that changed nothing.
  const commitDraft = () => {
    if (draft === String(value)) {
      return
    }
    onCommit(setting.type === 'number' ? Number(draft) : draft)
  }

  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commitDraft()
    }
  }

  const describedBy: string | undefined = error ? errorId : undefined
  const invalid: true | undefined = error ? true : undefined

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label font-semibold text-ink-muted">
        {setting.label}
      </label>

      {setting.type === 'choice' ? (
        // A dropdown change is a finished choice, so it commits right away.
        <select
          id={id}
          className={controlClass}
          value={draft}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => {
            setDraft(event.target.value)
            onCommit(event.target.value)
          }}
        >
          {setting.options.map((option: string) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        // Text and number boxes commit when the user leaves the box or
        // presses Enter, not on every keystroke.
        <input
          id={id}
          type={setting.type}
          min={setting.type === 'number' ? setting.min : undefined}
          className={controlClass}
          value={draft}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onBlur={commitDraft}
          onKeyDown={commitOnEnter}
        />
      )}

      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
