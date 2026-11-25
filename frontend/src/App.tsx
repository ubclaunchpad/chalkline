import { useRef, useState } from 'react'
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
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'
import { ConnectionStatus } from './realtime/ConnectionStatus'
import { getBoardId, useBoardConnection } from './realtime/useBoardConnection'
import { useSceneSync } from './realtime/useSceneSync'
import { Sidebar } from './sidebar/Sidebar'
import { useCanvasDropHandlers } from './sidebar/useCanvasDrop'

function BoardCanvas() {
  const connection = useBoardConnection()
  const [excalidrawApi, setExcalidrawApi] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const [identity, setIdentity] = useState(loadIdentity)
  const [componentsOpen, setComponentsOpen] = useState(true)
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
    >
      <div className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
        <Excalidraw
          excalidrawAPI={setExcalidrawApi}
          onChange={handleSceneChange}
          onPointerUpdate={onPointerUpdate}
          theme={DEFAULT_THEME}
        />
      </div>
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
  return (
    <BoardConnectionProvider>
      <BoardCanvas />
    </BoardConnectionProvider>
  )
}

export default App
