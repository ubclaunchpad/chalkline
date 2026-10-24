package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ubclaunchpad/chalkline/server/internal/httpapi"
)

const shutdownTimeout = 10 * time.Second

type config struct {
	port string
}

func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{port: getenv("PORT")}
	if cfg.port == "" {
		cfg.port = "8080"
	}
	if _, err := net.LookupPort("tcp", cfg.port); err != nil {
		return config{}, fmt.Errorf("invalid PORT %q: %w", cfg.port, err)
	}
	return cfg, nil
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Getenv); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

// run serves HTTP until ctx is cancelled, then drains in-flight requests.
func run(ctx context.Context, getenv func(string) string) error {
	cfg, err := loadConfig(getenv)
	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           httpapi.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		// HTTP Shutdown does not close upgraded WebSockets. Propagate shutdown
		// cancellation into request contexts so their read/write loops also stop.
		BaseContext: func(net.Listener) context.Context { return ctx },
	}

	serveErr := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", server.Addr)
		serveErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
