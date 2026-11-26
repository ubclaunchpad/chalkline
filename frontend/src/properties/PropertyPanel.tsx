import {
  CATALOG,
  type ComponentData,
  type KindDefinition,
  type SettingDefinition,
} from '../catalog/catalog.ts'
import { SettingInput } from './SettingInput.tsx'
import type { ComponentChange } from './updateComponent.ts'

interface PropertyPanelProps {
  // Changes whenever a different element is selected or the element is edited
  // (including by someone else), so inputs restart with the saved values.
  elementKey: string
  data: ComponentData
  notes: string
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

const notesSetting: SettingDefinition = {
  type: 'text',
  label: 'Notes',
  default: '',
}

// Shows one component's name, settings and notes. It only reports changes;
// saving them to the board is the caller's job.
export function PropertyPanel({
  elementKey,
  data,
  notes,
  errors,
  onChange,
}: PropertyPanelProps) {
  const kind: KindDefinition = CATALOG[data.kind]
  // Widened like in validate.ts: each kind has its own setting keys, so a
  // plain string key needs these general types to look values up.
  const settings: KindDefinition['settings'] = kind.settings
  const props: Readonly<Record<string, string | number>> = data.props

  return (
    <section aria-label="Component settings" className="flex flex-col gap-4">
      <p className="text-label text-ink-muted">{kind.description}</p>

      <SettingInput
        key={`${elementKey}-name`}
        id="component-name"
        setting={nameSetting}
        value={data.name}
        error={errors.name}
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

      <SettingInput
        key={`${elementKey}-notes`}
        id="component-notes"
        setting={notesSetting}
        value={notes}
        error={errors.notes}
        multiline
        onCommit={(value: string | number) => {
          onChange({ notes: String(value) })
        }}
      />
    </section>
  )
}
