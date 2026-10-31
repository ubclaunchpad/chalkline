import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useState } from 'react'
import '@excalidraw/excalidraw/index.css'
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'
import { ConnectionStatus } from './realtime/ConnectionStatus'
import { useBoardConnection } from './realtime/useBoardConnection'
import { useSceneSync } from './realtime/useSceneSync'

function BoardCanvas() {
  const connection = useBoardConnection()
  const [excalidrawApi, setExcalidrawApi] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const handleSceneChange = useSceneSync(connection, excalidrawApi)

  return (
    <main className="relative h-screen w-screen">
      <Excalidraw
        excalidrawAPI={setExcalidrawApi}
        onChange={handleSceneChange}
      />
      <ConnectionStatus />
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
