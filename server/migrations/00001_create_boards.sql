-- +goose Up
CREATE TABLE boards (
    id         text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE board_snapshots (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id   text NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    elements   jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Serves the latest-snapshot lookup and the board_id foreign key.
CREATE INDEX board_snapshots_board_id_created_at_idx
    ON board_snapshots (board_id, created_at DESC);

-- +goose Down
DROP TABLE board_snapshots;
DROP TABLE boards;
