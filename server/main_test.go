package main

import (
	"context"
	"testing"
	"time"
)

func TestLoadConfig(t *testing.T) {
	tests := []struct {
		name     string
		port     string
		wantPort string
		wantErr  bool
	}{
		{name: "defaults to 8080", port: "", wantPort: "8080"},
		{name: "uses PORT", port: "9000", wantPort: "9000"},
		{name: "rejects non-numeric PORT", port: "abc", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := loadConfig(func(string) string { return tt.port })
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cfg.port != tt.wantPort {
				t.Fatalf("port = %q, want %q", cfg.port, tt.wantPort)
			}
		})
	}
}

func TestRunWithoutDatabaseUsesMemory(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 300*time.Millisecond)
	defer cancel()
	env := map[string]string{"PORT": "0"}
	if err := run(ctx, func(k string) string { return env[k] }); err != nil {
		t.Fatalf("memory mode should serve until cancelled: %v", err)
	}
}
