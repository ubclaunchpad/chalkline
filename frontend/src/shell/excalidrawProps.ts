// Owned by area A: every prop the shell passes to <Excalidraw> beyond the
// wiring in App.tsx (UI options, grid, view mode, theme...).
import { useMemo } from 'react'
import type { ExcalidrawProps } from '@excalidraw/excalidraw/types'
import { useBoard } from '../app/context'
import { DEFAULT_THEME } from '../design/theme'

// Excalidraw's dark theme runs the canvas through an invert/hue-rotate
// filter, so no background colour comes out as exact navy. The canvas stays
// transparent and `.chalkline-board .excalidraw` in index.css paints the navy.

export const GRID_SIZE = 20

// Chrome the design replaces is hidden here and in index.css
// (`.chalkline-board`): our toolbar, zoom controls and menus take its place.
const UI_OPTIONS: ExcalidrawProps['UIOptions'] = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
  tools: { image: false },
}

const INITIAL_DATA: ExcalidrawProps['initialData'] = {
  appState: {
    viewBackgroundColor: 'transparent',
    gridSize: GRID_SIZE,
    gridStep: 1,
  },
}

export function useExcalidrawProps(): Partial<ExcalidrawProps> {
  const { access } = useBoard()
  return useMemo(
    () => ({
      theme: DEFAULT_THEME,
      UIOptions: UI_OPTIONS,
      initialData: INITIAL_DATA,
      gridModeEnabled: true,
      viewModeEnabled: access === 'view',
    }),
    [access],
  )
}
