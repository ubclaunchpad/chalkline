package realtime

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"sync"
)

// Access levels sent to the browser in welcome.
const (
	AccessEdit = "edit"
	AccessView = "view"
)

// ErrForbidden means the connection's key does not open the board.
var ErrForbidden = errors.New("this board needs a share link")

// BoardKeys are a board's share keys. Anyone with the edit key can change the
// board; anyone with the view key can only watch it.
type BoardKeys struct {
	Edit string `json:"edit"`
	View string `json:"view"`
}

// Grant is what one connection may do. Keys is set only for edit access, so
// editors can share both links and viewers never learn the edit key.
type Grant struct {
	Access string
	Keys   *BoardKeys
}

// AccessStore decides what a connection's key allows on a board.
type AccessStore interface {
	// Grant returns the access for key. A board with no keys gets new ones,
	// and the caller becomes its creator with edit access; a valid claim
	// becomes the edit key, so a browser can save its key before it connects.
	// An unknown or missing key on a board with keys returns ErrForbidden.
	Grant(ctx context.Context, boardID, key, claim string) (Grant, error)
}

// MemoryAccess keeps board keys in memory.
// shortcut: keys are lost on restart, so the next visitor becomes the creator; move them to PostgreSQL before real use.
type MemoryAccess struct {
	mu   sync.Mutex
	keys map[string]BoardKeys // board ID → keys
}

func NewMemoryAccess() *MemoryAccess {
	return &MemoryAccess{keys: make(map[string]BoardKeys)}
}

// validClaim keeps proposed edit keys long enough to be hard to guess.
func validClaim(claim string) bool {
	return len(claim) >= 20 && len(claim) <= 128
}

func (m *MemoryAccess) Grant(_ context.Context, boardID, key, claim string) (Grant, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	keys, ok := m.keys[boardID]
	if !ok {
		// The lock makes this the only creator, even when two people open a new
		// board at the same moment.
		keys = BoardKeys{Edit: rand.Text(), View: rand.Text()}
		if validClaim(claim) {
			keys.Edit = claim
		}
		m.keys[boardID] = keys
		return Grant{Access: AccessEdit, Keys: &keys}, nil
	}
	switch {
	case key == "":
		return Grant{}, ErrForbidden
	case subtle.ConstantTimeCompare([]byte(key), []byte(keys.Edit)) == 1:
		return Grant{Access: AccessEdit, Keys: &keys}, nil
	case subtle.ConstantTimeCompare([]byte(key), []byte(keys.View)) == 1:
		return Grant{Access: AccessView}, nil
	}
	return Grant{}, ErrForbidden
}
