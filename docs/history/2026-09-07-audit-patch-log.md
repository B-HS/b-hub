# 2026-09-06 전수 감사 수정 패치로그 (1~4차 통합, 도메인별)

> 2026-09-07 프로덕션 배포 기준. 괄호의 1차~4차는 배치 번호, 영문 ID 는 [../quality-assurance/2026-09-06-audit-findings.md](../quality-assurance/2026-09-06-audit-findings.md) 의 발견 번호다. 원칙: 성공 응답의 요청·응답 계약은 그대로 두고, 아래 "소비자가 볼 수 있는 변화" 에 적힌 것만 겉으로 달라진다. 배치별 상세는 [2026-09-06-audit-batch1.md](./2026-09-06-audit-batch1.md) · [2026-09-07-audit-batch2.md](./2026-09-07-audit-batch2.md) · [2026-09-07-audit-batch3.md](./2026-09-07-audit-batch3.md) · [2026-09-07-audit-batch4.md](./2026-09-07-audit-batch4.md).

## 1. 메일 (mail 클라이언트)

**데이터 손실·손상 수정**
1. (1차 D-05) IMAP 은 UID 가 폴더마다 다른데 메시지 고유키가 (계정, 원격ID) 뿐이라 다른 폴더의 같은 UID 메일이 서로 덮어쓰였다. 고유키를 (계정, 폴더, 원격ID)로 바꾸고 upsert·삭제를 폴더 단위로 제한. Gmail 은 라벨과 무관하게 계정당 1행을 유지.
2. (1차 D-06) Gmail 라벨 하나만 떼도 로컬 메일 행이 통째로 지워지던 문제. 삭제를 폴더 단위로 제한.
3. (1차 D-07) 메일함을 선택하지 않은 채 이동·플래그·삭제를 보내 imapflow 가 조용히 실패하던 문제. (계정, 폴더) 단위로 잠그고 실행하며 실패를 기록.
4. (1차 D-08) Gmail 증분 동기화에서 historyId 를 목록과 동시에 받아 그 사이 도착한 메일이 영구 누락되던 문제. 프로필로 historyId 를 먼저 확보.
5. (1차 D-09) IMAP 증분 동기화가 100건을 넘으면 오래된 쪽이 영구 누락되고 최신 1건을 매번 재수신하던 문제. 오름차순 배치 + `uid > lastUid`.
6. (1차 D-10) 커서가 있으면 폴더 목록을 갱신하지 않아 새 폴더·라벨이 영원히 안 보이던 문제. 증분에서도 폴더 목록 갱신.
7. (1차 D-11) 로컬 전용 `__local_drafts__` 폴더가 동기화 대상에 들어가 계정 동기화 전체가 실패하던 문제. `__local_` 접두 폴더 제외.
8. (1차 F-1) 메시지 이동 시 대상 폴더의 무관한 행을 지우던 회귀를 막고, 항목별로 충돌을 검사해 고유키 위반 없이 이동.
9. (1차 E-27) 동기화 실패 시 IMAP 연결을 끊지 않던 문제. `finally` 에서 해제.

**즉시 오류·잘못된 값 수정**
10. (2차 E-12) 같은 계정을 두 번 연결하면 500 이던 것을 409 `MAIL_ACCOUNT_ALREADY_EXISTS` 로.
11. (2차 E-19) 잘못된 Date 헤더 하나 때문에 배치 전체가 실패하던 문제. 무효 날짜는 null 로 저장.
12. (2차 E-20) `.eml` 첨부의 본문이 실제 메일 본문을 덮어쓰던 문제. `message/rfc822` 하위는 본문으로 재귀하지 않음.
13. (2차 E-28) 과거 메일 동기화가 남의 폴더 id 를 받아들이고 세션 커서를 다른 폴더에 쓰던 문제. 소유 검증 + 폴더 불일치 시 세션 무시.

**서버리스 안정성·제한**
14. (3차 R-06) 같은 계정 동기화가 겹치면 두 번째는 `{ added:0, updated:0, deleted:0, durationMs }` 로 즉시 성공 응답(계정 단위 락, 5분 뒤 자동 해제). 클라이언트의 자동·수동 동기화 중복 호출에 오류 toast 가 뜨지 않음.
15. (3차 R-06) 폴더 병렬 동기화를 전부 완료한 뒤 집계(하나 실패해도 나머지 결과 보존).
16. (3차 R-06) 헤더 유래 값(메시지 ID·inReplyTo·폴더 ID·첨부 파일명·MIME·contentId)을 컬럼 길이에 맞춰 절단해 insert 실패 방지.
17. (3차 S-17) 답장·전달에도 발송과 같은 분당 20회 한도 적용. 응답에 `X-RateLimit-*` 헤더가 새로 붙음.
18. (3차 R-01) 메일 상세 조회 시 읽음 처리의 로컬 DB 갱신은 응답 전에 완료, 원격 반영만 비동기.
19. (3차 R-20) 메시지 삭제 시 캐시된 첨부 R2 오브젝트를 먼저 지운 뒤 행 삭제(고아 파일 방지).
20. (3차 R-27) `/manage/mail/sync` 의 batchSize 를 10~500 으로 서버에서 클램프.
21. (3차 R-29) FULLTEXT 인덱스 존재 확인이 실패하면 다음 요청에서 재시도(영구 비활성 방지).

**성능**
22. (4차 P-05) Gmail access token 이 만료 5분 전이면 401 을 기다리지 않고 먼저 갱신(실패 시 기존 401 후 갱신 경로).
23. (4차 P-09) 메시지 저장을 건별 3~5 쿼리에서 배치(일괄 조회 → 신규 INSERT → 재조회 → 기존 UPDATE, 첨부 일괄 upsert)로.
24. (4차 P-12) 폴더별 메시지 수·미읽음 수를 쿼리 2회에서 1회로.
25. (4차 P-13) 원격 플래그 반영 시 계정당 provider 연결 1회 후 폴더 순회.

**소비자가 볼 수 있는 변화**: 중복 계정 409, 답장·전달의 rate limit 헤더와 429, 동기화 중 계정 목록의 `lastSyncStatus` 가 잠시 `running`, 동기화 겹침 시 0 결과 성공 응답. 그 외 응답 동일.

## 2. 캘린더 (Calendar 클라이언트 · Apple CalDAV · ICS 구독)

**데이터 손실·손상 수정**
1. (1차 D-12) ICS 파싱이 VALARM·RECURRENCE-ID 를 처리하지 못해 설명·시작일이 덮어써지던 문제. VALARM 구간 무시, RECURRENCE-ID 인스턴스 스킵.
2. (1차 D-13) TZID 를 무시하고 서버 로컬 시간으로 읽어 9시간 어긋나던 문제. 사용자 타임존 벽시계로 변환.
3. (1차 D-14) 생성 ICS 의 VTIMEZONE 오프셋이 전부 +0000 이던 문제. 실제 오프셋 산출(DST 존은 VTIMEZONE 생략).
4. (1차 D-15) CalDAV PUT 에서 exdate 가 빠져 단일 발생 삭제가 무시되던 문제.
5. (1차 D-16) PROPFIND 와 REPORT 의 href 가 달라 유령·중복 이벤트와 무한 재동기화가 생기던 문제. href 생성 단일화(Apple 은 재동기화로 흡수).
6. (1차 D-17) BYDAY 서수(예: 둘째 화요일)에서 RRule 이 throw 해 events API 전체가 500 이던 문제.
7. (1차 D-21) tombstone → delete → ctag 갱신이 비원자적이던 것을 트랜잭션으로.
8. (1차 E-22) PUT 의 ETag 와 GET 의 ETag 가 달라지던 문제. 저장 시각을 명시해 일치.
9. (1차 E-29) free-busy time-range 의 Invalid Date 처리.

**즉시 오류·잘못된 값 수정**
10. (2차 E-25) 구독이 없어도 토큰 재발급이 성공하던 문제 → 404 `CALENDAR_SUBSCRIPTION_NOT_FOUND`.
11. (2차 C-10) 그룹 PATCH 가 `data: null` 을 돌려줄 수 있던 문제 → 항상 행 반환, 없으면 404.
12. (2차 E-21) caldav-proxy 가 gzip 헤더를 남겨 응답이 깨지던 문제. `Accept-Encoding: identity` + 압축 헤더 제거.

**서버리스 안정성·제한**
13. (3차 R-25) 사용자당 구독 1행 unique + upsert 생성(경합 시 중복 행 방지).
14. (3차 R-26) 이벤트 생성·수정에서 남의 그룹 id 는 404, 종료가 시작보다 빠르면 400.

**성능**
15. (4차 P-18) ICS 구독 응답에 ETag, `If-None-Match` 일치 시 304(본문 없음). Apple·구독 클라이언트의 폴링 트래픽 절감.
16. (4차 P-18) CalDAV multiget 이 href 마다 조회하던 N+1 을 일괄 조회로, uid 조회 2회를 1회로.
17. (4차 P-07) 구독 lastAccessedAt 은 5분 경과 시에만 갱신.

**소비자가 볼 수 있는 변화**: 그룹 404·기간 400, regenerate 404, ICS 304, CalDAV href 정리(재동기화 1회). 그 외 동일.

## 3. 드라이브 (Storage 클라이언트 · upload-server)

**데이터 손실·손상 수정**
1. (1차 D-01) lifecycle 크론이 POST 전용이라 Vercel 크론(GET)이 매일 404 로 실행되지 않던 문제.
2. (1차 D-02) 축출 후보 조건의 괄호 누락으로 `lastViewedAt IS NULL` 자산이 전부 stale 로 잡히던 문제.
3. (1차 D-03) 마지막 조회가 없는 자산을 30일 미접근으로 간주하고 Google Drive 사본 확인 없이 유일 사본을 지우던 문제. `COALESCE(last_viewed_at, created_at)` + L3 사본 존재 확인.
4. (1차 D-04) 승격 조건에 리셋이 없어 축출·승격이 매일 반복되던 문제.
5. (1차 D-19) 어드민 삭제 3종이 스토리지 실물을 지우지 않아 고아 오브젝트가 남던 문제.

**보안**
6. (1차 S-01·C-15) upload-server 의 `/status`·`/complete`·`/gdrive-token` 콜백에 시크릿 검사, `s3Key` 는 허브 반환값과 대조. 시크릿 미설정 시 503.
7. (1차 S-02) assetId 경로 탈출 차단(`^[A-Za-z0-9_-]+$`).
8. (1차 S-05) `UPLOAD_SERVER_SECRET` 미설정이면 gdrive-token 발급이 통과되던 문제 → 503.
9. (1차 S-07) 시크릿 비교를 상수 시간 비교로.

**즉시 오류·잘못된 값 수정**
10. (2차 E-16) prepare 본문 Zod 검증, complete 에서 upload-server 실측 크기로 쿼터 재검증(신고 크기 우회 차단).
11. (2차 E-17) 해시 중복 500 → 409 `DRIVE_DUPLICATE_FILE`, 실패 시 자산 `failed` 마감 + 올린 티어 실물 정리.
12. (2차 E-18) L1(R2)만 있는 자산의 다운로드가 항상 500 이던 문제 → R2 스트리밍.

**서버리스 안정성**
13. (3차 R-24) 조회수 증가를 읽고-쓰기에서 원자 증가(`access_count + 1`)로.
14. (3차 E-09) stale 업로드 필터의 raw SQL Date 비교를 Drizzle 연산자로(타임존 의존 제거).
15. (3차 R-20) 실물 삭제 실패를 Sentry 로 기록(행 삭제는 진행).
16. (3차 R-32) upload-server 의 gdrive 폴더 캐시를 무한 Map 에서 LRU 500 으로.

**성능**
17. (4차 P-01) 자산 목록의 count/select 병렬.
18. (4차 P-19) 폴더 삭제의 재귀 조회를 깊이 단위 일괄 조회로.

**소비자가 볼 수 있는 변화**: 해시 중복 409, 쿼터 초과 413, upload-server 콜백에 시크릿 필수, L1 전용 자산 다운로드 성공. 그 외 동일.

## 4. 블로그 (bblog)

**데이터 손실·손상 수정**
1. (1차 D-20) 방명록 메시지 INSERT 2개가 비트랜잭션이라 고아 메시지가 생기던 문제. 트랜잭션 + imageIds UUID 검증.

**즉시 오류·잘못된 값 수정**
2. (2차 E-01) 댓글 있는 게시글 삭제가 FK 오류로 500 이던 문제. 트랜잭션에서 댓글 먼저 삭제.
3. (2차 E-07) OG 썸네일 요청마다 조회수가 +1 되던 문제.
4. (2차 C-01) 이미지 메타 추출 실패로 width/height 가 0 이면 업로드 전체가 400 이던 문제. 0 을 null 로 수용.
5. (2차 A-5, 사용자 승인) 로그인하지 않은 요청은 목록에 `isPublished=true, isHide=false` 강제, 비공개 글 상세는 404. admin 세션이면 이전과 동일.

**서버리스 안정성·제한**
6. (3차 R-16) 댓글 생성 시 게시글이 없으면 404, 댓글이 닫힌 글이면 403.

**성능**
7. (4차 P-01) 게시글·방명록 목록의 count/select 병렬.
8. (4차 P-14) 태그 집계를 전체 테이블 집계에서 게시글 상관 서브쿼리로, 방명록 이미지 N+1 을 일괄 조회로, 카테고리·태그 생성 후 재조회 제거, 수정·삭제의 존재 확인을 경량 쿼리로.
9. (4차 P-15) OG 썸네일 렌더 결과를 LRU 20·1시간 캐시(키 = 제목·카테고리·첫 태그), 그리드 노드 상수화.
10. (4차 회귀 리뷰 권고) 댓글·방명록 목록 정렬에 id 타이브레이크(인덱스 적용 후 동점 순서 고정).

**소비자가 볼 수 있는 변화**: 비로그인 초안 열람 차단(A-5), 댓글 404/403, 이미지 0 → null. 그 외 동일.

## 5. 이력서 (RESUME · Rirekisyo)

1. (1차 S-11) `/public/web` 이 아무 사용자의 최신 web 행을 서빙하고 admin PATCH 도 그 행을 고치던 문제. admin 소유 행 우선.
2. (2차 E-02) 빈 PATCH 본문이 `set({})` 로 500 이던 문제. UPDATE 생략.
3. (4차 P-02) `resumes(type, updated_at)` 인덱스 추가.

**소비자가 볼 수 있는 변화**: 없음. Rirekisyo 측 결함(K-1 필드명, K-2 `web` 타입)은 그쪽 수정 대기.

## 6. 날씨 (weather 웹 · ESP32)

1. (1차 S-09) endpoint 값이 50자를 넘으면 요청 로그 insert 가 실패해 일일 한도가 차감되지 않던 문제. 절단.
2. (2차 E-08) `/current` 의 baseDate/baseTime 이 서버 로컬 시각 기준이라 Vercel(UTC)에서 9시간 어긋나던 문제. KMA 기준시(KST)로 계산.
3. (3차 R-10) KMA 호출에 8초 타임아웃, 4xx 는 재시도 없이 즉시 502, NO_DATA 는 30초 negative cache + 동시 요청 합류(single-flight).
4. (3차 R-01) 키 사용 시각·요청 로그 기록을 응답 전에 완료(서버리스에서 기록 유실 방지).
5. (3차 R-03) Redis 캐시 클라이언트를 import 시점 생성에서 지연 생성으로, 인메모리 폴백을 LRU 500·30초로.
6. (4차 P-17) 키 검증의 DB 왕복을 줄이고(키 조회 + 24시간 카운트 1회), KMA 캐시 TTL 경계를 base time 과 일치.
7. (4차 P-17) `/api/weather/locations` 에 ETag·`Cache-Control`, `If-None-Match` 일치 시 304.

**소비자가 볼 수 있는 변화**: baseDate/baseTime 값 교정(형식 동일), 장애 시 502 가 빨리 옴, locations ETag. 정수 타입·문자열 형식·상태 코드 동일.

## 7. 로그 수집 · Discord 알림 · 크론 (ESP32 로그)

1. (1차 S-08) 디바이스 한도를 본문의 deviceId 로 집계해 우회가 가능하던 문제. 키에 묶인 deviceId 강제.
2. (1차 F-4) 배치 사전 검사 동작을 원래대로 유지.
3. (3차 R-01) 오류 로그 캡처·디바이스 키 사용 시각을 응답 전에 기록.
4. (3차 R-11) Discord 알림에 분당 20건 전역 예산, throttle 키 상한 500, `allowed_mentions` 차단, 3초 타임아웃. 알림 자체는 응답을 막지 않도록 비동기 유지.
5. (3차 R-12) 보관기간 정리를 크론 `GET /api/logs/purge` 로 추가(log_events 7/30/180일 + weather 로그 90일 + 메일 동기화 로그 90일 + 완료 세션 30일, LIMIT 1000 반복). 기존 admin POST 는 그대로. 현재 Vercel 크론은 비활성 상태.
6. (3차 R-23) `POST /api/logs`·`/batch` 본문 1MB 초과 시 413.

**소비자가 볼 수 있는 변화**: 1MB 초과 413 뿐(ESP32 배치 50건은 도달 불가).

## 8. 시스템 지표 (dashboard · metrics)

1. (1차 D-18) 아카이브 재실행이 같은 R2 키를 덮어써 부분 삭제 시 유실되던 문제. 키 파트화.
2. (2차 E-23) payload 크기를 문자 수로 재 64KB 상한이 무효였던 문제. UTF-8 바이트 기준.
3. (2차 C-11) series 조회가 `cpu.cores.0.usage` 같은 배열 인덱스 경로를 만들지 못하던 문제.
4. (3차 R-09) 아카이브 실행당 최대 3일·200초.
5. (3차 R-23) ingest 본문 128KB, 배치 4MB 초과 시 413(표준 오류 봉투).
6. (4차 P-01·P-21) 로그 목록 count/select 병렬, 디바이스 upsert 를 bulkWrite 1회로, Mongo 재연결 헬퍼 멱등화.
7. (4차 P-07) 토큰 lastUsedAt 은 5분 경과 시에만 갱신.

**소비자가 볼 수 있는 변화**: 상태 코드 순서(401→429→400→413) 유지, 멀티바이트 payload 는 이전보다 일찍 413.

## 9. Spotify (위젯 · API 키)

1. (2차 E-10·A-3) refresh 실패·미연결 계정의 500 을 502 `SPOTIFY_API_ERROR` / 404 `SPOTIFY_ACCOUNT_NOT_FOUND` 로.
2. (2차 E-11·A-4) 비활성(`isActive=false`) 계정을 실제로 집행 → 세션·API 키·위젯 경로 전부 404.
3. (3차 S-16) 공개 위젯 3경로에 토큰+IP 기준 분당 60회, `X-RateLimit-*` 헤더.
4. (3차 R-30) Spotify 429 재시도 대기 총합을 3초로 캡(이전 최대 180초).
5. (3차 R-31) refresh 응답의 새 refresh_token 저장.
6. (4차 P-05·P-16) 만료 5분 전 선제 갱신, 계정 조회를 JOIN 1쿼리로.

**소비자가 볼 수 있는 변화**: 비활성 계정 404, rate limit 헤더·429, 장애 시 502 가 빨리 옴. SVG/HTML/JSON 바이트 동일.

## 10. 배지 · 이미지 생성

1. (1차 S-13·S-14) 아이콘 URL 검증 강화(IPv4-mapped IPv6·DNS rebinding·`/\` 오픈 리다이렉트 방어), 아이콘 fetch 타임아웃·크기 상한·MIME 허용목록.
2. (1차 R-13 부분) 폰트 캐시 상한·fetch 타임아웃.
3. (2차 E-04) resvg WASM 이중 초기화로 500 이던 문제. 초기화 Promise 메모이즈.
4. (2차 E-05) `fontSize=0` 이 글자 없는 PNG 로 1년 캐시되던 문제. 자동 크기.
5. (2차 E-06) satori 예외가 500 으로 새던 것을 `IMAGE_GENERATE_FAILED` 로.
6. (3차 S-16) IP 기준 분당 60회, `width*height` 2,000,000 초과 시 400.
7. (3차 R-13) `@fontsource` 를 dependencies 로 이동(프로덕션에 폰트 파일 포함), 로컬 폰트 읽기 실패 기록.
8. (4차 P-15) 응답에 `CDN-Cache-Control` 추가, 폰트·아이콘 로드 병렬.

**소비자가 볼 수 있는 변화**: rate limit 헤더·429, 대형 크기 400, `CDN-Cache-Control`. PNG 바이트는 폰트가 실제 로드되면서 달라질 수 있음.

## 11. AI (mail · Calendar · Rirekisyo 의 AI 기능)

1. (1차 D-22) user/assistant 메시지 쌍 insert 를 트랜잭션으로.
2. (2차 E-14) 클라이언트가 끊겨도 업스트림을 계속 소비(과금)하던 문제. AbortSignal 전파 + reader cancel.
3. (2차 E-15) 토큰 갱신 single-flight 가 persist 전에 풀려 정상 토큰이 reauth_required 가 되던 문제.
4. (2차 C-04) providers/models 의 `displayName: null` 이 Calendar·Rirekisyo 의 strict 파싱을 깨뜨리던 문제. 항상 문자열.
5. (3차 R-18) 메시지 정렬에 id 2차 키(같은 ms 순서 뒤집힘 제거).
6. (3차 R-19) refresh 실패 중 `invalid_grant`/`refresh_token*` 만 reauth_required, 일시 장애는 502.
7. (3차 R-20·R-23) 첨부 insert 실패 시 R2 정리, 삭제는 DB → 스토리지, 업로드 본문 21MB 초과 413.
8. (3차 R-01) 사용량 로그를 응답 전에 기록.
9. (4차 P-01·P-20) 세션·메시지 목록 count/select 병렬, 채팅 준비 조회 4종 병렬, 첨부 R2 다운로드 병렬, 재연결 UPDATE 병합.

**소비자가 볼 수 있는 변화**: `displayName` 항상 문자열, 첨부 413, SSE 와이어 포맷 동일.

## 12. 어드민(/admin) · 셀프서비스(/manage)

1. (1차 S-03·S-04) CSRF 시크릿이 없으면 검사를 건너뛰던 fail-open → 상태 변경 POST 403, 멀티바이트 토큰 500 제거.
2. (1차 S-10) Ban 시 세션 회수.
3. (1차 S-12) gdrive refresh token 을 임의 사용자 것으로 고르던 문제. admin 우선.
4. (1차 S-15) 캘린더 color 인라인 CSS 주입 차단(hex 만 렌더).
5. (2차 E-03) 목록 `page` 미클램프로 음수 OFFSET 500 이던 문제(16 페이지 32곳).
6. (2차 E-24) Ban 만료일 Invalid Date 500, 음수 quota 거부.
7. (3차 R-14) 토큰·키 발급 5곳이 값을 담은 200 HTML 대신 303 + 일회성 쿠키(60초) → 다음 GET 에서 1회 표시(새로고침 재발급 제거). 어드민 로그아웃은 GET 유지 + CSRF POST 병행.
8. (3차 R-15) 요청당 세션 조회 1회(이전 2~3회).
9. (3차 R-28) 검색어 `q` 의 LIKE 메타문자 이스케이프(22곳).
10. (4차 P-01·P-22) 목록 31개·카운트 17종 병렬, 토글 6곳 단일 UPDATE.

## 13. 공통 · 인프라

1. (1차 S-06) 이미지 complete HMAC 키가 빈 문자열이면 토큰 위조가 가능하던 문제 → fail-closed.
2. (1차 S-07) 크론·콜백 시크릿 비교를 상수 시간 비교로.
3. (1차 E-26) 라우터가 `DATABASE_URL` 없는 환경(테스트)에서 부팅 실패하던 문제.
4. (1차 C-15) `lib/db-helper.ts` 의 중복 키 판별 헬퍼.
5. (3차 R-02) rate limiter 에 공유 스토어(Redis INCR+PEXPIRE) 주입 가능, `REDIS_URL` 이 있으면 mail·ai 한도가 인스턴스 간 공유, 없으면 인메모리(동일). cleanup 타이머 unref.
6. (3차 R-03 + 조정자) Redis 클라이언트 공용화·지연 생성. 첫 명령은 연결 완료를 기다리고(이전 구현은 첫 명령이 무조건 거부됨) 이후 장애는 즉시 폴백.
7. (3차 R-04) DB 풀에 maxIdle·idleTimeout·keepAlive(connectionLimit 20 유지).
8. (3차 R-21) `initSentry` 를 부트스트랩에서 실제 호출(`SENTRY_DSN` 있을 때만 전송).
9. (3차 R-01) fire-and-forget 이던 기록(오류 로그·키 사용 시각·요청 로그·사용량 로그)을 응답 전 await. Discord 웹훅만 비동기 유지.
10. (4차 P-06) 자격증명 복호화의 scrypt 키 유도를 LRU 500 캐시(요청당 14ms 절감).
11. (4차 P-07) api_token lastUsedAt 5분 단위 갱신.
12. (4차 P-08) 공용 LRU 캐시 축출을 O(n) 에서 O(1)로.
13. (4차 P-23) 미사용 `lib/external-api.ts` 삭제.
14. (4차 P-05) gdrive access token 프로세스 내 캐시(만료 60초 전까지).

## 14. DB 스키마 (2026-09-07 프로덕션 반영)

- `mail_messages` unique: (account_id, remote_message_id) → (account_id, folder_id, remote_message_id).
- `calendar_subscription.user_id` unique 추가.
- 인덱스 8종 추가: posts(isPublished, isHide, created_at), comments(postId, created_at), messages(userId, deleted_at, created_at), log_events(created_at), weather_api_log(created_at), image_assets(created_at), mail_sync_logs(account_id, created_at), resumes(type, updated_at).
- 중복 인덱스 3종 제거: calendar_event.uid, calendar_subscription.token, calendar_subscription.ics_token. FK 컬럼의 단일 인덱스(`idx_subscription_user`, `idx_mail_sync_logs_account`)는 유지.

## 15. 적용하지 않은 것

- A-6 calendar range 800일, A-7 mail `isInline`, A-8 DB timezone, A-9 cookieCache, A-10 목록 description 제거 — 사용자 결정으로 보류·미적용.
- E-13 사용자 `postsCount` 항상 0 — posts 에 작성자 컬럼이 없어 보류.
- R-05 크론 시크릿 env(현재 크론 비활성), R-07 업로드 4.5MB 우회, R-08 maxDuration, R-22 request-logger, R-32 멀티파트 스트리밍 — 계약·비용 영향으로 보류.
- P-03 sharp/satori 지연 import(preview 검증 필요), P-04, P-10·P-11 IMAP/Gmail 호출 축소(사용자 결정 대기), P-14 description·LIMIT, P-16 이미지 축소·캐시, P-17 Redis INCR, P-18 timeRange, P-21 countDocuments 캐시, P-22 LIMIT — 응답 변화 또는 정확성 이유로 미적용.
- 소비자 측 결함 K-1~K-9(Rirekisyo 필드명·web 타입, Banga 로그아웃 경로, hn-alert 고장, ESP32 dailyLimit·시크릿 추적, bblog API URL 폴백, dashboard 헤더 표기) — b-hub 밖.
