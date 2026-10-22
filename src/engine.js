// 댓글 처리 엔진: 폴링·웹훅 공통

import * as ig from "./instagram.js";
import { pickRule, pickPublicReply } from "./match.js";

const MAX_MEDIA_PER_POLL = 10; // "모든 게시물" 규칙일 때 확인할 최근 게시물 수

export async function getRules(env, igUserId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM rules WHERE ig_user_id = ? AND active = 1"
  ).bind(igUserId).all();
  return results;
}

// 댓글 1개 처리. 반환: "sent" | "failed" | "no-match" | "duplicate" | "self"
export async function handleComment(env, account, rules, c, source) {
  const commenterId = c.from?.id ? String(c.from.id) : null;
  const commenterName = c.from?.username || c.username || "";

  // 내 계정이 단 댓글(공개 답글 포함)엔 반응하지 않음 → 무한루프 방지
  if (commenterId === account.ig_user_id || commenterName === account.username) return "self";

  const commentTime = c.timestamp ? Math.floor(Date.parse(c.timestamp) / 1000) : null;
  const rule = pickRule(rules, { mediaId: c.mediaId, text: c.text, commentTime });
  if (!rule) return "no-match";

  // 중복 방지: comment_id 선점. 이미 있으면(폴링·웹훅 동시 수신 등) 건너뜀
  const claim = await env.DB.prepare(
    `INSERT OR IGNORE INTO logs
     (comment_id, ig_user_id, rule_id, media_id, commenter_id, commenter_username, comment_text, status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(c.id, account.ig_user_id, rule.id, c.mediaId, commenterId, commenterName, c.text, source, ig.now()).run();
  if (!claim.meta.changes) return "duplicate";

  let status = "sent";
  let error = null;
  try {
    await ig.sendPrivateReply(env, account.access_token, account.ig_user_id, c.id, rule.dm_message);
  } catch (e) {
    status = "failed";
    error = e.message;
  }

  // 공개 답글은 DM 성공 여부와 무관하게 시도, 실패해도 DM 결과에는 영향 없음
  const reply = pickPublicReply(rule.public_reply);
  if (reply) {
    try {
      await ig.replyToComment(env, account.access_token, c.id, reply);
    } catch (e) {
      error = (error ? error + " / " : "") + "공개답글 실패: " + e.message;
    }
  }

  await env.DB.prepare("UPDATE logs SET status = ?, error = ? WHERE comment_id = ?")
    .bind(status, error, c.id).run();
  return status;
}

// ---------- 폴링 (1분마다) ----------

export async function pollAll(env) {
  const { results: accounts } = await env.DB.prepare("SELECT * FROM accounts").all();
  const summary = [];
  for (const account of accounts) {
    try {
      summary.push(await pollAccount(env, account));
    } catch (e) {
      summary.push({ account: account.username, error: e.message });
    }
  }
  return summary;
}

export async function pollAccount(env, account) {
  const rules = await getRules(env, account.ig_user_id);
  const result = { account: account.username, checked: 0, sent: 0, failed: 0 };
  if (!rules.length) return result;

  // 확인할 게시물 목록
  const mediaIds = new Set(rules.filter((r) => r.media_id).map((r) => r.media_id));
  if (rules.some((r) => !r.media_id)) {
    const recent = await ig.listMedia(env, account.access_token, MAX_MEDIA_PER_POLL);
    recent.forEach((m) => mediaIds.add(m.id));
  }

  for (const mediaId of mediaIds) {
    let comments;
    try {
      comments = await ig.listComments(env, account.access_token, mediaId);
    } catch (e) {
      result.error = (result.error ? result.error + "; " : "") + `${mediaId}: ${e.message}`;
      continue;
    }
    for (const c of comments) {
      result.checked++;
      const r = await handleComment(env, account, rules, { ...c, mediaId }, "poll");
      if (r === "sent") result.sent++;
      if (r === "failed") result.failed++;
    }
  }
  return result;
}

// ---------- 웹훅 ----------

export async function handleWebhookPayload(env, payload) {
  if (payload.object !== "instagram") return;
  for (const entry of payload.entry || []) {
    const account = await env.DB.prepare("SELECT * FROM accounts WHERE ig_user_id = ?")
      .bind(String(entry.id)).first();
    if (!account) continue;
    const rules = await getRules(env, account.ig_user_id);
    if (!rules.length) continue;

    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue;
      const val = change.value || {};
      await handleComment(env, account, rules, {
        id: val.id,
        text: val.text,
        from: val.from,
        mediaId: val.media?.id,
        timestamp: entry.time ? new Date(entry.time * 1000).toISOString() : null,
      }, "webhook");
    }
  }
}

// 서명 확인: X-Hub-Signature-256 = sha256=HMAC(앱 시크릿, 원본 body)
export async function verifySignature(secret, rawBody, header) {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, header.slice(7));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- 토큰 자동 갱신 (만료 15일 전부터) ----------

export async function refreshExpiringTokens(env) {
  const soon = ig.now() + 15 * 86400;
  const { results } = await env.DB.prepare(
    "SELECT * FROM accounts WHERE token_expires_at < ? AND connected_at < ?"
  ).bind(soon, ig.now() - 86400).all(); // 발급 24시간 이후부터 갱신 가능
  for (const a of results) {
    try {
      const t = await ig.refreshToken(a.access_token);
      await env.DB.prepare("UPDATE accounts SET access_token = ?, token_expires_at = ? WHERE ig_user_id = ?")
        .bind(t.accessToken, t.expiresAt, a.ig_user_id).run();
    } catch (e) {
      console.log("토큰 갱신 실패", a.username, e.message);
    }
  }
}
