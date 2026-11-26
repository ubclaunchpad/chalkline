import { useEffect, useState } from 'react'
import type { AppState } from '@excalidraw/excalidraw/types'
import { useBoard } from '../app/context'

/**
 * One value from Excalidraw's app state, kept fresh as the board changes.
 * `select` should return a primitive so unchanged values skip a re-render.
 */
export function useAppStateValue<T>(
  select: (state: AppState) => T,
  fallback: T,
): T {
  const { api } = useBoard()
  const [value, setValue] = useState<T>(fallback)
  useEffect(() => {
    if (!api) return
    const read = () => {
      setValue(select(api.getAppState()))
    }
    read()
    const offChange = api.onChange(read)
    const offScroll = api.onScrollChange(read)
    return () => {
      offChange()
      offScroll()
    }
    // `select` is expected to be a stable, module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  return value
}
