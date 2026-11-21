-- +goose Up
ALTER TABLE board_operations DROP CONSTRAINT board_operations_elements_check;
ALTER TABLE board_operations ALTER COLUMN elements TYPE json USING elements::json;
ALTER TABLE board_snapshots ALTER COLUMN elements TYPE json USING elements::json;
ALTER TABLE board_operations ADD CONSTRAINT board_operations_elements_check CHECK (json_typeof(elements) = 'array');

-- +goose Down
ALTER TABLE board_operations DROP CONSTRAINT board_operations_elements_check;
ALTER TABLE board_operations ALTER COLUMN elements TYPE jsonb USING elements::jsonb;
ALTER TABLE board_snapshots ALTER COLUMN elements TYPE jsonb USING elements::jsonb;
ALTER TABLE board_operations ADD CONSTRAINT board_operations_elements_check CHECK (jsonb_typeof(elements) = 'array');
