// Instagram API (Instagram 로그인 방식) 호출 모음

const GRAPH = "https://graph.instagram.com";

export class IgError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// 무료 플랜은 실행 1번당 외부 요청 50개 제한 → env._budget 으로 남은 개수 관리
export class BudgetError extends Error {}
function spend(env) {
  if (!env?._budget) return;
  if (env._budget.left <= 0) throw new BudgetError("이번 실행의 요청 한도 소진 — 다음 실행에서 이어서 처리");
  env._budget.left--;
}

async function igFetch(url, init = {}, env) {
  spend(env);
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || body.error) {
    const msg = body.error?.message || body.error_message || `HTTP ${res.status}`;
    throw new IgError(msg, res.status, body);
  }
  return body;
}

function v(env) {
  return env.API_VERSION || "v25.0";
}

// ---------- OAuth ----------

export const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

export function authorizeUrl(env, state) {
  const p = new URLSearchParams({
    enable_fb_login: "0",
    force_reauth: "true",
    client_id: env.IG_APP_ID,
    redirect_uri: `${env.BASE_URL}/auth/callback`,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

// code → 단기 토큰 → 60일 장기 토큰 → 계정 정보
export async function exchangeCode(env, code) {
  const form = new URLSearchParams({
    client_id: env.IG_APP_ID,
    client_secret: env.IG_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: `${env.BASE_URL}/auth/callback`,
    code: code.replace(/#_$/, ""),
  });
  const short = await igFetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: form,
  });
  const shortToken = short.access_token || short.data?.[0]?.access_token;
  if (!shortToken) throw new IgError("단기 토큰을 받지 못했습니다", 500, short);

  const long = await igFetch(
    `${GRAPH}/access_token?` +
      new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: env.IG_APP_SECRET,
        access_token: shortToken,
      })
  );

  const me = await getMe(env, long.access_token);
  return {
    igUserId: String(me.user_id),
    username: me.username,
    accessToken: long.access_token,
    expiresAt: now() + Number(long.expires_in || 60 * 86400),
  };
}

export async function refreshToken(token) {
  const r = await igFetch(
    `${GRAPH}/refresh_access_token?` +
      new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })
  );
  return { accessToken: r.access_token, expiresAt: now() + Number(r.expires_in || 60 * 86400) };
}

// ---------- 읽기 ----------

export function getMe(env, token) {
  return igFetch(`${GRAPH}/${v(env)}/me?fields=user_id,username`, auth(token), env);
}

export async function listMedia(env, token, limit = 24) {
  const fields = "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp";
  const r = await igFetch(`${GRAPH}/${v(env)}/me/media?fields=${fields}&limit=${limit}`, auth(token), env);
  return r.data || [];
}

export async function listComments(env, token, mediaId, limit = 50) {
  const fields = "id,text,timestamp,username,from";
  const r = await igFetch(
    `${GRAPH}/${v(env)}/${mediaId}/comments?fields=${fields}&limit=${limit}`,
    auth(token), env
  );
  return r.data || [];
}

// ---------- 쓰기 ----------

// 메시지 본문: 버튼이 있으면 버튼 템플릿(텍스트 640자 + 링크 버튼 최대 3개)
export function buildMessage(text, buttons) {
  if (!buttons?.length) return { text };
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: text.slice(0, 640),
        buttons: buttons.slice(0, 3).map((b) => ({ type: "web_url", url: b.url, title: b.title })),
      },
    },
  };
}

// 버튼을 못 쓰는 경우 대비: 링크를 글자로 붙인 버전
export function textWithLinks(text, buttons) {
  if (!buttons?.length) return text;
  return text + "\n\n" + buttons.map((b) => `👉 ${b.title}\n${b.url}`).join("\n\n");
}

// 댓글 단 사람에게 DM (Private Reply). 댓글 1개당 1번, 댓글 후 7일 이내만 가능.
export function sendPrivateReply(env, token, igUserId, commentId, text, buttons) {
  return igFetch(`${GRAPH}/${v(env)}/${igUserId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: buildMessage(text, buttons) }),
  }, env);
}

// 댓글에 공개 답글
export function replyToComment(env, token, commentId, text) {
  return igFetch(`${GRAPH}/${v(env)}/${commentId}/replies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  }, env);
}

// ---------- 진단용 ----------
export async function rawGet(env, token, path) {
  try {
    return { ok: true, data: await igFetch(`${GRAPH}/${v(env)}/${path}`, auth(token), env) };
  } catch (e) {
    return { ok: false, status: e.status, error: e.message, body: e.body };
  }
}

// ---------- 팔로우 확인용 (대화) ----------

// 최근 대화 목록. participants 를 같이 받아 "누구와의 대화인지" 한 번에 파악
export async function listConversations(env, token) {
  const r = await igFetch(
    `${GRAPH}/${v(env)}/me/conversations?platform=instagram&fields=participants,updated_time&limit=50`,
    auth(token), env
  );
  return r.data || [];
}

// 특정 사람과의 대화 찾기 (participants 가 안 올 때 대비)
export async function findConversation(env, token, igsid) {
  const r = await igFetch(
    `${GRAPH}/${v(env)}/me/conversations?platform=instagram&user_id=${igsid}&fields=updated_time`,
    auth(token), env
  );
  return r.data?.[0] || null;
}

// 대화 안의 메시지 id 목록 (최신순)
export async function listMessages(env, token, conversationId) {
  const r = await igFetch(`${GRAPH}/${v(env)}/${conversationId}?fields=messages`, auth(token), env);
  return r.messages?.data || [];
}

export function getMessage(env, token, messageId) {
  return igFetch(`${GRAPH}/${v(env)}/${messageId}?fields=id,created_time,from,message`, auth(token), env);
}

// 상대가 나를 팔로우하는지 (상대가 나에게 메시지를 보낸 뒤에만 조회 가능)
export function getFollowStatus(env, token, igsid) {
  return igFetch(`${GRAPH}/${v(env)}/${igsid}?fields=username,is_user_follow_business`, auth(token), env);
}

// 일반 DM (상대가 답장한 뒤 24시간 안에만 가능)
export function sendDirect(env, token, igUserId, igsid, text, buttons) {
  return igFetch(`${GRAPH}/${v(env)}/${igUserId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igsid }, message: buildMessage(text, buttons) }),
  }, env);
}

// 인스타 시간값은 unix 초 또는 ISO 문자열 둘 다 옴
export function toUnix(t) {
  if (t == null) return 0;
  if (typeof t === "number") return t > 1e12 ? Math.floor(t / 1000) : t;
  if (/^\d+$/.test(t)) return toUnix(Number(t));
  const ms = Date.parse(String(t).replace(/\+0000$/, "Z"));
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

// 웹훅 구독 (Advanced Access 승인 후에만 실제 알림이 옴)
export function subscribeWebhooks(env, token) {
  return igFetch(`${GRAPH}/${v(env)}/me/subscribed_apps?subscribed_fields=comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }, env);
}

// ---------- 유틸 ----------

function auth(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function now() {
  return Math.floor(Date.now() / 1000);
}
