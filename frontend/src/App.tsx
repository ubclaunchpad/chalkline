import { useEffect, useState } from 'react'
import Board from './prototype/Board'
import Home from './prototype/Home'

type Route = { page: 'home' } | { page: 'board'; id: string; viewOnly: boolean }

function parseHash(hash: string): Route {
  const match = /^#\/b\/([a-z0-9-]+)(\/view)?$/.exec(hash)
  return match
    ? { page: 'board', id: match[1], viewOnly: Boolean(match[2]) }
    : { page: 'home' }
}

function App() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (route.page === 'board') {
    return (
      <Board
        key={`${route.id}-${route.viewOnly}`}
        boardId={route.id}
        viewOnly={route.viewOnly}
      />
    )
  }
  return <Home />
}

export default App
