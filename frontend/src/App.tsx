import { useEffect, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { syncBoardIdToUrl } from './realtime/useBoardConnection'
import { Sidebar } from './sidebar/Sidebar'
import { useCanvasDropHandlers } from './sidebar/useCanvasDrop'

function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null)
  const { onDragOver, onDrop } = useCanvasDropHandlers(excalidrawAPI)

  // Runs once on mount. The board id will be passed to the connection in #27.
  useEffect(() => {
    syncBoardIdToUrl()
  }, [])

  return (
    <main className="flex h-screen w-screen">
      <Sidebar excalidrawAPI={excalidrawAPI} />
      <div className="relative flex-1" onDragOver={onDragOver} onDrop={onDrop}>
        <Excalidraw excalidrawAPI={setExcalidrawAPI} />
      </div>
    </main>
  )
}

export default App
