import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'
import { ConnectionStatus } from './realtime/ConnectionStatus'

function App() {
  return (
    <BoardConnectionProvider>
      <main className="relative h-screen w-screen">
        <Excalidraw />
        <ConnectionStatus />
      </main>
    </BoardConnectionProvider>
  )
}

export default App
