import { useState, type ReactNode } from 'react'
import {
  CATALOG,
  defaultProps,
  KIND_DEFS,
  type ComponentData,
  type FieldDef,
  type Kind,
} from './catalog'
import { kindLabel, type Finding, type Graph } from './graph'

type Props = {
  tab: 'properties' | 'review'
  onTab: (tab: 'properties' | 'review') => void
  selected: { id: string; data: ComponentData } | null
  graph: Graph
  findings: Finding[]
  readOnly: boolean
  onChange: (id: string, data: ComponentData) => void
  onFocus: (ids: string[]) => void
}

export default function SidePanel(props: Props) {
  const { tab, onTab, findings } = props
  const warnings = findings.filter((f) => f.severity === 'warning').length
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex border-b border-slate-200 text-sm" role="tablist">
        <TabButton
          active={tab === 'properties'}
          onClick={() => onTab('properties')}
        >
          Properties
        </TabButton>
        <TabButton active={tab === 'review'} onClick={() => onTab('review')}>
          Review
          {findings.length > 0 && (
            <span
              className={`ml-2 rounded-full px-1.5 text-xs ${warnings ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
            >
              {findings.length}
            </span>
          )}
        </TabButton>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'properties' ? (
          <PropertiesTab {...props} />
        ) : (
          <ReviewTab {...props} />
        )}
      </div>
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center py-2.5 font-medium ${active ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
    >
      {children}
    </button>
  )
}

function PropertiesTab({
  selected,
  graph,
  readOnly,
  onChange,
  onFocus,
}: Props) {
  if (!selected) {
    return (
      <div className="text-sm text-slate-500">
        <p>Select a component to see what it is and edit its properties.</p>
        <p className="mt-3">
          The board has{' '}
          <strong className="text-slate-800">{graph.nodes.length}</strong>{' '}
          components and{' '}
          <strong className="text-slate-800">{graph.edges.length}</strong>{' '}
          connections.
        </p>
      </div>
    )
  }
  // Re-mount the form when the selection changes so drafts reset.
  return (
    <ComponentForm
      key={selected.id}
      selected={selected}
      graph={graph}
      readOnly={readOnly}
      onChange={onChange}
      onFocus={onFocus}
    />
  )
}

function ComponentForm({
  selected,
  graph,
  readOnly,
  onChange,
  onFocus,
}: Pick<Props, 'graph' | 'readOnly' | 'onChange' | 'onFocus'> & {
  selected: { id: string; data: ComponentData }
}) {
  const { id, data } = selected
  const def = KIND_DEFS[data.kind]
  const names = new Map(graph.nodes.map((n) => [n.id, n.name]))
  const incoming = graph.edges.filter((e) => e.to === id)
  const outgoing = graph.edges.filter((e) => e.from === id)

  const setKind = (kind: Kind) =>
    onChange(id, { ...data, kind, props: { ...defaultProps(kind) } })

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center gap-3">
        <span
          className="h-8 w-10 rounded-md border-2"
          style={{ background: def.background, borderColor: def.stroke }}
          aria-hidden
        />
        <div>
          <p className="text-xs text-slate-500">{def.label}</p>
          <p className="font-semibold">{data.name}</p>
        </div>
      </div>
      <p className="text-slate-500">{def.description}</p>

      <fieldset disabled={readOnly} className="space-y-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={data.name}
            onChange={(e) => onChange(id, { ...data, name: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <select
            className={inputClass}
            value={data.kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            {CATALOG.map((d) => (
              <option key={d.kind} value={d.kind}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        {def.fields.map((field) => (
          <PropField
            key={`${data.kind}-${field.key}`}
            field={field}
            value={data.props[field.key] ?? field.default}
            onValid={(value) =>
              onChange(id, {
                ...data,
                props: { ...data.props, [field.key]: value },
              })
            }
          />
        ))}
      </fieldset>

      <div>
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Connections
        </h3>
        {incoming.length + outgoing.length === 0 ? (
          <p className="mt-2 text-slate-500">
            None yet. Draw an arrow to or from this component.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {incoming.map((e) => (
              <ConnectionRow
                key={e.id}
                label={`from ${names.get(e.from)}`}
                onClick={() => onFocus([e.from])}
              />
            ))}
            {outgoing.map((e) => (
              <ConnectionRow
                key={e.id}
                label={`to ${names.get(e.to)}`}
                onClick={() => onFocus([e.to])}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ConnectionRow({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full rounded px-2 py-1 text-left hover:bg-slate-100"
      >
        {label.startsWith('from') ? '← ' : '→ '}
        {label}
      </button>
    </li>
  )
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:bg-slate-50 disabled:text-slate-500'

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  )
}

function PropField({
  field,
  value,
  onValid,
}: {
  field: FieldDef
  value: string | number
  onValid: (value: string | number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState<string>()

  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <select
          className={inputClass}
          value={String(value)}
          onChange={(e) => onValid(e.target.value)}
        >
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
    )
  }

  return (
    <Field label={field.label} error={error}>
      <input
        className={`${inputClass} ${error ? 'border-red-500' : ''}`}
        inputMode={field.type === 'number' ? 'numeric' : undefined}
        value={draft}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          if (field.type === 'text') {
            setError(undefined)
            onValid(next)
            return
          }
          const n = Number(next)
          if (next.trim() === '' || !Number.isFinite(n))
            setError('Enter a number')
          else if (field.min !== undefined && n < field.min)
            setError(`Must be at least ${field.min}`)
          else {
            setError(undefined)
            onValid(n)
          }
        }}
      />
    </Field>
  )
}

function ReviewTab({ graph, findings, onFocus }: Props) {
  const [showGraph, setShowGraph] = useState(false)
  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-500">
        Feedback from the structure you drew: {graph.nodes.length} components,{' '}
        {graph.edges.length} connections.
      </p>
      {graph.nodes.length === 0 ? (
        <p className="text-slate-500">Add some components to get feedback.</p>
      ) : findings.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
          No issues found by the current rules.
        </p>
      ) : (
        <ul className="space-y-2">
          {findings.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => onFocus(f.elementIds)}
                className={`w-full rounded-lg border p-3 text-left hover:shadow-sm ${f.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
              >
                <span className="block font-medium">
                  {f.severity === 'warning' ? '⚠︎ ' : 'ⓘ '}
                  {f.title}
                </span>
                <span className="mt-1 block text-slate-600">{f.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-200 pt-4">
        <button
          onClick={() => setShowGraph((s) => !s)}
          className="text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          {showGraph ? 'Hide' : 'Show'} derived graph
        </button>
        {showGraph && (
          <div className="mt-2 space-y-2 text-xs">
            <ul className="space-y-0.5">
              {graph.nodes.map((n) => (
                <li key={n.id}>
                  <span className="text-slate-500">{kindLabel(n.kind)}:</span>{' '}
                  {n.name}
                </li>
              ))}
            </ul>
            <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
              {JSON.stringify(
                {
                  nodes: graph.nodes.map(({ id, kind, props }) => ({
                    id,
                    kind,
                    props,
                  })),
                  edges: graph.edges.map(({ from, to }) => ({ from, to })),
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
