# Resume API

Base URL: `https://hub.gumyo.net/api`

모든 Resume API 요청에는 세션 인증(로그인)이 필요하다. 인증되지 않은 요청은 `401 UNAUTHORIZED`를 반환한다.

---

## 1. 엔드포인트 요약

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /resume | 내 이력서 목록 (페이지네이션) | 필수 |
| GET | /resume/:id | 이력서 상세 조회 | 필수 (소유자) |
| POST | /resume | 이력서 생성 | 필수 |
| PATCH | /resume/:id | 이력서 수정 | 필수 (소유자) |
| DELETE | /resume/:id | 이력서 삭제 | 필수 (소유자) |

---

## 2. 타입 정의

### ResumeType

이력서 종류. `type` 필드에 사용된다.

```typescript
type ResumeType = 'resume' | 'cv'
```

| 값 | 설명 |
|------|------|
| `resume` | 이력서 (履歴書) |
| `cv` | 직무경력서 (職務経歴書) |

---

### ResumeData (type: `'resume'`)

이력서 JSON 데이터 구조.

```typescript
type ContactInfo = {
    furigana: string   // 주소 후리가나
    postal: string     // 우편번호
    address: string    // 주소
    phone: string      // 전화번호
    email: string      // 이메일
}

type HistoryLine = {
    year: string       // 연도 (예: "平成26")
    month: string      // 월 (예: "3")
    content: string    // 내용 (예: "東京大学 卒業")
}

type ResumeData = {
    name_furigana: string            // 이름 후리가나
    name: string                     // 이름
    gender: '男' | '女' | ''         // 성별
    birthday_year: string            // 생년 (예: "平成7")
    birthday_month: string           // 생월
    birthday_day: string             // 생일
    age: string                      // 나이
    photo: string                    // 사진 (base64 또는 URL, 빈 문자열 가능)
    contact: ContactInfo             // 연락처
    emergency: ContactInfo           // 긴급연락처
    history: HistoryLine[]           // 학력/경력
    qualifications: HistoryLine[]    // 자격/면허
    self_promotion: string           // 자기PR
    commuting_hours: string          // 통근시간 (시간)
    commuting_minutes: string        // 통근시간 (분)
    dependents: string               // 부양가족 수
    marital_status: '有' | '無' | '' // 배우자 유무
    spouse_obligation: '有' | '無' | '' // 배우자 부양의무
    objective: string                // 희망/특기
    creation_year: string            // 작성연도
    creation_month: string           // 작성월
    creation_day: string             // 작성일
}
```

---

### CvData (type: `'cv'`)

직무경력서 JSON 데이터 구조.

```typescript
type CvExperience = {
    environments: string    // 개발환경 (줄바꿈으로 구분)
    languages: string       // 프로그래밍 언어
    frameworks: string      // 프레임워크
    infrastructure: string  // 인프라
    tools: string           // 도구
}

type CvOverview = {
    title: string       // 회사/프로젝트명
    period: string      // 기간 (예: "2023年10月 ～ 2025年7月")
    content: string     // 업무 내용
    tech_stack: string  // 기술 스택
}

type CvJob = {
    title: string        // 프로젝트명
    period_from: string  // 시작 (예: "23/10")
    period_to: string    // 종료 (예: "25/7")
    period_span: string  // 기간 (예: "1年10ヶ月")
    kind: string         // 업종
    role: string         // 역할
    size: string         // 팀 규모 (예: "6名")
    content: string      // 업무 내용
    lang: string         // 사용 언어/기술
    tools: string        // 사용 도구
}

type CvData = {
    name: string              // 이름
    kana: string              // 후리가나
    birthday: string          // 생년월일 (예: "1995年10月10日")
    age: string               // 나이 (예: "満30歳")
    nearest_station: string   // 최근역
    skills: string            // 스킬 요약
    hobbies: string           // 취미
    experience: CvExperience  // 기술경험
    overview: CvOverview[]    // 직무 요약
    jobs: CvJob[]             // 프로젝트 상세
}
```

---

### Resume (응답 객체)

API 응답에 포함되는 이력서 객체.

```typescript
type Resume = {
    id: number
    userId: string
    type: 'resume' | 'cv'
    title: string
    data: ResumeData | CvData  // type에 따라 구조가 다름
    isPublic: boolean
    createdAt: string          // ISO 8601
    updatedAt: string          // ISO 8601
}
```

---

## 3. API 상세

### GET /resume

내 이력서 목록 조회. 페이지네이션 지원.

**Query Parameters**

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|----------|------|------|--------|------|
| type | string | X | - | `'resume'` 또는 `'cv'`로 필터링 |
| page | number | X | 1 | 페이지 번호 (1 이상) |
| limit | number | X | 20 | 페이지 크기 (1~50) |

**Response 200**

```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "userId": "user-abc",
            "type": "resume",
            "title": "내 이력서",
            "data": { "..." },
            "isPublic": false,
            "createdAt": "2026-03-11T00:00:00.000Z",
            "updatedAt": "2026-03-11T00:00:00.000Z"
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "totalPages": 1
    }
}
```

**사용 예시**

```typescript
// 전체 목록
const res = await clientFetch('/resume')

// type 필터링
const res = await clientFetch('/resume?type=cv')

// 페이지네이션
const res = await clientFetch('/resume?page=2&limit=10')
```

---

### GET /resume/:id

이력서 상세 조회. 본인 소유의 이력서만 조회 가능.

**Path Parameters**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| id | number | 이력서 ID |

**Response 200**

```json
{
    "success": true,
    "data": {
        "id": 1,
        "userId": "user-abc",
        "type": "resume",
        "title": "내 이력서",
        "data": {
            "name_furigana": "ねこ　たろう",
            "name": "猫　太郎",
            "gender": "男",
            "birthday_year": "平成7",
            "birthday_month": "10",
            "birthday_day": "10",
            "age": "30",
            "photo": "",
            "contact": {
                "furigana": "とうきょうと",
                "postal": "100-0001",
                "address": "東京都豊島区豊島1-1-1",
                "phone": "099-9999-9999",
                "email": "test@example.com"
            },
            "emergency": {
                "furigana": "",
                "postal": "",
                "address": "",
                "phone": "",
                "email": ""
            },
            "history": [
                { "year": "平成26", "month": "3", "content": "東京大学 卒業" }
            ],
            "qualifications": [
                { "year": "令和5", "month": "1", "content": "普通自動車免許 取得" }
            ],
            "self_promotion": "テスト",
            "commuting_hours": "1",
            "commuting_minutes": "30",
            "dependents": "0",
            "marital_status": "無",
            "spouse_obligation": "無",
            "objective": "",
            "creation_year": "令和8",
            "creation_month": "3",
            "creation_day": "11"
        },
        "isPublic": false,
        "createdAt": "2026-03-11T00:00:00.000Z",
        "updatedAt": "2026-03-11T00:00:00.000Z"
    }
}
```

**사용 예시**

```typescript
const res = await clientFetch('/resume/1')
const resume = res.data

if (resume.type === 'resume') {
    // resume.data는 ResumeData 타입
    console.log(resume.data.name)
} else {
    // resume.data는 CvData 타입
    console.log(resume.data.jobs)
}
```

---

### POST /resume

이력서 생성. `type`에 따라 `data` 구조가 다르게 검증된다.

**Request Body**

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| type | `'resume'` \| `'cv'` | O | - | 이력서 종류 |
| title | string | O | - | 제목 (1~255자) |
| data | ResumeData \| CvData | O | - | type에 맞는 데이터 |
| isPublic | boolean | X | false | 공개 여부 |

- `type: 'resume'` → `data`는 `ResumeData` 구조여야 함
- `type: 'cv'` → `data`는 `CvData` 구조여야 함
- type과 data가 불일치하면 `400 VALIDATION_ERROR` 반환

**Request Body 예시 (이력서)**

```json
{
    "type": "resume",
    "title": "2026년 이력서",
    "data": {
        "name_furigana": "ねこ　たろう",
        "name": "猫　太郎",
        "gender": "男",
        "birthday_year": "平成7",
        "birthday_month": "10",
        "birthday_day": "10",
        "age": "30",
        "photo": "",
        "contact": {
            "furigana": "とうきょうと",
            "postal": "100-0001",
            "address": "東京都豊島区1-1-1",
            "phone": "099-9999-9999",
            "email": "test@example.com"
        },
        "emergency": {
            "furigana": "",
            "postal": "",
            "address": "",
            "phone": "",
            "email": ""
        },
        "history": [],
        "qualifications": [],
        "self_promotion": "",
        "commuting_hours": "0",
        "commuting_minutes": "0",
        "dependents": "0",
        "marital_status": "",
        "spouse_obligation": "",
        "objective": "",
        "creation_year": "令和8",
        "creation_month": "3",
        "creation_day": "11"
    }
}
```

**Request Body 예시 (CV)**

```json
{
    "type": "cv",
    "title": "2026년 직무경력서",
    "data": {
        "name": "猫 太郎",
        "kana": "ねこ たろう",
        "birthday": "1995年10月10日",
        "age": "満30歳",
        "nearest_station": "池袋駅",
        "skills": "TypeScript, React",
        "hobbies": "料理",
        "experience": {
            "environments": "Linux\nMacOS",
            "languages": "TypeScript\nPHP",
            "frameworks": "React\nLaravel",
            "infrastructure": "AWS\nDocker",
            "tools": "Git\nSlack"
        },
        "overview": [
            {
                "title": "株式会社テスト",
                "period": "2023年10月 ～ 2025年7月",
                "content": "Web開発",
                "tech_stack": "React, TypeScript"
            }
        ],
        "jobs": [
            {
                "title": "Web開発",
                "period_from": "23/10",
                "period_to": "25/7",
                "period_span": "1年10ヶ月",
                "kind": "IT",
                "role": "エンジニア",
                "size": "6名",
                "content": "フロントエンド開発",
                "lang": "TypeScript\nReact",
                "tools": "Git\nDocker"
            }
        ]
    }
}
```

**Response 200**

```json
{
    "success": true,
    "data": {
        "id": 1
    }
}
```

**사용 예시**

```typescript
const res = await clientFetch('/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        type: 'resume',
        title: '2026년 이력서',
        data: resumeData,
    }),
})
console.log(res.data.id) // 생성된 이력서 ID
```

---

### PATCH /resume/:id

이력서 수정. 본인 소유의 이력서만 수정 가능. 전달한 필드만 수정된다.

**Path Parameters**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| id | number | 이력서 ID |

**Request Body**

모든 필드가 optional이다.

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| title | string | X | 제목 (1~255자) |
| data | ResumeData \| CvData | X | 수정할 데이터 (전체 교체) |
| isPublic | boolean | X | 공개 여부 |

> **주의**: `data`를 수정할 때는 부분 수정이 아닌 **전체 교체**이다. 기존 데이터를 가져와서 수정한 뒤 전체를 보내야 한다.

> **주의**: `type`은 수정할 수 없다. 종류를 변경하려면 새로 생성해야 한다.

**Request Body 예시**

```json
{
    "title": "수정된 이력서 제목"
}
```

```json
{
    "data": { "...전체 ResumeData..." },
    "isPublic": true
}
```

**Response 200**

```json
{
    "success": true,
    "data": {
        "success": true
    }
}
```

**사용 예시**

```typescript
// 제목만 수정
await clientFetch('/resume/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '새 제목' }),
})

// data 전체 교체
const existing = await clientFetch('/resume/1')
const updatedData = { ...existing.data.data, name: '新しい名前' }
await clientFetch('/resume/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: updatedData }),
})
```

---

### DELETE /resume/:id

이력서 삭제. 본인 소유의 이력서만 삭제 가능.

**Path Parameters**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| id | number | 이력서 ID |

**Response 200**

```json
{
    "success": true,
    "data": {
        "success": true
    }
}
```

**사용 예시**

```typescript
await clientFetch('/resume/1', { method: 'DELETE' })
```

---

## 4. 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| UNAUTHORIZED | 401 | 인증되지 않은 요청 |
| VALIDATION_ERROR | 400 | 요청 데이터 검증 실패 (type/data 불일치 포함) |
| RESUME_NOT_FOUND | 404 | 이력서를 찾을 수 없음 |
| RESUME_NOT_OWNER | 403 | 이력서 소유자만 접근 가능 |

**에러 응답 형식**

```json
{
    "success": false,
    "error": {
        "code": "RESUME_NOT_FOUND",
        "message": "이력서를 찾을 수 없습니다"
    }
}
```

---

## 5. 프론트엔드 타입 활용 가이드

### Query Key

```typescript
export const QUERY_KEY = {
    RESUME: {
        LIST: (type?: string) => ['resume', 'list', type].filter(Boolean),
        GET: (id: number) => ['resume', 'get', id],
    },
}
```

### React Query 사용 예시

```typescript
// 목록 조회
const useResumeList = (type?: 'resume' | 'cv') => {
    return useQuery({
        queryKey: QUERY_KEY.RESUME.LIST(type),
        queryFn: () => clientFetch(`/resume${type ? `?type=${type}` : ''}`),
    })
}

// 상세 조회
const useResume = (id: number) => {
    return useQuery({
        queryKey: QUERY_KEY.RESUME.GET(id),
        queryFn: () => clientFetch(`/resume/${id}`),
    })
}

// 생성
const useCreateResume = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ResumeCreateInput) =>
            clientFetch('/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resume', 'list'] })
        },
    })
}

// 수정
const useUpdateResume = (id: number) => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ResumeUpdateInput) =>
            clientFetch(`/resume/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resume'] })
        },
    })
}

// 삭제
const useDeleteResume = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: number) =>
            clientFetch(`/resume/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resume', 'list'] })
        },
    })
}
```

### 프론트엔드 타입 정의

백엔드 DTO와 동일한 구조로 프론트엔드 타입을 정의한다.

```typescript
// types/resume.ts

type ContactInfo = {
    furigana: string
    postal: string
    address: string
    phone: string
    email: string
}

type HistoryLine = {
    year: string
    month: string
    content: string
}

type ResumeData = {
    name_furigana: string
    name: string
    gender: '男' | '女' | ''
    birthday_year: string
    birthday_month: string
    birthday_day: string
    age: string
    photo: string
    contact: ContactInfo
    emergency: ContactInfo
    history: HistoryLine[]
    qualifications: HistoryLine[]
    self_promotion: string
    commuting_hours: string
    commuting_minutes: string
    dependents: string
    marital_status: '有' | '無' | ''
    spouse_obligation: '有' | '無' | ''
    objective: string
    creation_year: string
    creation_month: string
    creation_day: string
}

type CvExperience = {
    environments: string
    languages: string
    frameworks: string
    infrastructure: string
    tools: string
}

type CvOverview = {
    title: string
    period: string
    content: string
    tech_stack: string
}

type CvJob = {
    title: string
    period_from: string
    period_to: string
    period_span: string
    kind: string
    role: string
    size: string
    content: string
    lang: string
    tools: string
}

type CvData = {
    name: string
    kana: string
    birthday: string
    age: string
    nearest_station: string
    skills: string
    hobbies: string
    experience: CvExperience
    overview: CvOverview[]
    jobs: CvJob[]
}

type Resume = {
    id: number
    userId: string
    type: 'resume' | 'cv'
    title: string
    data: ResumeData | CvData
    isPublic: boolean
    createdAt: string
    updatedAt: string
}

type ResumeCreateInput =
    | { type: 'resume'; title: string; data: ResumeData; isPublic?: boolean }
    | { type: 'cv'; title: string; data: CvData; isPublic?: boolean }

type ResumeUpdateInput = {
    title?: string
    data?: ResumeData | CvData
    isPublic?: boolean
}
```
