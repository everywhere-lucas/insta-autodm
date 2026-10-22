// 댓글 처리 엔진: 폴링·웹훅 공통

import * as ig from "./instagram.js";
import { pickRule, pickPublicReply } from "./match.js";

const MAX_MEDIA_PER_POLL = 5;  // "모든 게시물" 규칙일 때 확인할 최근 게시물 수 (20초마다라 줄임)
const MAX_PEOPLE_PER_RUN = 8;   // 한 번 실행에 답장 확인할 최대 인원 (요청 한도 보호)
const GATE_DAYS = 7;            // 팔로우 확인 대기 기간
const MAX_NUDGES = 3;           // "아직 팔로우 안 됨" 안내 최대 횟수

export const DEFAULT_FOLLOW_PROMPT =
  "댓글 고마워요! 🙌 팔로우하고 이 메시지에 '완료'라고 답장 주시면 바로 보내드릴게요.";
export const DEFAULT_NOT_FOLLOWING =
  "아직 팔로우가 확인되지 않아요 🥲 팔로우하고 다시 답장 주시면 바로 보내드릴게요!";

// 실행마다 요청 한도(무료 50개) 안에서 쓰도록 여유 있게 잡음
export function withBudget(env, n = 45) {
  return { ...env, _budget: { left: n } };
}
function budgetLeft(env) {
  return env._budget ? env._budget.left : Infinity;
}

export function parseButtons(raw) {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter((b) => b?.title && b?.url).slice(0, 3) : [];
  } catch { return []; }
}

// 버튼으로 먼저 보내고, 인스타가 거절하면 링크를 글자로 붙여서 다시 보냄
async function sendWithButtons(send, text, buttons) {
  if (!buttons.length) return send(text, null);
  try {
    return await send(text, buttons);
  } catch (e) {
    if (e instanceof ig.BudgetError || e.status >= 500 || e.status === 429) throw e;
    return send(ig.textWithLinks(text, buttons), null);
  }
}

export async function getRules(env, igUserId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM rules WHERE ig_user_id = ? AND active = 1"
  ).bind(igUserId).all();
  return results;
}

// 댓글 1개 처리. 반환: "sent" | "awaiting" | "failed" | "no-match" | "duplicate" | "repeat" | "self" | "deferred"
export async function handleComment(env, account, rules, c, source) {
  const commenterId = c.from?.id ? String(c.from.id) : null;
  const commenterName = c.from?.username || c.username || "";

  // 내 계정이 단 댓글(공개 답글 포함)엔 반응하지 않음 → 무한루프 방지
  if (commenterId === account.ig_user_id || commenterName === account.username) return "self";

  const commentTime = c.timestamp ? Math.floor(Date.parse(c.timestamp) / 1000) : null;
  const rule = pickRule(rules, { mediaId: c.mediaId, text: c.text, commentTime });
  if (!rule) return "no-match";

  // 같은 사람에게 같은 규칙으로는 한 번만 (댓글 여러 번 달아도)
  const already = await env.DB.prepare(
    `SELECT 1 FROM logs WHERE rule_id = ? AND status IN ('sent','awaiting','pending')
       AND ((commenter_id IS NOT NULL AND commenter_id = ?) OR (commenter_username != '' AND commenter_username = ?)) LIMIT 1`
  ).bind(rule.id, commenterId, commenterName).first();
  if (already) return "repeat";

  // 이번 실행의 요청 한도가 거의 다 찼으면 선점하지 않고 다음 실행으로 넘김
  if (budgetLeft(env) < 3) return "deferred";

  // 중복 방지: comment_id 선점. 이미 있으면(폴링·웹훅 동시 수신 등) 건너뜀
  const claim = await env.DB.prepare(
    `INSERT OR IGNORE INTO logs
     (comment_id, ig_user_id, rule_id, media_id, commenter_id, commenter_username, comment_text, status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(c.id, account.ig_user_id, rule.id, c.mediaId, commenterId, commenterName, c.text, source, ig.now()).run();
  if (!claim.meta.changes) return "duplicate";

  const gated = !!rule.follow_required;
  let status = gated ? "awaiting" : "sent";
  let error = null;
  try {
    // 팔로우 필수면 첫 DM은 안내만, 링크 버튼은 팔로우 확인 후에
    const text = gated ? rule.follow_prompt || DEFAULT_FOLLOW_PROMPT : rule.dm_message;
    const buttons = gated ? [] : parseButtons(rule.buttons);
    await sendWithButtons(
      (t, b) => ig.sendPrivateReply(env, account.access_token, account.ig_user_id, c.id, t, b),
      text, buttons
    );
    if (gated) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO follow_gates (comment_id, ig_user_id, rule_id, igsid, username, status, last_checked, created_at)
         VALUES (?, ?, ?, ?, ?, 'awaiting', ?, ?)`
      ).bind(c.id, account.ig_user_id, rule.id, commenterId, commenterName, ig.now(), ig.now()).run();
    }
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
  const limited = env._rateLimited || {};
  if (limited[account.ig_user_id]) return { ...result, skipped: "rate-limit" };

  if (rules.some((r) => !r.media_id)) {
    // 게시물 목록은 한 번 실행(1분) 동안 재사용
    const cache = env._mediaCache || {};
    if (!cache[account.ig_user_id]) cache[account.ig_user_id] = await ig.listMedia(env, account.access_token, MAX_MEDIA_PER_POLL);
    cache[account.ig_user_id].forEach((m) => mediaIds.add(m.id));
  }

  for (const mediaId of mediaIds) {
    if (budgetLeft(env) < 1) return { ...result, deferred: true };
    let comments;
    try {
      comments = await ig.listComments(env, account.access_token, mediaId);
    } catch (e) {
      if (e instanceof ig.BudgetError) return { ...result, deferred: true };
      if (isRateLimit(e)) {
        limited[account.ig_user_id] = true;
        return { ...result, error: "인스타 요청 한도 초과 — 잠시 쉬었다가 다시 확인해요" };
      }
      result.error = (result.error ? result.error + "; " : "") + `${mediaId}: ${e.message}`;
      continue;
    }
    for (const c of comments) {
      result.checked++;
      const r = await handleComment(env, account, rules, { ...c, mediaId }, "poll");
      if (r === "sent" || r === "awaiting") result.sent++;
      if (r === "failed") result.failed++;
      if (r === "deferred") return { ...result, deferred: true };
    }
    if (budgetLeft(env) < 3) return { ...result, deferred: true };
  }
  return result;
}

function isRateLimit(e) {
  const code = e?.body?.error?.code;
  return e?.status === 429 || [4, 17, 32, 613].includes(code);
}

// ---------- 20초마다 확인: 1분짜리 실행 안에서 3번 (0초·20초·40초) ----------
// 무료 플랜은 실행 1번당 외부 요청 50개 → 3번에 나눠 씀. 게시물 목록은 재사용.
export async function pollRounds(env, { rounds = 3, gapMs = 20000, total = 45 } = {}) {
  const shared = { left: total };
  const mediaCache = {};
  const rateLimited = {};
  const out = [];
  for (let i = 0; i < rounds; i++) {
    const share = Math.floor(shared.left / (rounds - i));
    const e = { ...env, _budget: { left: share }, _mediaCache: mediaCache, _rateLimited: rateLimited };
    out.push(await pollAll(e));
    shared.left -= share - e._budget.left;
    if (i < rounds - 1 && gapMs) await new Promise((r) => setTimeout(r, gapMs));
  }
  return out;
}

// ---------- 팔로우 확인 (답장 감지 → 팔로우 확인 → 링크 발송) ----------

export async function pollRepliesAll(env) {
  const { results: accounts } = await env.DB.prepare("SELECT * FROM accounts").all();
  const summary = [];
  for (const account of accounts) {
    try {
      summary.push(await pollReplies(env, account));
    } catch (e) {
      summary.push({ account: account.username, error: e.message });
    }
  }
  return summary;
}

export async function pollReplies(env, account) {
  const result = { account: account.username, waiting: 0, replied: 0, unlocked: 0, nudged: 0 };

  // 7일 지난 대기는 만료
  await env.DB.prepare(
    "UPDATE follow_gates SET status='expired' WHERE ig_user_id=? AND status='awaiting' AND created_at < ?"
  ).bind(account.ig_user_id, ig.now() - GATE_DAYS * 86400).run();

  const { results: gates } = await env.DB.prepare(
    `SELECT g.*, r.dm_message, r.buttons, r.not_following_msg FROM follow_gates g
     JOIN rules r ON r.id = g.rule_id
     WHERE g.ig_user_id = ? AND g.status = 'awaiting' ORDER BY g.last_checked ASC`
  ).bind(account.ig_user_id).all();
  result.waiting = gates.length;
  if (!gates.length) return result;

  // 사람별로 묶기 (한 사람이 여러 게시물에 댓글 단 경우)
  const byPerson = new Map();
  for (const g of gates) {
    const key = g.igsid || "@" + g.username;
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key).push(g);
  }

  // 대화 목록 한 번에 받아서 "누구와의 대화가 언제 갱신됐는지" 파악
  const convs = await ig.listConversations(env, account.access_token);
  const hasParticipants = convs.some((c) => c.participants?.data?.length);
  const convByPerson = new Map();
  for (const c of convs) {
    for (const p of c.participants?.data || []) {
      if (String(p.id) === account.ig_user_id || p.username === account.username) continue;
      const conv = { id: c.id, updated: ig.toUnix(c.updated_time) };
      if (p.id) convByPerson.set(String(p.id), conv);
      if (p.username) convByPerson.set("@" + p.username, conv);
    }
  }

  let handled = 0;
  for (const [key, list] of byPerson) {
    if (handled >= MAX_PEOPLE_PER_RUN || budgetLeft(env) < 6) break;
    const g0 = list[0];
    const since = Math.min(...list.map((g) => g.last_checked));

    let conv = convByPerson.get(g0.igsid) || convByPerson.get("@" + g0.username);
    if (!conv && !hasParticipants && g0.igsid) {
      handled++;
      const found = await ig.findConversation(env, account.access_token, g0.igsid);
      if (found) conv = { id: found.id, updated: ig.toUnix(found.updated_time) };
    }
    if (!conv) continue;                                 // 아직 답장 없음
    if (conv.updated && conv.updated <= since) continue;  // 그 뒤로 새 메시지 없음
    handled++;

    // 새 메시지 중 상대가 보낸 게 있는지
    const msgs = (await ig.listMessages(env, account.access_token, conv.id))
      .filter((m) => !m.created_time || ig.toUnix(m.created_time) > since)
      .slice(0, 3);
    let replied = null;
    for (const m of msgs) {
      const d = await ig.getMessage(env, account.access_token, m.id);
      const fromMe = String(d.from?.id) === account.ig_user_id || d.from?.username === account.username;
      if (!fromMe && ig.toUnix(d.created_time) > since) { replied = d; break; }
    }

    const checkedAt = ig.now();
    const ids = list.map((g) => g.comment_id);
    const marks = ids.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE follow_gates SET last_checked = ? WHERE comment_id IN (${marks})`)
      .bind(checkedAt, ...ids).run();
    if (!replied) continue;
    result.replied++;

    const igsid = String(replied.from?.id || g0.igsid);
    const profile = await ig.getFollowStatus(env, account.access_token, igsid);

    if (profile.is_user_follow_business) {
      // 팔로우 확인 → 규칙별 링크 DM (같은 규칙은 한 번만)
      const sentRules = new Set();
      for (const g of list) {
        let status = "sent", error = null;
        if (!sentRules.has(g.rule_id)) {
          try {
            await sendWithButtons(
              (t, b) => ig.sendDirect(env, account.access_token, account.ig_user_id, igsid, t, b),
              g.dm_message, parseButtons(g.buttons)
            );
            sentRules.add(g.rule_id);
            result.unlocked++;
          } catch (e) { status = "failed"; error = e.message; }
        }
        await env.DB.batch([
          env.DB.prepare("UPDATE follow_gates SET status='done', igsid=? WHERE comment_id=?").bind(igsid, g.comment_id),
          env.DB.prepare("UPDATE logs SET status=?, error=? WHERE comment_id=?").bind(status, error, g.comment_id),
        ]);
      }
    } else {
      // 아직 팔로우 안 함 → 안내 (최대 MAX_NUDGES 번)
      const nudges = Math.max(...list.map((g) => g.nudges));
      if (nudges < MAX_NUDGES) {
        try {
          await ig.sendDirect(env, account.access_token, account.ig_user_id, igsid, g0.not_following_msg || DEFAULT_NOT_FOLLOWING);
          result.nudged++;
        } catch (e) { /* 다음 답장 때 다시 시도 */ }
      }
      await env.DB.batch([
        env.DB.prepare(`UPDATE follow_gates SET nudges = nudges + 1, igsid=? WHERE comment_id IN (${marks})`).bind(igsid, ...ids),
        env.DB.prepare(`UPDATE logs SET error = ? WHERE comment_id IN (${marks})`)
          .bind(`답장했지만 아직 팔로우 안 함 (${nudges + 1}회)`, ...ids),
      ]);
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
