import { useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'
import { ConnectionStatus } from './realtime/ConnectionStatus'
import { useBoardConnection } from './realtime/useBoardConnection'
import { useSceneSync } from './realtime/useSceneSync'
import { Sidebar } from './sidebar/Sidebar'
import { useCanvasDropHandlers } from './sidebar/useCanvasDrop'

function BoardCanvas() {
  const connection = useBoardConnection()
  const [excalidrawApi, setExcalidrawApi] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const handleSceneChange = useSceneSync(connection, excalidrawApi)
  const { onDragOver, onDrop } = useCanvasDropHandlers(excalidrawApi)

  return (
    <main className="flex h-screen w-screen">
      <Sidebar excalidrawAPI={excalidrawApi} />
      <div className="relative flex-1" onDragOver={onDragOver} onDrop={onDrop}>
        <Excalidraw
          excalidrawAPI={setExcalidrawApi}
          onChange={handleSceneChange}
        />
        <ConnectionStatus />
      </div>
    </main>
  )
}

function App() {
  return (
    <BoardConnectionProvider>
      <BoardCanvas />
    </BoardConnectionProvider>
  )
}

export default App
