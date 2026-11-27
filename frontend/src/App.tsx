import { useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { DEFAULT_THEME } from './design/theme'
import { PropertyPanel } from './properties/PropertyPanel'
import { useComponentPanel } from './properties/useComponentPanel'
import { CollaboratorList } from './presence/CollaboratorList'
import { loadIdentity, saveIdentity } from './presence/identity'
import { NameDialog } from './presence/NameDialog'
import './presence/presence.css'
import { usePresence } from './presence/usePresence'
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
  const [identity, setIdentity] = useState(loadIdentity)
  const handleSceneChange = useSceneSync(connection, excalidrawApi)
  const { onDragOver, onDrop } = useCanvasDropHandlers(excalidrawApi)
  const panel = useComponentPanel(excalidrawApi)
  const { participants, onPointerUpdate } = usePresence(
    identity,
    connection ?? undefined,
    excalidrawApi,
  )

  return (
    <main className="flex h-screen w-screen bg-canvas font-sans text-body">
      <Sidebar excalidrawAPI={excalidrawApi} />
      <div
        className="relative flex-1 overflow-hidden"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <Excalidraw
          excalidrawAPI={setExcalidrawApi}
          onPointerUpdate={onPointerUpdate}
          renderTopRightUI={() =>
            identity && (
              <CollaboratorList
                identity={identity}
                participants={participants}
              />
            )
          }
          theme={DEFAULT_THEME}
          onChange={(elements, appState) => {
            handleSceneChange(elements)
            panel.onSceneChange(elements, appState)
          }}
        />
        {panel.selection && (
          <PropertyPanel
            elementId={panel.selection.element.id}
            data={panel.selection.data}
            errors={panel.errors}
            onChange={panel.save}
          />
        )}
        <ConnectionStatus />
      </div>
      {!identity && (
        <NameDialog
          onSubmit={(next) => {
            saveIdentity(next)
            setIdentity(next)
          }}
        />
      )}
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
