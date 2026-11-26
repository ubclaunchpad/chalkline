import { useEffect } from 'react'

// App.tsx owns whether the components panel is open. The toolbar and empty
// state ask for it through this event; the top bar (which App hands the
// toggle) answers, and the panel focuses its search box.
const OPEN_EVENT = 'chalkline:open-components'

export function openComponentsPanel(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function useOpenComponentsRequest(onRequest: () => void): void {
  useEffect(() => {
    window.addEventListener(OPEN_EVENT, onRequest)
    return () => {
      window.removeEventListener(OPEN_EVENT, onRequest)
    }
  }, [onRequest])
}
