# 댓글 → 자동 DM (insta-autodm)

인스타 게시물에 정해둔 키워드(예: `정보`)로 댓글이 달리면, 그 사람에게 자동으로 DM을 보내는 사이트입니다.
Cloudflare Workers + D1(무료 범위)에서 돌아갑니다.

- 키워드 여러 개, "포함" / "정확히 일치" 선택 (대소문자·띄어쓰기·이모지 무시)
- 모든 게시물 또는 특정 게시물만 지정
- 선택: "DM 보내드렸어요 📩" 같은 공개 답글 자동 달기 (여러 문구 중 랜덤)
- 같은 댓글에 두 번 보내지 않음, 내 답글엔 반응 안 함
- 발송/실패 기록, 60일 토큰 자동 갱신
- 여러 계정 연결 가능 (루카스 여행 + 먹눈사람 같이)

---

## 꼭 알아둘 것 — 어떻게 댓글을 감지하나

인스타가 "새 댓글이 달렸다"고 실시간으로 알려주는 기능(웹훅)은 **내 계정만 쓰더라도 Meta 앱 심사(Advanced Access)를 통과해야** 동작합니다.

그래서 이 사이트는 기본값으로 **1분마다 댓글을 직접 확인(폴링)** 합니다. 심사 없이 바로 쓸 수 있고, DM은 댓글 후 최대 1분 안에 나갑니다.
나중에 심사를 통과하면 `wrangler.toml`의 `MODE`를 `"both"`로 바꾸면 실시간으로 동작합니다.

인스타 규칙상 제한:
- 댓글 1개당 DM은 **1번**만, 댓글 단 지 **7일 이내**만 보낼 수 있음
- 받는 사람이 답장하기 전엔 추가 DM 불가
- 내 계정은 **프로페셔널 계정(비즈니스/크리에이터)** 이고 **공개** 상태여야 함
- "모든 게시물" 규칙은 최근 게시물 10개를 확인합니다

---

## 설치 순서 (PowerShell 기준, 약 30분)

### 0. 준비
- Node.js 설치되어 있어야 함 (`node -v`로 확인)
- 이 폴더에서:
```powershell
npm install
npx wrangler login
```

### 1. 데이터베이스 만들기
```powershell
npx wrangler d1 create insta-autodm
```
출력된 `database_id` 를 `wrangler.toml`의 `database_id = "..."` 에 붙여넣고:
```powershell
npm run db:init
```

### 2. 먼저 한 번 배포해서 주소 받기
```powershell
npx wrangler deploy
```
출력된 주소(예: `https://insta-autodm.xxxx.workers.dev`)를 `wrangler.toml`의 `BASE_URL`에 넣어두세요. (끝에 `/` 없이)

### 3. 비밀번호·토큰 등록
```powershell
npx wrangler secret put ADMIN_PASSWORD        # 대시보드 로그인 비밀번호 (아무거나 길게)
npx wrangler secret put WEBHOOK_VERIFY_TOKEN  # 아무 문자열 (나중에 웹훅용)
```
`IG_APP_SECRET`은 4단계에서 받은 뒤 등록합니다.

### 4. Meta 개발자 앱 만들기
1. https://developers.facebook.com/apps → **앱 만들기**
2. 사용 사례: **"Instagram에서 메시지 및 콘텐츠 관리"** 선택 → 앱 이름 입력 → 만들기
3. 왼쪽 메뉴 **Instagram → API setup with Instagram login** 들어가기
4. 화면 상단의 **Instagram app ID** 와 **Instagram app secret** 확인
   - app ID → `wrangler.toml`의 `IG_APP_ID`
   - app secret → 아래 명령으로 등록
   ```powershell
   npx wrangler secret put IG_APP_SECRET
   ```
   ⚠️ 메타 앱 ID(앱 대시보드 맨 위 숫자)가 아니라 **Instagram app ID**입니다.
5. 같은 화면 **"3. Set up Instagram business login"** → **Business login settings**
   - OAuth redirect URIs: `https://(내 주소)/auth/callback`
6. **앱 역할 → 역할 → Instagram 테스터** 에 `everywhere.lucas`(+ 먹눈사람 계정) 추가
   → 인스타 앱/웹 **설정 → 웹사이트 권한 → 앱 및 웹사이트 → 테스터 초대** 에서 수락
7. **앱 설정 → 기본 설정**
   - 개인정보처리방침 URL: `https://(내 주소)/privacy`
   - 카테고리, 아이콘 입력 후 상단 스위치를 **라이브(Live)** 로 전환
8. 인스타 앱에서 **설정 → 메시지 및 스토리 답장 → 메시지 컨트롤 → 연결된 도구 → 메시지 액세스 허용** 켜기

### 5. 다시 배포
```powershell
npx wrangler deploy
```

### 6. 사용
1. `https://(내 주소)` 접속 → 아이디는 아무거나, 비밀번호는 ADMIN_PASSWORD
2. **+ 인스타 계정 연결** → 인스타 로그인·권한 허용
3. **+ 새 규칙** → 키워드와 DM 내용 입력 → 저장
4. 다른 계정으로 그 게시물에 키워드 댓글 → 1분 안에 DM 확인
   (바로 확인하려면 **지금 댓글 확인** 버튼)

> 테스트는 반드시 **내 계정이 아닌 다른 계정**으로 댓글을 달아야 합니다. 내 계정 댓글엔 일부러 반응하지 않아요.

---

## 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| 계정 연결 시 "Invalid redirect_uri" | 4-5단계 리디렉션 URL이 `BASE_URL/auth/callback`과 글자 하나까지 같은지 |
| 연결은 되는데 DM이 "실패" | 4-8단계 "메시지 액세스 허용", 댓글이 7일 이내인지, 그 댓글에 이미 DM 보냈는지 |
| 아무 기록도 안 생김 | 규칙이 켜져 있는지, 규칙을 **만든 이후**에 달린 댓글인지 (예전 댓글엔 반응 안 함) |
| 실패 메시지 확인 | 대시보드 "최근 발송 기록"에 빨간 글씨로 인스타 오류가 그대로 표시됨 |
| 서버 로그 | `npx wrangler tail` |

## 실시간(웹훅)으로 바꾸려면 — 선택

1. Meta 앱에서 `instagram_business_manage_comments`, `instagram_business_manage_messages` **Advanced Access** 앱 심사 신청 (화면 녹화 필요)
2. 승인 후 Instagram → Webhooks 설정
   - Callback URL: `https://(내 주소)/webhook`
   - Verify token: `WEBHOOK_VERIFY_TOKEN`에 넣은 값
   - `comments` 필드 구독
3. `wrangler.toml`에서 `MODE = "both"` → 배포 → 대시보드에서 계정 다시 연결

## 개발용

```powershell
npm test     # 키워드 매칭·중복 방지·웹훅 서명 테스트 12개
```

## 파일 구성
```
src/index.js      라우팅, 로그인, 계정 연결, 대시보드 API
src/engine.js     댓글 처리 (폴링/웹훅 공통), 토큰 갱신
src/match.js      키워드 매칭 규칙
src/instagram.js  인스타 API 호출
src/pages.js      대시보드 화면, 개인정보처리방침
schema.sql        DB 테이블
```
