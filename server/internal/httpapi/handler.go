// Package httpapi exposes the server's stateless HTTP routes.
package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/ubclaunchpad/chalkline/server/internal/realtime"
)

// NewHandler returns the HTTP routes served by Chalkline.
func NewHandler() http.Handler {
	hub := realtime.NewHub()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("GET /ws", hub.HandleWebSocket)
	return mux
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
