import { useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PropertyPanel } from './properties/PropertyPanel'
import { useComponentPanel } from './properties/useComponentPanel'
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
  const panel = useComponentPanel(excalidrawApi)

  return (
    <main className="flex h-screen w-screen">
      <Sidebar excalidrawAPI={excalidrawApi} />
      <div className="relative flex-1" onDragOver={onDragOver} onDrop={onDrop}>
        <Excalidraw
          excalidrawAPI={setExcalidrawApi}
          onChange={(elements, appState) => {
            handleSceneChange(elements)
            panel.onSceneChange(elements, appState)
          }}
        />
        {panel.selection && (
          <PropertyPanel
            elementKey={panel.selection.elementKey}
            data={panel.selection.data}
            errors={panel.errors}
            onChange={panel.save}
          />
        )}
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
