import type { Identity } from './identity'
import type { Participant } from './presence'

// Match the product mock: show two people, then summarize everyone else.
const MAX_VISIBLE_PARTICIPANTS = 2

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase())
    .join('')
}

export function ParticipantAvatars({
  identity,
  participants,
}: {
  identity: Identity
  participants: ReadonlyMap<string, Participant>
}) {
  const people = [
    {
      id: 'self',
      name: identity.name,
      accessibleName: `${identity.name} (you)`,
      color: identity.color,
    },
    ...[...participants]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, participant]) => ({
        id,
        name: participant.name,
        accessibleName: participant.name,
        color: participant.color,
      })),
  ]
  const visible = people.slice(0, MAX_VISIBLE_PARTICIPANTS)
  const overflow = people.length - visible.length

  return (
    <ul
      aria-label={`Board participants, ${String(people.length)} present`}
      className="flex shrink-0 items-center pl-1"
    >
      {visible.map((person, index) => (
        <li
          key={person.id}
          aria-label={person.accessibleName}
          title={person.accessibleName}
          className="flex size-8 items-center justify-center rounded-full border-2 border-bg bg-surface-selected text-xs font-extrabold text-accent shadow-sm"
          style={{
            backgroundColor: person.color,
            marginLeft: index === 0 ? 0 : '-0.375rem',
            zIndex: visible.length - index,
          }}
        >
          <span aria-hidden="true">{initialsFor(person.name)}</span>
        </li>
      ))}
      {overflow > 0 && (
        <li
          aria-label={`${String(overflow)} additional participants`}
          title={`${String(overflow)} additional participants`}
          className="-ml-1.5 flex size-8 items-center justify-center rounded-full border-2 border-bg bg-surface-raised text-xs font-extrabold text-ink-muted shadow-sm"
        >
          <span aria-hidden="true">+{overflow}</span>
        </li>
      )}
    </ul>
  )
}
