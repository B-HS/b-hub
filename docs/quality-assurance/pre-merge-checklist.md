# 머지 전 체크리스트 (Pre-merge Checklist)

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `package.json`, `prettier.config.cjs`, `node_modules/feconfig-bhs/prettier.config.js`, `tsconfig.json`, `drizzle.config.ts`, `.gitignore`, `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts`, `lib/api-response.ts`, `lib/env.ts`, `compose/blog.ts`, `service/domain/spotify/spotify-widget.ts`, `index.ts`

## 개요

- 브랜치를 `dev`(기본 브랜치)에 머지/PR 하기 직전, 아래 9개 항목을 순서대로 통과시킨다.
- 이 문서는 **검증 절차·명령·통과 기준만** 소유한다. 규칙의 정의는 소유 문서로 링크한다: 스택·불변 규칙 [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md), 계층 경계·에러/응답 헬퍼 [../architecture.md](../architecture.md), 테스트 작성·실행 [../testing.md](../testing.md), 문서 갱신 트리거 [../guidelines/docs-maintenance.md](../guidelines/docs-maintenance.md), DB 변경 [../guidelines/db-schema-change.md](../guidelines/db-schema-change.md).
- 검증 명령은 전부 **Bun** 으로만 실행한다(npm/node 우회 금지).

---

## 0. 빠른 실행 (순서대로)

```
bunx tsc --noEmit                       # 1. 타입: 0 errors
bun test                                # 2. 테스트: 0 fail
git diff --name-only --diff-filter=d origin/dev...HEAD | grep -E '\.tsx?$' | xargs bunx prettier --check   # 3. 포맷: 0 warning
```

- `tsc`·`drizzle-kit` 은 `node_modules/.bin` 에 있다. **`prettier` 는 로컬 미설치**(`node_modules/prettier` 없음) → `bunx prettier` 로 실행하면 Bun 이 받아 돈다.
- `origin/dev...HEAD` 는 머지 대상 기준. 로컬만이면 `HEAD` 를 커밋 범위로 바꿔 쓴다.

---

## 1. 타입체크

- [ ] `bunx tsc --noEmit` 이 **0 errors** 로 끝난다.

| 항목 | 값 |
|------|-----|
| 명령 | `bunx tsc --noEmit` (= `bun run typecheck`) |
| 통과 기준 | 출력 없음, exit code 0 |

- 새 코드는 반환 타입 미명시(추론)·유틸리티 타입 유도로 통과해야 한다. `tsconfig.json` 은 strict.

---

## 2. 전체 테스트

- [ ] `bun test` 가 **0 fail** 이다.
- [ ] 신규/변경한 코드에 **대응 테스트를 추가**했다(위치·필수 케이스: [../testing.md](../testing.md) §6).

| 항목 | 값 |
|------|-----|
| 명령 | `bun test` (부분: `bun test <경로>`) |
| 통과 기준 | fail 0, exit code 0 |
| 베이스라인 | 182 파일 / pass 2268 / fail 0 ([../testing.md](../testing.md) §3) |

- 콘솔의 `[mail] attachment download failed`·`Gmail API error 500` 등은 에러 경로를 의도적으로 트리거하는 케이스의 SUT 로그이며 **실패가 아니다**(해당 테스트는 통과).
- `tests/` 는 소스 트리를 미러한다. dto→`tests/dto/`, service→`tests/service/`, route→`tests/route/`, 어드민 페이지→`tests/page/`, 미들웨어→`tests/middleware/`, lib/HOF→`tests/lib/`.

---

## 3. 포맷 (prettier)

- [ ] 변경한 `.ts`/`.tsx` 가 prettier `--check` 를 통과한다.

| 항목 | 값 |
|------|-----|
| 명령(검사) | `bunx prettier --check <변경 파일>` |
| 명령(자동수정) | `bunx prettier --write <변경 파일>` |
| 설정 | `prettier.config.cjs` → `feconfig-bhs/prettier.config.js` (자동 해석) |

- 핵심 설정: printWidth 150 · tabWidth 4(스페이스) · `semi: false` · `singleQuote`/`jsxSingleQuote: true` · `trailingComma: 'all'` · `arrowParens: 'always'` · `bracketSameLine: true` · `endOfLine: 'lf'`.
- `.prettierignore` 가 없다. prettier 3 은 기본으로 `.gitignore` 도 무시 목록으로 읽으므로 `api/`·`dist/`(gitignore 대상)는 제외되지만, `--check .` 은 diff 와 무관한 파일·모든 파일 유형(`.md`·`.json` 등)까지 검사한다. **변경 파일로 범위를 좁혀** 검사한다.

---

## 4. 컨벤션

정의 정본은 [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md) 와 `~/.claude/convention/*`. 아래는 diff 기준 점검 항목이다.

- [ ] **arrow function only** — `function` 키워드 없음. (예외: `service/domain/spotify/spotify-widget.ts` 의 임베드 브라우저 JS 문자열)
- [ ] **코드 주석 금지** — `//`·`/* */`·`{/* */}` 없음. JSDoc `/** */`(영어)만 예외.
- [ ] **`any` 금지 / 근거 없는 `unknown` 금지** — 타입 회피용 캐스팅 없음. (`Record<string, unknown>`·`z.unknown()` 는 에러 details·JSON 페이로드용 기존 관례라 허용)
- [ ] **named export** — default export 는 Bun 진입점 `index.ts`(`{ port, fetch }`)와 drizzle-kit 설정 `drizzle.config.ts`(`defineConfig`) 뿐(`deploy/upload-server/` 는 자체 `package.json` 을 가진 별도 서비스라 제외).
- [ ] **에러 3파일** — 새 에러코드는 `lib/error-code.ts`·`lib/error-message.ts`·`lib/error.ts` **세 곳 모두**에 추가하고 `throw createAppError('CODE')` 로만 던진다.
- [ ] **응답 헬퍼** — 클라이언트 응답은 `successResponse`/`paginatedResponse`/`errorResponse`(`lib/api-response.ts`)로만. `c.json` 에 임의 봉투 직접 작성 금지.
- [ ] **ServiceDb 경계** — 새 도메인 서비스의 Drizzle 쿼리는 `compose/` 의 ServiceDb 인라인 구현에 둔다. `service/` 는 HTTP·Drizzle 를 모른다(경계 정의: [../architecture.md](../architecture.md)).

| 확인 방법 | 명령 |
|-----------|------|
| `any` 캐스팅(0 이어야 함) | `git diff origin/dev...HEAD -- '*.ts' \| grep -nE '^\+.*(: any\b\|as any\b\|<any>)'` |
| 코드 주석 유입 | diff 의 `+` 라인에서 `//`·`/*` 육안 확인(JSDoc `/**` 제외) |
| default export 유입 | `git diff origin/dev...HEAD -- '*.ts' \| grep -nE '^\+.*export default'` (있으면 `index.ts`·`drizzle.config.ts`·`deploy/` 외엔 위반) |

- `new Error` 는 provider/compose 어댑터 내부 에러(mail·weather·spotify·config 가드)에서 쓰이고 상위 Route 에서 `createAppError` 로 변환된다. **클라이언트에 나가는 Route 경로 에러**만 `createAppError` 여야 한다.

---

## 5. DB 변경

- [ ] `db/schema.ts` 를 바꿨다면 `bun run db:push` 로 실 DB 에 반영을 **완료**했다.

| 항목 | 값 |
|------|-----|
| 변경 감지 | `git diff --name-only origin/dev...HEAD \| grep '^db/schema.ts'` |
| 반영 명령 | `bun run db:push` (= `drizzle-kit push`) |
| 사전 확인(선택) | `bun run db:generate` 로 DDL 미리보기(로컬 확인용) |

- **마이그레이션 파일 없음.** `drizzle/` 산출물은 gitignored → 커밋 대상이 아니다. 절차 정본: [../guidelines/db-schema-change.md](../guidelines/db-schema-change.md).

---

## 6. 시크릿 미노출

- [ ] diff 에 API 키·토큰·비밀번호·DB 접속정보가 없다.
- [ ] `.env*` 파일이 스테이징되지 않았다(`.gitignore` 로 차단됨: `.env`, `.env.local`, `.env.*.local`, `.env.vercel`, `.env.vercel.*`, `.env.backup`).
- [ ] 환경변수는 `getEnv()`(`lib/env.ts`)로만 접근하고, 값을 코드·문서·로그에 하드코딩하지 않았다.

| 확인 방법 | 명령 |
|-----------|------|
| 스테이징된 env 파일 | `git diff --cached --name-only \| grep -E '^\.env'` (결과 없어야 함) |
| diff 내 키/토큰 흔적 | `git diff origin/dev...HEAD \| grep -inE '(secret\|token\|api[_-]?key\|password)\s*[:=]'` 육안 검토 |

- `errorResponse` 는 `NODE_ENV !== 'production'` 일 때만 `details` 를 직렬화한다(`lib/api-response.ts`) — 프로덕션 응답에 내부 정보가 새지 않는지 확인.

---

## 7. 문서 갱신

- [ ] 코드 변경을 [../guidelines/docs-maintenance.md](../guidelines/docs-maintenance.md) 의 **트리거 표**와 대조해 대응 문서를 갱신했다.

- 스키마·엔드포인트·env·lib·shared 전수 레퍼런스는 [../reference/](../reference/), 도메인별은 [../domains/](../domains/), 계층·부트스트랩은 [../architecture.md](../architecture.md) 가 소유한다. 트리거에 걸리면 해당 문서를 함께 수정한다.

---

## 8. PROCESS.md 갱신

- [ ] `docs/PROCESS.md` 의 해당 작업 체크박스를 진행 상태에 맞게 갱신했다.

- 세션·에이전트가 바뀌어도 작업 상태가 이어지도록 완료 항목을 체크 처리한다.

---

## 9. 커밋 규칙

- [ ] **사용자 요청 전에는 commit/push 하지 않았다.**
- [ ] 커밋 메시지가 Conventional Commits 형식이다 — `type(scope): 설명` (type 영어·소문자, 설명 한국어).
- [ ] author 가 사용자 단독이고 `Co-Authored-By`/`Claude` 트레일러가 없다.

| 확인 방법 | 명령 |
|-----------|------|
| 트레일러 검증(비어 있어야 함) | `git log -1 --format='%B' \| grep -i 'co-author\|claude'` |
| author 확인 | `git log -1 --format='%an <%ae>'` |

- type 목록: `feat`·`fix`·`docs`·`style`·`refactor`·`perf`·`test`·`build`·`ci`·`chore`·`revert`. 호환성 깨짐은 `type!:` 또는 `BREAKING CHANGE:` 푸터.

---

## 관련 문서

- 스택·불변 규칙: [../memory/stack-and-invariants.md](../memory/stack-and-invariants.md)
- 계층 경계·에러/응답 헬퍼: [../architecture.md](../architecture.md)
- 테스트 실행·작성: [../testing.md](../testing.md)
- 문서 갱신 트리거: [../guidelines/docs-maintenance.md](../guidelines/docs-maintenance.md)
- DB 스키마 변경 절차: [../guidelines/db-schema-change.md](../guidelines/db-schema-change.md)
