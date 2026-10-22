// schema.sql 과 같은 내용 — 사이트가 켜질 때 테이블을 자동으로 만듭니다
export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS accounts ( ig_user_id TEXT PRIMARY KEY, username TEXT, access_token TEXT NOT NULL, token_expires_at INTEGER NOT NULL, connected_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS rules ( id INTEGER PRIMARY KEY AUTOINCREMENT, ig_user_id TEXT NOT NULL, name TEXT, media_id TEXT, media_permalink TEXT, media_thumb TEXT, keywords TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'contains', dm_message TEXT NOT NULL, buttons TEXT, public_reply TEXT, follow_required INTEGER NOT NULL DEFAULT 0, follow_prompt TEXT, not_following_msg TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS logs ( comment_id TEXT PRIMARY KEY, ig_user_id TEXT, rule_id INTEGER, media_id TEXT, commenter_id TEXT, commenter_username TEXT, comment_text TEXT, status TEXT, error TEXT, source TEXT, created_at INTEGER )",
  "CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_rules_account ON rules(ig_user_id, active)",
  "CREATE TABLE IF NOT EXISTS follow_gates ( comment_id TEXT PRIMARY KEY, ig_user_id TEXT NOT NULL, rule_id INTEGER NOT NULL, igsid TEXT, username TEXT, status TEXT NOT NULL DEFAULT 'awaiting', nudges INTEGER NOT NULL DEFAULT 0, last_checked INTEGER NOT NULL, created_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS idx_gates_wait ON follow_gates(ig_user_id, status)"
];

// 예전 버전 DB에 새 칸 추가 (이미 있으면 오류 → 무시)
export const MIGRATIONS = [
  "ALTER TABLE rules ADD COLUMN follow_required INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE rules ADD COLUMN follow_prompt TEXT",
  "ALTER TABLE rules ADD COLUMN not_following_msg TEXT",
  "ALTER TABLE rules ADD COLUMN buttons TEXT"
];
