// 실행: npm test   (Node 22+, 외부 패키지 불필요)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { normalize, matchesRule, pickRule } from "../src/match.js";
import { handleComment, pollAccount, handleWebhookPayload, verifySignature } from "../src/engine.js";

// ---- D1 흉내 (node:sqlite 위에) ----
function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())), raw: db };
}

// ---- 인스타 API 흉내 ----
let calls, failSend, comments, media;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, method: init.method || "GET", body: init.body });
  const ok = (data) => new Response(JSON.stringify(data), { status: 200 });
  if (url.includes("/messages")) {
    if (failSend) return new Response(JSON.stringify({ error: { message: "(#10) 7일 지난 댓글" } }), { status: 400 });
    return ok({ recipient_id: "x", message_id: "m1" });
  }
  if (url.includes("/replies")) return ok({ id: "r1" });
  if (url.includes("/me/media")) return ok({ data: media });
  const cm = url.match(/\/(\w+)\/comments/);
  if (cm) return ok({ data: comments[cm[1]] || [] });
  throw new Error("unexpected fetch " + url);
};

const env = { API_VERSION: "v25.0" };
const account = { ig_user_id: "1784", username: "everywhere.lucas", access_token: "TOKEN" };
const T0 = 1_800_000_000;
const iso = (t) => new Date(t * 1000).toISOString();

function addRule(over = {}) {
  const r = { ig_user_id: "1784", name: "테스트", media_id: null, keywords: "정보, info", match_type: "contains",
    dm_message: "링크 드려요 https://everywherelucas.com", public_reply: null, active: 1, created_at: T0, ...over };
  const res = env.DB.raw.prepare(
    `INSERT INTO rules (ig_user_id,name,media_id,keywords,match_type,dm_message,public_reply,active,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(r.ig_user_id, r.name, r.media_id, r.keywords, r.match_type, r.dm_message, r.public_reply, r.active, r.created_at);
  return { ...r, id: Number(res.lastInsertRowid) };
}
const rules = () => env.DB.raw.prepare("SELECT * FROM rules WHERE active=1").all();
const sends = () => calls.filter((c) => c.url.includes("/messages"));

beforeEach(() => {
  env.DB = makeD1();
  calls = []; failSend = false; comments = {}; media = [];
  env.DB.raw.prepare("INSERT INTO accounts VALUES (?,?,?,?,?)").run("1784", "everywhere.lucas", "TOKEN", T0 + 5e6, T0);
});

// ================= 매칭 =================

test("정규화: 대소문자·공백·문장부호·이모지 무시", () => {
  assert.equal(normalize("정보 주세요!! 🙏"), "정보주세요");
  assert.equal(normalize("  INFO "), "info");
});

test("포함 / 정확히 일치", () => {
  const c = { keywords: "정보,링크", match_type: "contains" };
  assert.ok(matchesRule(c, "정보 부탁드려요"));
  assert.ok(matchesRule(c, "링크!!"));
  assert.ok(!matchesRule(c, "예뻐요"));
  const e = { keywords: "정보", match_type: "exact" };
  assert.ok(matchesRule(e, "정보!"));
  assert.ok(matchesRule(e, " 정 보 🙏"));
  assert.ok(!matchesRule(e, "정보 주세요"));
});

test("특정 게시물 규칙이 전체 규칙보다 우선, 규칙 생성 전 댓글은 무시", () => {
  const all = { id: 1, active: 1, media_id: null, keywords: "정보", match_type: "contains", created_at: 100 };
  const one = { id: 2, active: 1, media_id: "M1", keywords: "정보", match_type: "contains", created_at: 100 };
  assert.equal(pickRule([all, one], { mediaId: "M1", text: "정보", commentTime: 200 }).id, 2);
  assert.equal(pickRule([all, one], { mediaId: "M2", text: "정보", commentTime: 200 }).id, 1);
  assert.equal(pickRule([all, one], { mediaId: "M1", text: "정보", commentTime: 50 }), null);
});

// ================= 발송 엔진 =================

test("키워드 댓글 → DM 발송 + 기록 'sent'", async () => {
  addRule();
  const r = await handleComment(env, account, rules(),
    { id: "C1", text: "정보 주세요", from: { id: "99", username: "fan1" }, mediaId: "M1", timestamp: iso(T0 + 10) }, "poll");
  assert.equal(r, "sent");
  assert.equal(sends().length, 1);
  const body = JSON.parse(sends()[0].body);
  assert.deepEqual(body.recipient, { comment_id: "C1" });
  assert.match(sends()[0].url, /graph\.instagram\.com\/v25\.0\/1784\/messages/);
  const log = env.DB.raw.prepare("SELECT * FROM logs").get();
  assert.equal(log.status, "sent");
  assert.equal(log.commenter_username, "fan1");
});

test("같은 댓글은 두 번 보내지 않음 (폴링+웹훅 동시 수신)", async () => {
  addRule();
  const c = { id: "C1", text: "정보", from: { id: "99", username: "fan1" }, mediaId: "M1", timestamp: iso(T0 + 10) };
  const [a, b] = await Promise.all([
    handleComment(env, account, rules(), c, "poll"),
    handleComment(env, account, rules(), c, "webhook"),
  ]);
  assert.deepEqual([a, b].sort(), ["duplicate", "sent"]);
  assert.equal(sends().length, 1);
});

test("내 계정 댓글(공개 답글)엔 반응 안 함", async () => {
  addRule({ keywords: "dm" });
  const r = await handleComment(env, account, rules(),
    { id: "C2", text: "DM 보내드렸어요", from: { id: "1784", username: "everywhere.lucas" }, mediaId: "M1" }, "poll");
  assert.equal(r, "self");
  assert.equal(sends().length, 0);
});

test("발송 실패는 'failed' + 에러 메시지 기록, 공개 답글은 시도", async () => {
  addRule({ public_reply: "DM 보내드렸어요 📩" });
  failSend = true;
  const r = await handleComment(env, account, rules(),
    { id: "C3", text: "info", from: { id: "99", username: "fan1" }, mediaId: "M1", timestamp: iso(T0 + 10) }, "poll");
  assert.equal(r, "failed");
  const log = env.DB.raw.prepare("SELECT * FROM logs").get();
  assert.equal(log.status, "failed");
  assert.match(log.error, /7일/);
  assert.equal(calls.filter((c) => c.url.includes("/replies")).length, 1);
});

test("폴링: 모든 게시물 규칙 → 최근 게시물 댓글 확인, 키워드만 발송", async () => {
  addRule();
  media = [{ id: "M1" }, { id: "M2" }];
  comments = {
    M1: [
      { id: "a", text: "정보요", timestamp: iso(T0 + 5), from: { id: "1", username: "u1" } },
      { id: "b", text: "예뻐요", timestamp: iso(T0 + 6), from: { id: "2", username: "u2" } },
      { id: "c", text: "정보요", timestamp: iso(T0 - 100), from: { id: "3", username: "old" } }, // 규칙 전 댓글
    ],
    M2: [{ id: "d", text: "INFO please", timestamp: iso(T0 + 7), from: { id: "4", username: "u4" } }],
  };
  const r1 = await pollAccount(env, account);
  assert.equal(r1.sent, 2);
  assert.equal(r1.checked, 4);
  // 다음 폴링에서는 아무것도 다시 보내지 않음
  const r2 = await pollAccount(env, account);
  assert.equal(r2.sent, 0);
  assert.equal(sends().length, 2);
});

test("폴링: 특정 게시물 규칙만 있으면 게시물 목록 호출 안 함", async () => {
  addRule({ media_id: "M9" });
  comments = { M9: [{ id: "z", text: "정보", timestamp: iso(T0 + 1), from: { id: "1", username: "u" } }] };
  const r = await pollAccount(env, account);
  assert.equal(r.sent, 1);
  assert.equal(calls.filter((c) => c.url.includes("/me/media")).length, 0);
});

test("꺼진 규칙은 동작 안 함", async () => {
  addRule({ active: 0 });
  comments = {};
  media = [{ id: "M1" }];
  const r = await pollAccount(env, account);
  assert.equal(r.checked, 0);
});

// ================= 웹훅 =================

test("웹훅 payload 처리", async () => {
  addRule();
  await handleWebhookPayload(env, {
    object: "instagram",
    entry: [{ id: "1784", time: T0 + 20, changes: [{ field: "comments",
      value: { id: "W1", text: "정보", from: { id: "77", username: "hook" }, media: { id: "M1" } } }] }],
  });
  assert.equal(sends().length, 1);
  assert.equal(env.DB.raw.prepare("SELECT source FROM logs").get().source, "webhook");
});

test("웹훅 서명 검증", async () => {
  const body = '{"object":"instagram"}';
  const { createHmac } = await import("node:crypto");
  const good = "sha256=" + createHmac("sha256", "SECRET").update(body).digest("hex");
  assert.ok(await verifySignature("SECRET", body, good));
  assert.ok(!(await verifySignature("WRONG", body, good)));
  assert.ok(!(await verifySignature("SECRET", body, null)));
});
