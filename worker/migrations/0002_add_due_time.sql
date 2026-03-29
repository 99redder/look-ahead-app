ALTER TABLE planner_items ADD COLUMN due_time TEXT;
CREATE INDEX IF NOT EXISTS idx_planner_items_due_time ON planner_items(due_time);
