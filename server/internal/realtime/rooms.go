package realtime

import "sync"

type Room struct {
	mu      sync.Mutex
	clients map[string]*Client // client ID → connected client
}

