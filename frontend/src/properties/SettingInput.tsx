import { useEffect, useEffectEvent, useState, type KeyboardEvent } from 'react'
import type { SettingDefinition } from '../catalog/catalog.ts'

interface SettingInputProps {
  id: string
  setting: SettingDefinition
  value: string | number
  error?: string
  onCommit: (value: string | number) => void
  // When set, a text or number box also commits once the user stops typing
  // for this long, instead of only on blur or Enter.
  commitDelayMs?: number
}

// Number('') is 0, which would quietly save an empty box as 0 for any setting
// whose minimum allows it. An empty box is not a number, so it becomes NaN and
// the validator reports 'must be a number'. A number box reports '' for
// anything that is not a number (including only spaces), so '' is the only
// case to catch.
function draftToNumber(draft: string): number {
  return draft === '' ? Number.NaN : Number(draft)
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
  commitDelayMs,
}: SettingInputProps) {
  // What the user is typing, kept separate from the saved value so that a
  // half-typed number (such as an empty box) is not saved.
  const [draft, setDraft] = useState<string>(String(value))
  const errorId = `${id}-error`

  // When the saved value changes while this input stays on screen (such as
  // someone else renaming the component), show the new value. Our own saves
  // come back equal to the draft, so they change nothing visible.
  const [savedValue, setSavedValue] = useState<string | number>(value)
  if (value !== savedValue) {
    setSavedValue(value)
    setDraft(String(value))
  }

  // Only send real changes, so an untouched box does no work. The exception is
  // a box showing an error whose draft is back at the saved value: committing
  // it lets the caller clear the error. That save changes nothing, so it does
  // not bump the element's version or sync an edit.
  const commitDraft = () => {
    if (draft === String(value) && !error) {
      return
    }
    onCommit(setting.type === 'number' ? draftToNumber(draft) : draft)
  }

  // An effect event always sees the latest draft and onCommit without making
  // the timer restart when they change. onCommit is a new function on every
  // render, so depending on it would restart the timer after each failed save
  // and retry forever.
  const commitAfterPause = useEffectEvent(commitDraft)

  useEffect(() => {
    if (commitDelayMs === undefined) {
      return
    }
    const timer = setTimeout(() => {
      commitAfterPause()
    }, commitDelayMs)
    // Typing again before the delay ends cancels this timer and starts a new
    // one, so only the pause after the last keystroke commits.
    return () => {
      clearTimeout(timer)
    }
  }, [draft, commitDelayMs])

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
