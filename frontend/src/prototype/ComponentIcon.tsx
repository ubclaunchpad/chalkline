import { KIND_DEFS, type Kind } from './catalog'
import { iconDataUrl } from './icons'

/** A component's icon on its tinted tile, matching how it looks on the canvas. */
export default function ComponentIcon({
  kind,
  size,
}: {
  kind: Kind
  size: 'sm' | 'lg'
}) {
  const def = KIND_DEFS[kind]
  const box = size === 'sm' ? 'h-8 w-8 rounded-md' : 'h-10 w-10 rounded-lg'
  const img = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  return (
    <span
      className={`flex shrink-0 items-center justify-center border-2 ${box}`}
      style={{ background: def.background, borderColor: def.stroke }}
      aria-hidden
    >
      <img src={iconDataUrl(kind)} alt="" className={img} />
    </span>
  )
}
