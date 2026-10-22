export const DEFAULT_BOARD_ID = 'demo'

export function getBoardId(search: string): string {
  const board = new URLSearchParams(search).get('board')
  return board === null || board === '' ? DEFAULT_BOARD_ID : board
}

// Makes the address bar show the board in use, without reloading the page.
// eg. empty ?board= --> url changes to ?board=demo
export function syncBoardIdToUrl(): string {
  const url = new URL(window.location.href)
  const boardId = getBoardId(url.search)
  if (url.searchParams.get('board') !== boardId) {
    url.searchParams.set('board', boardId)
    window.history.replaceState(null, '', url)
  }
  return boardId
}
