import {
  CATALOG,
  type ComponentData,
  type KindDefinition,
  type SettingDefinition,
} from '../catalog/catalog.ts'
import { SettingInput } from './SettingInput.tsx'
import type { ComponentChange } from './updateComponent.ts'

// Name saves this long after the last keystroke.
export const NAME_COMMIT_DELAY_MS = 300

interface PropertyPanelProps {
  // A new id resets the inputs; a new version does not.
  elementId: string
  data: ComponentData
  // By field: 'name' or a setting key.
  errors: Readonly<Record<string, string>>
  onChange: (change: ComponentChange) => void
}

// Name isn't a catalog setting but edits like a text one.
const nameSetting: SettingDefinition = {
  type: 'text',
  label: 'Name',
  default: '',
}

// Shows one component's name and settings. It only reports changes; saving
// them to the board is the caller's job.
export function PropertyPanel({
  elementId,
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
      className="flex h-full w-50 flex-col max-md:w-full gap-3 overflow-y-auto border-l border-border bg-bg p-4 motion-safe:animate-panel-in"
    >
      <div>
        <h2 className="text-body font-extrabold text-ink">{kind.label}</h2>
        <p className="text-xs text-ink-muted">{kind.description}</p>
      </div>

      {/* Keyed by element, not version, so saves keep focus and drafts. */}
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
            key={`${elementId}-${key}`}
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
