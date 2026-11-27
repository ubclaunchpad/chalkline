-- +goose Up
ALTER TABLE boards ADD COLUMN operation_sequence bigint NOT NULL DEFAULT 0 CHECK (operation_sequence >= 0);
ALTER TABLE board_snapshots ADD COLUMN through_sequence bigint NOT NULL DEFAULT 0 CHECK (through_sequence >= 0);
CREATE TABLE board_operations (
    board_id text NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    sequence bigint NOT NULL CHECK (sequence > 0),
    elements jsonb NOT NULL CHECK (jsonb_typeof(elements) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (board_id, sequence)
);

-- +goose Down
DROP TABLE board_operations;
ALTER TABLE board_snapshots DROP COLUMN through_sequence;
ALTER TABLE boards DROP COLUMN operation_sequence;
