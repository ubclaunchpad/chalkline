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

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ubclaunchpad/chalkline/server/internal/httpapi"
	"github.com/ubclaunchpad/chalkline/server/internal/realtime"
	"github.com/ubclaunchpad/chalkline/server/internal/store"
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

	databaseURL := getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	dbCtx, dbCancel := context.WithTimeout(ctx, 5*time.Second)
	pool, err := pgxpool.New(dbCtx, databaseURL)
	if err != nil {
		dbCancel()
		return fmt.Errorf("invalid database configuration")
	}
	defer pool.Close()
	err = pool.Ping(dbCtx)
	dbCancel()
	if err != nil {
		return fmt.Errorf("database unavailable")
	}
	persistence := realtime.DefaultPersistenceConfig()
	for name, target := range map[string]*time.Duration{"PERSIST_FLUSH_INTERVAL": &persistence.FlushInterval, "PERSIST_CHECKPOINT_INTERVAL": &persistence.CheckpointInterval} {
		if raw := getenv(name); raw != "" {
			d, e := time.ParseDuration(raw)
			if e != nil || d <= 0 {
				return fmt.Errorf("invalid %s", name)
			}
			*target = d
		}
	}
	hub, err := realtime.NewPersistentHub(store.NewPostgres(pool), persistence)
	if err != nil {
		return err
	}
	defer func() {
		drain, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		_ = hub.Shutdown(drain)
	}()
	server := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           httpapi.NewHandler(hub),
		ReadHeaderTimeout: 5 * time.Second,
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
	hubDone := make(chan error, 1)
	go func() { hubDone <- hub.Shutdown(shutdownCtx) }()
	httpErr := server.Shutdown(shutdownCtx)
	hubErr := <-hubDone
	if err := errors.Join(httpErr, hubErr); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
