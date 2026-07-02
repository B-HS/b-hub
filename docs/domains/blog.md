# blog 도메인

> 기준: 2026-07-02 (chore/deps-update @ `ed87433`) 코드 검증. 다루는 코드: `route/blog/*`, `service/domain/blog/*`, `compose/blog.ts`, `dto/blog/*`, 썸네일이 쓰는 `service/shared/image-generator.ts`·`font-loader.ts`, (blog 미배선 공유) `service/shared/markdown.ts`·`image-processor.ts`, `db/schema.ts`, `route/index.ts`, `index.ts`

## 개요

개인 블로그 프론트(`gumyo.net` 서브도메인)가 소비하는 JSON API 도메인. 게시글(post)·카테고리(category)·태그(tag)·댓글(comment)·소셜 피드 메시지(message)·이미지 에셋(image asset)·게시글 OG 썸네일(thumbnail)·관리자 JSON 라우트(admin)를 제공한다. 모든 라우트는 `/api` 하위 `/api/blog/*` 로 마운트된다(`index.ts` 의 `app.route('/api', api)` + `route/index.ts` 의 `/blog/*`). CORS 허용 오리진은 `gumyo.net`·`hyns.dev` 서브도메인이다(`index.ts` `allowedDomains`).

외부 의존은 두 가지다. (1) 이미지 저장소는 Cloudflare R2(S3 호환)이고, 공개 URL은 CDN 도메인 `https://blogimg.gumyo.net`(기본값)로 서빙된다. (2) 이미지 바이너리 수신·webp 변환·R2 업로드는 b-hub 가 아니라 별도 Docker 서비스 `deploy/upload-server` 가 수행하고, 완료 후 `POST /api/blog/images/complete` 콜백으로 b-hub 에 메타데이터만 기록한다(상세: [../deploy.md](../deploy.md)). 마크다운 렌더링 유틸(`service/shared/markdown.ts`)은 이 도메인 코드에 배선되어 있지 않다(아래 [주의사항](#주의사항--함정) 참조).

## 파일 맵

| 파일 | 역할 |
|------|------|
| `dto/blog/post.ts` | 게시글 목록 쿼리/생성/수정/응답 Zod 스키마, `PostListQuery`·`PostCreateInput`·`PostUpdateInput` |
| `dto/blog/comment.ts` | 댓글 목록 쿼리/생성/수정/응답 스키마 |
| `dto/blog/category.ts` | 카테고리 생성/응답 스키마 |
| `dto/blog/tag.ts` | 태그 생성/응답 스키마 |
| `dto/blog/message.ts` | 메시지 목록 쿼리/생성/응답·사용자 프로필 응답 스키마 |
| `dto/blog/image.ts` | 이미지 업로드 prepare/complete 요청·응답, 목록 응답 스키마 |
| `route/blog/post.ts` | 게시글 목록/상세/생성/수정 라우트 (`createPostRoute`) |
| `route/blog/thumbnail.ts` | 게시글 OG PNG 썸네일 생성 라우트 (`createThumbnailRoute`) |
| `route/blog/comment.ts` | 댓글 목록/작성/수정/삭제 라우트 (`createCommentRoute`) |
| `route/blog/category.ts` | 카테고리 목록/생성 라우트 (`createCategoryRoute`) |
| `route/blog/tag.ts` | 태그 목록/생성 라우트 (`createTagRoute`) |
| `route/blog/message.ts` | 메시지 피드/프로필/작성/삭제 라우트 (`createMessageRoute`) |
| `route/blog/image.ts` | 이미지 목록/prepare/삭제/complete 라우트 (`createImageRoute`) |
| `route/blog/admin.ts` | 관리자 JSON 라우트: 사용자/게시글/댓글 조회·삭제·숨김 (`createAdminRoute`) |
| `service/domain/blog/post.ts` | 게시글 서비스: list/getById(views++)/create/update/delete (`createPostService`) |
| `service/domain/blog/comment.ts` | 댓글 서비스: 작성자 소유 검증 + admin 삭제/숨김 (`createCommentService`) |
| `service/domain/blog/message.ts` | 메시지 서비스: 피드/프로필/작성/소프트삭제 (`createMessageService`) |
| `service/domain/blog/blog-image.ts` | 이미지 에셋 서비스: HMAC 업로드 토큰 발급/검증, prepare/complete/list/delete (`createBlogImageService`) |
| `compose/blog.ts` | 위 서비스의 `*ServiceDb` 를 Drizzle 로 인라인 구현·주입 + `categoryDb`/`tagDb`/`adminDb` (`composeBlog`) |
| `compose/types.ts` | `ComposeBlogArgs`(= core + `storageService` + `imageProcessor`) |
| `service/shared/image-generator.ts` | satori→resvg(WASM)로 PNG 생성(공유). **썸네일 라우트가 사용**(`route/index.ts` 가 `imageGenerator` 주입). 상세 [../reference/shared-services.md](../reference/shared-services.md) |
| `service/shared/font-loader.ts` | 폰트 로드(공유). 썸네일이 `Noto Sans KR` 400/700 로드에 사용. 상세 [../reference/shared-services.md](../reference/shared-services.md) |
| `service/shared/markdown.ts` | 마크다운→HTML 변환·HTML sanitize·strip/truncate 유틸 (공유). **현재 blog 런타임 미배선** |
| `service/shared/image-processor.ts` | sharp 래퍼 toWebp/toPng/resize/getMetadata(10MB 상한, 공유). blog 런타임에서 직접 호출 안 함(→ upload-server) |
| `route/index.ts` | `/blog/*` 마운트(아래 [엔드포인트](#api-엔드포인트)) |
| `tests/dto/blog/*`, `tests/route/blog/*`, `tests/service/domain/blog/*` | 도메인 테스트(아래 [테스트](#테스트)) |

## 데이터 모델

`db/schema.ts` 의 블로그 관련 테이블(물리 테이블명). 컬럼 상세·전체 스키마는 [../reference/db-schema.md](../reference/db-schema.md) 참조.

| 테이블(물리명) | 핵심 컬럼 | 관계 |
|------|------|------|
| `posts` | `postId`(PK, auto), `categoryId`(FK), `title`, `description`(text), `views`, `isPublished`/`isHide`/`isNotice`/`isComment`, `created_at`/`updated_at`(datetime) | `categoryId`→`categories.categoryId` |
| `categories` | `categoryId`(PK), `category`, `isHide` | — |
| `tags` | `tagId`(PK), `tag` | — |
| `post_tags` | `postId`, `tagId`, `unique(postId, tagId)` | `postId`→`posts`(cascade), `tagId`→`tags`(cascade) |
| `comments` | `commentId`(PK), `postId`(FK), `userId`(FK), `comment`(text), `isHide`, `created_at`/`updated_at` | `postId`→`posts`, `userId`→`user`(cascade) |
| `image_assets` | `id`(PK, uuid varchar36), `r2_key`(unique), `bucket`, `mime_type`, `size_bytes`, `width`/`height`, `checksum`, `uploaded_by`(FK) | `uploaded_by`→`user`(set null) |
| `messages` | `id`(PK, uuid), `userId`(FK), `body`(text), `replyToId`, `retweetOfId`, `created_at`/`updated_at`, `deleted_at`(소프트삭제) | `userId`→`user`(cascade) |
| `message_images` | `messageId`, `imageId`, `order`, `unique(messageId, imageId)` | `messageId`→`messages`(cascade), `imageId`→`image_assets`(cascade) |
| `follows` | `followerId`, `followingId`, `unique` | 프로필 팔로워/팔로잉 카운트 산출용 |
| `user` | `id`, `name`, `email`, `image`, `role` | 댓글/메시지 작성자·admin 판정(`role === 'admin'`)에 조인 |

- 레거시 `images` 테이블(`imageId` PK, `fileName`/`url` 등)은 스키마에 존재하나 blog 라우트/서비스/compose 어디서도 참조되지 않는다(grep 확인). 현재 이미지 파이프라인은 `image_assets` 만 쓴다.
- `message_likes`·`message_bookmarks` 테이블도 스키마에 있으나 현재 blog 라우트/서비스에 배선되어 있지 않다(메시지 응답에 좋아요/북마크 수 없음).

## API 엔드포인트

경로는 `index.ts`(`/api` 마운트) + `route/index.ts`(`/blog/*` 마운트) + 각 라우트 파일 기준. 인증은 핸들러 내부 `getSession` 으로 걸린다(전역 인증 미들웨어 없음). "admin" = 세션 존재 + `user.role === 'admin'`.

### 게시글 (`route/blog/post.ts`, `route/blog/thumbnail.ts` — 둘 다 `/blog/posts` 에 마운트)

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/blog/posts` | 없음 | 게시글 목록. `paginatedResponse`. 쿼리: `page`/`limit`/`keyword`/`categoryId`/`tagId`/`isPublished`/`isHide`/`isNotice` |
| GET | `/api/blog/posts/:id` | 없음 | 게시글 상세. 조회 시 `views` +1 |
| GET | `/api/blog/posts/:id/thumbnail` | 없음 | 1200×630 OG PNG 생성(satori+resvg, Noto Sans KR). `Cache-Control: public, max-age=2592000, immutable` |
| POST | `/api/blog/posts` | admin | 게시글 생성(태그 연결 트랜잭션) |
| PUT | `/api/blog/posts/:id` | admin | 게시글 수정(`tagIds` 전달 시 재설정) |

### 댓글 (`route/blog/comment.ts` — `/blog/comments`)

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/blog/comments?postId=` | 없음 | 게시글별 댓글 목록(`isHide` 댓글은 본문 빈 문자열로) |
| POST | `/api/blog/comments` | 로그인 | 댓글 작성(role 무관, 로그인만) |
| PATCH | `/api/blog/comments/:id` | 로그인 + 작성자 | 댓글 수정(소유자 아니면 `BLOG_COMMENT_NOT_FOUND`) |
| DELETE | `/api/blog/comments/:id` | 로그인 + 작성자 | 댓글 삭제 |

### 카테고리 / 태그 (`route/blog/category.ts`·`tag.ts`)

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/blog/categories` | 없음 | 노출 카테고리 목록(`isHide = false` 만) |
| POST | `/api/blog/categories` | admin | 카테고리 생성 |
| GET | `/api/blog/tags` | 없음 | 태그 목록 |
| POST | `/api/blog/tags` | admin | 태그 생성 |

### 메시지 (소셜 피드) (`route/blog/message.ts` — `/blog/messages`)

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/blog/messages/user/:userId` | 없음 | 사용자별 메시지 피드(`page`/`size`, 소프트삭제 제외, 이미지 포함) |
| GET | `/api/blog/messages/user/:userId/profile` | 없음 | 사용자 프로필(팔로워/팔로잉 수). 없으면 `NOT_FOUND` |
| POST | `/api/blog/messages` | admin | 메시지 작성(`imageIds` 순서대로 연결) |
| DELETE | `/api/blog/messages/:id` | admin + 작성자 | 메시지 소프트 삭제(`deleted_at` 설정) |

### 이미지 (`route/blog/image.ts` — `/blog/images`)

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/blog/images` | admin | 이미지 목록(메시지에 미사용된 에셋만) |
| POST | `/api/blog/images/prepare` | admin | 업로드 준비: `assetId`·`s3Key`(`<assetId>.webp`)·HMAC `uploadToken`·`uploadUrl`·`expiresAt` 발급 |
| DELETE | `/api/blog/images/:id` | admin | 이미지 삭제(R2 오브젝트 + DB 로우) |
| POST | `/api/blog/images/complete` | uploadToken(HMAC) | 업로드 완료 콜백. **세션 없이 토큰 검증**(`deploy/upload-server` 가 호출) |

### 관리자 JSON (`route/blog/admin.ts` — `/blog/admin`)

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/blog/admin/users` | admin | 전체 사용자(+댓글 수) |
| DELETE | `/api/blog/admin/users/:id` | admin | 사용자 삭제 |
| GET | `/api/blog/admin/posts` | admin | 전체 게시글(카테고리 조인) |
| DELETE | `/api/blog/admin/posts/:id` | admin | 게시글 삭제 |
| PATCH | `/api/blog/admin/posts/:id` | admin | 게시글 숨김 토글(`isHide`) |
| GET | `/api/blog/admin/comments` | admin | 전체 댓글(게시글 제목 조인) |
| DELETE | `/api/blog/admin/comments/:id` | admin | 댓글 삭제 |
| PATCH | `/api/blog/admin/comments/:id` | admin | 댓글 숨김 토글(`isHide`) |

> 이 JSON 라우트는 SSR 어드민 콘솔(`/admin/blog`, `page/admin/pages/blog.tsx`)과 별개다. SSR 어드민 UI는 [../admin-features.md](../admin-features.md) 참조.

## 핵심 흐름

### 게시글 목록/상세
- `createPostRoute` → `postService.list(query)`(`service/domain/blog/post.ts`) → `compose/blog.ts` `getPostList`. Drizzle 서브쿼리로 태그를 `JSON_ARRAYAGG` 집계, `categories` 조인, 동적 조건(keyword `LIKE`, category/tag/isPublished/isHide/isNotice) 후 `created_at`·`postId` desc 정렬 + `limit/offset`. 별도 count 쿼리로 total 산출.
- 상세: `postService.getById(id)` → 존재하면 `incrementViews(id)`(`views = views + 1`) 실행 후 반환. 없으면 라우트가 `BLOG_POST_NOT_FOUND` throw.

### 게시글 생성/수정
- `create`/`update` 는 admin 게이팅. `insertPost`/`updatePost` 는 `db.transaction` 안에서 `posts` upsert + `post_tags` 재설정(`tagIds` 전달 시 기존 삭제 후 재삽입).

### 댓글 소유권
- `commentService.update`/`delete` 는 `getCommentById` 로 존재 확인 후 `existing.userId !== userId` 면 `{ success: false, reason: 'not_owner' }` 반환 → 라우트가 `BLOG_COMMENT_NOT_FOUND` 로 변환. admin 라우트의 `adminDelete`/`adminUpdateHide` 는 소유권 무시.

### 이미지 업로드 3단계 (b-hub ↔ upload-server)
1. `POST /api/blog/images/prepare`(admin) → `blogImageService.prepare(userId)` 가 `assetId`(uuid)·`s3Key = <assetId>.webp` 를 만들고 `HMAC-SHA256(UPLOAD_SERVER_SECRET)` 로 `uploadToken` 서명(TTL 10분). `uploadUrl = UPLOAD_SERVER_URL` 반환.
2. 클라이언트가 원본 파일을 `deploy/upload-server` 로 업로드 → upload-server 가 webp 변환·R2 업로드 후 `POST {hubBaseUrl}/api/blog/images/complete` 로 콜백(`deploy/upload-server/blog-image-handler.ts`).
3. `blogImageService.complete` 가 토큰을 상수시간 비교로 검증 + `s3Key === <assetId>.webp` 확인 후 `image_assets` 로우 삽입, 공개 URL(`storageService.getUrl`) 반환. 토큰 불일치 시 `UNAUTHORIZED`, s3Key 불일치 시 `VALIDATION_ERROR`.

### 썸네일 OG 이미지
- `createThumbnailRoute` → `postService.getById(id)` 로 제목/카테고리/첫 태그를 얻어(이때도 `views` +1) 정적 그리드 배경 위에 satori(JSX→SVG) + resvg(SVG→PNG)로 1200×630 PNG 생성. 폰트는 `fontLoader.load('Noto Sans KR', 400/700)`.

### 메시지 피드
- `getMessagesByUserId`: `deleted_at IS NULL` 메시지를 페이지네이션 조회 후 메시지별로 `message_images`→`image_assets` 조인해 이미지 배열 구성. 응답은 `{ content, totalElements, totalPages, prev, next }`. 프로필은 `follows` 서브쿼리로 팔로워/팔로잉 수 계산.

## 환경변수

이 도메인이 쓰는 것(전부 optional, 미설정 시 폴백). 상세는 [../reference/env.md](../reference/env.md).

| 변수 | 용도 |
|------|------|
| `R2_END_POINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2(S3) 클라이언트(`compose/shared.ts`) |
| `R2_BUCKET` | 버킷명(기본 `blog-cloud`) |
| `R2_CUSTOM_DOMAIN` / `R2_CUSTOME_DOMAIN` | 이미지 공개 CDN 도메인(기본 `https://blogimg.gumyo.net`) |
| `UPLOAD_SERVER_URL` | prepare 응답의 `uploadUrl` |
| `UPLOAD_SERVER_SECRET` | 업로드 토큰 HMAC 시크릿(prepare 서명 / complete 검증, 기본 `''`) |

## 에러 코드

`lib/error-code.ts` 중 blog 라우트/서비스에서 실제로 throw 하는 코드(`route/blog/*`·`service/domain/blog/*` grep 확인).

| 코드 | 메시지 | 발생 지점 |
|------|--------|-----------|
| `UNAUTHORIZED` | — | 세션 없음 / 업로드 토큰 검증 실패 |
| `FORBIDDEN` | — | admin 아님 / 이미지 삭제 시 허용되지 않은 `r2Key` |
| `NOT_FOUND` | — | 프로필/메시지/이미지 에셋 없음 |
| `VALIDATION_ERROR` | — | complete 의 `s3Key` 불일치 |
| `BLOG_POST_NOT_FOUND` | 게시글을 찾을 수 없습니다 | 게시글 상세/수정/삭제/썸네일 |
| `BLOG_COMMENT_NOT_FOUND` | 댓글을 찾을 수 없습니다 | 댓글 수정/삭제(비소유자 포함) |

- `BLOG_CATEGORY_NOT_FOUND`·`BLOG_IMAGE_TOO_LARGE`(413)·`BLOG_IMAGE_INVALID_TYPE`(422) 는 `lib/error-code.ts` 에 `BLOG_*` 코드로 정의(+메시지/상태 매핑)돼 있으나 현재 blog 라우트/서비스 어디서도 throw 하지 않는다(정의만 존재, grep 확인). 이미지 검증/처리를 upload-server 에 위임하므로 이미지 관련 코드도 blog 런타임에서 발생하지 않는다.
- `IMAGE_PROCESS_FAILED` 는 `service/shared/image-processor.ts` 에서만 throw(10MB 초과 등). blog 런타임은 이미지 처리를 직접 하지 않으므로 이 도메인 라우트에서는 발생하지 않는다.

## 테스트

실행: `bun test <경로>` (전체: `bun test`).

- DTO: `tests/dto/blog/post.test.ts`, `comment.test.ts`, `category.test.ts`, `tag.test.ts`, `message.test.ts`, `image.test.ts`
- 라우트: `tests/route/blog/post.test.ts`, `comment.test.ts`, `category.test.ts`, `tag.test.ts`, `message.test.ts`, `image.test.ts`, `admin.test.ts` (thumbnail 전용 테스트는 없음)
- 서비스: `tests/service/domain/blog/post.test.ts`, `comment.test.ts`, `message.test.ts`, `blog-image.test.ts`
- 공유(참고): `tests/service/shared/markdown.test.ts`, `image-processor.test.ts`, `image-generator.test.ts`, `font-loader.test.ts`
- SSR 어드민(참고): `tests/page/admin/blog.test.ts`

## 주의사항 / 함정

- **`GET /api/blog/posts/:id` 는 공개 + 비공개/미발행 필터 없음**: `getById` 는 `isHide`/`isPublished` 를 검사하지 않아 id 만 알면 숨김·미발행 게시글도 반환된다. 목록(`GET /api/blog/posts`)의 `isPublished`/`isHide` 필터는 클라이언트가 넘기는 쿼리이므로, 공개 목록은 프론트가 `isPublished=true`·`isHide=false` 를 명시해야 한다.
- **조회수 증가 부작용**: `getById` 는 호출마다 `views` 를 +1 한다. 상세 조회뿐 아니라 **썸네일 생성(`/:id/thumbnail`)도** `getById` 를 거치므로 OG 이미지 요청이 조회수를 올린다. 중복 방지 로직 없음.
- **댓글 숨김 = 본문 마스킹**: `getCommentsByPostId` 는 `isHide` 댓글의 `comment` 를 빈 문자열로 바꿔 내려준다(로우 자체는 유지).
- **마크다운 미배선**: `service/shared/markdown.ts`(마크다운→HTML + `<script>`/이벤트핸들러/위험 href sanitize)는 자체 테스트 외에 compose/route/page 어디에도 import 되지 않는다(grep 확인). 게시글 `description` 은 raw text 로 저장·반환되며, HTML 렌더링은 프론트 책임이다. 서버에서 마크다운/삭제소독을 태우려면 이 서비스를 compose 에 배선해야 한다.
- **imageProcessor 미사용**: `composeBlog` 는 `imageProcessor`(sharp)를 인자로 받지만 본문에서 호출하지 않는다. webp 변환은 `deploy/upload-server` 에서 일어난다.
- **메시지 이미지 URL 하드코딩**: `compose/blog.ts` 의 메시지 이미지 URL은 `storageService.getUrl` 대신 `https://blogimg.gumyo.net/${r2Key}` 를 직접 문자열로 조립한다(이미지 에셋 목록은 `getUrl` 사용). CDN 도메인을 바꾸면 두 경로가 어긋날 수 있다.
- **thumbnail 라우트도 `/blog/posts` 에 마운트**: `createPostRoute` 와 `createThumbnailRoute` 가 같은 접두사에 붙는다(경로가 `/:id` vs `/:id/thumbnail` 로 달라 충돌 없음).

## 관련 문서

- [../deploy.md](../deploy.md) — R2·CDN, `deploy/upload-server`(이미지 수신·webp·R2·complete 콜백) 상세
- [../reference/db-schema.md](../reference/db-schema.md) — 전체 테이블/컬럼 정의
- [../reference/env.md](../reference/env.md) — 전체 환경변수
- [../admin-features.md](../admin-features.md) — SSR 어드민(`/admin/blog`, `/admin/messages`) 기능
- [../hono-reference.md](../hono-reference.md) — 라우트/OpenAPI/에러·응답 헬퍼 패턴
- [../DESIGN.md](../DESIGN.md) — 블로그 프론트 디자인 시스템(프론트 소비 측)
