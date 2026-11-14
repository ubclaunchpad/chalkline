import type { Icon, IconProps } from '@tabler/icons-react'

export const ICON_STROKE_WIDTH = 1.75

type SharedIconProps = Omit<
  IconProps,
  'aria-hidden' | 'aria-label' | 'role' | 'stroke'
> & {
  icon: Icon
}

type DecorativeIconProps = SharedIconProps & {
  decorative?: true
  label?: never
}

type InformativeIconProps = SharedIconProps & {
  decorative: false
  label: string
}

export type ChalklineIconProps = DecorativeIconProps | InformativeIconProps

export function ChalklineIcon({
  icon: IconComponent,
  decorative = true,
  label,
  ...props
}: ChalklineIconProps) {
  return (
    <IconComponent
      {...props}
      stroke={ICON_STROKE_WIDTH}
      focusable="false"
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      role={decorative ? undefined : 'img'}
    />
  )
}
