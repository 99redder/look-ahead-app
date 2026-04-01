ALTER TABLE planner_items ADD COLUMN category_id TEXT;
ALTER TABLE planner_items ADD COLUMN category_name TEXT;
ALTER TABLE planner_items ADD COLUMN category_color TEXT;
CREATE INDEX IF NOT EXISTS idx_planner_items_category_id ON planner_items(category_id);
