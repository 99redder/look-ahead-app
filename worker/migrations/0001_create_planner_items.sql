CREATE TABLE IF NOT EXISTS planner_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'task',
  title TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_planner_items_user ON planner_items(user_id);
CREATE INDEX IF NOT EXISTS idx_planner_items_due_date ON planner_items(due_date);
CREATE INDEX IF NOT EXISTS idx_planner_items_status ON planner_items(status);
