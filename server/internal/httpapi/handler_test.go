package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthz(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantBody   string
	}{
		{name: "get reports ok", method: http.MethodGet, path: "/healthz", wantStatus: http.StatusOK, wantBody: "{\"status\":\"ok\"}\n"},
		{name: "post is not allowed", method: http.MethodPost, path: "/healthz", wantStatus: http.StatusMethodNotAllowed},
		{name: "unknown path is not found", method: http.MethodGet, path: "/nope", wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			NewHandler().ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if tt.wantBody != "" && rec.Body.String() != tt.wantBody {
				t.Fatalf("body = %q, want %q", rec.Body.String(), tt.wantBody)
			}
		})
	}
}
