package store

import (
	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres is a Store backed by the tables in server/migrations
type Postgres struct {
	pool *pgxpool.Pool
}

var _ Store = (*Postgres)(nil)

// NewPostgres returns a Store that uses pool
func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}
