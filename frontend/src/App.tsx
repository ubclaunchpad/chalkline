import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { BoardConnectionProvider } from './realtime/BoardConnectionProvider'

function App() {
  return (
    <BoardConnectionProvider>
      <main className="h-screen w-screen">
        <Excalidraw />
      </main>
    </BoardConnectionProvider>
  )
}

export default App
