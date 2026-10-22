// schema.sql 과 같은 내용 — 사이트가 처음 켜질 때 테이블을 자동으로 만듭니다
export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS accounts ( ig_user_id TEXT PRIMARY KEY, username TEXT, access_token TEXT NOT NULL, token_expires_at INTEGER NOT NULL, connected_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS rules ( id INTEGER PRIMARY KEY AUTOINCREMENT, ig_user_id TEXT NOT NULL, name TEXT, media_id TEXT, media_permalink TEXT, media_thumb TEXT, keywords TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'contains', dm_message TEXT NOT NULL, public_reply TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS logs ( comment_id TEXT PRIMARY KEY, ig_user_id TEXT, rule_id INTEGER, media_id TEXT, commenter_id TEXT, commenter_username TEXT, comment_text TEXT, status TEXT, error TEXT, source TEXT, created_at INTEGER )",
  "CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_rules_account ON rules(ig_user_id, active)"
];
