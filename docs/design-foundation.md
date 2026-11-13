# Frontend design foundation

The shared frontend styles come from the Figma **Visual Direction** frame. The
application loads locally bundled Nunito and Gaegu files, defaults to dark mode,
and exposes the design values through Tailwind v4 in
[`frontend/src/index.css`](../frontend/src/index.css).

## Tokens and themes

Use semantic utilities in product UI so a theme change stays centralized:

```tsx
<section className="rounded-lg border border-border bg-surface p-4 text-ink">
  <p className="text-body">Board settings</p>
  <p className="text-label text-ink-muted">Changes save automatically.</p>
  <button className="bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-focus-ring">
    Save
  </button>
</section>
```

Dark mode is the default. Put `data-theme="light"` on a subtree to use the
light semantic mapping; no production theme control is included in this ticket.

```tsx
<div data-theme="dark" className="bg-canvas text-ink">Dark sample</div>
<div data-theme="light" className="bg-canvas text-ink">Light sample</div>
```

The Blue 1 primitives are `blue-light` (`#f2f6fd`), `blue-light-hover`
(`#ecf2fc`), `blue-light-active` (`#d8e3fa`), `blue-normal` (`#81a6ee`),
`blue-normal-hover` (`#7495d6`), `blue-normal-active` (`#6785be`),
`blue-dark` (`#617db3`), `blue-dark-hover` (`#4d648f`),
`blue-dark-active` (`#3a4b6b`), and `blue-darker` (`#2d3a53`). Prefer semantic
tokens such as `surface`, `ink`, `accent`, and `focus-ring` in application code.

Spacing uses Tailwind's 4px base (`gap-1`, `p-2`, and so on). `gap-grid` is the
20px board-grid value. The shared radii are `rounded-sm` (6px), `rounded-md`
(8px), `rounded-lg` (12px), and `rounded-xl` (16px).

## Fonts

Nunito is the global UI font and is bundled as a variable WOFF2 covering weights
400–800. `text-body` is the 14px UI size and `text-label` is the 13px secondary
size. Use Gaegu only for handwriting, annotations, sticky notes, and the
wordmark:

```tsx
<p className="font-handwriting text-handwriting">This talks to the cache!</p>
```

Both families use `font-display: swap`; the application makes no Google Fonts
request at runtime.

## Icons

Import each Tabler icon by name and render it through `ChalklineIcon`. The
wrapper fixes the Figma-approved 1.75 stroke. Icons are decorative by default;
set `decorative={false}` and provide `label` only when the icon itself conveys
meaning. Icon-only buttons still need their own accessible label.

```tsx
import { IconShare } from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'

<button type="button" aria-label="Share board">
  <ChalklineIcon icon={IconShare} size={16} />
</button>
```

## Logo

`Logo` uses the outlined SVG exported from Figma, keeps its 619:109 aspect
ratio, and defaults to the accessible name “Chalkline”. Use `decorative` only
when nearby text already supplies the name.

```tsx
import { Logo } from '../design/Logo'

<Logo className="h-auto w-36" />
```

Figma currently defines one approved asset: the Gaegu Bold wordmark in
`blue-light`. A separate compact mark and a dark-on-light wordmark have not been
specified; add those only after design provides approved variants.

## Designer follow-ups

- The light example specifies white surfaces, `blue-light-active` borders,
  `#1a2233` ink, `#4d5b75` muted ink, and the light accent/focus mappings. It
  does not separately label the light `bg`, `surface-raised`, and
  `surface-overlay` elevation steps. The current mapping uses white,
  `blue-light-hover`, and `blue-light-active`; design should confirm that ladder.
- Status hues are defined once in the Visual Direction frame. They remain the
  same in both themes and must be paired with a dot, icon, or text. Design should
  confirm whether light mode needs darker status variants for text-only uses.
- Figma has no compact logo mark or dark-on-light wordmark yet.
