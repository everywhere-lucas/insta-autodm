// 관리 대시보드 + 개인정보처리방침 페이지

export function privacyHtml(env) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>개인정보처리방침</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.7;color:#111}</style>
</head><body>
<h1>개인정보처리방침</h1>
<p>이 서비스는 운영자 본인의 인스타그램 프로페셔널 계정에 달린 댓글에 자동으로 답장(DM)을 보내기 위한 도구입니다.</p>
<h3>수집하는 정보</h3>
<p>운영자 계정에 달린 댓글의 ID, 작성자 아이디, 댓글 내용, 처리 시각. 자동 답장 여부를 판단하고 중복 발송을 막는 용도로만 사용합니다.</p>
<h3>보관 및 삭제</h3>
<p>정보는 판매하거나 제3자에게 제공하지 않습니다. 삭제를 원하시면 인스타그램 DM으로 요청해 주세요. 요청 후 지체 없이 삭제합니다.</p>
<h3>문의</h3><p>Instagram @everywhere.lucas</p>
</body></html>`;
}

export function dashboardHtml(env) {
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>자동 DM</title>
<style>
:root{
  --blue:#1f4bff; --blue-ink:#1033c9; --neon:#d6ff3a; --bg:#f5f7fb; --card:#fff;
  --ink:#0d1220; --muted:#667085; --line:#e4e8f0; --ok:#12b76a; --bad:#f04438; --warn:#f79009;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#0b0e17; --card:#141927; --ink:#eef1f8; --muted:#98a2b3; --line:#232a3b; --blue:#4d6dff; --blue-ink:#8aa0ff;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;font-size:15px}
.wrap{max-width:880px;margin:0 auto;padding:24px 16px 80px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}
h1{font-size:22px;font-weight:800;margin:0;letter-spacing:-.02em}
h1 span{background:var(--neon);color:#0d1220;padding:0 6px;border-radius:4px}
h2{font-size:16px;font-weight:800;margin:0}
.badge{font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;background:var(--card);border:1px solid var(--line);color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.stat{background:var(--blue);color:#fff;border-radius:14px;padding:14px 16px}
.stat b{display:block;font-size:26px;font-weight:800}
.stat small{opacity:.8}
.stat.alt{background:var(--card);color:var(--ink);border:1px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.btn{border:0;border-radius:10px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer;background:var(--blue);color:#fff;text-decoration:none;display:inline-block}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn.neon{background:var(--neon);color:#0d1220}
.btn.sm{padding:6px 10px;font-size:13px}
.btn.danger{background:transparent;color:var(--bad);border:1px solid var(--line)}
.muted{color:var(--muted);font-size:13px}
.acc{display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--line)}
.acc:first-of-type{border-top:0}
.rule{display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.rule:first-of-type{border-top:0}
.rule>div{min-width:0}
.thumb{width:56px;height:56px;border-radius:10px;object-fit:cover;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);text-align:center}
.chips{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
.chip{background:var(--neon);color:#0d1220;font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px}
.rule .dm{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px}
.switch{position:relative;width:40px;height:24px;flex:none}
.switch input{opacity:0;width:0;height:0}
.switch span{position:absolute;inset:0;background:var(--line);border-radius:99px;cursor:pointer;transition:.15s}
.switch span:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}
.switch input:checked+span{background:var(--blue)}
.switch input:checked+span:before{transform:translateX(16px)}
.log{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line);font-size:14px}
.log:first-of-type{border-top:0}
.st{font-size:11px;font-weight:700;padding:3px 7px;border-radius:6px;color:#fff}
.st.sent{background:var(--ok)}.st.failed{background:var(--bad)}.st.pending{background:var(--warn)}.st.awaiting{background:var(--blue)}
.tag{font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;background:var(--blue);color:#fff}
.toggle-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding:12px 14px;border:1px solid var(--line);border-radius:12px}
.toggle-row b{font-size:14px}
.gate{border-left:3px solid var(--neon);padding-left:12px;margin-top:4px}
.btn-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr) auto;gap:6px;margin-top:6px}
.btn-row input{min-width:0}
.linkbtn{display:inline-block;font-size:12px;font-weight:600;border:1px solid var(--line);border-radius:8px;padding:3px 8px;margin:4px 4px 0 0;color:var(--blue-ink)}
.dm-preview{background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:10px;margin-top:8px;max-width:300px}
.dm-preview .bubble{white-space:pre-wrap;font-size:13px;line-height:1.45}
.dm-preview .pbtn{display:block;text-align:center;font-size:13px;font-weight:600;padding:8px;border-top:1px solid var(--line);margin:8px -10px -2px;color:var(--blue-ink)}
.dm-preview .pbtn+.pbtn{margin-top:0}
.err{color:var(--bad);font-size:12px;margin-top:2px;word-break:break-all}
dialog{border:0;border-radius:18px;padding:0;width:min(560px,calc(100vw - 24px));background:var(--card);color:var(--ink)}
dialog::backdrop{background:rgba(5,10,30,.5)}
form{padding:20px}
label{display:block;font-weight:600;font-size:13px;margin:14px 0 6px}
input[type=text],textarea,select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--bg);color:var(--ink)}
textarea{min-height:84px;resize:vertical}
.seg{display:flex;gap:6px}
.seg label{margin:0;flex:1;text-align:center;border:1px solid var(--line);border-radius:10px;padding:9px;cursor:pointer;font-weight:600}
.seg input{display:none}
.seg input:checked+span{color:var(--blue)}
.seg label:has(input:checked){border-color:var(--blue);background:color-mix(in srgb,var(--blue) 8%,transparent)}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px;max-height:260px;overflow:auto;margin-top:8px}
.media-grid button{padding:0;border:2px solid transparent;border-radius:8px;overflow:hidden;cursor:pointer;aspect-ratio:1;background:var(--bg)}
.media-grid button.on{border-color:var(--blue);box-shadow:0 0 0 2px var(--neon)}
.media-grid img{width:100%;height:100%;object-fit:cover;display:block}
.hint{font-size:12px;color:var(--muted);margin-top:4px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0d1220;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;display:none;z-index:9}
.empty{text-align:center;padding:24px 0;color:var(--muted)}
@media (max-width:560px){
  .stats{grid-template-columns:repeat(3,1fr)}
  .stat b{font-size:20px}
  .rule{grid-template-columns:48px minmax(0,1fr)}
  .rule .thumb{width:48px;height:48px}
  .rule .actions{grid-column:1/-1;justify-content:flex-end}
  .rule .dm{max-width:100%}
  .acc{flex-wrap:wrap}
}
</style></head>
<body><div class="wrap">

<header>
  <h1>댓글 → <span>자동 DM</span></h1>
  <span class="badge" id="mode">…</span>
</header>

<div class="stats">
  <div class="stat"><small>최근 24시간 발송</small><b id="s-today">-</b></div>
  <div class="stat alt"><small>누적 발송</small><b id="s-total">-</b></div>
  <div class="stat alt"><small>24시간 실패</small><b id="s-fail">-</b></div>
</div>

<section class="card">
  <div class="row"><h2>연결된 계정</h2><a class="btn neon sm" href="/auth/login">+ 인스타 계정 연결</a></div>
  <div id="accounts" style="margin-top:8px"></div>
</section>

<section class="card">
  <div class="row"><h2>자동 DM 규칙</h2><button class="btn sm" id="new-rule">+ 새 규칙</button></div>
  <div id="rules" style="margin-top:8px"></div>
</section>

<section class="card">
  <div class="row"><h2>최근 발송 기록</h2>
    <div style="display:flex;gap:6px"><button class="btn ghost sm" id="poll-now">지금 댓글 확인</button><button class="btn ghost sm" id="reload">새로고침</button></div>
  </div>
  <div id="logs" style="margin-top:8px"></div>
</section>

</div>

<dialog id="dlg"><form id="f" method="dialog">
  <div class="row"><h2 id="f-title">새 규칙</h2><button type="button" class="btn ghost sm" id="f-close">닫기</button></div>

  <label>계정</label>
  <select name="ig_user_id" id="f-acc"></select>

  <label>규칙 이름 <span class="muted">(나만 보는 메모)</span></label>
  <input type="text" name="name" placeholder="예: 오사카 숙소 정보">

  <label>어떤 게시물?</label>
  <div class="seg">
    <label><input type="radio" name="scope" value="all" checked><span>모든 게시물</span></label>
    <label><input type="radio" name="scope" value="one"><span>특정 게시물</span></label>
  </div>
  <div id="media-wrap" hidden>
    <div class="media-grid" id="media"></div>
    <div class="hint" id="media-hint">게시물을 불러오는 중…</div>
  </div>

  <label>어떤 댓글에 반응?</label>
  <div class="seg">
    <label><input type="radio" name="match_type" value="contains" checked><span>키워드 포함</span></label>
    <label><input type="radio" name="match_type" value="exact"><span>정확히 일치</span></label>
    <label><input type="radio" name="match_type" value="any"><span>모든 댓글</span></label>
  </div>
  <div id="kw-wrap">
    <label>키워드 <span class="muted">(쉼표로 여러 개)</span></label>
    <input type="text" name="keywords" placeholder="정보, 링크, info">
    <div class="hint">대소문자·띄어쓰기·이모지는 무시해요. "키워드 포함"은 '정보 주세요🙏'도 '정보'로 잡아요.</div>
  </div>
  <div class="hint" id="any-hint" hidden>키워드 없이 댓글을 단 모든 사람에게 보내요. 같은 사람에겐 한 번만 보내요.</div>

  <div class="toggle-row">
    <div><b>팔로우한 사람에게만 보내기</b><div class="hint" style="margin:2px 0 0">먼저 팔로우+답장을 요청하고, 팔로우가 확인되면 아래 DM을 보내요</div></div>
    <label class="switch" style="margin:0"><input type="checkbox" name="follow_required" id="f-follow"><span></span></label>
  </div>
  <div id="gate-fields" class="gate" hidden>
    <label>① 첫 DM <span class="muted">(팔로우 + 답장 요청 · 비우면 기본 문구)</span></label>
    <textarea name="follow_prompt" placeholder="댓글 고마워요! 🙌 팔로우하고 이 메시지에 '완료'라고 답장 주시면 바로 보내드릴게요."></textarea>
    <label>답장했는데 아직 팔로우 안 했을 때 <span class="muted">(비우면 기본 문구 · 최대 3번)</span></label>
    <textarea name="not_following_msg" placeholder="아직 팔로우가 확인되지 않아요 🥲 팔로우하고 다시 답장 주시면 바로 보내드릴게요!"></textarea>
    <div class="hint">답장 내용은 아무거나 괜찮아요. 답장이 오면 1분 안에 팔로우 여부를 확인해요.</div>
  </div>

  <label><span id="dm-label">보낼 DM</span> <span class="muted" id="dm-count">0 / 1000</span></label>
  <textarea name="dm_message" required placeholder="댓글 남겨주셔서 감사해요! 아래 버튼 눌러서 확인해 보세요 👇"></textarea>

  <label>링크 버튼 <span class="muted">(선택 · 최대 3개 · 버튼 이름 20자)</span></label>
  <div id="btns"></div>
  <button type="button" class="btn ghost sm" id="add-btn" style="margin-top:6px">+ 버튼 추가</button>
  <div class="dm-preview" id="dm-preview" hidden><div class="bubble" id="pv-text"></div><div id="pv-btns"></div></div>
  <div class="hint">버튼을 못 보내는 경우엔 자동으로 링크를 글자로 붙여서 보내요.</div>

  <label>공개 답글 <span class="muted">(선택 · 한 줄에 하나, 랜덤으로 달아요)</span></label>
  <textarea name="public_reply" placeholder="DM 보내드렸어요 📩&#10;확인해 보세요! 💌"></textarea>
  <div class="hint">"DM 보냈어요" 답글을 달면 다른 사람도 댓글을 남기는 효과가 있어요.</div>

  <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn" type="submit" id="f-save">저장</button></div>
</form></dialog>

<div class="toast" id="toast"></div>

<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let state = { accounts: [], rules: [], editing: null, media: null, picked: null };

async function call(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ("오류 " + r.status));
  return d;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = "none"), 2600);
}
function ago(sec) {
  const d = Math.floor(Date.now() / 1000) - sec;
  if (d < 60) return "방금"; if (d < 3600) return Math.floor(d / 60) + "분 전";
  if (d < 86400) return Math.floor(d / 3600) + "시간 전"; return Math.floor(d / 86400) + "일 전";
}

async function loadAccounts() {
  const d = await call("/api/accounts");
  state.accounts = d.accounts;
  $("#mode").textContent = d.mode === "webhook" ? "실시간 웹훅" : d.mode === "both" ? "웹훅 + 1분 확인" : "1분마다 확인";
  $("#accounts").innerHTML = d.accounts.length ? d.accounts.map((a) => {
    const days = Math.floor((a.token_expires_at - Date.now() / 1000) / 86400);
    return '<div class="acc"><b>@' + esc(a.username) + '</b><span class="muted" style="flex:1">토큰 ' + days + '일 남음 · 자동 갱신</span>' +
      '<button class="btn danger sm" data-del-acc="' + esc(a.ig_user_id) + '">연결 해제</button></div>';
  }).join("") : '<div class="empty">아직 연결된 계정이 없어요. 위 버튼으로 연결하세요.</div>';
}

async function loadRules() {
  const d = await call("/api/rules");
  state.rules = d.rules;
  $("#rules").innerHTML = d.rules.length ? d.rules.map((r) => {
    const thumb = r.media_id
      ? (r.media_thumb ? '<img class="thumb" src="' + esc(r.media_thumb) + '" alt="">' : '<div class="thumb">게시물</div>')
      : '<div class="thumb">모든<br>게시물</div>';
    const kws = r.match_type === "any" ? '<span class="chip">모든 댓글</span>' : r.keywords.split(/[,\\n]/).map((k) => k.trim()).filter(Boolean)
      .map((k) => '<span class="chip">' + esc(k) + '</span>').join("");
    return '<div class="rule">' + thumb +
      '<div><div class="row" style="justify-content:flex-start;gap:8px"><b>' + esc(r.name || "이름 없는 규칙") + '</b>' +
      (r.follow_required ? '<span class="tag">팔로우 필수</span>' : '') +
      '<span class="muted">@' + esc(r.username || "?") + ' · ' + (r.match_type === "exact" ? "정확히 일치" : r.match_type === "any" ? "모든 댓글" : "포함") + ' · ' + r.sent_count + '건 발송</span></div>' +
      '<div class="chips">' + kws + '</div><div class="dm">💬 ' + esc(r.dm_message) + '</div>' +
      btnList(r.buttons).map((b) => '<span class="linkbtn">🔗 ' + esc(b.title) + '</span>').join("") + '</div>' +
      '<div class="actions row" style="gap:6px;flex-wrap:nowrap">' +
      '<label class="switch" title="켜기/끄기"><input type="checkbox" data-toggle="' + r.id + '"' + (r.active ? " checked" : "") + '><span></span></label>' +
      '<button class="btn ghost sm" data-edit="' + r.id + '">수정</button>' +
      '<button class="btn danger sm" data-del="' + r.id + '">삭제</button></div></div>';
  }).join("") : '<div class="empty">규칙이 없어요. "+ 새 규칙"으로 키워드와 DM을 만들어 보세요.</div>';
}

async function loadLogs() {
  const d = await call("/api/logs");
  $("#s-today").textContent = d.stats?.today || 0;
  $("#s-total").textContent = d.stats?.total || 0;
  $("#s-fail").textContent = d.stats?.failed_today || 0;
  const label = { sent: "발송", failed: "실패", pending: "처리중", awaiting: "팔로우 대기" };
  $("#logs").innerHTML = d.logs.length ? d.logs.map((l) =>
    '<div class="log"><span class="st ' + esc(l.status) + '">' + (label[l.status] || esc(l.status)) + '</span>' +
    '<div><b>@' + esc(l.commenter_username) + '</b> <span class="muted">"' + esc(l.comment_text) + '"</span>' +
    '<div class="muted">' + esc(l.rule_name || "삭제된 규칙") + ' · ' + (l.source === "webhook" ? "웹훅" : "1분 확인") + '</div>' +
    (l.error ? '<div class="err">' + esc(l.error) + '</div>' : "") + '</div>' +
    '<span class="muted">' + ago(l.created_at) + '</span></div>'
  ).join("") : '<div class="empty">아직 기록이 없어요.</div>';
}

async function refresh() {
  try { await Promise.all([loadAccounts(), loadRules(), loadLogs()]); }
  catch (e) { toast(e.message); }
}

function btnList(raw) {
  if (Array.isArray(raw)) return raw;
  try { const a = JSON.parse(raw || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}

// ---- 링크 버튼 입력 ----
function btnRow(b = {}) {
  const row = document.createElement("div");
  row.className = "btn-row";
  row.innerHTML = '<input type="text" class="b-title" maxlength="20" placeholder="버튼 이름 (예: 숙소 보기)">' +
    '<input type="text" class="b-url" placeholder="https://...">' +
    '<button type="button" class="btn danger sm b-del">삭제</button>';
  row.querySelector(".b-title").value = b.title || "";
  row.querySelector(".b-url").value = b.url || "";
  $("#btns").appendChild(row);
  syncBtns();
}
function readBtns() {
  return [...document.querySelectorAll("#btns .btn-row")].map((r) => ({
    title: r.querySelector(".b-title").value.trim(), url: r.querySelector(".b-url").value.trim(),
  })).filter((b) => b.title || b.url);
}
function syncBtns() {
  const n = document.querySelectorAll("#btns .btn-row").length;
  $("#add-btn").hidden = n >= 3;
  const list = readBtns();
  const max = list.length ? 640 : 1000;
  $("#dm-count").textContent = f.dm_message.value.length + " / " + max;
  $("#dm-preview").hidden = !list.length;
  $("#pv-text").textContent = f.dm_message.value || "DM 내용";
  $("#pv-btns").innerHTML = list.map((b) => '<span class="pbtn">' + esc(b.title || "버튼") + '</span>').join("");
}
$("#add-btn").onclick = () => btnRow();
$("#btns").addEventListener("click", (e) => { if (e.target.classList.contains("b-del")) { e.target.closest(".btn-row").remove(); syncBtns(); } });
$("#btns").addEventListener("input", syncBtns);

// ---- 규칙 폼 ----
const f = $("#f"), dlg = $("#dlg");
function openForm(rule) {
  if (!state.accounts.length) return toast("먼저 인스타 계정을 연결하세요");
  state.editing = rule || null;
  state.picked = rule && rule.media_id ? { id: rule.media_id, permalink: rule.media_permalink, thumb: rule.media_thumb } : null;
  f.reset();
  $("#f-title").textContent = rule ? "규칙 수정" : "새 규칙";
  $("#f-acc").innerHTML = state.accounts.map((a) => '<option value="' + esc(a.ig_user_id) + '">@' + esc(a.username) + '</option>').join("");
  if (rule) {
    f.ig_user_id.value = rule.ig_user_id; f.name.value = rule.name || ""; f.keywords.value = rule.keywords === "*" ? "" : rule.keywords;
    f.dm_message.value = rule.dm_message; f.public_reply.value = rule.public_reply || "";
    f.querySelector('[name=match_type][value=' + rule.match_type + ']').checked = true;
    f.follow_required.checked = !!rule.follow_required;
    f.follow_prompt.value = rule.follow_prompt || ""; f.not_following_msg.value = rule.not_following_msg || "";
    f.querySelector('[name=scope][value=' + (rule.media_id ? "one" : "all") + ']').checked = true;
  }
  $("#dm-count").textContent = f.dm_message.value.length + " / 1000";
  $("#btns").innerHTML = "";
  btnList(rule && rule.buttons).forEach((b) => btnRow(b));
  syncBtns(); syncFollow(); syncMatch(); state.media = null; syncScope();
  dlg.showModal();
}
async function syncScope() {
  const one = f.scope.value === "one";
  $("#media-wrap").hidden = !one;
  if (!one) return;
  if (!state.media) {
    $("#media").innerHTML = ""; $("#media-hint").textContent = "게시물을 불러오는 중…";
    try { state.media = (await call("/api/media?account=" + encodeURIComponent(f.ig_user_id.value))).media; }
    catch (e) { $("#media-hint").textContent = "불러오기 실패: " + e.message; return; }
  }
  $("#media").innerHTML = state.media.map((m) => {
    const src = m.thumbnail_url || m.media_url || "";
    return '<button type="button" data-media="' + esc(m.id) + '" class="' + (state.picked?.id === m.id ? "on" : "") + '" title="' + esc((m.caption || "").slice(0, 80)) + '">' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy">' : "") + '</button>';
  }).join("");
  $("#media-hint").textContent = state.picked ? "선택됨 ✓" : "DM을 걸 게시물을 고르세요 (최근 24개)";
}

function syncMatch() {
  const any = f.match_type.value === "any";
  $("#kw-wrap").hidden = any; $("#any-hint").hidden = !any;
}
function syncFollow() {
  const on = f.follow_required.checked;
  $("#gate-fields").hidden = !on;
  $("#dm-label").textContent = on ? "② 팔로우 확인 후 보낼 DM" : "보낼 DM";
}
f.addEventListener("change", (e) => {
  if (e.target.name === "follow_required") syncFollow();
  if (e.target.name === "match_type") syncMatch();
  if (e.target.name === "scope") syncScope();
  if (e.target.name === "ig_user_id") { state.media = null; state.picked = null; syncScope(); }
});
f.dm_message.addEventListener("input", syncBtns);
$("#media").addEventListener("click", (e) => {
  const b = e.target.closest("[data-media]"); if (!b) return;
  const m = state.media.find((x) => x.id === b.dataset.media);
  state.picked = { id: m.id, permalink: m.permalink, thumb: m.thumbnail_url || m.media_url };
  syncScope();
});
$("#f-close").onclick = () => dlg.close();
f.addEventListener("submit", async (e) => {
  e.preventDefault();
  const one = f.scope.value === "one";
  if (one && !state.picked) return toast("게시물을 선택하세요");
  if (f.match_type.value !== "any" && !f.keywords.value.trim()) return toast("키워드를 입력하세요");
  const body = {
    ig_user_id: f.ig_user_id.value, name: f.name.value, keywords: f.keywords.value,
    match_type: f.match_type.value, dm_message: f.dm_message.value, public_reply: f.public_reply.value,
    buttons: readBtns(),
    follow_required: f.follow_required.checked, follow_prompt: f.follow_prompt.value, not_following_msg: f.not_following_msg.value,
    media_id: one ? state.picked.id : null, media_permalink: one ? state.picked.permalink : null,
    media_thumb: one ? state.picked.thumb : null, active: state.editing ? !!state.editing.active : true,
  };
  try {
    if (state.editing) await call("/api/rules/" + state.editing.id, { method: "PUT", body: JSON.stringify(body) });
    else await call("/api/rules", { method: "POST", body: JSON.stringify(body) });
    dlg.close(); toast(state.editing ? "수정했어요" : "규칙을 만들었어요. 지금부터 달리는 댓글에 반응해요"); loadRules();
  } catch (err) { toast(err.message); }
});

// ---- 목록 버튼들 ----
document.addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.dataset.edit) openForm(state.rules.find((r) => r.id == t.dataset.edit));
    if (t.dataset.del && confirm("이 규칙을 삭제할까요?")) { await call("/api/rules/" + t.dataset.del, { method: "DELETE" }); loadRules(); }
    if (t.dataset.delAcc && confirm("계정 연결을 해제할까요? 이 계정의 규칙도 함께 삭제돼요.")) {
      await call("/api/accounts/" + t.dataset.delAcc, { method: "DELETE" }); refresh();
    }
  } catch (err) { toast(err.message); }
});
document.addEventListener("change", async (e) => {
  if (!e.target.dataset.toggle) return;
  try { await call("/api/rules/" + e.target.dataset.toggle, { method: "PATCH", body: JSON.stringify({ active: e.target.checked }) }); toast(e.target.checked ? "켰어요" : "껐어요"); }
  catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
});
$("#new-rule").onclick = () => openForm();
$("#reload").onclick = refresh;
$("#poll-now").onclick = async () => {
  const b = $("#poll-now"); b.disabled = true; b.textContent = "확인 중…";
  try {
    const d = await call("/api/poll", { method: "POST" });
    const sent = d.result.reduce((n, r) => n + (r.sent || 0), 0);
    const unlocked = (d.replies || []).reduce((n, r) => n + (r.unlocked || 0), 0);
    const errs = d.result.concat(d.replies || []).filter((r) => r.error).map((r) => r.error);
    toast(errs.length ? "오류: " + errs[0] : "확인 완료 · 새 DM " + sent + "건" + (unlocked ? " · 팔로우 확인 후 발송 " + unlocked + "건" : ""));
    loadLogs();
  } catch (err) { toast(err.message); }
  b.disabled = false; b.textContent = "지금 댓글 확인";
};

const qs = new URLSearchParams(location.search);
if (qs.get("connected")) { toast("@" + qs.get("connected") + " 연결 완료" + (qs.get("webhook") ? " (웹훅 구독은 실패 — 1분 확인 모드로 동작)" : "")); history.replaceState(null, "", "/"); }
refresh();
setInterval(loadLogs, 30000);
</script>
</body></html>`;
}
