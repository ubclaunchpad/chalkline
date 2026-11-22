import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { DEFAULT_THEME } from './design/theme'
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
import { focusBoard } from './toolbar/excalidrawAdapter'
import { FloatingToolbar } from './toolbar/FloatingToolbar'

function BoardCanvas() {
  const connection = useBoardConnection()
  const [excalidrawApi, setExcalidrawApi] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const [identity, setIdentity] = useState(loadIdentity)
  const [isReturningVisitor] = useState(identity !== null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const focusCanvas = useCallback(() => {
    focusBoard(canvasRef.current)
  }, [])
  useEffect(() => {
    // Returning visitors skip the name prompt, which otherwise hands off focus.
    // Leave focus alone if they have already moved it somewhere.
    if (
      excalidrawApi &&
      isReturningVisitor &&
      document.activeElement === document.body
    ) {
      focusCanvas()
    }
  }, [excalidrawApi, focusCanvas, isReturningVisitor])
  const toggleSidebar = () => {
    setSidebarCollapsed((value) => !value)
  }
  const handleSceneChange = useSceneSync(connection, excalidrawApi)
  const { onDragOver, onDrop } = useCanvasDropHandlers(excalidrawApi)
  const { participants, onPointerUpdate } = usePresence(
    identity,
    connection ?? undefined,
    excalidrawApi,
  )

  return (
    <main className="flex h-screen w-screen bg-canvas font-sans text-body">
      <Sidebar
        excalidrawAPI={excalidrawApi}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
      />
      <div
        ref={canvasRef}
        className="relative flex-1"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <Excalidraw
          excalidrawAPI={setExcalidrawApi}
          onChange={handleSceneChange}
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
        />
        <FloatingToolbar
          api={excalidrawApi}
          componentsOpen={!sidebarCollapsed}
          onToggleComponents={toggleSidebar}
        />
        <ConnectionStatus />
      </div>
      {!identity && (
        <NameDialog
          onClosed={focusCanvas}
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
