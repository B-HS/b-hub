# 합의 — 웹 이력서 타입 신설 (2026-08-29)

## 최종 결정 (정정 반영)

1. **`type='web'` 을 신설**해 resume.gumyo.net 웹 이력서(ko/en/jp `webResumeDataSchema`)를 저장한다. `resume`(履歴書)·`cv`(職務経歴書)는 기존 스키마 그대로 보존.
2. 웹 이력서 조회는 **인증·토큰 없이 무조건 공개**: `GET /api/resume/public/web`. `isPublic` 플래그로 필터링하지 않고 최신(updatedAt) web 1건을 반환한다.
3. 편집 UI 는 신규 개발 없이 기존 `/manage/resume` JSON 편집기를 그대로 사용한다 (type 선택지에 web 추가됨).
4. 테이블 스키마 변경 없음 (`data` JSON 컬럼의 Zod 계약만 추가) — `db:push` 불필요.

## 경위 — cv 슬롯 재사용안 폐기

당초 "cv 타입 실데이터 없음" 전제로 cv 슬롯을 웹 이력서로 재정의해 배포했으나, 배포 직후 검증에서 **기존 cv 행(일본어 職務経歴書, 2026-03-15 수정) 발견**. 그 시점의 `/public/cv` 가 해당 문서를 공개 서빙하는 상태였고, 구 CV 의 본문 수정도 새 스키마 검증에 막히는 문제가 있어 사용자 결정(A안)으로 **cv 스키마 원복 + web 타입 신설**로 정정했다.

## 소비자

- resume.gumyo.net (RESUME 레포) — Next.js fetch 캐시(revalidate 60s) + TanStack Query 로 소비. RESUME 쪽에 동형 Zod 스키마를 중복 정의해 경계 검증한다 (공유 패키지 없음, 의도적 중복).
