# FE 소비자 영향 검수 매뉴얼 — 2026-07 deps 업그레이드 (zod 4 · hono-openapi 1)

> 기준: 2026-07-02, 브랜치 `chore/deps-update`(커밋 `c3adc1f`·`b04e93f`·`5887a60`). 서버 변경 상세는 [../history/2026-07-deps-upgrade.md](../history/2026-07-deps-upgrade.md).
> **대상**: b-hub API(`api.gumyo.net`)를 호출하는 모든 FE 프로젝트. 프로젝트마다 아래 체크리스트를 1회씩 수행한다.

## 요약 — 무엇이 바뀌었나

FE 에 보일 수 있는 변화는 사실상 **①(400 검증 실패 바디 구조) 하나**다. ②③은 부수 확인.

| #   | 변화                                                                                                                                           | 원인                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| ①   | **검증 실패(400) 응답 바디 구조 변경** — `error` 가 객체(`{issues, name}`)에서 **issue 배열** 로                                               | hono-openapi 1 이 validator 를 `@hono/zod-validator` → `@hono/standard-validator` 로 교체 |
| ②   | 400 issue 의 **message 문구** 가 zod 4 문구로 변경 (예: `Number must be less than or equal to 4096` → `Too big: expected number to be <=4096`) | zod 3 → 4                                                                                 |
| ③   | 이메일 필드(`z.email()`)가 v3 보다 **약간 엄격**                                                                                               | zod 3 → 4                                                                                 |

### 400 바디 구/신 대조 (실측)

구 (@hono/zod-validator — `c.json(safeParse결과, 400)`, 소스 확인):

```json
{
    "success": false,
    "error": {
        "issues": [
            {
                "code": "too_big",
                "maximum": 4096,
                "type": "number",
                "inclusive": true,
                "message": "Number must be less than or equal to 4096",
                "path": ["width"]
            }
        ],
        "name": "ZodError"
    }
}
```

신 (@hono/standard-validator — 업그레이드 후 실서버 응답):

```json
{
    "data": { "width": "99999" },
    "error": [
        {
            "origin": "number",
            "code": "too_big",
            "maximum": 4096,
            "inclusive": true,
            "path": ["width"],
            "message": "Too big: expected number to be <=4096"
        }
    ],
    "success": false
}
```

차이 요점: `error.issues[...]` → `error[...]` (배열 직접), `error.name` 삭제, `data` 에 보낸 입력 에코, issue 에 `origin` 추가·`type`/`exact` 삭제, message 문구 변경.

## 검수 불필요 (서버측 보장 — 다시 볼 필요 없음)

- 엔드포인트 경로·메서드, 성공 응답 봉투(`successResponse`/`paginatedResponse`) — 무변경.
- 핸들러가 던지는 도메인 에러(401/403/404, `VALIDATION_ERROR` throw 등)의 봉투 `{ success: false, error: { code, message } }` 와 에러코드·상태 매핑 — 무변경. **바뀐 것은 validator 미들웨어가 직접 응답하는 400 뿐이다.**
- 인증(세션 쿠키·OAuth 흐름), DB 스키마 — 무변경. 2268 테스트 + 실서버 스모크로 확인됨.
- badge 등 이미지 URL 소비(`<img>`) — 바디 파싱이 없으므로 무관.

## 체크리스트 (FE 프로젝트당 1회)

### 1. 400 바디 내부 구조 파싱 여부 (핵심)

```bash
rg -n "error\.issues|\.issues\[|ZodError" src/
rg -n -A5 "status ?===? ?400|!res\.ok|!response\.ok" src/
```

(grep 이면 `grep -rEn "..." src/`.) 첫 명령이 히트 0 이고, 둘째 명령의 400 분기들이 status 만 쓰거나 공통 에러 처리만 하면 → **PASS**. `error.issues`·`error.name` 접근 발견 → **수정 필요**(아래 대응).

### 2. v3 에러 문구 의존

```bash
rg -n "Number must be|String must contain|Invalid email|Expected .* received" src/ tests/
```

서버 400 메시지를 그대로 매칭/스냅샷하는 테스트·토스트를 찾는다. 히트 0 → PASS. 발견 → 문구 갱신 또는 `code`/`path` 기반 매칭으로 전환.

### 3. 이메일 입력 필드

b-hub mail API 로 이메일을 보내는 화면(메일 계정 등록 `provider/email`, 발송 `to/cc/bcc`)이 있는 FE 만 해당. FE 자체 검증이 없거나 서버보다 느슨하면 비정형 주소 입력 시 400 이 뜰 수 있다. 일반적인 실주소는 v4 기본 정규식을 통과하므로 대부분 PASS.

### 4. OpenAPI 코드젠 사용 여부

```bash
rg -n "openapi|swagger" package.json
```

`/docs` 스펙으로 타입/클라이언트를 생성하는 FE 가 있으면: 스펙이 OpenAPI 3.0.3 → **3.1.0** 으로 변경됨. 재생성 후 diff 확인.

복사용:

```
- [ ] 1. 400 바디 파싱 여부 (error.issues / error.name / ZodError 접근 없음)
- [ ] 2. 서버 400 문구 매칭 없음 (토스트·스냅샷)
- [ ] 3. (mail 화면 있는 FE만) 이메일 필드 자체 검증 확인
- [ ] 4. (코드젠 FE만) OpenAPI 3.1.0 재생성
```

## 수정이 필요할 때의 대응

- `error.issues[0].message` → `error[0].message` (error 가 배열). `error.name === 'ZodError'` 분기는 삭제하고 `Array.isArray(error)` 또는 status 기반으로.
- 구/신을 모두 받아야 하는 과도기면: `const issues = Array.isArray(body.error) ? body.error : (body.error?.issues ?? [])`.
- 필드별 매핑은 `message` 문구가 아니라 `path`(필드 경로)·`code`(`too_big`/`invalid_type` 등) 기준으로 매칭하면 zod 버전과 무관해진다.
