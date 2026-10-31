import { lazy, Suspense, useEffect } from 'react'
import '@excalidraw/excalidraw/index.css'
import { syncBoardIdToUrl } from './realtime/useBoardConnection'
import { PresenceCanvas } from './presence/PresenceCanvas'

// Vite removes this demo import entirely from production builds.
const Canvas =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('presenceDemo') === '1'
    ? lazy(() => import('./presence/PresenceDemo'))
    : PresenceCanvas

function App() {
  // Runs once on mount. The board id will be passed to the connection in #27.
  useEffect(() => {
    syncBoardIdToUrl()
  }, [])

  return (
    <main className="h-screen w-screen">
      <Suspense fallback={<p>Loading canvas…</p>}>
        <Canvas />
      </Suspense>
    </main>
  )
}

export default App
