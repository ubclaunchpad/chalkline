import { useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'
import { ConnectionStatus } from './realtime/ConnectionStatus'
import { Sidebar } from './sidebar/Sidebar'
import { useCanvasDropHandlers } from './sidebar/useCanvasDrop'

function App() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const { onDragOver, onDrop } = useCanvasDropHandlers(excalidrawAPI)

  return (
    <BoardConnectionProvider>
      <main className="flex h-screen w-screen">
        <Sidebar excalidrawAPI={excalidrawAPI} />
        <div
          className="relative flex-1"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <Excalidraw excalidrawAPI={setExcalidrawAPI} />
          <ConnectionStatus />
        </div>
      </main>
    </BoardConnectionProvider>
  )
}

export default App
