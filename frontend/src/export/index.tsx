// Export menu in the top bar: images, the board file, Mermaid, a Terraform
// sketch, and a link to the board. Everything runs in the browser.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  CaptureUpdateAction,
  exportToBlob,
  exportToSvg,
  loadFromBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw'
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import {
  IconBrandTerraform,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconFileCode,
  IconFolderOpen,
  IconLink,
  IconPhoto,
  IconSitemap,
  IconVector,
  type Icon,
} from '@tabler/icons-react'
import { useBoard } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import { deriveGraph } from '../graph/deriveGraph'
import { toMermaid } from './mermaid'
import { boardName, drawableElements, fileStem, replaceScene } from './scene'
import { toTerraform } from './terraform'

// Excalidraw's bundled types point these at a package path that doesn't
// resolve, so they arrive untyped. These are the parts we use.
interface ImageOptions {
  elements: readonly NonDeletedExcalidrawElement[]
  appState: Partial<AppState>
  files: BinaryFiles
  exportPadding: number
}
const toBlob = exportToBlob as (
  options: ImageOptions & { mimeType: string },
) => Promise<Blob>
const toSvg = exportToSvg as (options: ImageOptions) => Promise<SVGSVGElement>

type ItemKey =
  | 'png'
  | 'svg'
  | 'json'
  | 'open'
  | 'mermaid'
  | 'terraform'
  | 'copy-mermaid'
  | 'link'

interface Item {
  key: ItemKey
  label: string
  icon: Icon
  /** Single key that runs the item while the menu is open. */
  shortcut: string
}

// Images first, then code formats, then copy actions.
const GROUPS: Item[][] = [
  [
    { key: 'png', label: 'PNG image', icon: IconPhoto, shortcut: 'P' },
    { key: 'svg', label: 'SVG image', icon: IconVector, shortcut: 'S' },
  ],
  [
    {
      key: 'json',
      label: 'Chalkline file (.json)',
      icon: IconFileCode,
      shortcut: 'J',
    },
    { key: 'open', label: 'Open file…', icon: IconFolderOpen, shortcut: 'O' },
    {
      key: 'mermaid',
      label: 'Mermaid (.mmd)',
      icon: IconSitemap,
      shortcut: 'M',
    },
    {
      key: 'terraform',
      label: 'Terraform sketch (.tf)',
      icon: IconBrandTerraform,
      shortcut: 'T',
    },
  ],
  [
    {
      key: 'copy-mermaid',
      label: 'Copy Mermaid',
      icon: IconCopy,
      shortcut: 'C',
    },
    { key: 'link', label: 'Copy link to board', icon: IconLink, shortcut: 'L' },
  ],
]
const ITEMS = GROUPS.flat()

const EXPORT_PADDING = 32

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Give the browser a moment to start the download before freeing the URL.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

const textFile = (text: string, type = 'text/plain') =>
  new Blob([text], { type })

/** Runs one export and returns the message for the toast. */
async function runExport(
  key: Exclude<ItemKey, 'open'>,
  api: ExcalidrawImperativeAPI,
  boardId: string,
): Promise<string> {
  const elements = api.getSceneElements()
  const appState = api.getAppState()
  const name = fileStem(boardName(elements, boardId))
  const images: ImageOptions = {
    elements: drawableElements(elements),
    // Matches what is on screen: the board's dark background and colours.
    appState: {
      ...appState,
      exportBackground: true,
      exportWithDarkMode: appState.theme === 'dark',
    },
    files: api.getFiles(),
    exportPadding: EXPORT_PADDING,
  }
  const mermaid = () => toMermaid(deriveGraph(elements))

  switch (key) {
    case 'png':
      if (images.elements.length === 0) return 'Nothing to export yet'
      download(
        await toBlob({ ...images, mimeType: 'image/png' }),
        `${name}.png`,
      )
      return 'PNG downloaded'
    case 'svg': {
      if (images.elements.length === 0) return 'Nothing to export yet'
      const svg = await toSvg(images)
      download(textFile(svg.outerHTML, 'image/svg+xml'), `${name}.svg`)
      return 'SVG downloaded'
    }
    case 'json':
      download(
        textFile(
          serializeAsJSON(elements, appState, api.getFiles(), 'local'),
          'application/json',
        ),
        `${name}.chalkline.json`,
      )
      return 'Board file downloaded'
    case 'mermaid':
      download(textFile(mermaid()), `${name}.mmd`)
      return 'Mermaid file downloaded'
    case 'terraform':
      download(textFile(toTerraform(deriveGraph(elements))), `${name}.tf`)
      return 'Terraform sketch downloaded'
    case 'copy-mermaid':
      await navigator.clipboard.writeText(mermaid())
      return 'Mermaid copied. Paste it into a ```mermaid block'
    case 'link':
      await navigator.clipboard.writeText(window.location.href)
      return 'Link copied'
  }
}

export function ExportMenu() {
  const { api, boardId, access } = useBoard()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const viewOnly = access === 'view'

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      setToast(null)
    }, 2500)
    return () => {
      clearTimeout(timer)
    }
  }, [toast])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  if (!api) return null

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const runItem = (item: Item) => {
    if (item.key === 'open') {
      if (viewOnly) return
      close()
      fileRef.current?.click()
      return
    }
    close()
    runExport(item.key, api, boardId).then(setToast, (error: unknown) => {
      console.error(error)
      setToast(`${item.label} failed. Try again.`)
    })
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ]
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    const focusAt = (i: number) => {
      buttons[(i + buttons.length) % buttons.length].focus()
    }
    if (event.key === 'ArrowDown') focusAt(index + 1)
    else if (event.key === 'ArrowUp') focusAt(index - 1)
    else if (event.key === 'Home') focusAt(0)
    else if (event.key === 'End') focusAt(buttons.length - 1)
    else if (event.key === 'Escape' || event.key === 'Tab') close()
    else {
      const item = ITEMS.find(
        (candidate) => candidate.shortcut === event.key.toUpperCase(),
      )
      if (!item || event.metaKey || event.ctrlKey || event.altKey) return
      runItem(item)
    }
    // Keep arrow keys and shortcuts away from the canvas underneath.
    event.preventDefault()
    event.stopPropagation()
  }

  const onFile = async (file: File) => {
    let loaded
    try {
      loaded = await loadFromBlob(file, null, null)
    } catch {
      setToast('That file isn’t a Chalkline or Excalidraw board')
      return
    }
    const ok = window.confirm(
      `Replace everything on this board with “${file.name}”? Everyone on the board will see the change. You can undo it.`,
    )
    if (!ok) return
    api.updateScene({
      elements: replaceScene(
        api.getSceneElementsIncludingDeleted(),
        loaded.elements,
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
    api.addFiles(Object.values(loaded.files))
    api.scrollToContent(undefined, { fitToContent: true })
    setToast(`Opened ${file.name}`)
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="export-menu"
        onClick={() => {
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-label font-semibold text-ink hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <ChalklineIcon icon={IconDownload} size={18} />
        <span className="max-sm:sr-only">Export</span>
        <ChalklineIcon icon={IconChevronDown} size={14} />
      </button>

      {open && (
        <div
          ref={menuRef}
          id="export-menu"
          role="menu"
          aria-label="Export"
          onKeyDown={onMenuKeyDown}
          className="absolute top-11 right-0 z-50 w-64 rounded-xl border border-border bg-surface-raised p-1.5 shadow-xl"
        >
          {GROUPS.map((group, groupIndex) => (
            <div
              key={group[0].key}
              role="group"
              className={
                groupIndex > 0 ? 'mt-1.5 border-t border-border pt-1.5' : ''
              }
            >
              {group.map((item) => {
                const disabled = item.key === 'open' && viewOnly
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={disabled || undefined}
                    title={
                      disabled
                        ? 'View-only: you can’t replace this board'
                        : undefined
                    }
                    onClick={() => {
                      runItem(item)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-body text-ink hover:bg-surface-overlay focus-visible:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-focus-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  >
                    <ChalklineIcon
                      icon={item.icon}
                      size={18}
                      className="shrink-0 text-ink-muted"
                    />
                    <span className="flex-1">{item.label}</span>
                    <kbd className="rounded-sm border border-border px-1.5 font-mono text-[11px] text-ink-muted">
                      {item.shortcut}
                    </kbd>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".json,.excalidraw,application/json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void onFile(file)
        }}
      />

      {/* Always mounted so screen readers announce new messages. */}
      <div
        role="status"
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
      >
        {toast && (
          <p className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-body text-ink shadow-xl">
            {toast}
          </p>
        )}
      </div>
    </div>
  )
}
