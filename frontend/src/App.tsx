import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { DEFAULT_THEME } from './design/theme'
import { BoardLayout } from './layout/BoardLayout'
import { TopBar } from './layout/TopBar'
import { loadIdentity, saveIdentity } from './presence/identity'
import { NameDialog } from './presence/NameDialog'
import { ParticipantAvatars } from './presence/ParticipantAvatars'
import './presence/presence.css'
import { usePresence } from './presence/usePresence'
import { PropertyPanel } from './properties/PropertyPanel'
import { useComponentPanel } from './properties/useComponentPanel'
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'
import { ConnectionStatus } from './realtime/ConnectionStatus'
import { getBoardId, useBoardConnection } from './realtime/useBoardConnection'
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
  const [componentsOpen, setComponentsOpen] = useState(true)
  const componentsButtonRef = useRef<HTMLButtonElement>(null)
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
  const toggleComponents = () => {
    setComponentsOpen((open) => !open)
  }
  const handleSceneChange = useSceneSync(connection, excalidrawApi)
  const { onDragOver, onDrop } = useCanvasDropHandlers(excalidrawApi)
  const panel = useComponentPanel(excalidrawApi)
  const { participants, onPointerUpdate } = usePresence(
    identity,
    connection ?? undefined,
    excalidrawApi,
  )

  const closeComponents = () => {
    setComponentsOpen(false)
    componentsButtonRef.current?.focus()
  }

  return (
    <BoardLayout
      topBar={
        <TopBar
          boardId={getBoardId(window.location.search)}
          componentsOpen={componentsOpen}
          onToggleComponents={toggleComponents}
          componentsButtonRef={componentsButtonRef}
          status={<ConnectionStatus />}
          participants={
            identity ? (
              <ParticipantAvatars
                identity={identity}
                participants={participants}
              />
            ) : null
          }
        />
      }
      leftPanel={
        <Sidebar excalidrawAPI={excalidrawApi} onClose={closeComponents} />
      }
      leftPanelOpen={componentsOpen}
      rightPanel={
        panel.selection && (
          <PropertyPanel
            elementId={panel.selection.element.id}
            data={panel.selection.data}
            errors={panel.errors}
            onChange={panel.save}
          />
        )
      }
      rightPanelOpen={panel.selection !== null}
    >
      <div
        ref={canvasRef}
        className="relative h-full w-full"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <Excalidraw
          excalidrawAPI={setExcalidrawApi}
          onPointerUpdate={onPointerUpdate}
          theme={DEFAULT_THEME}
          onChange={(elements, appState) => {
            handleSceneChange(elements)
            panel.onSceneChange(elements, appState)
          }}
        />
        <FloatingToolbar
          api={excalidrawApi}
          componentsOpen={componentsOpen}
          onToggleComponents={toggleComponents}
        />
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
    </BoardLayout>
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
