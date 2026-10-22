// Instagram API (Instagram 로그인 방식) 호출 모음

const GRAPH = "https://graph.instagram.com";

export class IgError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function igFetch(url, init = {}) {
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
  return igFetch(`${GRAPH}/${v(env)}/me?fields=user_id,username`, auth(token));
}

export async function listMedia(env, token, limit = 24) {
  const fields = "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp";
  const r = await igFetch(`${GRAPH}/${v(env)}/me/media?fields=${fields}&limit=${limit}`, auth(token));
  return r.data || [];
}

export async function listComments(env, token, mediaId, limit = 50) {
  const fields = "id,text,timestamp,username,from";
  const r = await igFetch(
    `${GRAPH}/${v(env)}/${mediaId}/comments?fields=${fields}&limit=${limit}`,
    auth(token)
  );
  return r.data || [];
}

// ---------- 쓰기 ----------

// 댓글 단 사람에게 DM (Private Reply). 댓글 1개당 1번, 댓글 후 7일 이내만 가능.
export function sendPrivateReply(env, token, igUserId, commentId, text) {
  return igFetch(`${GRAPH}/${v(env)}/${igUserId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });
}

// 댓글에 공개 답글
export function replyToComment(env, token, commentId, text) {
  return igFetch(`${GRAPH}/${v(env)}/${commentId}/replies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
}

// 웹훅 구독 (Advanced Access 승인 후에만 실제 알림이 옴)
export function subscribeWebhooks(env, token) {
  return igFetch(`${GRAPH}/${v(env)}/me/subscribed_apps?subscribed_fields=comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ---------- 유틸 ----------

function auth(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function now() {
  return Math.floor(Date.now() / 1000);
}
