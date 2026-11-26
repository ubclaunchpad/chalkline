import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  IconArrowNarrowRight,
  IconBoxMultiple,
  IconSquareDashed,
  IconTrash,
  IconX,
  type Icon,
} from '@tabler/icons-react'
import { useBoard, useScene } from '../app/context'
import type { SettingDefinition } from '../catalog/catalog'
import { ChalklineIcon } from '../design/Icon'
import { catalog } from '../sidebar/catalog'
import { fieldErrors } from './fieldErrors'
import {
  ACCENT_COLOURS,
  CONNECTION_KINDS,
  currentSize,
  deleteElements,
  GROUP_KINDS,
  inspectTarget,
  readConnection,
  PROTOCOLS,
  resizeAroundCentre,
  setAccent,
  SIZES,
  updateConnection,
  updateGroup,
  type ConnectionData,
  type GroupData,
  type InspectTarget,
} from './inspect'
import { PropertyPanel } from './PropertyPanel'
import { SettingInput } from './SettingInput'
import {
  readNotes,
  updateComponent,
  type UpdateResult,
} from './updateComponent'
import { canvasColor, onScreen } from '../design/canvasColor'

const NOT_SET = 'Not set'

const kindSetting: SettingDefinition = {
  type: 'choice',
  label: 'Kind',
  default: 'Call',
  options: CONNECTION_KINDS.map((kind) => kind.label),
}
const labelSetting: SettingDefinition = {
  type: 'text',
  label: 'Label',
  default: '',
}
const protocolSetting: SettingDefinition = {
  type: 'choice',
  label: 'Protocol',
  default: NOT_SET,
  options: [NOT_SET, ...PROTOCOLS],
}
const groupNameSetting: SettingDefinition = {
  type: 'text',
  label: 'Name',
  default: '',
}
const groupKindSetting: SettingDefinition = {
  type: 'choice',
  label: 'Kind',
  default: 'VPC',
  options: GROUP_KINDS.map((kind) => kind.label),
}

const buttonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-md text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:opacity-60'

/** Settings panel for the selected component, connection or group. */
export function Inspector() {
  const { api, access, panel, openPanel, closePanel } = useBoard()
  const { elements, selectedIds } = useScene()
  const target = useMemo(
    () => inspectTarget(elements, selectedIds),
    [elements, selectedIds],
  )

  // Open on a new single selection and close when it clears, but only react
  // to selection changes so a panel the user opened or closed stays that way.
  const selectionKey = selectedIds.join(',')
  const lastSelection = useRef('')
  useEffect(() => {
    if (selectionKey === lastSelection.current) return
    lastSelection.current = selectionKey
    if (target && target.type !== 'many' && panel === null) {
      openPanel('inspector')
    } else if (!target && panel === 'inspector') {
      closePanel()
    }
  }, [selectionKey, target, panel, openPanel, closePanel])

  if (panel !== 'inspector') return null

  // Writes changed elements with undo, so they sync to everyone on the board.
  const apply = (changed: readonly ExcalidrawElement[]) => {
    if (!api || changed.length === 0) return
    const byId = new Map(changed.map((el) => [el.id, el]))
    api.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        .map((el) => byId.get(el.id) ?? el),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
  }
  // The latest version of an element, in case someone edited it meanwhile.
  const latest = (id: string): ExcalidrawElement | undefined =>
    api?.getSceneElementsIncludingDeleted().find((el) => el.id === id)

  const header = headerFor(target)

  return (
    <aside
      aria-labelledby="inspector-title"
      className="flex h-full w-75 flex-col border-l border-border bg-surface-raised text-ink max-md:w-full"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          closePanel()
        }
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span className="inline-flex size-8 items-center justify-center rounded-md bg-surface-overlay text-accent">
          <ChalklineIcon icon={header.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="inspector-title" className="truncate font-bold">
            {header.title}
          </h2>
          {header.subtitle && (
            <p className="truncate text-label text-ink-muted">
              {header.subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close settings"
          onClick={closePanel}
          className={`${buttonClass} size-8 hover:bg-surface-overlay`}
        >
          <ChalklineIcon icon={IconX} size={18} />
        </button>
      </div>

      <fieldset
        disabled={access === 'view'}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {access === 'view' && (
          <p className="mb-3 text-label text-ink-muted">
            You can view this board but not change it.
          </p>
        )}
        {target === null ? (
          <p className="text-ink-muted">
            Select a component, connection or group to see its settings.
          </p>
        ) : target.type === 'component' ? (
          <ComponentSettings target={target} apply={apply} latest={latest} />
        ) : target.type === 'connection' ? (
          <ConnectionSettings
            element={target.element}
            data={target.data}
            apply={apply}
            latest={latest}
          />
        ) : target.type === 'group' ? (
          <GroupSettings
            element={target.element}
            data={target.data}
            apply={apply}
            latest={latest}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p>{target.summary} selected.</p>
            <button
              type="button"
              onClick={() => {
                if (!api) return
                apply(deleteElements(target.ids, api.getSceneElements()))
                api.updateScene({
                  appState: { selectedElementIds: {} },
                  captureUpdate: CaptureUpdateAction.NEVER,
                })
              }}
              className={`${buttonClass} self-start border border-danger px-3 py-1.5 text-danger hover:bg-surface-overlay`}
            >
              <ChalklineIcon icon={IconTrash} size={16} />
              Delete
            </button>
          </div>
        )}
      </fieldset>
    </aside>
  )
}

function headerFor(target: InspectTarget | null): {
  icon: Icon
  title: string
  subtitle?: string
} {
  if (target?.type === 'component') {
    const entry = catalog.find((item) => item.kind === target.data.kind)
    return {
      icon: entry?.icon ?? IconBoxMultiple,
      title: entry?.label ?? 'Component',
      subtitle: target.data.name,
    }
  }
  if (target?.type === 'connection') {
    return { icon: IconArrowNarrowRight, title: 'Connection' }
  }
  if (target?.type === 'group') {
    return {
      icon: IconSquareDashed,
      title: 'Group',
      subtitle: target.data.name,
    }
  }
  if (target?.type === 'many')
    return { icon: IconBoxMultiple, title: 'Selection' }
  return { icon: IconBoxMultiple, title: 'Settings' }
}

interface EditorProps {
  apply: (changed: readonly ExcalidrawElement[]) => void
  latest: (id: string) => ExcalidrawElement | undefined
}

// Saves an update or keeps its problems for the inputs. Problems are kept per
// element so they vanish when another element is selected.
function useSave(elementId: string, apply: EditorProps['apply']) {
  const [problems, setProblems] = useState<{
    id: string
    errors: Record<string, string>
  }>({ id: '', errors: {} })
  const save = (result: UpdateResult) => {
    if (result.ok) {
      setProblems({ id: elementId, errors: {} })
      apply([result.element])
    } else {
      setProblems({ id: elementId, errors: fieldErrors(result.problems) })
    }
  }
  return { errors: problems.id === elementId ? problems.errors : {}, save }
}

function ComponentSettings({
  target,
  apply,
  latest,
}: EditorProps & {
  target: Extract<InspectTarget, { type: 'component' }>
}) {
  const { element, data } = target
  const { errors, save } = useSave(element.id, apply)
  const elementKey = `${element.id}-${String(element.version)}`
  return (
    <div className="flex flex-col gap-4">
      <Appearance element={element} apply={apply} latest={latest} />
      <PropertyPanel
        elementKey={elementKey}
        data={data}
        notes={readNotes(element)}
        errors={errors}
        onChange={(change) => {
          save(updateComponent(latest(element.id) ?? element, change))
        }}
      />
    </div>
  )
}

function ConnectionSettings({
  element,
  data,
  apply,
  latest,
}: EditorProps & { element: ExcalidrawElement; data: ConnectionData }) {
  const { errors, save } = useSave(element.id, apply)
  const elementKey = `${element.id}-${String(element.version)}`
  const change = (next: Parameters<typeof updateConnection>[2]) => {
    // Read the newest data: the render-time copy can lag behind the scene.
    const current = latest(element.id) ?? element
    save(updateConnection(current, readConnection(current, []) ?? data, next))
  }
  const kindLabel =
    CONNECTION_KINDS.find((kind) => kind.value === data.kind)?.label ?? 'Call'
  const protocol = data.props?.protocol
  return (
    <div className="flex flex-col gap-4">
      <SettingInput
        key={`${elementKey}-kind`}
        id="connection-kind"
        setting={kindSetting}
        value={kindLabel}
        error={errors.kind}
        onCommit={(value) => {
          change({
            kind: CONNECTION_KINDS.find((kind) => kind.label === value)?.value,
          })
        }}
      />
      <SettingInput
        key={`${elementKey}-label`}
        id="connection-label"
        setting={labelSetting}
        value={data.label ?? ''}
        error={errors.label}
        onCommit={(value) => {
          change({ label: String(value) })
        }}
      />
      <SettingInput
        key={`${elementKey}-protocol`}
        id="connection-protocol"
        setting={protocolSetting}
        value={typeof protocol === 'string' ? protocol : NOT_SET}
        error={errors.protocol}
        onCommit={(value) => {
          change({ protocol: value === NOT_SET ? '' : String(value) })
        }}
      />
    </div>
  )
}

function GroupSettings({
  element,
  data,
  apply,
  latest,
}: EditorProps & { element: ExcalidrawElement; data: GroupData }) {
  const { errors, save } = useSave(element.id, apply)
  const elementKey = `${element.id}-${String(element.version)}`
  const kindLabel =
    GROUP_KINDS.find((kind) => kind.value === data.kind)?.label ?? 'VPC'
  return (
    <div className="flex flex-col gap-4">
      <SettingInput
        key={`${elementKey}-name`}
        id="group-name"
        setting={groupNameSetting}
        value={data.name}
        error={errors.name}
        onCommit={(value) => {
          save(
            updateGroup(latest(element.id) ?? element, { name: String(value) }),
          )
        }}
      />
      <SettingInput
        key={`${elementKey}-kind`}
        id="group-kind"
        setting={groupKindSetting}
        value={kindLabel}
        error={errors.kind}
        onCommit={(value) => {
          save(
            updateGroup(latest(element.id) ?? element, {
              kind: GROUP_KINDS.find((kind) => kind.label === value)?.value,
            }),
          )
        }}
      />
    </div>
  )
}

// The colour and size pop-up: accent swatches and S / M / L presets.
function Appearance({
  element,
  apply,
  latest,
}: EditorProps & { element: ExcalidrawElement }) {
  const { api } = useBoard()
  // Build on the newest versions so quick clicks don't undo each other.
  const current = () => latest(element.id) ?? element
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const size = currentSize(element)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="inspector-appearance"
        onClick={() => {
          setOpen((value) => !value)
        }}
        className={`${buttonClass} w-full justify-start border border-border-strong px-3 py-1.5 hover:bg-surface-overlay`}
      >
        <span
          aria-hidden="true"
          className="size-4 rounded-full border border-border"
          style={{ backgroundColor: onScreen(element.strokeColor) }}
        />
        Colour and size
        <span className="ml-auto text-label text-ink-muted">
          {size?.short ?? 'Custom'}
        </span>
      </button>
      {open && (
        <div
          id="inspector-appearance"
          role="group"
          aria-label="Colour and size"
          className="absolute top-full right-0 left-0 z-10 mt-2 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            }
          }}
        >
          <Section label="Colour">
            {ACCENT_COLOURS.map((colour) => (
              <button
                key={colour.value}
                type="button"
                aria-label={colour.name}
                aria-pressed={element.strokeColor === canvasColor(colour.value)}
                title={colour.name}
                onClick={() => {
                  apply([setAccent(current(), colour.value)])
                }}
                className={`${buttonClass} size-8 rounded-full border-2 border-transparent aria-pressed:border-ink`}
              >
                <span
                  aria-hidden="true"
                  className="size-6 rounded-full"
                  style={{ backgroundColor: colour.value }}
                />
              </button>
            ))}
          </Section>
          <Section label="Size">
            {SIZES.map((option) => (
              <button
                key={option.short}
                type="button"
                aria-label={option.name}
                aria-pressed={size === option}
                title={`${option.name} (${String(option.width)} × ${String(option.height)})`}
                onClick={() => {
                  apply(
                    resizeAroundCentre(
                      current(),
                      option,
                      api?.getSceneElements() ?? [],
                    ),
                  )
                }}
                className={`${buttonClass} h-8 w-10 border border-border-strong font-bold hover:bg-surface-overlay aria-pressed:border-accent aria-pressed:bg-surface-selected`}
              >
                {option.short}
              </button>
            ))}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-label font-semibold text-ink-muted">{label}</span>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}
