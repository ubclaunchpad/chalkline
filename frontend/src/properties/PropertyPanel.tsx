import {
  CATALOG,
  type ComponentData,
  type KindDefinition,
  type SettingDefinition,
} from '../catalog/catalog.ts'
import { SettingInput } from './SettingInput.tsx'
import type { ComponentChange } from './updateComponent.ts'

// How long the name waits after the last keystroke before saving.
export const NAME_COMMIT_DELAY_MS = 300

interface PropertyPanelProps {
  // Changes only when a different element is selected.
  elementId: string
  // Changes whenever a different element is selected or the element is edited
  // (including by someone else), so inputs restart with the saved values.
  elementKey: string
  data: ComponentData
  // Problems to show, by field: 'name' or a setting key such as 'replicas'.
  errors: Readonly<Record<string, string>>
  onChange: (change: ComponentChange) => void
}

// The name is not a catalog setting, but it edits like a text setting, so it
// reuses the same input.
const nameSetting: SettingDefinition = {
  type: 'text',
  label: 'Name',
  default: '',
}

// Shows one component's name and settings. It only reports changes; saving
// them to the board is the caller's job.
export function PropertyPanel({
  elementId,
  elementKey,
  data,
  errors,
  onChange,
}: PropertyPanelProps) {
  const kind: KindDefinition = CATALOG[data.kind]
  // Widened like in validate.ts: each kind has its own setting keys, so a
  // plain string key needs these general types to look values up.
  const settings: KindDefinition['settings'] = kind.settings
  const props: Readonly<Record<string, string | number>> = data.props

  return (
    <aside
      aria-label="Component settings"
      className="absolute inset-y-0 right-0 z-10 flex w-50 flex-col gap-3 overflow-y-auto border-l border-border bg-bg p-4 motion-safe:animate-panel-in"
    >
      <div>
        <h2 className="text-body font-extrabold text-ink">{kind.label}</h2>
        <p className="text-xs text-ink-muted">{kind.description}</p>
      </div>

      {/* The name saves while the user is still typing, and each save makes a
          new element version. Keying by version would rebuild the input and
          drop focus mid-word, so it is keyed by element only and follows
          outside renames through its value instead. */}
      <SettingInput
        key={`${elementId}-name`}
        id="component-name"
        setting={nameSetting}
        value={data.name}
        error={errors.name}
        commitDelayMs={NAME_COMMIT_DELAY_MS}
        onCommit={(value: string | number) => {
          onChange({ name: String(value) })
        }}
      />

      {Object.entries(settings).map(
        ([key, setting]: [string, SettingDefinition]) => (
          <SettingInput
            key={`${elementKey}-${key}`}
            id={`component-setting-${key}`}
            setting={setting}
            value={props[key]}
            error={errors[key]}
            onCommit={(value: string | number) => {
              onChange({ props: { [key]: value } })
            }}
          />
        ),
      )}
    </aside>
  )
}
