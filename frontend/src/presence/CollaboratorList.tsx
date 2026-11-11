import type { Identity } from './identity'

export function CollaboratorList({
  identity,
  connectedClientIds,
  identities,
}: {
  identity: Identity
  connectedClientIds: ReadonlySet<string>
  identities: ReadonlyMap<string, Identity>
}) {
  return (
    <section
      aria-label="Board participants"
      className="max-h-48 min-w-40 max-w-56 shrink-0 overflow-auto rounded-lg bg-white p-3 text-sm text-slate-900 shadow"
      tabIndex={0}
    >
      <h2 className="font-semibold">Who's here</h2>
      <ul className="mt-1 space-y-1">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: identity.color }}
          />
          <span className="break-all">{identity.name} (you)</span>
        </li>
        {[...connectedClientIds].sort().map((clientId) => {
          const participantIdentity = identities.get(clientId)
          return (
            <li key={clientId} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full"
                style={{
                  backgroundColor: participantIdentity?.color ?? '#cbd5e1',
                }}
              />
              <span className="break-all">
                {participantIdentity?.name ?? 'Joining…'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
