package main

import (
	"sync"
	"testing"
)

// Deliberate data race: two goroutines write the same variable without a
// lock. Plain `go test` usually passes; `go test -race` must fail.
func TestDeliberateRace(t *testing.T) {
	var wg sync.WaitGroup
	counter := 0
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			counter++
		}()
	}
	wg.Wait()
	_ = counter
}
