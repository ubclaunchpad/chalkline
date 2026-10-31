package main

import "testing"

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
