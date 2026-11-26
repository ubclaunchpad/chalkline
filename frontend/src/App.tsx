import { useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { BoardProvider } from './app/board'
import { useBoard } from './app/context'
import { CanvasLayers, RightPanels, TopBarActions } from './app/slots'
import { useExcalidrawProps } from './shell/excalidrawProps'
import { HomePage } from './home/HomePage'
import { BoardLayout } from './layout/BoardLayout'
import { TopBar } from './layout/TopBar'
import { loadIdentity, saveIdentity } from './presence/identity'
import { NameDialog } from './presence/NameDialog'
import { ParticipantAvatars } from './presence/ParticipantAvatars'
import './presence/presence.css'
import { usePresence } from './presence/usePresence'
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'
import { ConnectionStatus } from './realtime/ConnectionStatus'
import { getBoardId, useBoardConnection } from './realtime/useBoardConnection'
import { useSceneSync } from './realtime/useSceneSync'
import { Sidebar } from './sidebar/Sidebar'
import { useCanvasDropHandlers } from './sidebar/useCanvasDrop'

function BoardCanvas() {
  const [excalidrawApi, setExcalidrawApi] =
    useState<ExcalidrawImperativeAPI | null>(null)
  return (
    <BoardProvider
      api={excalidrawApi}
      boardId={getBoardId(window.location.search)}
    >
      <BoardScreen onApi={setExcalidrawApi} />
    </BoardProvider>
  )
}

function BoardScreen({
  onApi,
}: {
  onApi: (api: ExcalidrawImperativeAPI) => void
}) {
  const { api: excalidrawApi, panel } = useBoard()
  const excalidrawProps = useExcalidrawProps()
  const connection = useBoardConnection()
  const [identity, setIdentity] = useState(loadIdentity)
  const [componentsOpen, setComponentsOpen] = useState(false)
  const componentsButtonRef = useRef<HTMLButtonElement>(null)
  const handleSceneChange = useSceneSync(connection, excalidrawApi)
  const { onDragOver, onDrop } = useCanvasDropHandlers(excalidrawApi)
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
          onToggleComponents={() => {
            setComponentsOpen((open) => !open)
          }}
          componentsButtonRef={componentsButtonRef}
          status={<ConnectionStatus />}
          actions={<TopBarActions />}
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
      rightPanel={<RightPanels />}
      rightPanelOpen={panel !== null}
    >
      <div className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
        <Excalidraw
          {...excalidrawProps}
          excalidrawAPI={onApi}
          onChange={handleSceneChange}
          onPointerUpdate={onPointerUpdate}
        />
      </div>
      <CanvasLayers />
      {!identity && (
        <NameDialog
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
  // No ?board= in the address: show the home page (area A).
  if (!new URLSearchParams(window.location.search).has('board')) {
    return <HomePage />
  }
  return (
    <BoardConnectionProvider>
      <BoardCanvas />
    </BoardConnectionProvider>
  )
}

export default App
