-- 연결된 인스타그램 계정
CREATE TABLE IF NOT EXISTS accounts (
  ig_user_id       TEXT PRIMARY KEY,      -- 프로페셔널 계정 ID (웹훅 entry.id 와 같음)
  username         TEXT,
  access_token     TEXT NOT NULL,         -- 60일짜리 장기 토큰
  token_expires_at INTEGER NOT NULL,      -- unix 초
  connected_at     INTEGER NOT NULL
);

-- 자동 DM 규칙
CREATE TABLE IF NOT EXISTS rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ig_user_id      TEXT NOT NULL,
  name            TEXT,
  media_id        TEXT,                   -- NULL = 최근 게시물 전체
  media_permalink TEXT,
  media_thumb     TEXT,
  keywords        TEXT NOT NULL,          -- 쉼표로 구분 (예: 정보,링크,info)
  match_type      TEXT NOT NULL DEFAULT 'contains',  -- contains | exact
  dm_message      TEXT NOT NULL,
  public_reply    TEXT,                   -- 공개 답글(선택). 줄마다 하나, 랜덤 선택
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL        -- 이 시각 이후 댓글에만 반응
);

-- 처리 기록 (comment_id 가 기본키라 같은 댓글에 두 번 보내지 않음)
CREATE TABLE IF NOT EXISTS logs (
  comment_id         TEXT PRIMARY KEY,
  ig_user_id         TEXT,
  rule_id            INTEGER,
  media_id           TEXT,
  commenter_id       TEXT,
  commenter_username TEXT,
  comment_text       TEXT,
  status             TEXT,                -- pending | sent | failed
  error              TEXT,
  source             TEXT,                -- poll | webhook
  created_at         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rules_account ON rules(ig_user_id, active);
