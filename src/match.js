// 키워드 매칭 (순수 함수 — 테스트 가능)

// 비교용 정규화: 대소문자 무시, 공백·문장부호·이모지 제거
// "정보 주세요!!" → "정보주세요",  "INFO 🙏" → "info"
export function normalize(s) {
  return String(s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function parseKeywords(raw) {
  return String(raw || "")
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function matchesRule(rule, text) {
  // "모든 댓글": 키워드 없이 내용이 있는 댓글이면 전부 (이모지만 있어도 OK)
  if (rule.match_type === "any") return String(text || "").trim().length > 0;
  const t = normalize(text);
  if (!t) return false;
  return parseKeywords(rule.keywords).some((kw) => {
    const k = normalize(kw);
    if (!k) return false;
    return rule.match_type === "exact" ? t === k : t.includes(k);
  });
}

// 이 댓글에 적용할 규칙 1개 고르기
// - 특정 게시물 규칙이 "모든 게시물" 규칙보다 우선
// - 같은 범위면 키워드 규칙이 "모든 댓글" 규칙보다 우선
// - 규칙 생성 이전에 달린 댓글은 무시 (옛날 댓글에 갑자기 DM 가는 것 방지)
export function pickRule(rules, { mediaId, text, commentTime }) {
  const candidates = rules.filter(
    (r) =>
      r.active &&
      (r.media_id === mediaId || !r.media_id) &&
      (!commentTime || commentTime >= r.created_at) &&
      matchesRule(r, text)
  );
  const any = (r) => (r.match_type === "any" ? 1 : 0);
  candidates.sort((a, b) => (a.media_id ? 0 : 1) - (b.media_id ? 0 : 1) || any(a) - any(b) || a.id - b.id);
  return candidates[0] || null;
}

export function pickPublicReply(raw) {
  const lines = String(raw || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}
