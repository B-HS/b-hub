# 2026-09-06 — 전수 감사 후속 수정의 전제: 소비자 레포 전체 참조 + 동작 100% 보장

## 결정

1. b-hub 내부 수정(버그·최적화)은 **모든 소비자 프로젝트를 로컬에서 참조 가능한 상태**에서 진행한다. 요청/응답 계약은 그대로 유지하고, 현재 돌아가는 소비자 동작이 100% 보장되어야 한다.
2. 로컬에 없던 소비자 레포 11개를 `~/development/` 에 클론했다(사용자 승인, 전부 클론안 선택).
3. 수정 전에 소비자별 **계약 인벤토리**(엔드포인트·헤더·요청/응답 필드·에러 코드·SSE·타이밍 가정)를 문서로 고정하고, 그 문서 대조를 통과한 변경만 적용한다.

## 소비자 레포 지도 (`~/development/` 기준)

| 폴더 | GitHub | 브랜치 | 소비 도메인 | 비고 |
|------|--------|--------|-------------|------|
| bblog | B-HS/BBlog | dev | blog | 기존 로컬 |
| RESUME | B-HS/RESUME | dev | resume | 기존 로컬 |
| mail | B-HS/mail | vercel | mail, ai | 신규 클론 |
| Calendar | B-HS/Calendar | vercel | calendar, mail, ai | 신규 클론 |
| Storage | B-HS/Storage | vercel | drive, upload-server | 신규 클론 |
| weather | B-HS/weather | vercel | weather | 신규 클론 |
| dashboard | B-HS/dashboard | dev | metrics | docs 의 `~/machboard` 실체. Rust + Tauri |
| ESP32-Weather-API | B-HS/ESP32-Weather-API | dev | weather | C++ 펌웨어(신) |
| ESP32-weather | B-HS/ESP32-weather | main | weather, logs | C++ 펌웨어(구), X-Device-Key |
| Rirekisyo | B-HS/Rirekisyo | dev | resume, ai(추정) | 실소비 여부 확인 중 |
| hn-alert | B-HS/hn-alert | dev | 미확인 | api.gumyo.net 참조, 실소비 여부 확인 중 |
| Banga | B-HS/Banga | vercel | auth(추정) | better-auth 세션 공유 추정, 확인 중 |
| nextjs-portfolio | B-HS/nextjs-portfolio | dev | weather(문서) | 실소비 여부 확인 중 |

- 소비자가 아닌 것으로 판정: message-container·corekeeper(자체 `/api/logs`), TAIDE·llm-rules(문서 언급), testing-page(정적 HTML), BWeather·Badge·Image-Bucket·simple-proxy·bcalendar-private(이전 세대).
- 미확인: spotify 위젯 토큰·X-Spotify-Key 소비처, badge 소비처. 코드 검색에 걸린 외부 레포 없음. 사용자 확인 필요.

## 적용 규칙

- 소비자 계약 인벤토리 정본: [../reference/consumer-contracts.md](../reference/consumer-contracts.md) (작성 중). 엔드포인트를 바꾸는 모든 변경은 이 문서의 해당 행을 먼저 대조한다.
- 오류 상태 코드가 바뀌는 수정(예: 500 → 409)은 계약 변경으로 간주해 소비자 코드에서 해당 코드를 읽는지 확인한 뒤 사용자에게 개별 승인을 받는다.
- 펌웨어(ESP32)와 데스크톱(dashboard)은 배포된 바이너리를 갱신하기 어려우므로 요청/응답 필드·타입·크기 상한을 가장 엄격하게 고정한다.

## 2026-09-06 사용자 결정 (d 단계)

- 상태 코드 변경 A-1(메일 계정 중복 409)·A-2(drive 해시 중복 409)·A-3(Spotify 500 → 502/404)·A-4(Spotify `isActive` 집행): **적용**. 단 "기존 동작이 완벽하게 보장되어야 한다" 는 전제가 재강조됨. 구현 시 해당 경로의 성공 응답은 바이트 단위로 동일해야 하며, 바뀌는 것은 오류 경로의 상태 코드·코드 문자열뿐이어야 한다.
- A-5 공개 게시글 가시성 강제: **적용**. admin 세션이 있으면 기존 동작 그대로.
- A-6(calendar range 800일)·A-7(mail `isInline` 수용)·A-8(DB timezone UTC)·A-9(cookieCache): 사용자가 전부 선택했으나 **"매우 민감하므로 기존 동작에 영향이 없는지 완벽하게 파악한 뒤 작업 여부를 다시 검토"** 하라는 조건이 붙음. 따라서 심층 영향 검토(별도 워크플로)를 먼저 수행하고 결과를 보고한 뒤 재결정한다. 이번 수정 배치에는 포함하지 않는다.
- A-10 목록 `description` 제거: 미적용.
- Rirekisyo 불일치(K-1·K-2): **보류**. b-hub 계약도 Rirekisyo 도 이번 범위에서 손대지 않는다.
- 실행 방식: 1차(D·S·C-15) → 2차(E·C-01·C-04·C-10·C-11·A-1~A-5) → 3차(R·S-16·S-17) → 4차(P) 순으로 Workflow(구현 opus + 검증 파이프라인). 스키마 변경은 에이전트가 `db:push` 를 실행하지 않고 사용자가 직접 반영한다.

## 2026-09-06 A-6~A-9 심층 영향 검토 결과 (d2 단계, 워크플로 12 에이전트: 항목별 서버·소비자 분석 + 반박 검증)

| 항목 | 분석가 2인 | 반박 검증 최종 | 핵심 근거 |
|------|-----------|---------------|-----------|
| A-6 calendar range 800일 | 조건부 적용 | **조건부 적용** | 상한만 올리면 Calendar AI 컨텍스트가 400(range) 에서 400(AI content 100,000자 초과) 으로 자리만 옮긴다. 설명 200자짜리 DAILY 반복 1건만으로 366일 컨텍스트가 114,923자. 응답 4.5MB 초과 임계도 DAILY 반복 ~15건으로 내려간다. 기존 테스트(732일 → 400 기대) 가 깨진다. Calendar FE 의 컨텍스트 절단·`res.ok` 검사·재조회 억제가 선행돼야 실익이 있다. |
| A-7 mail `isInline` 수용 | 조건부 적용 | **조건부 적용** | 발견 목록의 "cid 임베드가 원래 의도" 서술은 오기였다. 코드에 cid 경로는 없고, 바뀌는 것은 에디터 이미지에 인라인 규칙(10MB 상한·jpeg/png/gif/webp 화이트리스트·매직바이트) 이 새로 적용되는 것뿐이다. 즉 오늘 통과하던 10~25MB 이미지·HEIC/SVG/AVIF·`image/jpg` 같은 근접 MIME 이 413/422 로 거부되는 **동작 축소**다. 실패는 전역 토스트로 보이므로 "무음 실패" 주장은 반박됨. |
| A-8 DB `timezone: 'Z'` | 조건부 적용 | **미적용** | mysql2 는 `SET time_zone` 을 보내지 않는다. 옵션은 raw `sql` 파라미터의 JS Date 이스케이프와 바이너리 파서에만 작용하며, 저장소에서 Date 파라미터는 `compose/drive.ts:152,256` 두 곳뿐(둘 다 읽기 필터). 프로덕션(TZ=UTC)에서는 바이트 동일, 로컬(KST)에서만 바뀐다. E-09 의 "KST/UTC 혼재" 는 MySQL 세션 타임존 vs drizzle 의 `+0000` 가정 사이의 문제라 이 옵션으로 해결되지 않으며, `@@session.time_zone` 측정 없이는 수정인지 회귀인지도 판정 불가. 근본 해법은 raw sql Date 비교를 drizzle 연산자로 바꾸는 것(1차 배치 D-02 가 :256 을 이미 치환). |
| A-9 better-auth cookieCache | 조건부 적용 | **미적용** | 캐시 히트 시 DB 를 전혀 읽지 않아 세션 회수·Ban·role 변경이 최대 5분 지연된다. `route/` 안에서 `getSession(c)` 를 직접 호출하는 곳이 19파일 66곳이라 admin 경로만 우회시키는 완화가 불가능하고, 그중 `PATCH /api/resume/web` 은 공개 문서 쓰기 경로다. 캐시 payload 에 세션 토큰·이메일·role 이 서명만 된 평문으로 실리고, session_token 과 바인딩되지 않아 payload 유출 시 300초간 타인 인증이 가능하다. 계약 인벤토리 M33(세션 쿠키 1종) 을 깨고 모든 `*.gumyo.net` 요청 쿠키가 +1.4KB 늘며, upload-server 의 `verifySession` 도 stale 창을 상속한다. |

조정자 권고: A-6 은 Calendar FE 수정과 한 묶음으로 보류, A-7 은 미적용(현행 `inline` 유지, 문서 오기 정정), A-8 은 미적용(대신 raw sql Date 비교 제거를 P/R 배치에 포함, E-09 재정의), A-9 는 미적용(P-04 대체안: 요청당 중복 getSession 제거 R-15). 최종 결정은 사용자.

## 2026-09-06 A-6~A-9 최종 결정 (사용자: "권고대로")

- A-6 calendar range 800일: **보류**. Calendar FE 의 AI 컨텍스트 절단·`res.ok` 검사·재조회 억제와 한 묶음으로 다룬다.
- A-7 mail `isInline` 수용: **미적용**. 라우트는 현행대로 `inline` 만 읽는다. 발견 목록의 "cid 임베드" 서술은 정정했다.
- A-8 DB `timezone: 'Z'`: **미적용**. 대신 raw `sql` 에 JS Date 를 넣는 두 곳(`compose/drive.ts` stale 필터 등)을 drizzle 연산자로 바꾸는 항목을 성능 배치(E-09 재정의)에 포함한다.
- A-9 better-auth cookieCache: **미적용**. P-04 는 요청당 중복 `getSession` 제거(R-15)로 대체한다.

## 2026-09-06 1차 배치 독립 회귀 리뷰 결과와 조치

소비자 그룹 6 + 횡단 1 리뷰어가 HEAD 와 워킹트리를 대조했다(storage-upload·weather-esp32-logs·dashboard-metrics 는 clean). 승인 목록 밖의 차이 3건을 조정자가 직접 수정했다.

1. 부트스트랩 throw 제거 — `createAdminRoute`/`createManageRoute` 가 `csrfSecret` 미설정 시 생성 시점에 throw 하던 것을 제거. 승인 범위는 "상태 변경 요청 403 fail-closed" 이고, 그 가드(`page/admin/csrf.ts`)는 그대로 동작한다. `BETTER_AUTH_SECRET` 이 optional 인 채로 전 서비스가 부팅 실패하는 장애 반경 확대를 막는다.
2. mail 이동(`compose/mail.ts moveMessages`) — uidMap 이 없는 항목에 대해 대상 폴더의 같은 UID 행(IMAP 에서는 다른 메시지)을 지우던 로직을 제거. 새 규칙: uidMap 이 있으면 대상 폴더의 같은 새 UID 행만 정리 후 folderId·remoteMessageId·uid 를 한 UPDATE 로 갱신, 없으면 대상 폴더에 같은 UID 행이 있을 때 **옮기던 행(로컬 사본)** 을 지우고 대상 행은 보존(그 메시지는 다음 동기화에서 대상 폴더 UID 로 다시 들어온다). 항목별 순차 처리라 배치 내부 UID 충돌도 unique 위반 없이 처리된다. Gmail 은 계정 단위 1행이라 충돌이 없고 HEAD 와 같이 folderId 만 갱신된다.
3. font-loader 실패 캐시(5분) 제거 — HEAD 는 실패 시 매 요청 재시도했으므로 그대로 둔다. 캐시 상한·fetch timeout 만 유지.

리뷰가 승인으로 분류했으나 운영상 인지할 변경: CalDAV REPORT href 접두사가 요청 컬렉션과 일치하도록 바뀜(Apple 클라이언트는 재동기화로 흡수), DST 타임존은 VTIMEZONE 블록 생략, Gmail/IMAP 증분 sync 의 `added` 집합과 커서 값이 달라짐(누락 버그 수정 결과), 배지 아이콘 URL 에 DNS 검사 추가(사설 IP 로 해석되는 호스트는 아이콘 생략).

린트 훅이 편집 중 지적한 기존 코드 2건은 이번 범위 밖이라 유지: `compose/mail.ts:17` 의 `throw new Error('MAIL_ENCRYPTION_KEY …')`(부트스트랩 검증), `service/shared/font-loader.ts`·`icon-loader.ts` 의 `process.env.VERCEL`.
