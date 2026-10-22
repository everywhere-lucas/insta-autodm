import * as ig from "./instagram.js";
import {
  pollAll, pollRepliesAll, withBudget, handleWebhookPayload, verifySignature, refreshExpiringTokens,
} from "./engine.js";
import { dashboardHtml, privacyHtml } from "./pages.js";
import { SCHEMA, MIGRATIONS } from "./schema.js";

// 켜질 때 한 번: 테이블 생성 + 새 칸 추가 (이미 있으면 아무것도 안 함)
let schemaReady = null;
function ensureSchema(env) {
  schemaReady ??= (async () => {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    for (const m of MIGRATIONS) {
      try { await env.DB.prepare(m).run(); } catch { /* 이미 있는 칸 */ }
    }
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

// 크론 2개: 하나는 새 댓글 확인, 하나는 팔로우 답장 확인 (각각 요청 한도 따로)
const CRON_REPLIES = "0-59 * * * *";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      await ensureSchema(env);
      // ---- 공개 경로 (Meta가 호출) ----
      if (path === "/webhook") return await webhook(request, env, ctx, url);
      if (path === "/privacy") return html(privacyHtml(env));
      if (path === "/auth/callback") return await authCallback(request, env, url);
      if (path === "/healthz") return json({ ok: true });

      // ---- 여기부터 관리자 비밀번호 필요 ----
      const denied = requireAdmin(request, env);
      if (denied) return denied;

      if (path === "/" ) return html(dashboardHtml(env));
      if (path === "/auth/login") return authLogin(env);
      if (path.startsWith("/api/")) return await api(request, env, url, path);

      return new Response("Not found", { status: 404 });
    } catch (e) {
      if (!e.status || e.status >= 500) console.log("error", e.stack || e.message);
      if (path === "/auth/callback") {
        return html(page("연결 실패", e.message + " — Meta 앱 설정(리디렉션 URL, 앱 ID/시크릿)을 확인하세요."), 500);
      }
      return json({ error: e.message, detail: e.body }, e.status && e.status < 500 ? e.status : 500);
    }
  },

  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    if (event.cron === CRON_REPLIES) {
      ctx.waitUntil(pollRepliesAll(withBudget(env)));
      ctx.waitUntil(refreshExpiringTokens(env));
    } else if (env.MODE !== "webhook") {
      ctx.waitUntil(pollAll(withBudget(env)));
    }
  },
};

// ================= 관리자 인증 (브라우저 기본 로그인창) =================

function requireAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return new Response("ADMIN_PASSWORD 시크릿을 먼저 등록하세요.", { status: 500 });
  }
  const h = request.headers.get("Authorization") || "";
  if (h.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0))); } catch {}
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (decoded.includes(":") && pass === env.ADMIN_PASSWORD) return null;
  }
  return new Response("로그인이 필요합니다", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="insta-autodm", charset="UTF-8"' },
  });
}

// ================= 인스타 계정 연결 (OAuth) =================

function authLogin(env) {
  if (!env.IG_APP_ID || !env.BASE_URL) {
    return html("<p>wrangler.toml 의 IG_APP_ID, BASE_URL 을 먼저 채워주세요.</p>", 500);
  }
  const state = crypto.randomUUID();
  return new Response(null, {
    status: 302,
    headers: {
      Location: ig.authorizeUrl(env, state),
      "Set-Cookie": `ig_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

async function authCallback(request, env, url) {
  const cookieState = (request.headers.get("Cookie") || "").match(/ig_state=([^;]+)/)?.[1];
  if (!cookieState || cookieState !== url.searchParams.get("state")) {
    return html(page("연결 실패", "보안 확인값이 맞지 않습니다. 대시보드에서 다시 시도하세요."), 400);
  }
  if (url.searchParams.get("error")) {
    return html(page("연결 취소됨", url.searchParams.get("error_description") || ""), 400);
  }

  const t = await ig.exchangeCode(env, url.searchParams.get("code") || "");
  await env.DB.prepare(
    `INSERT INTO accounts (ig_user_id, username, access_token, token_expires_at, connected_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ig_user_id) DO UPDATE SET
       username = excluded.username, access_token = excluded.access_token,
       token_expires_at = excluded.token_expires_at, connected_at = excluded.connected_at`
  ).bind(t.igUserId, t.username, t.accessToken, t.expiresAt, ig.now()).run();

  let webhookNote = "";
  if (env.MODE !== "poll") {
    try { await ig.subscribeWebhooks(env, t.accessToken); }
    catch (e) { webhookNote = `<p style="color:#b45309">웹훅 구독 실패: ${esc(e.message)}</p>`; }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/?connected=${encodeURIComponent(t.username)}${webhookNote ? "&webhook=fail" : ""}`,
      "Set-Cookie": "ig_state=; Path=/auth; Max-Age=0",
    },
  });
}

// ================= 웹훅 =================

async function webhook(request, env, ctx, url) {
  if (request.method === "GET") {
    // Meta 대시보드에서 콜백 URL 확인할 때
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === env.WEBHOOK_VERIFY_TOKEN
    ) {
      return new Response(url.searchParams.get("hub.challenge"));
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "POST") {
    const raw = await request.text();
    const ok = await verifySignature(env.IG_APP_SECRET, raw, request.headers.get("X-Hub-Signature-256"));
    if (!ok) return new Response("Bad signature", { status: 401 });
    // Meta는 빠른 200 응답을 원함 → 처리는 백그라운드로
    ctx.waitUntil(handleWebhookPayload(env, JSON.parse(raw)).catch((e) => console.log("webhook", e.message)));
    return new Response("EVENT_RECEIVED");
  }
  return new Response("Method not allowed", { status: 405 });
}

// ================= 대시보드 API =================

async function api(request, env, url, path) {
  const m = request.method;

  if (path === "/api/accounts" && m === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT ig_user_id, username, token_expires_at, connected_at FROM accounts ORDER BY connected_at"
    ).all();
    return json({ accounts: results, mode: env.MODE || "poll" });
  }

  const accDel = path.match(/^\/api\/accounts\/(\w+)$/);
  if (accDel && m === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rules WHERE ig_user_id = ?").bind(accDel[1]),
      env.DB.prepare("DELETE FROM accounts WHERE ig_user_id = ?").bind(accDel[1]),
    ]);
    return json({ ok: true });
  }

  if (path === "/api/media" && m === "GET") {
    const acc = await getAccount(env, url.searchParams.get("account"));
    return json({ media: await ig.listMedia(env, acc.access_token, 24) });
  }

  if (path === "/api/rules" && m === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT r.*, a.username,
         (SELECT COUNT(*) FROM logs l WHERE l.rule_id = r.id AND l.status = 'sent') AS sent_count
       FROM rules r LEFT JOIN accounts a ON a.ig_user_id = r.ig_user_id
       ORDER BY r.id DESC`
    ).all();
    return json({ rules: results });
  }

  if (path === "/api/rules" && m === "POST") {
    const b = validateRule(await request.json());
    await getAccount(env, b.ig_user_id);
    const r = await env.DB.prepare(
      `INSERT INTO rules (ig_user_id, name, media_id, media_permalink, media_thumb, keywords, match_type, dm_message, public_reply,
         follow_required, follow_prompt, not_following_msg, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).bind(b.ig_user_id, b.name, b.media_id, b.media_permalink, b.media_thumb, b.keywords,
      b.match_type, b.dm_message, b.public_reply, b.follow_required, b.follow_prompt, b.not_following_msg, ig.now()).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }

  const ruleMatch = path.match(/^\/api\/rules\/(\d+)$/);
  if (ruleMatch && m === "PUT") {
    const b = validateRule(await request.json());
    await env.DB.prepare(
      `UPDATE rules SET name=?, media_id=?, media_permalink=?, media_thumb=?, keywords=?, match_type=?,
       dm_message=?, public_reply=?, follow_required=?, follow_prompt=?, not_following_msg=?, active=? WHERE id=?`
    ).bind(b.name, b.media_id, b.media_permalink, b.media_thumb, b.keywords, b.match_type,
      b.dm_message, b.public_reply, b.follow_required, b.follow_prompt, b.not_following_msg, b.active, ruleMatch[1]).run();
    return json({ ok: true });
  }
  if (ruleMatch && m === "PATCH") {
    const b = await request.json();
    await env.DB.prepare("UPDATE rules SET active = ? WHERE id = ?").bind(b.active ? 1 : 0, ruleMatch[1]).run();
    return json({ ok: true });
  }
  if (ruleMatch && m === "DELETE") {
    await env.DB.prepare("DELETE FROM rules WHERE id = ?").bind(ruleMatch[1]).run();
    return json({ ok: true });
  }

  if (path === "/api/logs" && m === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT l.*, r.name AS rule_name FROM logs l LEFT JOIN rules r ON r.id = l.rule_id
       ORDER BY l.created_at DESC LIMIT 100`
    ).all();
    const since = ig.now() - 86400;
    const stats = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status='sent' AND created_at > ? THEN 1 ELSE 0 END) AS today,
         SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS total,
         SUM(CASE WHEN status='failed' AND created_at > ? THEN 1 ELSE 0 END) AS failed_today,
         SUM(CASE WHEN status='awaiting' THEN 1 ELSE 0 END) AS awaiting
       FROM logs`
    ).bind(since, since).first();
    return json({ logs: results, stats });
  }

  // 지금 바로 댓글 확인 (테스트용)
  if (path === "/api/poll" && m === "POST") {
    const comments = await pollAll(withBudget(env));
    const replies = await pollRepliesAll(withBudget(env));
    return json({ result: comments, replies });
  }

  return json({ error: "not found" }, 404);
}

function validateRule(b) {
  const clean = (s, max) => (s == null ? null : String(s).trim().slice(0, max) || null);
  const out = {
    ig_user_id: clean(b.ig_user_id, 40),
    name: clean(b.name, 60),
    media_id: clean(b.media_id, 40),
    media_permalink: clean(b.media_permalink, 300),
    media_thumb: clean(b.media_thumb, 1000),
    keywords: clean(b.keywords, 300),
    match_type: b.match_type === "exact" ? "exact" : "contains",
    dm_message: clean(b.dm_message, 1000),
    public_reply: clean(b.public_reply, 1000),
    follow_required: b.follow_required ? 1 : 0,
    follow_prompt: clean(b.follow_prompt, 1000),
    not_following_msg: clean(b.not_following_msg, 1000),
    active: b.active === false || b.active === 0 ? 0 : 1,
  };
  if (!out.keywords) throw httpError("키워드를 입력하세요", 400);
  if (!out.dm_message) throw httpError("DM 메시지를 입력하세요", 400);  return out;
}

async function getAccount(env, id) {
  const a = id
    ? await env.DB.prepare("SELECT * FROM accounts WHERE ig_user_id = ?").bind(id).first()
    : await env.DB.prepare("SELECT * FROM accounts ORDER BY connected_at LIMIT 1").first();
  if (!a) throw httpError("연결된 인스타 계정이 없습니다", 400);
  return a;
}

// ================= 응답 헬퍼 =================

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
function html(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
function page(title, msg) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <body style="font-family:system-ui;padding:40px;max-width:480px;margin:auto">
  <h2>${esc(title)}</h2><p>${esc(msg)}</p><p><a href="/">대시보드로 돌아가기</a></p>`;
}
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
