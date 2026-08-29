# 합의 — cv 슬롯을 웹 이력서로 재정의 (2026-08-29)

## 사용자 결정

1. `resumes.type='resume'`(履歴書)은 실사용 문서로 유지, **`type='cv'` 는 resume.gumyo.net 웹 이력서 전용으로 재정의**한다. 구 `cvDataSchema`(職務経歴書)는 폐기하고 ko/en/jp 3개 언어 스키마로 교체.
2. **기존 cv 타입 행은 DB 에 없다는 전제**로 진행. (있었다면 새 스키마 검증에 걸려 `/manage` 수정이 실패한다 — 발견 시 사용자에게 보고)
3. 웹 이력서 조회는 **인증·토큰 없이 무조건 공개**: `GET /api/resume/public/cv`. `isPublic` 플래그로 필터링하지 않고 최신(updatedAt) cv 1건을 반환한다.
4. 편집 UI 는 신규 개발 없이 기존 `/manage/resume` JSON 편집기를 그대로 사용한다.
5. 테이블 스키마 변경 없음 (`data` JSON 컬럼의 Zod 계약만 교체) — `db:push` 불필요.

## 소비자

- resume.gumyo.net (RESUME 레포) — Next.js fetch 캐시(revalidate 60s) + TanStack Query 로 소비. RESUME 쪽에 동형 Zod 스키마를 중복 정의해 경계 검증한다 (공유 패키지 없음, 의도적 중복).
