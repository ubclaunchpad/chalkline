import { useEffect } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { syncBoardIdToUrl } from './realtime/useBoardConnection'

function App() {
  // Runs once on mount. The board id will be passed to the connection in #27.
  useEffect(() => {
    syncBoardIdToUrl()
  }, [])

  return (
    <main className="h-screen w-screen">
      <Excalidraw />
    </main>
  )
}

export default App
