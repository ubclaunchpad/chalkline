import type { ImgHTMLAttributes } from 'react'
import wordmark from '../assets/logos/chalkline-wordmark.svg'

type LogoProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'alt' | 'height' | 'src' | 'width'
> & {
  decorative?: boolean
  label?: string
}

/** The approved Figma wordmark, exported as outlined SVG paths. */
export function Logo({
  decorative = false,
  label = 'Chalkline',
  ...props
}: LogoProps) {
  return (
    <img
      {...props}
      src={wordmark}
      alt={decorative ? '' : label}
      width={619}
      height={109}
    />
  )
}
