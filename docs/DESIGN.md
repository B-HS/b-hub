# BBlog — Design System

> 프레임워크 중립 디자인 문서. 이 문서만으로 Next.js / Nuxt / SvelteKit / Astro / Solid Start 등 어떤 스택에서든 BBlog의 시각적 정체성을 ~100% 충실도로 재구성할 수 있습니다.

---

## 1. Meta & Scope

### 1‑1. 문서 목적

BBlog는 `blog.gumyo.net`에 배포된 개인 기술 블로그입니다. Frontend Engineer의 글 작성·공개·관리, 관리자 도구, 방명록(log), OAuth 로그인을 포함하는 중소 규모 애플리케이션입니다. 이 문서는 BBlog의 **모든 시각 결정**(색상, 타이포그래피, 스페이싱, 레이아웃, 컴포넌트 해부, 모션, 접근성)을 **원본 코드에 의존하지 않고도** 재구현할 수 있도록 기술합니다.

### 1‑2. 대상 충실도

- 픽셀 단위 / 라운드 단위 / 트랜지션 시간 단위까지 원본과 동일하게 재현 가능한 수준.
- shadcn/ui new-york 프리셋을 기준으로 하되, shadcn이 없는 스택에서도 의미론적 HTML + ARIA + Tailwind v4만으로 동일한 결과를 얻도록 설계.

### 1‑3. 프레임워크 매트릭스

| 영역 | 원본 스택 | 대체 가능 스택 |
|---|---|---|
| 런타임 | Next.js 16 (App Router, RSC, React Compiler) | Nuxt 3 · SvelteKit · Astro · Solid Start · Remix |
| UI 라이브러리 | shadcn/ui (new-york) + Radix | Vue: Radix Vue · Svelte: Bits UI · 기본 HTML + cmdk / headless primitives |
| 스타일링 | Tailwind v4 (`@import 'tailwindcss'`, `@theme inline`) | Tailwind v4 타 프레임워크에서도 그대로 사용 가능 |
| 다크모드 | `next-themes` (`attribute='class'`, 시스템 감지) | CSS `@media (prefers-color-scheme: dark)` + `[data-theme]` 수동 토글 |
| 아이콘 | `lucide-react` + 커스텀 SVG (`ui/icons/github.tsx`) | `lucide` 패키지(바닐라) · 직접 SVG 삽입 |
| 캐러셀 | `embla-carousel-react` | `embla-carousel`(바닐라) · `keen-slider` · CSS scroll-snap |
| 명령 팔레트 | `cmdk` | 사용자 정의 콤보박스(role=dialog + role=listbox) |
| 토스트 | `sonner` | `vue-sonner` · `svelte-sonner` · 사용자 정의 live region |
| 마크다운 | `unified` + `remark-*` + `rehype-*` | 서버 사이드 MD→HTML 파이프라인 자유 선택 |
| 인증 | `better-auth` (OAuth) | 재현 대상 아님 — 시각만 중요 |
| 쿼리 | `@tanstack/react-query` | `@tanstack/vue-query` · `@tanstack/svelte-query` |

### 1‑4. 범위(in / out)

- **In scope**: 색상 토큰, 타이포그래피, 스페이싱/라운드/쉐도우 스케일, 컴포넌트 해부(원형 + 인스턴스), 페이지 패턴, 반응형 규칙, 다크모드, 모션, 접근성, 프레임워크 중립 매핑, Tailwind v4 `@theme` 블록.
- **Out of scope**: 데이터 계층(Drizzle ORM, MySQL, API 라우트), 인증 구현, SEO 메타데이터 내용, Markdown 파이프라인 내부 구성, 빌드/배포.

### 1‑5. 딜리버리 레이어

1. `:root { --… }` — 바닐라 CSS 커스텀 프로퍼티 (16장).
2. `@theme inline { … }` — Tailwind v4 전용 테마 블록 (16장).
3. `@custom-variant dark (…)` — 다크 모드 변형 트리거 (16장).

세 레이어는 동일한 토큰을 반복해 노출합니다. 어떤 스택에서도 `:root` 블록만 있으면 렌더링이 성립합니다.

### 1‑6. 읽는 순서

실무자 별 권장 순서:
- **토큰 도입**: §16 → §3 → §4 → §5 → §6
- **컴포넌트 재현**: §10 → §13 → §14 → §17
- **페이지 합성**: §8 → §9 → §11 → §13
- **검증**: §18

---

## 2. Visual Theme & Atmosphere

BBlog의 시각적 정체성은 **"가장 조용한 흑백"** 한 문장으로 요약됩니다. Tailwind가 기본 제공하는 `neutral` 팔레트를 그대로 채택한 것이 아니라, shadcn/ui new-york 프리셋이 제시하는 **완전 무채색(OKLCH C = 0)** 팔레트를 사용합니다. 모든 UI 표면이 `oklch(1 0 0)`(순수 흰색)부터 `oklch(0.145 0 0)`(거의 검정)까지의 무채색 계단을 따라 움직이며, 유일한 채도는 **파괴적 동작(destructive)** 과 **차트 시리즈** 두 곳에서만 허용됩니다. 결과적으로 본문을 읽을 때 색이 인지되지 않고, 글과 코드 블록의 하이라이팅만이 색의 유일한 독자가 됩니다.

이 톤은 블로그 포스트라는 콘텐츠의 가독성을 위한 의도적 선택입니다. 포스트 리스트의 카드들, 기사 본문의 `prose` 래퍼, 댓글 쓰레드, 관리자 테이블 — 어느 영역에서도 브랜드 컬러가 사용자의 시선을 간섭하지 않습니다. Hover/active 상태조차 무채색 단계를 한 칸 이동하는 것으로 표현되며, 주요 액션 버튼은 **near-black 배경 + near-white 전경**(라이트 모드) 또는 반대(다크 모드)로 전환되어, 동일한 대비 비율을 유지합니다. 이는 "화면 전체가 단일한 먹빛 종이 한 장"처럼 읽히도록 유도합니다.

섬세한 레이어감은 **좌우·상하 6~7px의 얕은 쉐도우**와 **1px 무채색 경계선**의 이중 장치로 만들어집니다. shadcn 프리셋의 기본 쉐도우 8단계가 그대로 보존되어, "카드"와 "팝오버"가 각자의 깊이를 점유합니다. 라운드는 `0.375rem`(6px)을 중심으로 ±2/4px의 좁은 범위만 사용하며, **full round는 아바타·뱃지·페이지 인덱스에만** 쓰입니다. 이 제약이 곧 BBlog의 규칙집입니다.

### 2‑1. 여섯 가지 핵심 특성

1. **모노크롬 우선(Monochrome-first)** — 모든 중립 토큰은 OKLCH chroma 0. 색은 오직 경고(destructive)와 차트 시리즈에서만 허용.
2. **저명도 브랜드(Quiet brand)** — primary 컬러는 별도 hue 없이 `oklch(0.205 0 0)`(near-black). 즉 "브랜드 = 고대비 글로벌 흑백"으로 정의됨.
3. **얕은 깊이(Shallow depth)** — 박스 쉐도우는 `0 0 7px`의 얕은 고정 블러에 1~10px 수직 오프셋이 곁들여지는 8단 스케일.
4. **좁은 라운드 대역(Tight radius band)** — 라디우스 토큰은 총 4단: `sm=2px / md=4px / lg=6px / xl=10px`. 추가 단계는 금지.
5. **타이포 무게 5단(Five-weight typography)** — normal(400), medium(500), semibold(600), bold(700), extrabold(800) 다섯 단만 사용. 그 외 무게는 소스 전체에서 관찰되지 않음.
6. **2xs/3xs 극세 스텝(Micro text-size)** — `text-2xs(10px)`, `text-3xs(8px)`가 Tailwind v4 `@theme`에 추가되어 코드 블록과 메타데이터 영역에서만 등장.
7. **스크롤바 제거 + 가상 스크롤바**(Scrollbar-free) — 기본 스크롤바는 `scrollbar-width: none` + `::-webkit-scrollbar { display: none }`으로 제거하고, 우측 상단에 너비 0.75rem의 자체 스크롤바 위젯(`VirtualScroll`)을 띄움.
8. **한글 우선, 시스템 폰트(Korean-first system)** — 별도 폰트 로딩 없이 `ui-sans-serif → system-ui → -apple-system → Segoe UI → Roboto → 'Helvetica Neue' → Arial → 'Noto Sans'` 스택에 의존. 플랫폼 기본 한글 폰트(Apple SD Gothic Neo / Malgun Gothic / Noto Sans CJK)가 자동으로 채택됨.

---

## 3. Color System (Light)

### 3‑1. 팔레트 레이어 (Tier 1)

모든 색은 OKLCH. 주석에는 원본 hex 근사치를 병기합니다. 변환 기준은 Oklab 좌표계, 3자리 소수 L/C, 정수 H.

> 변환 도구: **Culori** 1.4 (`oklch()` converter). 근사 hex는 sRGB 공간에서 gamut clipping 후 표기.

```css
:root {
  /* ───────── Neutrals (chroma 0, 9-step scale) ───────── */
  /* #ffffff — pure white */
  --palette-neutral-0:   oklch(1     0 0);
  /* #fafafa — near-white, surface highlight */
  --palette-neutral-25:  oklch(0.985 0 0);
  /* #f5f5f5 — muted/secondary surface */
  --palette-neutral-50:  oklch(0.97  0 0);
  /* #e5e5e5 — border, input */
  --palette-neutral-200: oklch(0.922 0 0);
  /* #a3a3a3 — ring / focus */
  --palette-neutral-400: oklch(0.708 0 0);
  /* #737373 — muted text */
  --palette-neutral-500: oklch(0.556 0 0);
  /* #404040 — dark-mode muted surface */
  --palette-neutral-700: oklch(0.269 0 0);
  /* #262626 — primary brand (near-black) */
  --palette-neutral-800: oklch(0.205 0 0);
  /* #171717 — foreground on light, surface on dark */
  --palette-neutral-900: oklch(0.145 0 0);

  /* ───────── Destructive (red, single accent) ───────── */
  /* #dc2626 — light-mode destructive surface */
  --palette-red-500:     oklch(0.577 0.245 27);
  /* #ef4444 — dark-mode destructive surface */
  --palette-red-400:     oklch(0.704 0.191 22);

  /* ───────── Chart series (light) ───────── */
  /* #d97706 — amber */
  --palette-chart-light-1: oklch(0.646 0.222 41);
  /* #0891b2 — teal */
  --palette-chart-light-2: oklch(0.600 0.118 185);
  /* #334155 — slate-blue */
  --palette-chart-light-3: oklch(0.398 0.070 227);
  /* #facc15 — yellow */
  --palette-chart-light-4: oklch(0.828 0.189 84);
  /* #f59e0b — warm amber */
  --palette-chart-light-5: oklch(0.769 0.188 70);
}
```

**팔레트 규칙**
- 팔레트 레이어 변수는 **컴포넌트 CSS에서 직접 참조하지 않음**. 반드시 시맨틱 레이어를 경유.
- 9단 무채색 + 2단 destructive + 5단 차트 = **총 16개** raw 토큰.

### 3‑2. 시맨틱 레이어 (Tier 2)

```css
:root {
  /* Surface */
  --color-background:           var(--palette-neutral-0);
  --color-foreground:           var(--palette-neutral-900);
  --color-card:                 var(--palette-neutral-0);
  --color-card-foreground:      var(--palette-neutral-900);
  --color-popover:              var(--palette-neutral-0);
  --color-popover-foreground:   var(--palette-neutral-900);

  /* Brand */
  --color-primary:              var(--palette-neutral-800);
  --color-primary-foreground:   var(--palette-neutral-25);

  /* Subtle surfaces */
  --color-secondary:            var(--palette-neutral-50);
  --color-secondary-foreground: var(--palette-neutral-800);
  --color-muted:                var(--palette-neutral-50);
  --color-muted-foreground:     var(--palette-neutral-500);
  --color-accent:               var(--palette-neutral-50);
  --color-accent-foreground:    var(--palette-neutral-800);

  /* Feedback */
  --color-destructive:            var(--palette-red-500);
  --color-destructive-foreground: var(--palette-neutral-0);

  /* Structure */
  --color-border:               var(--palette-neutral-200);
  --color-input:                var(--palette-neutral-200);
  --color-ring:                 var(--palette-neutral-400);

  /* Sidebar (admin shell) */
  --color-sidebar:                        var(--palette-neutral-25);
  --color-sidebar-foreground:             var(--palette-neutral-900);
  --color-sidebar-primary:                var(--palette-neutral-800);
  --color-sidebar-primary-foreground:     var(--palette-neutral-25);
  --color-sidebar-accent:                 var(--palette-neutral-50);
  --color-sidebar-accent-foreground:      var(--palette-neutral-800);
  --color-sidebar-border:                 var(--palette-neutral-200);
  --color-sidebar-ring:                   var(--palette-neutral-400);

  /* Chart (used only if charting component introduced) */
  --color-chart-1: var(--palette-chart-light-1);
  --color-chart-2: var(--palette-chart-light-2);
  --color-chart-3: var(--palette-chart-light-3);
  --color-chart-4: var(--palette-chart-light-4);
  --color-chart-5: var(--palette-chart-light-5);
}
```

**시맨틱 규칙**
- 컴포넌트는 **오직 `--color-*`** 만 참조. 이는 다크모드 재바인딩이 시맨틱 레벨에서만 일어나기 위한 전제.
- `primary`와 `foreground`가 **같은 색**이 아닌 점에 주의: `primary = 0.205`(브랜드), `foreground = 0.145`(본문 글자). 본문 텍스트는 더 진한 검정.
- `muted = secondary = accent = 0.97` — 세 값 모두 동일한 매우 연한 회색 표면. 다만 **역할**(hover 배경, 비활성, 강조) 분리를 위해 별도 시맨틱 이름 유지.

### 3‑3. 차트 시리즈 배정 규칙

현재 BBlog 본문에는 차트 컴포넌트가 존재하지 않지만(`recharts`/`chart.js` 의존성 없음), shadcn 프리셋이 제공하는 5색 시리즈를 **미래 도입 시 즉시 사용 가능한 토큰**으로 예약합니다. 차트가 도입될 때의 권장 매핑:

| 데이터 역할 | 라이트 토큰 | 다크 토큰 |
|---|---|---|
| 주요(primary series) | `--color-chart-1` (amber) | `--color-chart-1` (indigo) |
| 보조 대비(contrast) | `--color-chart-2` (teal) | `--color-chart-2` (emerald) |
| 배경 계열(neutral data) | `--color-chart-3` (slate) | `--color-chart-3` (amber) |
| 강조(highlight) | `--color-chart-4` (yellow) | `--color-chart-4` (purple) |
| 경고/이상치(alert) | `--color-chart-5` (warm amber) | `--color-chart-5` (red) |

라이트 팔레트는 **난색 중심**(amber/yellow 지배), 다크 팔레트는 **한색 중심**(indigo/emerald/purple 지배). 이는 shadcn new-york 기본값의 의도를 그대로 보존합니다.

### 3‑4. 그라디언트 정책

**단 한 곳에서만** 사용됩니다: `widgets/log/log-page-header.tsx`의 배너 오버레이.

```css
/* 배너 위 얕은 그라디언트 — 인물 사진 위에 텍스트 가독성 확보 */
background-image: linear-gradient(
  to bottom,
  oklch(0.985 0 0 / 10%),   /* 상단: near-white 10% */
  oklch(0.269 0 0 / 10%)    /* 하단: dark 10% */
);
```

**규칙**
- 신규 그라디언트는 도입 금지. 브랜드 시각을 "무채색 평면 + 얕은 쉐도우"로 유지하기 위함.
- 그라디언트 끝 알파는 최대 10%. 주제 이미지의 가독성 보조 이상 역할 없음.

### 3‑5. 기타 색 (비토큰)

- `text-green-500` — `features/common/user-card.tsx`의 인증 뱃지(verified icon).
- `text-red-500` — 동 파일의 비인증 인디케이터.
- `text-blue-900 dark:text-blue-200` — user-card의 외부 링크.
- `#24292f` — `ui/icons/github.tsx` 하드코딩된 GitHub 브랜드 블랙.
- `bg-black/60`, `bg-black/80` — `widgets/log/log-message-form.tsx`의 이미지 제거 버튼 오버레이.
- `bg-neutral-800 border-neutral-600 text-neutral-100` — `features/common/code-block.tsx`(코드 블록 프레임). 다크모드 고정(라이트 모드에서도 검정 배경).

이들은 Tailwind 팔레트(`blue-900`, `green-500` 등)와 하드코딩된 브랜드 로고색으로 남겨둡니다. **시맨틱 토큰으로 승격하지 않음** — 각자 매우 제한된 문맥에서만 쓰이기 때문. 다만 재구현 시 아래 해당 Tailwind 토큰이 가진 값을 유지해야 합니다:
- `green-500` ≈ `oklch(0.723 0.219 150)`
- `red-500` ≈ `oklch(0.637 0.237 25)`
- `blue-900` ≈ `oklch(0.379 0.146 265)`
- `blue-200` ≈ `oklch(0.882 0.059 254)`
- `neutral-100` ≈ `oklch(0.961 0 0)`
- `neutral-600` ≈ `oklch(0.439 0 0)`
- `neutral-800` ≈ `oklch(0.269 0 0)`

---

## 4. Dark Mode System

### 4‑1. 철학

BBlog의 브랜드 철학은 **모노크롬(C = 0)** 입니다. 다크모드 파생은 이 철학을 깨뜨리지 않습니다. 즉, 다크 모드의 검정(`oklch(0.145 0 0)`)은 파랗지도(cool) 따뜻하지도(warm) 않은 **완전 무채색**입니다. 단순 명도 반전이 아니라, "종이 위 먹글씨"의 라이트 버전을 "검은 화면 위 하얀 글씨"로 뒤집은 대칭 디자인입니다.

**보존 원칙**
- 모든 중립 토큰은 다크에서도 **chroma 0 유지**.
- 모든 시맨틱 이름은 라이트/다크에서 **동일한 이름·동일한 역할** 유지.
- 팔레트 레이어는 고정. 다크 재바인딩은 **시맨틱 레벨에서만** 일어남.
- destructive / chart 시리즈는 다크 모드 전용 값이 별도 존재(명도 ↑, 채도 ↓ 조정).

### 4‑2. 다크 팔레트

```css
:root {
  /* ───────── Neutrals remain identical — same palette file ───────── */
  /* (no new dark-specific neutrals required; reuse neutral scale) */

  /* ───────── Destructive (dark) ───────── */
  /* #ef4444 — higher L, lower C for AA on dark surface */
  --palette-red-dark:    oklch(0.704 0.191 22);

  /* ───────── Chart series (dark) ───────── */
  /* #6366f1 — indigo */
  --palette-chart-dark-1: oklch(0.488 0.243 264);
  /* #10b981 — emerald */
  --palette-chart-dark-2: oklch(0.696 0.170 162);
  /* #f59e0b — amber (shared with light-5) */
  --palette-chart-dark-3: oklch(0.769 0.188 70);
  /* #a855f7 — purple */
  --palette-chart-dark-4: oklch(0.627 0.265 304);
  /* #ef4444 — red */
  --palette-chart-dark-5: oklch(0.645 0.246 16);

  /* ───────── Alpha-based borders (dark only) ───────── */
  /* 10% white — subtle separator on dark surface */
  --palette-border-dark:  oklch(1 0 0 / 10%);
  /* 15% white — input border on dark surface */
  --palette-input-dark:   oklch(1 0 0 / 15%);
}
```

### 4‑3. 다크 시맨틱 재바인딩

```css
/* Trigger 1 — OS preference (자동 감지) */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background:           var(--palette-neutral-900);
    --color-foreground:           var(--palette-neutral-25);
    --color-card:                 var(--palette-neutral-800);
    --color-card-foreground:      var(--palette-neutral-25);
    --color-popover:              var(--palette-neutral-800);
    --color-popover-foreground:   var(--palette-neutral-25);

    --color-primary:              var(--palette-neutral-200);
    --color-primary-foreground:   var(--palette-neutral-800);

    --color-secondary:            var(--palette-neutral-700);
    --color-secondary-foreground: var(--palette-neutral-25);
    --color-muted:                var(--palette-neutral-700);
    --color-muted-foreground:     var(--palette-neutral-400);
    --color-accent:               var(--palette-neutral-700);
    --color-accent-foreground:    var(--palette-neutral-25);

    --color-destructive:            var(--palette-red-dark);
    --color-destructive-foreground: var(--palette-neutral-25);

    --color-border:               var(--palette-border-dark);
    --color-input:                var(--palette-input-dark);
    --color-ring:                 var(--palette-neutral-500);

    --color-sidebar:                        var(--palette-neutral-800);
    --color-sidebar-foreground:             var(--palette-neutral-25);
    --color-sidebar-primary:                var(--palette-chart-dark-1);
    --color-sidebar-primary-foreground:     var(--palette-neutral-25);
    --color-sidebar-accent:                 var(--palette-neutral-700);
    --color-sidebar-accent-foreground:      var(--palette-neutral-25);
    --color-sidebar-border:                 var(--palette-border-dark);
    --color-sidebar-ring:                   var(--palette-neutral-500);

    --color-chart-1: var(--palette-chart-dark-1);
    --color-chart-2: var(--palette-chart-dark-2);
    --color-chart-3: var(--palette-chart-dark-3);
    --color-chart-4: var(--palette-chart-dark-4);
    --color-chart-5: var(--palette-chart-dark-5);
  }
}

/* Trigger 2 — manual override (항상 OS 프리퍼런스보다 우선) */
[data-theme="dark"] { /* same rebindings as above */ }
[data-theme="light"] { /* empty — falls through to light :root defaults */ }
```

**원본 스택 주의**: 원본은 `next-themes`의 `attribute='class'` 모드를 사용해 `<html class="dark">`로 토글하고, `@custom-variant dark (&:is(.dark *))` 가 이를 Tailwind 변형으로 연결합니다. 프레임워크 중립 버전에서는 `[data-theme="dark"]` 속성이 표준이며, `<html data-theme="dark">` 로 동일한 결과를 얻습니다. Tailwind custom variant도 `[data-theme="dark"]`로 재정의(§16 참고).

### 4‑4. 쉐도우/보더 다크 변형

**쉐도우** — 원본은 라이트/다크에서 **동일한 값**을 유지(`hsl(0 0% 0% / 6%)` 기반). 다크 표면에서도 검은 쉐도우가 "내려앉은" 입체감을 만듭니다. 별도 다크 변형 불필요.

**보더** — 다크에서는 배경색이 어둡기 때문에 무채색 회색 보더(`neutral-200`)가 거의 보이지 않습니다. 다크에서는 `oklch(1 0 0 / 10%)`(흰색 10% 알파)로 **경계선을 빛의 얇은 층**으로 처리. 이로써 라이트·다크 모두 "보이되 침범하지 않는 선"을 유지합니다.

### 4‑5. Notice/Warning 색

이 프로젝트에는 **별도의 경고/주의 전용 색이 없습니다.** `destructive` 하나로 파괴적 동작 + 오류 + 숨김 상태를 모두 처리합니다(예: admin-panel의 "Hidden" 배지에서 `bg-destructive/10 text-destructive`). 다크에서는 `destructive`가 `oklch(0.704 0.191 22)`(`red-400`)으로 명도↑ 채도↓ 조정되므로 추가 설정 불요.

경고 전용 토큰이 필요해진다면 (향후 확장):
- 라이트: `oklch(0.752 0.164 85)` (amber-500 근사)
- 다크: `oklch(0.828 0.189 84)` (yellow, chart-light-4와 동일)

이 두 값은 WCAG AA (4.5:1) body text 기준을 라이트/다크 양쪽에서 모두 통과합니다.

### 4‑6. 다크 모드 주의사항

- **`code-block.tsx`는 항상 다크 테마**: `bg-neutral-800 border-neutral-600 text-neutral-100` 하드코딩. 라이트 모드에서도 코드 블록은 검정 프레임을 유지합니다. `highlight.js/styles/stackoverflow-dark.min.css`가 양 모드에서 로드되므로 하이라이팅 일관성 보장. 이는 **의도된 디자인**이며 재구현 시에도 보존.
- **`scrollbar-toc` 점 마커**: `::before { color: var(--primary); }` — 라이트에서 진한 회색, 다크에서 밝은 회색. 자동 반전.
- **GitHub 로고**: `fill="#24292f"` 하드코딩 + `dark:invert` 적용. 다크에서는 CSS filter로 반전되어 흰색 아이콘으로 보임.
- **이미지 제거 버튼**(`log-message-form.tsx`): `bg-black/60 hover:bg-black/80` — 모드와 무관하게 반투명 검정 유지. 이미지 위에 얹히므로 시각적 일관성을 위해 의도적 하드코딩.
- **`user-card`의 verified/링크 색**: `text-green-500 / text-red-500` 라이트 다크 공통; 링크는 `text-blue-900 dark:text-blue-200` 명시 반전.

### 4‑7. 토글 구현 레퍼런스

```ts
// 원본: next-themes
<ThemeProvider
  attribute="class"        // html.dark 토글
  defaultTheme="system"    // OS 프리퍼런스 감지
  enableSystem             // auto 모드 허용
  disableTransitionOnChange // 토글 순간 모든 transition 차단(깜빡임 방지)
/>
```

**프레임워크 중립 재구현 권장**
1. `<html data-theme={state}>` 를 수동 토글.
2. 초기값: `matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'`.
3. 토글 순간 `<html>`에 `transition-none` 클래스를 약 100ms 부여 후 제거 — shadcn의 `disableTransitionOnChange`와 동일한 UX.
4. 저장: `localStorage.theme`(`'system' | 'light' | 'dark'`). `system` 값일 때만 `matchMedia`를 구독.

---

## 5. Typography

### 5‑1. 루트 폰트-사이즈 정책

- **원본은 `html { font-size }`를 명시하지 않음**. 따라서 브라우저 기본값 **16px = `1rem`** 이 적용됩니다. `62.5%` 트릭을 사용하지 않으므로, Tailwind rem 기반 유틸리티(`text-sm = 0.875rem = 14px` 등)는 기본 배율대로 동작.
- 재구현 시에도 `html { font-size: … }` 를 명시하지 말 것 — 원본 픽셀값이 그대로 유지되어야 함.

### 5‑2. 폰트 패밀리

원본은 OS 시스템 폰트만 사용합니다. 외부 웹폰트(Pretendard, Noto Sans KR 등) 로딩 없음. 따라서 한글 사용자에게는 플랫폼 기본 CJK 폰트(Apple SD Gothic Neo / Malgun Gothic / Noto Sans CJK)가 자동 할당됩니다.

```css
:root {
  --font-sans:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    'Noto Sans',
    sans-serif,
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Noto Color Emoji';

  --font-serif:
    ui-serif, Georgia, Cambria,
    'Times New Roman', Times, serif;

  --font-mono:
    ui-monospace, SFMono-Regular,
    Menlo, Monaco, Consolas,
    'Liberation Mono', 'Courier New',
    monospace;
}
```

**역할 분담**
- `--font-sans` — 기본 본문 및 모든 UI. `html`, `body`에 적용.
- `--font-mono` — 코드 블록, 인라인 코드. `prose code`, `features/common/code-block.tsx` 내부.
- `--font-serif` — 현재 BBlog에서 **사용되지 않음**. shadcn 프리셋 기본값이 토큰으로만 존재. 재구현 시 제거해도 무방하나 호환성을 위해 유지 권장.

### 5‑3. 언어 인식

현재 `<html lang="ko">` 한 가지 로케일만 고정. 추가 언어 지원이 필요해지면 아래 패턴을 채택:

```css
/* 기본: ko — 시스템 폰트가 자동으로 Korean glyph 커버 */
html[lang="en"] { font-family: var(--font-sans); }
html[lang="ja"] { font-family: var(--font-sans); }
/* 필요 시 언어별 pre-stack 추가 */
```

현재 원본에는 언어별 분기 없음. 이 섹션은 확장 가이드로서의 메모.

### 5‑4. 웨이트 정책

**사용 웨이트: 5종.** 그 외 웨이트 사용 금지.

| 토큰 | 값 | 대표 사용처 |
|---|---|---|
| `font-normal` | 400 | 본문, 폼 인풋 값 |
| `font-medium` | 500 | 버튼 텍스트, 사이드바 메뉴 아이템, 메타데이터 |
| `font-semibold` | 600 | 다이얼로그 타이틀, `prose h2/h3`, 아바타 Fallback |
| `font-bold` | 700 | `prose th`, post 카드 제목, admin 섹션 타이틀 |
| `font-extrabold` | 800 | 헤더 로고(`Gumyoʼs Blog`), `prose h1` (`text-3xl lg:text-5xl font-extrabold`) |

### 5‑5. 타입 스케일

```css
:root {
  /* shadcn/Tailwind v4 기본 유지 + 커스텀 확장 */
  --text-3xs:   0.5rem;     /* 8px  — 소스 전체에서 관찰되지 않지만 토큰만 예약 */
  --text-2xs:   0.625rem;   /* 10px — features/common/code-block.tsx: `text-2xs lg:text-sm` */
  --text-xs:    0.75rem;    /* 12px */
  --text-sm:    0.875rem;   /* 14px */
  --text-base:  1rem;       /* 16px */
  --text-lg:    1.125rem;   /* 18px */
  --text-xl:    1.25rem;    /* 20px */
  --text-2xl:   1.5rem;     /* 24px */
  --text-3xl:   1.875rem;   /* 30px — prose h1 mobile */
  --text-5xl:   3rem;       /* 48px — prose h1 lg */
}
```

라인-하이트, 트래킹은 Tailwind v4 기본값 유지:
- `leading-7` = 1.75rem (28px) — `prose p` 기본.
- `tracking-tight` — `prose h1/h2/h3`.
- `tracking-widest` — `command.tsx` CommandShortcut(키보드 단축키 표기).

### 5‑6. 의미론적 타이포그래피 테이블

| 역할 | 클래스 조합 | 산출 값 |
|---|---|---|
| Page title (home h2) | `text-2xl font-bold` | 24px / 800 |
| Section header (admin) | `text-2xl font-bold tracking-tight` | 24px / 800 / 타이트 |
| Admin top bar title | `text-lg font-semibold` | 18px / 600 |
| Comment section title | `text-lg font-semibold` | 18px / 600 |
| Dialog title | `text-lg font-semibold leading-none` | 18px / 600 / 1 |
| Post card title | `text-base font-bold` | 16px / 700 |
| Post header title (sm) | `text-sm font-semibold py-2` | 14px / 600 |
| Post header title (md↑) | `text-lg font-semibold py-2` | 18px / 600 |
| Comment author | `text-sm font-semibold` | 14px / 600 |
| Badge/Pill | `text-xs font-medium` | 12px / 500 |
| Tag button text | `text-sm font-normal leading-tight` | 14px / 400 |
| Command group heading | `text-xs font-medium` | 12px / 500 |
| Sidebar menu button (sm) | `h-7 text-xs` | 32 / 12px |
| Sidebar menu button (default) | `h-8 text-sm` | 32 / 14px |
| Sidebar menu button (lg) | `h-12 text-sm` | 48 / 14px |
| Tooltip content | `text-xs text-balance` | 12px |
| Code block body | `text-2xs lg:text-sm` | 10px → 14px |
| Prose h1 | `text-3xl lg:text-5xl font-extrabold tracking-tight` | 30 → 48px / 800 |
| Prose h2 | `text-2xl font-semibold tracking-tight mt-10 pb-2 border-b` | 24px / 600 |
| Prose h3 | `text-xl font-semibold tracking-tight mt-8` | 20px / 600 |
| Prose p | `leading-7 [&:not(:first-child)]:mt-6` | 16px / 1.75 |
| Prose a | `text-primary underline underline-offset-4 font-medium` | — |
| Prose blockquote | `border-l-2 pl-6 italic mt-6` | — |
| Prose table th | `px-4 py-2 font-bold text-left break-words` | 14px / 700 |

### 5‑7. 타이포그래피 원칙

1. **본문 색은 `--color-foreground`**, UI/버튼 텍스트는 각자의 시맨틱(`--color-primary-foreground`, `--color-muted-foreground`).
2. **`line-height`는 단위를 포함한 고정값**(`leading-7 = 1.75rem`). `leading-normal` 같은 가변값은 사용하지 않음.
3. **트래킹 변화는 `prose` 계열에서만**. UI 요소는 기본 트래킹(`0em`).
4. **Italic은 `prose blockquote`에서만**. UI 요소 이탤릭 금지.
5. **Underline은 `prose a`와 `button variant=link`**에만. 기타 링크는 `hover:underline` 지연 노출.
6. **`text-balance`는 툴팁에만** (shadcn tooltip 기본).

---

## 6. Spacing, Radius, Border, Shadow

### 6‑1. 스페이싱 스케일

Tailwind v4는 `--spacing: 0.25rem`(4px)를 단일 기본 단위로 두고 `p-1 = 0.25rem`, `p-2 = 0.5rem` … 로 곱셈 스케일을 구성합니다. shadcn 프리셋 기본값을 그대로 유지.

```css
:root {
  --spacing: 0.25rem;   /* 4px base */
}
```

**실제 관찰되는 스케일 값(소스 전체에서 수집)**

| 토큰 | 값(px) | 대표 사용처 |
|---|---|---|
| `p-0.5` | 2 | `post-tag-list.tsx` tag padding, post-header py |
| `p-1` | 4 | 뱃지 패딩, 댓글 아이콘 버튼 padding |
| `p-1.5` | 6 | `user-card` 좌측 섹션, 아바타 wrapper |
| `p-2` | 8 | 테이블 셀 padding |
| `p-3` | 12 | post-card, 블로그 홈 section padding |
| `p-3.5` | 14 | **가장 자주 사용되는 내부 여백** (댓글/로그/포스트 섹션) |
| `p-4` | 16 | dialog content, popover content |
| `p-6` | 24 | dialog padding, admin panel content |
| `p-8` | 32 | empty state 블록 |
| `py-0.5` / `py-2` / `py-3` | 2 / 8 / 12 | post-header, home sections |
| `px-6 py-3 sm:px-8 sm:py-6` | 24/12 → 32/24 | log page section |
| `gap-1` | 4 | 작은 플렉스 gap |
| `gap-1.5` | 6 | button sm gap |
| `gap-2` | 8 | header nav, flex row 기본 |
| `gap-3` | 12 | post-list grid gap |
| `gap-3.5` | 14 | admin top bar gap, log profile gap |
| `gap-5` | 20 | log page header |
| `gap-7` | 28 | home vertical stack |

**최대 너비(max-width) 상수**

| 용도 | 값 | 선언 위치 |
|---|---|---|
| Blog layout container | `max-w-5xl` = **64rem / 1024px** | `app/(blog)/layout.tsx` |
| Dialog (mobile) | `max-w-[calc(100%-2rem)]` | `ui/dialog.tsx` DialogContent |
| Dialog (sm↑) | `sm:max-w-lg` = **32rem / 512px** | `ui/dialog.tsx` |
| Sheet (sm↑) | `sm:max-w-sm` = **24rem / 384px** | `ui/sheet.tsx` |
| Popover | `w-72` = **18rem / 288px** | `ui/popover.tsx` |
| Command list | `max-h-[300px]` = **300px** | `ui/command.tsx` |
| Admin comments cell | `max-w-md` = **28rem / 448px** | `widgets/admin/comments-table.tsx` |
| Scrollbar TOC (hover) | `max-w-[15dvh]` | `app/globals.css` |
| ToC collapsed | `max-w-0` → `min-w-[20px]` | `app/globals.css` |

### 6‑2. 라디우스 스케일

```css
:root {
  --radius: 0.375rem;   /* 6px — 단일 기준점 */
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);  /*  2px */
  --radius-md: calc(var(--radius) - 2px);  /*  4px */
  --radius-lg: var(--radius);              /*  6px */
  --radius-xl: calc(var(--radius) + 4px);  /* 10px */
}
```

**추가 라디우스(원본 직접 사용)**
- `rounded-xs` = **`0.125rem` / 2px** (Tailwind v4 기본) — dialog close button, sheet close button, popover inner
- `rounded-full` — 뱃지, 아바타, 파괴 버튼(hover 오버레이), carousel prev/next, 페이지네이션 이탈 뱃지
- `rounded-[2px]` — tooltip arrow (shadcn 기본)
- `rounded-none` — `image-modal.tsx` full-viewport dialog

**라디우스 정책**
- **4단 주 스케일(sm/md/lg/xl)** + **`rounded-xs`(2px)** + **`rounded-full`** 만 허용.
- `rounded-2xl`, `rounded-3xl` 등 대형 라운드 사용 금지(BBlog의 "종이 한 장" 톤을 위반).
- 각진 UI 요소(Input/Textarea/Card/Popover/Dialog)는 **모두 `rounded-md`(4px)** 로 통일.

### 6‑3. 보더 정책

```css
:root {
  --border-width: 1px;                 /* 사실상 모든 경계선 */
  --border-style: solid;               /* 항상 solid */
}

@layer base {
  * { @apply border-border outline-ring/50; }
}
```

**관찰되는 보더 패턴**
- `border` = 1px solid `var(--color-border)` — 카드, 입력, 분할선 전반
- `border-b border-border` — 섹션 하단 분리선 (comment-form, comment-item, post-header)
- `border-l border-r border-t` — sheet의 진입 방향별 하드 엣지
- `border-l-2` — `prose blockquote` (유일한 2px 경계)
- `border border-primary/10` — `go-to-top` 버튼 (브랜드 알파 테두리)
- `border-dashed`, `border-double` — **미사용**. 모든 경계는 solid.

**Divider 패턴** — border 대신 **1px 높이/너비 box**:
- `h-px w-full bg-border` — 가로 구분선
- `w-px h-full bg-border` — 세로 구분선(post-form 좌우 분할)

### 6‑4. 쉐도우 스케일

shadcn 프리셋이 제공하는 8단 스케일. 원본은 라이트/다크 **동일 값** 유지.

```css
:root {
  --shadow-2xs: 0px 0px 7px 0px hsl(0 0% 0% / 0.03);
  --shadow-xs:  0px 0px 7px 0px hsl(0 0% 0% / 0.03);
  --shadow-sm:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 1px 2px -1px hsl(0 0% 0% / 0.06);
  --shadow:     0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 1px 2px -1px hsl(0 0% 0% / 0.06);
  --shadow-md:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 2px 4px -1px hsl(0 0% 0% / 0.06);
  --shadow-lg:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 4px 6px -1px hsl(0 0% 0% / 0.06);
  --shadow-xl:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 8px 10px -1px hsl(0 0% 0% / 0.06);
  --shadow-2xl: 0px 0px 7px 0px hsl(0 0% 0% / 0.15);
}
```

**역할 매핑**
- `shadow-2xs` — 미사용 예약
- `shadow-xs` — Input / Textarea / Checkbox / Button outline 기본 엘리베이션
- `shadow-sm` — post-card 기본, sidebar outline variant
- `shadow-md` — popover content
- `shadow-lg` — dialog, sheet
- `shadow-xl` — 미사용 예약
- `shadow-2xl` — 미사용 예약(15% 알파의 강조용)

**다크 모드 쉐도우** — 동일 값을 그대로 재사용. 다크 카드 위에서도 검은 쉐도우가 "표면이 더 깊이 꺼진" 효과를 만듦. 별도 `inset ring` 대체 불필요.

**카드 hover 엘리베이션**: `shadow-sm → shadow-md` 이동(150ms). `post-card`의 대표 상호작용.

### 6‑5. 블러 / 오버레이

- `backdrop-blur-xs` — header (`sticky top-0 h-12 backdrop-blur-xs bg-background/50`)
- `backdrop-blur-sm` — post-header detail (`bg-background/80`)
- `backdrop-blur supports-[backdrop-filter]:bg-background/60` — admin top bar (fallback 체인)
- `bg-black/50` — Dialog/Sheet/AlertDialog overlay (50% black)
- `bg-black/60`, `bg-black/80` — image remove button hover layer
- `bg-neutral-50/10 → bg-neutral-600/10` — log banner gradient overlay

블러 값은 총 **`xs`와 `sm` 두 단계**만 사용. 기본 `backdrop-blur`(sm과 동일)는 admin에서 한 번 관찰. 새로운 블러 단계 도입 금지.

---

## 7. Motion & Accessibility

### 7‑1. 모션 토큰

```css
:root {
  /* Durations */
  --motion-instant:  0ms;
  --motion-quick:    100ms;   /* debounce content (write page) */
  --motion-fast:     150ms;   /* post-card hover shadow */
  --motion-base:     200ms;   /* sidebar transition, tooltip fade */
  --motion-slow:     300ms;   /* sheet close, TOC expand, scrollbar-toc hover */
  --motion-slower:   500ms;   /* sheet open */

  /* Easings */
  --motion-ease:          ease;
  --motion-ease-in-out:   ease-in-out;
  --motion-ease-linear:   linear;

  /* Transition property scopes */
  --motion-color:      color;
  --motion-colors:     color, background-color, border-color, text-decoration-color, fill, stroke;
  --motion-box-shadow: color, box-shadow;
  --motion-opacity:    opacity;
  --motion-all:        all;
}
```

**실제 관찰 매핑**

| 요소 | 속성 | 지속 | 이징 |
|---|---|---|---|
| `post-card` 전체 | `all` | 150ms | (기본 ease) |
| Dialog overlay (open/close) | fade-in-0 / fade-out-0 | 200ms | (shadcn 기본) |
| Dialog content (open/close) | zoom-in-95 / zoom-out-95 + fade | 200ms | ease |
| Sheet open | slide-in-from-* | 500ms | ease-in-out |
| Sheet close | slide-out-to-* | 300ms | ease-in-out |
| Popover / Command | fade + zoom + side-slide | (animate-in 기본 150ms) | ease-out |
| Tooltip | fade + zoom + side-slide | (기본) | |
| Sidebar width change | width, left, right | 200ms | linear |
| Sidebar menu label fade (icon mode) | opacity, margin | 200ms | linear |
| `buttonVariants` 전체 | `all`(transition-all) | (Tailwind default 150ms) | ease |
| Input / Textarea | color, box-shadow | (기본) | ease |
| Checkbox | all | (기본) | ease |
| Skeleton | animate-pulse | (2000ms cubic-bezier loop — Tailwind 기본) | |
| Sonner spinner | animate-spin | (1000ms linear infinite — Tailwind 기본) | |
| ScrollArea viewport focus | color, box-shadow | | |
| `scrollbar-toc` expand | max-width | 300ms | ease-in-out |
| `scrollbar-toc` button color | color | 200ms | ease-in-out |
| `scrollbar-toc` button::before opacity | opacity | 200ms | ease-in-out |
| `virtual-scroll` thumb opacity | opacity | 200ms | (기본) |
| `log-page-header` height expand | all | (기본) | |
| `log-message-form` 이미지 제거 버튼 | opacity | | |

### 7‑2. `prefers-reduced-motion`

원본이 명시적으로 처리하는 지점:

```css
@media (prefers-reduced-motion: reduce) {
  [data-bscroll-toc='true'],
  [data-bscroll-toc='true'] button,
  [data-bscroll-toc='true'] button::before {
    transition: none;
  }
}
```

**권장 전역 정책(재구현 시 추가)**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

**예외 허용**:
- `animate-spin` (로딩 인디케이터): 기능적으로 필수이므로 유지.
- `animate-pulse` (Skeleton): 콘텐츠 로딩 신호. 유지 권장.

### 7‑3. 포커스 정책

모든 인터랙티브 요소는 `focus-visible`에 **3px 링**을 표시:

```css
focus-visible:border-ring
focus-visible:ring-ring/50
focus-visible:ring-[3px]
```

`ring-ring/50` = `var(--color-ring)` 50% alpha. 링 색은 라이트 `oklch(0.708 0 0)`, 다크 `oklch(0.556 0 0)`. 알파 50%로 인해 "희미하게 둥근 후광" 질감.

**aria-invalid 상태**:
```css
aria-invalid:ring-destructive/20
dark:aria-invalid:ring-destructive/40
aria-invalid:border-destructive
```

- Button, Input, Textarea, Checkbox 공통.
- Dialog/AlertDialog Close 버튼은 **옛 방식**(`focus:ring-ring focus:ring-2 focus:ring-offset-2 focus:outline-hidden`) — shadcn 하위 호환 유지.

**포커스 링 금지**: `focus:outline-none` 단독 사용은 허용되지 않음. 반드시 `focus-visible:ring-*` 치환으로 시각 대체. (Button/Input 기본값은 `outline-none`이지만 직후 `focus-visible:*` 체인이 즉시 대체.)

### 7‑4. 시각적으로만 숨김(visually-hidden) 유틸

- `sr-only` (Tailwind 기본): 다이얼로그 타이틀/설명에 적용 — "Dialog Title"을 시각적으로 숨기되 스크린리더에 전달.
- `aria-hidden="true"` + `tabindex="-1"`: 장식 아이콘, 데코레이티브 SVG.

### 7‑5. Z-인덱스 스케일

```css
:root {
  --z-base:       0;
  --z-toc:        20;     /* scrollbar-toc aside */
  --z-sticky-top: 10;     /* post-header, admin top bar (page-local) */
  --z-header:     50;     /* 전역 header sticky */
  --z-go-to-top:  50;     /* floating button */
  --z-overlay:    50;     /* dialog/sheet/popover/alertdialog */
  --z-virtual-scroll: 60; /* 항상 모든 것 위 */
  --z-sidebar:    10;     /* admin sidebar fixed (sidebar.tsx 기본) */
}
```

관찰된 구체적 값:
- `z-10` — post-header, admin top bar (로컬 sticky)
- `z-20` — scrollbar-toc aside
- `z-50` — 전역 header, carousel buttons, go-to-top, dialog/sheet overlay, popover content, command inside dialog
- `z-[60]` — virtual-scroll thumb (가장 높은 계층)

**규칙**: 신규 z값 도입 시 위 계단에서 선택. 임의 값(`z-100`, `z-[9999]`) 사용 금지.

---

## 8. Layout System

### 8‑1. 앱 셸 구조 (Blog 루트)

```
┌────────────────────────────────────────────────────────────────────┐
│  <html lang="ko" data-theme="…">                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  <body> (antialiased relative bg-background text-foreground) │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │  Analytics scripts (head)                             │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  │                                                                │  │
│  │  ┌──── Blog layout wrapper ────────────────────────────────┐  │  │
│  │  │ <header class="max-w-5xl mx-auto">                      │  │  │
│  │  │   [header widget: sticky top-0 h-12 backdrop-blur-xs]   │  │  │
│  │  │   ┌──────────────────────────────────────────────────┐  │  │  │
│  │  │   │ Logo                [theme] [auth] [nav...]     │  │  │  │
│  │  │   └──────────────────────────────────────────────────┘  │  │  │
│  │  │ </header>                                                │  │  │
│  │  │                                                          │  │  │
│  │  │ <main class="antialiased relative                        │  │  │
│  │  │            max-w-5xl mx-auto pb-10">                     │  │  │
│  │  │   { page children }                                      │  │  │
│  │  │ </main>                                                  │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │  [ Portals ]                                                   │  │
│  │   ├─ <ScrollbarToc aside>   (fixed right, z-20, hidden on sm)  │  │
│  │   ├─ <VirtualScroll>        (fixed right, z-60)                │  │
│  │   ├─ <GoToTop button>       (fixed right-9 bottom-9, z-50)     │  │
│  │   └─ <Toaster (sonner)>     (bottom-right)                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 8‑2. 앱 셸 구조 (Admin)

```
┌──────────────────────────────────────────────────────────────┐
│ <div class="flex h-screen w-full">                            │
│  ┌────────────┬──────────────────────────────────────────┐   │
│  │ Sidebar    │ <main class="flex-1 overflow-y-auto">     │   │
│  │ (fixed /   │ ┌─ Top bar ──────────────────────────┐    │   │
│  │ collapsible│ │ sticky top-0 z-10 h-12 border-b    │    │   │
│  │ icon mode) │ │ bg-background/95 backdrop-blur…    │    │   │
│  │            │ │ ← SidebarTrigger + Title (text-lg) │    │   │
│  │            │ └────────────────────────────────────┘    │   │
│  │            │ <section class="p-6">                      │   │
│  │            │   [ heading text-2xl font-bold ]           │   │
│  │            │   [ muted-foreground subtitle ]            │   │
│  │            │   [ Table / Form / Cards … ]               │   │
│  │            │ </section>                                  │   │
│  └────────────┴──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 8‑3. 앱 셸 구조 (Editor)

```
┌──────────────────────────────────────────────────────────────┐
│ <main class="flex h-dvh">                                     │
│  ┌────────────────────────┬──────────────────────────────┐   │
│  │ PostForm (w-full md:w-1/2 h-full flex flex-col)        │   │
│  │ ┌──────────────────────────────────────────────────┐   │   │
│  │ │ Input (title, text-2xl font-bold, shadow-none)   │   │   │
│  │ ├──────────────────────────────────────────────────┤   │   │
│  │ │ [ flex gap-3 p-3.5 ]  CategorySelect / TagSelect │   │   │
│  │ ├──────────────────────────────────────────────────┤   │   │
│  │ │ ScrollArea (flex-1 min-h-0 p-3.5) Textarea       │   │   │
│  │ ├──────────────────────────────────────────────────┤   │   │
│  │ │ [ flex gap-2 p-3.5 ]  Save / Cancel buttons      │   │   │
│  │ └──────────────────────────────────────────────────┘   │   │
│  │ (w-px h-full bg-border divider between panes)          │   │
│  │ Preview prose pane (w-0 md:w-1/2 h-full overflow-scroll)│   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 8‑4. 공통 CSS 레이아웃 베이스

```css
html, body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  scrollbar-width: none;            /* Firefox */
  scroll-behavior: smooth !important;
}
body { position: relative; }
::-webkit-scrollbar { display: none; }

@media (prefers-color-scheme: dark) {
  html, body { color-scheme: dark; }
}
```

`scrollbar-width: none`으로 네이티브 스크롤바를 제거하고, 우측 `VirtualScroll` 위젯이 자리를 대신합니다. 재구현 시에도 두 설정은 **쌍으로** 적용해야 합니다.

### 8‑5. Column/Grid 시스템

BBlog는 **CSS Grid 전용 레이아웃 프레임워크를 두지 않습니다**. 모든 멀티-컬럼은 개별 컴포넌트에서 직접 선언:

- **Home sections**: `flex flex-col gap-7 px-2 lg:px-0 py-7` (수직 섹션 쌓기)
- **Post grid**: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3` (1→2→3 컬럼)
- **Post form**: `w-full md:w-1/2` × 2 (50/50 분할, md↓에선 편집 창만)
- **User card**: `flex-col sm:flex-row` (모바일 세로 → 데스크탑 가로)
- **Log page**: `flex-col sm:flex-row` (프로필 사진/텍스트)
- **Dialog footer**: `flex-col-reverse sm:flex-row sm:justify-end` (모바일: 취소가 위, 데스크탑: 취소가 왼쪽)

**Grid 사용 지점**
- Dialog content: `grid gap-4 ... w-full max-w-[calc(100%-2rem)] sm:max-w-lg`
- Log message form 이미지: `grid grid-cols-2 gap-2`
- Post images panel: `grid grid-cols-7 gap-2 max-h-50 overflow-y-auto`

---

## 9. Breakpoints

Tailwind v4 기본 스케일을 그대로 사용. 커스텀 브레이크포인트 없음.

```css
@theme inline {
  --breakpoint-sm:  40rem;   /* 640px  — mobile → tablet */
  --breakpoint-md:  48rem;   /* 768px  — tablet → narrow desktop */
  --breakpoint-lg:  64rem;   /* 1024px — primary desktop */
  --breakpoint-xl:  80rem;   /* 1280px — wide desktop */
  --breakpoint-2xl: 96rem;   /* 1536px — ultra-wide (미사용) */
}
```

**관찰되는 사용 빈도**
- `sm:` — 모바일 ↔ 태블릿 분기(가장 빈번). log, user-card, comment, post-header.
- `md:` — 테이블/편집기 등 2컬럼 분기. post-list, post-form, admin.
- `lg:` — 데스크탑 여백 제거, prose h1 확대. blog home `px-2 lg:px-0`, prose `lg:text-5xl`, scrollbar-toc `lg:block`.
- `xl:` — 거의 미사용. 필요 시 사이드 TOC 확장 등에 확장 여지.
- `2xl:` — **전혀 사용되지 않음**.

**모바일 우선**: 기본 클래스는 모바일 기준, 상위 브레이크포인트에서 덮어쓰는 스타일.

---

## 10. Component Catalog

총 **11개 주요 원형(Primary)** + **5개 보조 원형(Supporting)**.

### 10‑1. Button

**목적**: 모든 클릭 가능한 작업 트리거. 6가지 variant × 6가지 size = 총 36 조합.

**해부**
```html
<!-- Framework-agnostic -->
<button data-slot="button" type="button"
        class="[base classes] [variant] [size]">
  <svg aria-hidden="true"></svg>
  <span>Label</span>
</button>
```

**Base classes (모든 variant 공통)**
```
inline-flex items-center justify-center gap-2
whitespace-nowrap rounded-md text-sm font-medium
transition-all shrink-0
disabled:pointer-events-none disabled:opacity-50
[&_svg]:pointer-events-none [&_svg]:shrink-0
[&_svg:not([class*='size-'])]:size-4
outline-none
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
aria-invalid:border-destructive
```

**Variants**

| Variant | Surface | Foreground | Hover | 특이 |
|---|---|---|---|---|
| `default` | `bg-primary` | `text-primary-foreground` | `hover:bg-primary/90` | |
| `destructive` | `bg-destructive` | `text-white` | `hover:bg-destructive/90` | `focus:ring-destructive/20`, 다크 `bg-destructive/60` |
| `outline` | `border bg-background` | — | `hover:bg-accent hover:text-accent-foreground` | `shadow-xs`, 다크 `bg-input/30 border-input hover:bg-input/50` |
| `secondary` | `bg-secondary` | `text-secondary-foreground` | `hover:bg-secondary/80` | |
| `ghost` | — | — | `hover:bg-accent hover:text-accent-foreground` | 다크 `hover:bg-accent/50` |
| `link` | — | `text-primary` | `hover:underline` | `underline-offset-4` |

**Sizes**

| Size | 치수 | 라운드/간격 |
|---|---|---|
| `default` | `h-9 px-4 py-2` | 기본, SVG 있으면 `has-[>svg]:px-3` |
| `sm` | `h-8 px-3 gap-1.5` | `rounded-md`, SVG 있으면 `px-2.5` |
| `lg` | `h-10 px-6` | `rounded-md`, SVG 있으면 `px-4` |
| `icon` | `size-9` | 정사각 36×36px |
| `icon-sm` | `size-8` | 정사각 32×32px |
| `icon-lg` | `size-10` | 정사각 40×40px |

**State matrix**

| 상태 | 시각 변화 |
|---|---|
| default | 기본 표면 |
| hover | variant별 위 표 참고 |
| focus-visible | 3px ring (`ring-ring/50`) + `border-ring` |
| active | (별도 스타일 없음 — 기본 `:active`) |
| disabled | `pointer-events-none opacity-50` |
| aria-invalid | destructive ring + border |

**Do / Don't**
- ✅ 아이콘 크기는 자동(`size-4`). 직접 `size-*` 주면 자동 크기 덮어쓰기.
- ✅ `asChild` 패턴(Radix Slot)으로 `<a>` 링크에 버튼 모양 적용.
- ❌ 고유 색상(e.g. `bg-green-500`) 직접 주입 금지. 필요하면 새로운 variant 정의.
- ❌ 반경은 size별 고정. `rounded-xl`로 변경 금지.

### 10‑2. Badge

**목적**: 상태·카테고리·태그 라벨. 4가지 variant.

**Base**
```
inline-flex items-center justify-center rounded-full border
px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0
gap-1 overflow-hidden
[&>svg]:size-3 [&>svg]:pointer-events-none
transition-[color,box-shadow]
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
aria-invalid:border-destructive
```

**Variants**

| Variant | Surface | Foreground | Hover (a로 감쌀 때) |
|---|---|---|---|
| `default` | `border-transparent bg-primary` | `text-primary-foreground` | `[a&]:hover:bg-primary/90` |
| `secondary` | `border-transparent bg-secondary` | `text-secondary-foreground` | `[a&]:hover:bg-secondary/90` |
| `destructive` | `border-transparent bg-destructive` | `text-white` | `[a&]:hover:bg-destructive/90` |
| `outline` | (bg 없음, border만) | `text-foreground` | `[a&]:hover:bg-accent [a&]:hover:text-accent-foreground` |

**인스턴스 덮어쓰기 (관찰)**
- post-card notice: `rounded-xs h-fit px-1` — 라운드 `2px`, 높이 콘텐츠 맞춤
- post-header 카테고리: `rounded py-1.25` (outline) — 기본 6px 라디우스
- post-tag-list: `rounded p-0.5 px-1.5 h-fit text-sm font-normal leading-tight` — 태그용 저사양
- tag-select 선택 칩: `gap-1 rounded-xs` (secondary)
- admin posts table status cell: **Badge 아님** — 일반 `<span>` + 동일 스타일 인라인.

### 10‑3. Card (Signature Card)

**목적**: 리스트 아이템의 표준 래퍼. post-card가 대표 구현.

**Anatomy**
```html
<article class="p-3 rounded shadow-sm border
                hover:shadow-md hover:bg-border/50
                transition-all duration-150
                flex flex-col gap-1.5">
  <header class="flex items-center justify-between gap-2">
    <span class="badge rounded-xs h-fit px-1">공지</span>
    <time class="text-sm text-secondary-foreground/70 line-clamp-1">
      2024.03.22
    </time>
  </header>
  <h3 class="text-base font-bold w-fit line-clamp-1">
    포스트 제목
  </h3>
  <!-- optional: preview / tags -->
</article>
```

**Tokens**
- Surface: `card` (라이트: 흰색, 다크: `neutral-800`)
- Border: `--color-border`
- Padding: `p-3` (12px)
- Radius: `rounded` = `--radius-lg` (6px)
- Shadow: `--shadow-sm` → hover `--shadow-md`
- Transition: `all 150ms`

**States**

| 상태 | 스타일 |
|---|---|
| default | `shadow-sm`, 배경 투명 |
| hover | `shadow-md`, `bg-border/50` |
| notice | 추가: `border bg-border/50` (flat highlight) |
| hidden | 추가: `opacity-25` |

**Do / Don't**
- ✅ 카드 최대 너비는 그리드가 결정. 카드 자체에 max-width 주지 않음.
- ❌ 인라인 그림자(`shadow-[…]`) 금지. 토큰 스케일만 사용.

### 10‑4. Input

**목적**: 단행 텍스트 입력.

**Base**
```
file:text-foreground placeholder:text-muted-foreground
selection:bg-primary selection:text-primary-foreground
dark:bg-input/30 border-input
h-9 w-full min-w-0 rounded-md border bg-transparent
px-3 py-1 text-base shadow-xs outline-none
transition-[color,box-shadow]
file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
md:text-sm
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
aria-invalid:border-destructive
```

**Tokens**
- Height: `h-9` (36px)
- Padding: `px-3 py-1`
- Text: `text-base` → `md:text-sm` (모바일 iOS 확대 방지 패턴)
- Radius: `rounded-md` (4px)
- Shadow: `--shadow-xs`
- Border: 1px `--color-input`

**Data attr**: `data-slot="input"` — 스킨 덮어쓰기 훅.

**관찰된 오버라이드**
- `article-filter.tsx`: `pl-8 focus-visible:ring-0 focus-visible:outline-none` — 검색 아이콘 공간 + 링 억제
- `post-form.tsx` 타이틀: `shadow-none focus-visible:ring-0 focus-visible:outline-none text-2xl font-bold` — "문서 제목처럼" 네이티브 느낌
- `log-message-form.tsx` Textarea: `focus-visible:ring-0 p-3 text-base shadow-none`

포커스 링을 **의도적으로 제거**하는 경우는 세 곳뿐. 그 외 입력은 3px 링 유지.

### 10‑5. Textarea

**목적**: 다중행 텍스트 입력.

**Base** — Input과 거의 동일하되:
- `min-h-20` (80px) 최소 높이
- `px-3 py-2` 패딩
- `data-slot="textarea"`

**인스턴스**
- 댓글 편집: `min-h-20 resize-none text-sm`
- 로그 메시지 폼: `min-h-[60px] max-h-[300px] resize-none overflow-y-auto`
- 포스트 폼 본문: 단일 textarea, 스크롤영역 안쪽

### 10‑6. Checkbox

**목적**: 이진 선택. 비밀 댓글, 비공개 상태 등.

**Root**
```
peer size-4 shrink-0 rounded border border-input bg-background
shadow-xs transition-all outline-none
disabled:cursor-not-allowed disabled:opacity-50
data-[state=checked]:bg-primary
data-[state=checked]:text-primary-foreground
data-[state=checked]:border-primary
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
aria-invalid:border-destructive
```

**Indicator**: `flex items-center justify-center text-current` + `<svg Check />`

Radix data-state → CSS 선택자로 표시. 프레임워크 중립 재구현 시 `<input type="checkbox">` + 동일한 클래스 체계를 적용하고, `:checked ~ .indicator`로 아이콘을 노출.

### 10‑7. Dialog / AlertDialog

**목적**: 포커스를 잠그는 모달. 두 변형은 스타일 동일, 포커스 복귀 정책(AlertDialog는 버튼 누를 때까지 차단)이 다름.

**Overlay**
```
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
fixed inset-0 z-50 bg-black/50
```

**Content**
```
bg-background
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
fixed top-[50%] left-[50%] z-50 grid
w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%]
gap-4 rounded-lg border p-6 shadow-lg duration-200
sm:max-w-lg
```

**Close Button (Dialog only)**
```
ring-offset-background focus:ring-ring
data-[state=open]:bg-accent data-[state=open]:text-muted-foreground
absolute top-4 right-4 rounded-xs opacity-70
transition-opacity hover:opacity-100
focus:ring-2 focus:ring-offset-2 focus:outline-hidden
disabled:pointer-events-none
[&_svg]:pointer-events-none [&_svg]:shrink-0
[&_svg:not([class*='size-'])]:size-4
```

**Header / Footer / Title / Description**
```css
.header { @apply flex flex-col gap-2 text-center sm:text-left; }
.footer { @apply flex flex-col-reverse gap-2 sm:flex-row sm:justify-end; }
.title  { @apply text-lg leading-none font-semibold; }
.desc   { @apply text-muted-foreground text-sm; }
```

**전체화면 Dialog 인스턴스** (`image-modal.tsx`)
- `h-dvh w-dvw sm:max-w-dvw p-0 border-0 rounded-none flex flex-col`
- Carousel이 내부를 점유. 닫기 버튼은 상단 중앙 원형.

### 10‑8. Popover / Tooltip

**Popover Content**
```
bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-hidden
origin-(--radix-popover-content-transform-origin)
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
data-[side=bottom]:slide-in-from-top-2
data-[side=left]:slide-in-from-right-2
data-[side=right]:slide-in-from-left-2
data-[side=top]:slide-in-from-bottom-2
```

**Tooltip Content** — popover와 동일한 애니메이션 + 반대 색상:
```
bg-foreground text-background z-50 w-fit rounded-md px-3 py-1.5 text-xs text-balance
origin-(--radix-tooltip-content-transform-origin)
```

**Tooltip Arrow**: `bg-foreground fill-foreground size-2.5 rotate-45 rounded-[2px]`

### 10‑9. Sheet (Drawer)

**목적**: 엣지에서 슬라이드-인하는 패널. 네 방향 지원.

**Content base**
```
bg-background fixed z-50 flex flex-col gap-4 shadow-lg
transition ease-in-out
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:duration-300 data-[state=open]:duration-500
```

**방향별 차이**

| Side | 위치 | 크기 | 보더 |
|---|---|---|---|
| right | `inset-y-0 right-0 h-full w-3/4 sm:max-w-sm` | 3/4 뷰포트 → sm `384px` | `border-l` |
| left | `inset-y-0 left-0 h-full w-3/4 sm:max-w-sm` | 동일 | `border-r` |
| top | `inset-x-0 top-0 h-auto` | 자동 | `border-b` |
| bottom | `inset-x-0 bottom-0 h-auto` | 자동 | `border-t` |

### 10‑10. Sidebar (Admin shell)

**목적**: 관리자 영역 전용 고정/접힘 가능 네비게이션. `ui/sidebar.tsx` — shadcn/ui의 sidebar 블록.

**핵심 CSS 변수(Sidebar Provider 레벨)**
```
--sidebar-width: 16rem      (데스크탑 펼침)
--sidebar-width-icon: 3rem  (아이콘 모드)
```

**Sidebar Root**
```
fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width)
transition-[left,right,width] duration-200 ease-linear md:flex
```

**Menu Button**
- `default` variant: `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`
- `outline` variant: `bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]`
- Sizes: `default`(`h-8 text-sm`), `sm`(`h-7 text-xs`), `lg`(`h-12 text-sm`)
- Active: `data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium`

**Sub Menu**: `mx-3.5 border-l border-sidebar-border px-2.5 py-0.5 gap-1` — 왼쪽 얇은 세로 바.

### 10‑11. Table (Admin data table)

**목적**: 관리자 페이지의 목록 표. shadcn/ui의 기본 Table 블록 + 인라인 상태 배지.

**Anatomy**
```html
<div class="rounded-md border">
  <div class="relative w-full overflow-x-auto">
    <table class="w-full caption-bottom text-sm">
      <thead class="[&_tr]:border-b">
        <tr>
          <th class="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
            Title
          </th>
          ...
        </tr>
      </thead>
      <tbody class="[&_tr:last-child]:border-0">
        <tr class="hover:bg-muted/50 border-b transition-colors">
          <td class="p-2 align-middle whitespace-nowrap">
            <span class="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
              Category
            </span>
          </td>
          <td>
            <div class="flex flex-col gap-1">
              <span class="inline-flex w-fit rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Published</span>
              <span class="inline-flex w-fit rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">Notice</span>
            </div>
          </td>
          <td>
            <div class="flex items-center gap-1">
              <button class="size-7 [icon]">✏️</button>
              <button class="size-7 [icon] destructive">🗑</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**상태 배지 색 매핑** (admin 인라인 스타일)
| 상태 | Surface | Foreground |
|---|---|---|
| Category / Role(user) | `bg-secondary` | `text-secondary-foreground` |
| Published / Active | `bg-primary/10` | `text-primary` |
| Hidden / Banned | `bg-destructive/10` | `text-destructive` |
| Role(admin) | `bg-destructive/10` | `text-destructive` |
| Notice | `bg-accent` | `text-accent-foreground` |

이 매핑은 새로운 Admin 테이블 셀에서 **반드시 재사용** — 자체 색상 도입 금지.

### 10‑12. Carousel (이미지 모달)

**Root Wrapper**: `relative`

**Content Wrapper**: `overflow-hidden`

**Items container**: `flex` (가로) / `flex flex-col` (세로), `-ml-4` / `-mt-4` 음수 margin.

**Item**: `min-w-0 shrink-0 grow-0 basis-full` + `pl-4` / `pt-4`.

**Navigation buttons** (이미지 모달 전용 오버라이드):
- `size-12 z-50 left-3.5` / `right-3.5`
- 기본은 `size-8` 원형 outline.

### 10‑13. Pagination

**Purpose**: 페이지 이동. 숫자 링크 + 이전/다음 + 생략부호.

```html
<nav aria-label="pagination" class="mx-auto flex w-full justify-center">
  <ul class="flex flex-row items-center gap-1">
    <li><a class="buttonVariants(variant='ghost' size='icon') gap-1 px-2.5 sm:pl-2.5">이전</a></li>
    <li><a class="buttonVariants(variant=isActive?'outline':'ghost' size='icon')">1</a></li>
    <li><span class="flex size-9 items-center justify-center">…</span></li>
    <li><a class="buttonVariants(variant='ghost' size='icon')">10</a></li>
    <li><a class="buttonVariants(variant='ghost' size='icon') gap-1 px-2.5 sm:pr-2.5">다음</a></li>
  </ul>
</nav>
```

**Disabled state**: `pointer-events-none opacity-50` (첫 페이지에서 이전, 마지막 페이지에서 다음).

### 10‑14. Combobox (Category/Tag Select) — 보조 원형

**목적**: Radix Popover + cmdk Command 조합으로 구현되는 선택기.

**Anatomy**
```html
<div class="flex flex-col gap-2">
  <label class="text-sm font-medium">Category</label>
  <button class="buttonVariants(variant='outline') w-full justify-between h-auto min-h-9">
    Selected · <chevron />
  </button>
  <!-- Popover open -->
  <div class="popover w-full p-0">
    <div class="cmdk root">
      <div class="flex h-9 items-center gap-2 border-b px-3">
        <search-icon />
        <input class="h-10 bg-transparent text-sm outline-hidden" />
      </div>
      <ul class="max-h-[300px] overflow-y-auto">
        <li class="data-[selected=true]:bg-accent rounded-sm px-2 py-1.5 text-sm">Option</li>
      </ul>
    </div>
  </div>
</div>
```

**Tag select에서 태그 칩 오버레이**: `gap-1 rounded-xs` (secondary variant Badge).

### 10‑15. Avatar — 보조 원형

**Root**: `relative flex size-8 shrink-0 overflow-hidden rounded-full`
**Image**: `aspect-square size-full`
**Fallback**: `bg-muted flex size-full items-center justify-center rounded-full`

**관찰되는 사이즈**
| 크기 | 사용처 |
|---|---|
| `size-5` | admin comments-table inline |
| `size-8` (기본) | header, 일반 댓글 |
| `size-10` | 로그 메시지, user-card 모바일 |
| `size-20` | user-card 데스크탑 |
| `size-32` | log-page-header, log-page-info |

모든 Avatar는 `rounded-full` 고정. 사각 아바타 없음.

### 10‑16. Command Palette — 보조 원형

**Root**: `bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md`

**CommandDialog**: Dialog + Command + 내부 cmdk 스타일을 네스팅.

**Item**: `data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm`

**Shortcut 인라인 힌트**: `text-muted-foreground ml-auto text-xs tracking-widest`

### 10‑17. Scroll Area — 보조 원형

**Root**: `relative`
**Viewport**: `focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1`
**Vertical bar**: `flex touch-none p-px transition-colors select-none h-full w-2.5 border-l border-l-transparent`
**Horizontal bar**: `flex touch-none p-px transition-colors select-none h-2.5 flex-col border-t border-t-transparent`
**Thumb**: `bg-border relative flex-1 rounded-full`

---

## 11. Page Patterns

### 11‑1. Home (`/`)

**Container**: `px-2 lg:px-0 flex flex-col gap-7 py-7`

**Sections**
1. **Informations**
   - `<section>` → `<h2 class="text-2xl font-bold">Informations</h2>` + `<div class="flex gap-2">[Github button] [Resume button]</div>`
   - 버튼: `buttonVariants({variant: 'outline', size: 'icon-lg'})`
2. **Notice**
   - `<h2 class="text-2xl font-bold">공지</h2>` + `<PostList>` (최대 3개, notice 플래그)
3. **Recent Articles**
   - `<h2 class="text-2xl font-bold">최근 글</h2>` + `<PostList>` (최대 6개)

**데이터 전략**: `unstable_cache` (30일 TTL) + `tags: [QUERY_KEY.POST.MAIN]`로 ISR 리밸리데이트.

### 11‑2. Article List (`/article`)

**Container**: `px-2 lg:px-0 flex flex-col gap-2 py-7`

**Sections**
1. **Title + reset link** — 조건부로 "검색조건 초기화" 링크 + `XIcon` 노출.
2. **ArticleFilter** — 카테고리 배지 리스트 (`badge variant=default|secondary`) + 검색 Input(좌측 돋보기 아이콘).
3. **PostList** — 12개 grid.
4. **ArticlePaginator** — `py-2.5`.

**Metadata**: `generateMetadata`가 category / tag / keyword 조합으로 타이틀 생성.

### 11‑3. Article Detail (`/article/[id]`)

**Container**: `<article>` 바깥 래퍼 없음 (blog layout의 `max-w-5xl`에 의존).

**Anatomy**
```html
<article>
  <PostHeader>
    <!-- backdrop-blur-sm bg-background/80 flex gap-1 border-b border-border px-3 py-0.5 sm:px-3 sm:py-2 flex-wrap -->
    <Badge variant="outline">카테고리</Badge>
    <h1 class="text-sm sm:text-lg font-semibold py-2 line-clamp-2 text-pretty">제목</h1>
    <div class="flex gap-1 sm:gap-2 text-xs sm:text-sm px-1 pb-2 sm:px-0 sm:pb-0 w-full sm:w-fit justify-end">
      <span class="text-primary font-medium">작성일</span>
    </div>
  </PostHeader>
  <div class="prose p-3.5 text-primary flex-shrink-0">
    {HTML}
  </div>
  <section class="p-3.5">
    <PostTagList> (flex gap-2 overflow-scroll, outline badges)
  </section>
  <hr class="border-border" />
  <UserCard />
  <CommentSection>
</article>
<ScrollbarToc>  <!-- 우측 상단 고정, lg↑에서만 노출 -->
```

**Metadata**: 포스트 제목, description(본문 250자), 키워드(태그), OG 이미지(`/api/thumbnail/{id}`), Twitter card.

**ISR**: `revalidate = 2592000` (30일).

### 11‑4. Log (`/log`)

**Structure**
```html
<main>
  <LogPageHeader>
    <div class="relative h-64 hover:h-72 transition-all">
      <div class="absolute inset-0 bg-linear-to-b from-neutral-50/10 to-neutral-600/10"></div>
    </div>
    <section class="px-6 py-3 sm:px-8 sm:py-6">
      <div class="flex flex-col sm:flex-row items-center sm:items-end -mt-20 mb-3.5 gap-5">
        <Avatar class="size-32 border border-border bg-card/50" />
        <div class="flex-1 text-center sm:text-left">
          <h1 class="text-2xl font-bold">Hyunseok</h1>
          <p class="text-muted-foreground">...</p>
        </div>
      </div>
    </section>
  </LogPageHeader>
  <LogMessageList>
</main>
```

**Message item**: `flex flex-col gap-2` — 헤더(유저·시간) + 내용 + 이미지 그룹(`bg-muted p-2 flex gap-2 w-fit`).

### 11‑5. Editor (Write / Edit)

**Shell**: `<main class="flex h-dvh">`
- 좌: `<PostForm class="w-full md:w-1/2 h-full flex flex-col">`
- 우(md↑): 프리뷰 `<div class="w-0 md:w-1/2 h-full overflow-scroll"><div class="prose p-3.5"></div></div>`
- 중앙 구분선: `<div class="w-px h-full bg-border">`

**Form 내부 순서**
1. `<Input title>` — 거대한 bold 2xl, shadow-none
2. Selects — `<div class="flex gap-3 p-3.5"> <CategorySelect /> <TagSelect /></div>`
3. Body — `<ScrollArea class="flex-1 min-h-0 p-3.5"> <Textarea /> </ScrollArea>`
4. Actions — `<div class="flex gap-2 p-3.5"> [Save] [Cancel] </div>` (각 버튼 `flex-1`)

**Save flow**: `useCreatePost()` mutation, 100ms 디바운스된 `previewContent`로 프리뷰 갱신.

### 11‑6. Admin (`/admin`)

**Shell**
```html
<div class="flex h-screen w-full">
  <AdminSidebar />
  <main class="flex-1 overflow-y-auto">
    <div class="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex h-12 items-center gap-3.5 px-3.5">
      <SidebarTrigger />
      <h1 class="text-lg font-semibold">Admin</h1>
    </div>
    <section class="p-6">
      <header class="flex flex-col gap-3.5">
        <h2 class="text-2xl font-bold tracking-tight">...</h2>
        <p class="text-muted-foreground">...</p>
      </header>
      [PostsTable / CommentsTable / UsersTable]
    </section>
  </main>
</div>
```

### 11‑7. Login (`/login`)

```html
<main class="flex flex-col items-center justify-center h-screen gap-5">
  <h1 class="text-2xl font-bold">Login</h1>
  <button class="buttonVariants(variant='outline' size='lg') min-w-50 cursor-pointer">
    <Github /> GitHub
  </button>
  <a class="buttonVariants(size='lg') min-w-50 cursor-pointer">
    <HomeIcon /> Home
  </a>
</main>
```

수직 중앙 정렬, 버튼 최소 너비 200px(50 × 4).

### 11‑8. Not Found (`/not-found`)

```html
<section class="w-full text-center space-y-2 p-5">
  <BirdIcon class="animate-bounce mx-auto size-16" />
  <p class="text-5xl font-bold">Not Found</p>
  <p>Could not find requested page</p>
  <button class="buttonVariants()">
    <ArrowUpLeftFromSquareIcon /> Home
  </button>
</section>
```

---

## 12. Do's & Don'ts

1. **DO**: 컴포넌트에서 색을 쓸 때는 반드시 `var(--color-*)` 시맨틱 토큰만 참조. **DON'T**: `bg-[#171717]` 같은 직접 hex 주입. (유일한 예외: `code-block`과 GitHub 로고).
2. **DO**: 라운드는 `rounded-{xs|sm|md|lg|xl|full}` 중에서만. **DON'T**: `rounded-[8px]`, `rounded-2xl`, `rounded-3xl`.
3. **DO**: 인터랙티브 요소에 `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` 3종 세트 부여. **DON'T**: `focus:outline-none` 단독.
4. **DO**: 텍스트 weight는 `{400, 500, 600, 700, 800}` 중에서만. **DON'T**: `300`, `900`, 외부 웹폰트 특수 weight 주입.
5. **DO**: 폰트는 시스템 스택을 믿는다. **DON'T**: `next/font` 또는 외부 웹폰트 로딩 금지(BBlog 철학에 반함).
6. **DO**: 쉐도우는 `shadow-{2xs…2xl}` 8단 중에서만. **DON'T**: `shadow-[0_4px_12px_rgba(…)]` 인라인.
7. **DO**: 카드·다이얼로그 등 표면은 `border` + `shadow-*` 조합으로 깊이 표현. **DON'T**: 그라디언트 또는 이중 보더로 깊이 생성(배너 오버레이 예외 제외).
8. **DO**: 모바일 우선 → `sm/md/lg` 순으로 확장. **DON'T**: desktop-first `max-sm:` 체인 사용 금지.
9. **DO**: 스페이싱은 Tailwind 배수(`gap-2`, `p-3.5`) 사용. **DON'T**: `gap-[13px]`, `p-[14.5px]` 임의 값.
10. **DO**: 애니메이션은 shadcn `animate-in/out` + 모션 토큰 사용. **DON'T**: 새 `@keyframes` 도입(현재 소스에 사용자 정의 키프레임 없음).
11. **DO**: `[data-theme]` 속성으로 다크 토글. **DON'T**: 컴포넌트별 if-else 색 분기.
12. **DO**: 아이콘 크기는 버튼/뱃지 클래스 체인이 자동 관리(`[&_svg:not([class*='size-'])]:size-4`). 필요시 `size-*`를 svg에 직접 부여. **DON'T**: `width={16} height={16}` 속성과 `class="size-4"` 혼합.

---

## 13. Responsive Behavior

### 13‑1. 브레이크포인트별 수축·확장 전략

| 원형 | `< sm` (<640px) | `sm` (≥640) | `md` (≥768) | `lg` (≥1024) |
|---|---|---|---|---|
| Blog layout container | `max-w-5xl mx-auto` (모바일 조임) | — | — | 여백 해제(`px-0`) |
| Home sections | `px-2` | — | — | `px-0` |
| Post list grid | `grid-cols-1` | — | `md:grid-cols-2` | `lg:grid-cols-3` |
| Article filter | stacked (암시적) | — | — | — |
| Post header title | `text-sm font-semibold py-2` | — | — | `text-lg` (실제로는 sm에서 전환: `sm:text-lg`) |
| Post header date | `flex gap-1 text-xs px-1 pb-2 w-full justify-end` | `flex gap-2 text-sm px-0 pb-0 w-fit` | — | — |
| Dialog/AlertDialog | `max-w-[calc(100%-2rem)]` | `sm:max-w-lg` | — | — |
| Sheet | `w-3/4` | `sm:max-w-sm` | — | — |
| Dialog footer | `flex-col-reverse gap-2` | `sm:flex-row sm:justify-end` | — | — |
| Dialog header alignment | `text-center` | `sm:text-left` | — | — |
| Sidebar | 접힘(모바일: sheet로 진입) | — | `md:flex` (고정) | — |
| Post form | `w-full` (편집만) | — | `md:w-1/2` (편집+프리뷰) | — |
| Post images grid | `grid-cols-7` | — | — | — |
| UserCard | `flex-col items-start` | `sm:flex-row sm:items-center` | — | — |
| Log profile | `flex-col items-center` | `sm:flex-row sm:items-end` | — | — |
| Comment responsive | 동일한 구조(모바일·데스크탑 차이 없음) | — | — | — |
| Log section padding | `px-6 py-3` | `sm:px-8 sm:py-6` | — | — |
| Scrollbar TOC | `hidden` | — | — | `lg:block` |
| Code block font | `text-2xs` | — | — | `lg:text-sm` |
| Prose h1 | `text-3xl` | — | — | `lg:text-5xl` |
| Input fontsize | `text-base` | — | `md:text-sm` | — |

### 13‑2. 모바일에서 숨김 / 전환

- **ScrollbarToc**: `lg` 미만에서 완전 숨김. 모바일은 전용 TOC UI 없음(스크롤에만 의존).
- **VirtualScroll**: 전 브레이크포인트 노출(0.75rem 너비의 얇은 트랙).
- **Admin Sidebar**: `md` 미만에서 Sheet로 진입(sidebar.tsx의 Sheet composition).
- **Post form preview**: `md` 미만에서 `w-0` — 즉 프리뷰 영역이 사라지고 편집만 전체.

---

## 14. Framework‑Agnostic Translation

### 14‑1. Primitive Mapping

| 원본 (shadcn + Radix + Next) | 시맨틱 HTML + ARIA | Tailwind / CSS |
|---|---|---|
| `<Button>` (`ui/button.tsx`) | `<button type="button">` / `<a role="button">` | base + variant + size 클래스 체인 (§10‑1) |
| `<Button asChild>` (Radix Slot) | 직접 자식 엘리먼트에 버튼 클래스 수동 적용 | 동일 |
| `<Badge>` | `<span>` 또는 `<a>` | §10‑2 클래스 |
| `<Dialog>` / `<Dialog.*>` (`@radix-ui/react-dialog`) | `<dialog open>` + `aria-modal="true"` + 포커스 트랩 수동 구현 | §10‑7 클래스 |
| `<AlertDialog>` (`@radix-ui/react-alert-dialog`) | `<div role="alertdialog" aria-modal="true" aria-labelledby aria-describedby>` | §10‑7 클래스 |
| `<Popover>` (`@radix-ui/react-popover`) | `<div role="dialog">` + 외부 클릭 닫기 + 포지셔닝 라이브러리(floating-ui) | §10‑8 클래스 |
| `<Tooltip>` (`@radix-ui/react-tooltip`) | `<div role="tooltip">` + `aria-describedby` | §10‑8 클래스 |
| `<Sheet>` (Radix Dialog 재사용) | `<dialog>` + CSS 슬라이드 | §10‑9 클래스 |
| `<Avatar>` (`@radix-ui/react-avatar`) | `<img>` + 대체 텍스트 + onError로 fallback 노출 | §10‑15 클래스 |
| `<Carousel>` (embla-carousel-react) | CSS scroll-snap 컨테이너 + 이전/다음 버튼 | `overflow-hidden flex` + `scroll-snap-type: x mandatory` |
| `<Command>` (cmdk) | `<input role="combobox">` + `<ul role="listbox">` + 키 핸들러 | §10‑16 클래스 |
| `<Sidebar>` (shadcn) | `<aside role="navigation" aria-label="Admin menu">` + CSS 폭 토글 | §10‑10 클래스 |
| `<SidebarTrigger>` | `<button aria-expanded aria-controls="sidebar">` | — |
| `<ScrollArea>` (`@radix-ui/react-scroll-area`) | 기본 `<div class="overflow-auto">` (나머지 스타일은 장식) | §10‑17 클래스 |
| `<Checkbox>` (`@radix-ui/react-checkbox`) | `<input type="checkbox">` + `:checked ~ .indicator` | §10‑6 클래스 |
| `<Separator>` (`@radix-ui/react-separator`) | `<hr role="separator" aria-orientation="horizontal/vertical">` | `bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px` |
| `<Skeleton>` | `<div aria-busy="true" aria-live="polite">` | `bg-accent animate-pulse rounded-md` |
| `<Toaster>` (sonner) | 직접 구현: `<div role="status" aria-live="polite" class="fixed bottom-4 right-4 z-50">` | Sonner의 CSS 변수 매핑을 그대로 포팅 |
| `<Pagination*>` | `<nav aria-label="pagination">` + `<ul>` + `<li>` + `<a aria-current="page">` | §10‑13 클래스 |
| `<Table*>` | 순수 `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>` | §10‑11 클래스 |
| `<Image>` (`next/image` 래퍼 `ui/image.tsx`) | `<img loading="lazy" onerror="this.src=fallback">` 또는 `<picture>` | 기존 유틸 클래스 그대로 |
| `buttonVariants()` (CVA) | CSS 클래스 헬퍼 또는 `clsx()`로 수동 조합 | 원본 base + variant 문자열을 그대로 연결 |
| `cn(...)` 유틸 (`clsx` + `tailwind-merge`) | `tailwind-merge` + `clsx` (프레임워크 무관) | 그대로 사용 |
| `next-themes` ThemeProvider | `localStorage.theme` + `<html data-theme>` 토글 스크립트 | (§4‑7) |
| `next/link`, `next/image` | `<a href>`, `<img>` 또는 프레임워크 네이티브 라우팅/이미지 | — |
| `next/navigation` router | 각 프레임워크의 라우터 (Vue Router / SvelteKit routing / TanStack Router) | — |
| RSC `unstable_cache` | 프레임워크별 캐시 (`useFetch`의 `key`, SvelteKit `load`) | — |
| `@next/third-parties` GA/GTM | `<script>` 직접 삽입 | — |

### 14‑2. Icon 전략

원본 아이콘 공급원:
1. `lucide-react` — Heart/Pencil/Trash/Check/ChevronDown/Search/XIcon/Home/ArrowUpLeft/Bird 등.
2. `ui/icons/github.tsx` — 유일한 커스텀 SVG.

**프레임워크 중립 재구현 원칙**
- Lucide의 SVG는 MIT 라이선스. `lucide` 패키지(바닐라 SVG path 제공)를 사용하거나, 각 아이콘을 `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` 포맷으로 포팅.
- 크기: `size-4`(16px, 기본) / `size-3`(12px, 배지 내부) / `size-5`(20px, 로고/로딩) / `size-12`(48px, carousel nav).
- 색: 모두 `currentColor`. 부모 텍스트 색이 자동 적용.
- GitHub 로고는 **고정 `fill="#24292f"` + `dark:invert`** 정책 유지. 다른 SVG는 모두 `currentColor`.

### 14‑3. i18n 바인딩

원본은 `<html lang="ko">` 단일. 확장 패턴:

```html
<html lang="ko" data-theme="light">
```

```css
/* 언어별 폰트 스택 (확장 시) */
html[lang="ko"] { font-family: var(--font-sans); /* 시스템 CJK */ }
html[lang="en"] { font-family: var(--font-sans); }
html[lang="ja"] { font-family: var(--font-sans); /* 시스템 JP */ }
```

원본이 별도 로케일 분기 없이 시스템 폰트에 위임하므로, 이 패턴은 **선택적 확장**. 최소 요구사항은 `<html lang>`만 올바르게 유지.

### 14‑4. 프레임워크 기본 측정값(절대 픽셀)

shadcn/Tailwind 기반이지만, 일부 유틸 기본값은 "Tailwind 기본"에 의존합니다. 프레임워크 없이 재구현할 경우 명시적으로 고정해야 하는 픽셀:

| 유틸 | 절대 픽셀 |
|---|---|
| `h-screen` | 100vh |
| `h-dvh` | 100dvh |
| `h-svh` | 100svh |
| `rounded-xs` | 2px |
| `rounded-md` | 4px |
| `rounded-lg` | 6px |
| `rounded-xl` | 10px |
| `rounded-full` | 9999px |
| `border` | 1px solid |
| `border-l-2` | 2px solid (blockquote) |
| `ring-[3px]` | 3px box-shadow |
| `size-4` | 16×16px |
| `size-8` | 32×32px |
| `size-9` | 36×36px |
| `size-10` | 40×40px |
| `size-12` | 48×48px |
| `size-20` | 80×80px |
| `size-32` | 128×128px |
| `w-72` | 288px |
| `max-w-md` | 448px |
| `max-w-lg` | 512px |
| `max-w-5xl` | 1024px |
| `h-12` | 48px |
| `h-9` | 36px (Button default height) |
| `min-h-20` | 80px |
| `max-h-[300px]` | 300px |

### 14‑5. Tailwind v4 Custom Variants

```css
/* Dark mode — 원본: &:is(.dark *), 중립판: data attribute */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* 언어별 확장 시 */
@custom-variant lang-ko (&:where(html[lang="ko"] *));
@custom-variant lang-en (&:where(html[lang="en"] *));
```

### 14‑6. 애니메이션 대체

원본은 `tw-animate-css` 플러그인이 제공하는 `animate-in/out`, `fade-in-0/out-0`, `zoom-in-95/out-95`, `slide-in-from-*/slide-out-to-*` 유틸리티를 사용합니다. 제거 시 대체 CSS:

```css
/* fade-in */
@keyframes fade-in  { from { opacity: 0 } to { opacity: 1 } }
@keyframes fade-out { from { opacity: 1 } to { opacity: 0 } }

/* zoom-in-95 */
@keyframes zoom-in-95  { from { transform: scale(.95); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes zoom-out-95 { from { transform: scale(1);   opacity: 1 } to { transform: scale(.95); opacity: 0 } }

/* slide-in-from-top-2 */
@keyframes slide-in-from-top-2  { from { transform: translateY(-.5rem) } to { transform: translateY(0) } }
/* slide-in-from-bottom/left/right 유사 */

/* usage */
.popover[data-state="open"] {
  animation:
    fade-in .15s ease-out,
    zoom-in-95 .15s ease-out,
    slide-in-from-top-2 .15s ease-out;
}
```

Sheet는 더 긴 슬라이드(300/500ms)를 사용하므로 별도 타이밍 관리 필요.

---

## 15. File Tree Coverage Checklist

### 15‑1. Stylesheets & Config

- [x] `app/globals.css` — 전역 CSS, `:root` 토큰, `@theme inline`, `@layer base`, `prose` 오버라이드, scrollbar-toc 규칙, `@theme` 확장(`--text-2xs`, `--text-3xs`), `html/body` 리셋. **Pattern leader: 전체 토큰 기반 문서 (§3, §4, §5, §6, §16)**
- [x] `components.json` — shadcn config (new-york, neutral, Tailwind css 파일 경로)
- [x] `next.config.ts` — React Compiler, output standalone, images remotePatterns
- [x] `postcss.config.mjs` — `@tailwindcss/postcss`
- [x] `tsconfig.json` — path alias (`@app, @db, @entities, @features, @lib, @scripts, @ui, @widgets`)
- [x] `package.json` — 의존성 inventory (§1‑3)

### 15‑2. UI Primitives (`ui/`)

- [x] `ui/button.tsx` — **Pattern leader: Button (§10‑1)**
- [x] `ui/badge.tsx` — **Pattern leader: Badge (§10‑2)**
- [x] `ui/input.tsx` — **Pattern leader: Input (§10‑4)**
- [x] `ui/textarea.tsx` — **Pattern leader: Textarea (§10‑5)**
- [x] `ui/checkbox.tsx` — **Pattern leader: Checkbox (§10‑6)**
- [x] `ui/dialog.tsx` — **Pattern leader: Dialog (§10‑7)**
- [x] `ui/alert-dialog.tsx` — instance of Dialog; 추가: focus-trap 정책 강화, Close 버튼 없음(Action/Cancel 페어 필수)
- [x] `ui/popover.tsx` — **Pattern leader: Popover (§10‑8)**
- [x] `ui/tooltip.tsx` — instance of Popover; 오버라이드: `bg-foreground text-background text-xs`
- [x] `ui/sheet.tsx` — **Pattern leader: Sheet (§10‑9)**
- [x] `ui/sidebar.tsx` — **Pattern leader: Sidebar (§10‑10)**
- [x] `ui/avatar.tsx` — **Pattern leader: Avatar (§10‑15)**
- [x] `ui/carousel.tsx` — **Pattern leader: Carousel (§10‑12)**
- [x] `ui/command.tsx` — **Pattern leader: Command Palette (§10‑16)**
- [x] `ui/pagination.tsx` — **Pattern leader: Pagination (§10‑13)**
- [x] `ui/scroll-area.tsx` — **Pattern leader: ScrollArea (§10‑17)**
- [x] `ui/separator.tsx` — instance of divider (1px line pattern, §6‑3)
- [x] `ui/skeleton.tsx` — instance of loading indicator; `bg-accent animate-pulse rounded-md`
- [x] `ui/sonner.tsx` — instance of toast; CSS variable mapping `--normal-bg=var(--popover)`
- [x] `ui/table.tsx` — **Pattern leader: Table (§10‑11)**
- [x] `ui/image.tsx` — fallback chain 래퍼 (시각 스타일 없음 — 유지)
- [x] `ui/icons/github.tsx` — 커스텀 SVG 아이콘, 고정 `fill="#24292f"`

### 15‑3. Widgets (`widgets/`)

**Layout**
- [x] `widgets/layout/header.tsx` — instance of Signature nav bar; `sticky top-0 z-50 h-12 backdrop-blur-xs bg-background/50` + 로고 `font-extrabold text-xl`
- [x] `widgets/layout/auth-nav.tsx` — instance of Button (variant='ghost' size='icon')
- [x] `widgets/layout/go-to-top.tsx` — instance of fixed Button (size='icon', bg secondary, border-primary/10)
- [x] `widgets/layout/scrollbar-toc.tsx` — instance of aside TOC; `[data-bscroll-toc]` 셀렉터 규칙 (§7, §8‑1)

**Post**
- [x] `widgets/post/post-card.tsx` — **Instance + canonical example of Signature Card (§10‑3)**
- [x] `widgets/post/post-list.tsx` — `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3` (§13)
- [x] `widgets/post/post-header.tsx` — 블로그 포스트 상세 상단 메타; backdrop-blur-sm, border-b, 반응형 타이틀
- [x] `widgets/post/post-tag-list.tsx` — instance of Badge list (outline, `rounded p-0.5 px-1.5`)
- [x] `widgets/post/post-images.tsx` — instance of image grid (`grid-cols-7 gap-2 max-h-50`)
- [x] `widgets/post/article-filter.tsx` — Badge 필터 + Input 검색 조합
- [x] `widgets/post/article-paginator.tsx` — instance of Pagination
- [x] `widgets/post/post-form.tsx` — Editor 페이지 좌측 panel (§11‑5)

**Comment**
- [x] `widgets/comment/comment-section.tsx` — section header + CommentList 컴포지션
- [x] `widgets/comment/comment-list.tsx` — empty state + 반복
- [x] `widgets/comment/comment-item.tsx` — Avatar + 본문 + 편집 토글 (`p-3.5 flex gap-3 border-b border-border`)
- [x] `widgets/comment/comment-form.tsx` — Textarea + 비밀 댓글 Checkbox + Submit 버튼 (`p-3.5 flex flex-col gap-2 border-b`)

**Category / Tag**
- [x] `widgets/category/category-select.tsx` — **Pattern leader: Combobox (§10‑14)**
- [x] `widgets/tag/tag-select.tsx` — instance of Combobox; 선택된 태그 Badge 칩 표시

**Admin**
- [x] `widgets/admin/admin-panel.tsx` — Admin shell (§8‑2, §11‑6)
- [x] `widgets/admin/admin-sidebar.tsx` — instance of Sidebar
- [x] `widgets/admin/posts-table.tsx` — **Instance + canonical example of Table (§10‑11)**; 상태 배지 매핑 규칙
- [x] `widgets/admin/comments-table.tsx` — instance of Table; `max-w-md truncate` 본문 셀 규칙
- [x] `widgets/admin/users-table.tsx` — instance of Table; role/status 배지

**Log**
- [x] `widgets/log/log-page-header.tsx` — banner hero (§11‑4)
- [x] `widgets/log/log-page-info.tsx` — instance of log-page-header (variant without overlay)
- [x] `widgets/log/log-message-form.tsx` — instance of comment-form (Avatar + Textarea + 이미지 업로더)
- [x] `widgets/log/log-message-list.tsx` — 메시지 아이템 반복
- [x] `widgets/log/image-modal.tsx` — instance of full-viewport Dialog + Carousel (§10‑7, §10‑12)

### 15‑4. Features (`features/`)

**Common**
- [x] `features/common/user-card.tsx` — 프로필 카드 (반응형 flex)
- [x] `features/common/paginator.tsx` — instance of Pagination
- [x] `features/common/code-block.tsx` — **instance of Signature Card, 다크 고정**; `bg-neutral-800 border-neutral-600 text-neutral-100`

**Theme**
- [x] `features/theme/theme-changer.tsx` — instance of Button (`ghost` + `icon`); 로딩 아이콘 `animate-spin size-5`
- [x] `features/theme/virtual-scroll.tsx` — **스크롤바 위젯** (fixed `right-0 top-0 w-0.75 z-[60]`)

**Log**
- [x] `features/log/log-info-list.tsx` — 메타 리스트 (`text-sm text-muted-foreground`, `size-3` 아이콘)

**Editor**
- [x] `features/editor/editor.tsx` — (어드민에서 사용) 툴바 + 컨텐트-에디터블 영역
- [x] `features/editor/editor-button.tsx` — instance of Button (`ghost` + `icon`, active 시 `bg-accent`)
- [x] `features/editor/markdown.tsx` — MD→HTML 파이프라인 (`prose` 규칙 적용)
- [x] `features/editor/hooks/*` — 비시각; 제외
- [x] `features/editor/utils/*` — 비시각; 제외

### 15‑5. App Routes (`app/`)

- [x] `app/layout.tsx` — 루트 셸 (ThemeProvider + TanstackQueryProvider + Analytics + Toaster + VirtualScroll + GoToTop) (§11‑1 shell)
- [x] `app/(blog)/layout.tsx` — blog layout `max-w-5xl mx-auto` (§8‑1)
- [x] `app/(blog)/page.tsx` — **Page leader: Home (§11‑1)**
- [x] `app/(blog)/article/page.tsx` — **Page leader: Article List (§11‑2)**
- [x] `app/(blog)/article/[id]/page.tsx` — **Page leader: Article Detail (§11‑3)**
- [x] `app/(blog)/log/page.tsx` — **Page leader: Log (§11‑4)**
- [x] `app/(editor)/layout.tsx` — 인증 게이트 (RSC `notFound()`)
- [x] `app/(editor)/write/page.tsx` — **Page leader: Editor Write (§11‑5)**
- [x] `app/(editor)/edit/[id]/page.tsx` — instance of Editor (프리필 상태 추가)
- [x] `app/admin/layout.tsx` — 인증 게이트
- [x] `app/admin/page.tsx` — Admin shell 진입 (§11‑6)
- [x] `app/login/page.tsx` — **Page leader: Login (§11‑7)**
- [x] `app/not-found.tsx` — **Page leader: Not Found (§11‑8)**
- [x] `app/robots.ts` / `app/sitemap.ts` — 비시각; 제외
- [x] `app/favicon.ico` — 아이콘 바이너리; 제외
- [x] `app/api/**/*.ts` — 서버 API 라우트; 시각 영역 없음(제외)

### 15‑6. Providers & Utils

- [x] `lib/providers/theme-provider.tsx` — `next-themes` 래퍼 (§4‑7)
- [x] `lib/providers/tanstack-query-provider.tsx` — QueryClient 프로바이더 (비시각)
- [x] `lib/utils.ts` — `cn = (...inputs) => twMerge(clsx(inputs))` (§14‑1)
- [x] `lib/constants.ts` — QUERY_KEY, USER_INFO, CUSTOM_LINKS, BLOG_DESCRIPTION, LOG_USER_ID — 비시각
- [x] `lib/auth/*`, `lib/images/*`, `lib/hooks/*` — 비시각

### 15‑7. 제외 경로

- `db/` — Drizzle 스키마/마이그레이션
- `entities/*` — 데이터 fetch 로직
- `scripts/*` — 유틸 스크립트
- `app/api/**/*` — 서버 API

---

## 16. Tailwind v4 `@theme` Reference Block

이 블록은 **재구현 시 그대로 붙여넣을 수 있는 완전본**입니다. 토큰 ID를 바꾸지 말 것. 주석은 트레이스용.

```css
/* ============================================================
   BBlog — Design Tokens (v1.0 — 2026-04-22)
   - OKLCH only (hex in comments for traceability)
   - Dual-tier: --palette-* (raw) → --color-* (semantic)
   - Dark mode: [data-theme="dark"] + prefers-color-scheme
   ============================================================ */

@import 'tailwindcss';
@import 'tw-animate-css';
@import 'highlight.js/styles/stackoverflow-dark.min.css';

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* ── Palette layer (Tier 1) ─────────────────────────────── */
:root {
  /* Neutrals — chroma 0 */
  --palette-neutral-0:   oklch(1     0 0); /* #ffffff */
  --palette-neutral-25:  oklch(0.985 0 0); /* #fafafa */
  --palette-neutral-50:  oklch(0.97  0 0); /* #f5f5f5 */
  --palette-neutral-200: oklch(0.922 0 0); /* #e5e5e5 */
  --palette-neutral-400: oklch(0.708 0 0); /* #a3a3a3 */
  --palette-neutral-500: oklch(0.556 0 0); /* #737373 */
  --palette-neutral-700: oklch(0.269 0 0); /* #404040 */
  --palette-neutral-800: oklch(0.205 0 0); /* #262626 */
  --palette-neutral-900: oklch(0.145 0 0); /* #171717 */

  /* Feedback */
  --palette-red-500:     oklch(0.577 0.245 27); /* #dc2626 */
  --palette-red-dark:    oklch(0.704 0.191 22); /* #ef4444 */

  /* Alpha-based dark borders */
  --palette-border-dark: oklch(1 0 0 / 10%);
  --palette-input-dark:  oklch(1 0 0 / 15%);

  /* Chart (light) */
  --palette-chart-light-1: oklch(0.646 0.222 41);   /* #d97706 */
  --palette-chart-light-2: oklch(0.600 0.118 185);  /* #0891b2 */
  --palette-chart-light-3: oklch(0.398 0.070 227);  /* #334155 */
  --palette-chart-light-4: oklch(0.828 0.189 84);   /* #facc15 */
  --palette-chart-light-5: oklch(0.769 0.188 70);   /* #f59e0b */

  /* Chart (dark) */
  --palette-chart-dark-1: oklch(0.488 0.243 264);   /* #6366f1 */
  --palette-chart-dark-2: oklch(0.696 0.170 162);   /* #10b981 */
  --palette-chart-dark-3: oklch(0.769 0.188 70);    /* #f59e0b */
  --palette-chart-dark-4: oklch(0.627 0.265 304);   /* #a855f7 */
  --palette-chart-dark-5: oklch(0.645 0.246 16);    /* #ef4444 */
}

/* ── Semantic layer (Tier 2, light defaults) ─────────────── */
:root {
  --color-background:           var(--palette-neutral-0);
  --color-foreground:           var(--palette-neutral-900);
  --color-card:                 var(--palette-neutral-0);
  --color-card-foreground:      var(--palette-neutral-900);
  --color-popover:              var(--palette-neutral-0);
  --color-popover-foreground:   var(--palette-neutral-900);

  --color-primary:              var(--palette-neutral-800);
  --color-primary-foreground:   var(--palette-neutral-25);

  --color-secondary:            var(--palette-neutral-50);
  --color-secondary-foreground: var(--palette-neutral-800);
  --color-muted:                var(--palette-neutral-50);
  --color-muted-foreground:     var(--palette-neutral-500);
  --color-accent:               var(--palette-neutral-50);
  --color-accent-foreground:    var(--palette-neutral-800);

  --color-destructive:            var(--palette-red-500);
  --color-destructive-foreground: var(--palette-neutral-0);

  --color-border:               var(--palette-neutral-200);
  --color-input:                var(--palette-neutral-200);
  --color-ring:                 var(--palette-neutral-400);

  --color-sidebar:                        var(--palette-neutral-25);
  --color-sidebar-foreground:             var(--palette-neutral-900);
  --color-sidebar-primary:                var(--palette-neutral-800);
  --color-sidebar-primary-foreground:     var(--palette-neutral-25);
  --color-sidebar-accent:                 var(--palette-neutral-50);
  --color-sidebar-accent-foreground:      var(--palette-neutral-800);
  --color-sidebar-border:                 var(--palette-neutral-200);
  --color-sidebar-ring:                   var(--palette-neutral-400);

  --color-chart-1: var(--palette-chart-light-1);
  --color-chart-2: var(--palette-chart-light-2);
  --color-chart-3: var(--palette-chart-light-3);
  --color-chart-4: var(--palette-chart-light-4);
  --color-chart-5: var(--palette-chart-light-5);

  /* Typography */
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
               'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans',
               sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
               'Segoe UI Symbol', 'Noto Color Emoji';
  --font-serif: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
               'Liberation Mono', 'Courier New', monospace;

  /* Radius */
  --radius: 0.375rem;

  /* Tracking */
  --tracking-normal: 0em;

  /* Spacing base */
  --spacing: 0.25rem;

  /* Shadow (light = dark — intentional) */
  --shadow-2xs: 0px 0px 7px 0px hsl(0 0% 0% / 0.03);
  --shadow-xs:  0px 0px 7px 0px hsl(0 0% 0% / 0.03);
  --shadow-sm:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 1px 2px -1px hsl(0 0% 0% / 0.06);
  --shadow:     0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 1px 2px -1px hsl(0 0% 0% / 0.06);
  --shadow-md:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 2px 4px -1px hsl(0 0% 0% / 0.06);
  --shadow-lg:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 4px 6px -1px hsl(0 0% 0% / 0.06);
  --shadow-xl:  0px 0px 7px 0px hsl(0 0% 0% / 0.06),
                0px 8px 10px -1px hsl(0 0% 0% / 0.06);
  --shadow-2xl: 0px 0px 7px 0px hsl(0 0% 0% / 0.15);
}

/* ── Dark rebindings (Trigger 1 — OS) ────────────────────── */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background:           var(--palette-neutral-900);
    --color-foreground:           var(--palette-neutral-25);
    --color-card:                 var(--palette-neutral-800);
    --color-card-foreground:      var(--palette-neutral-25);
    --color-popover:              var(--palette-neutral-800);
    --color-popover-foreground:   var(--palette-neutral-25);

    --color-primary:              var(--palette-neutral-200);
    --color-primary-foreground:   var(--palette-neutral-800);

    --color-secondary:            var(--palette-neutral-700);
    --color-secondary-foreground: var(--palette-neutral-25);
    --color-muted:                var(--palette-neutral-700);
    --color-muted-foreground:     var(--palette-neutral-400);
    --color-accent:               var(--palette-neutral-700);
    --color-accent-foreground:    var(--palette-neutral-25);

    --color-destructive:            var(--palette-red-dark);
    --color-destructive-foreground: var(--palette-neutral-25);

    --color-border:               var(--palette-border-dark);
    --color-input:                var(--palette-input-dark);
    --color-ring:                 var(--palette-neutral-500);

    --color-sidebar:                    var(--palette-neutral-800);
    --color-sidebar-foreground:         var(--palette-neutral-25);
    --color-sidebar-primary:            var(--palette-chart-dark-1);
    --color-sidebar-primary-foreground: var(--palette-neutral-25);
    --color-sidebar-accent:             var(--palette-neutral-700);
    --color-sidebar-accent-foreground:  var(--palette-neutral-25);
    --color-sidebar-border:             var(--palette-border-dark);
    --color-sidebar-ring:               var(--palette-neutral-500);

    --color-chart-1: var(--palette-chart-dark-1);
    --color-chart-2: var(--palette-chart-dark-2);
    --color-chart-3: var(--palette-chart-dark-3);
    --color-chart-4: var(--palette-chart-dark-4);
    --color-chart-5: var(--palette-chart-dark-5);
  }
}

/* ── Dark rebindings (Trigger 2 — manual override wins) ──── */
[data-theme="dark"] {
  --color-background:           var(--palette-neutral-900);
  --color-foreground:           var(--palette-neutral-25);
  --color-card:                 var(--palette-neutral-800);
  --color-card-foreground:      var(--palette-neutral-25);
  --color-popover:              var(--palette-neutral-800);
  --color-popover-foreground:   var(--palette-neutral-25);
  --color-primary:              var(--palette-neutral-200);
  --color-primary-foreground:   var(--palette-neutral-800);
  --color-secondary:            var(--palette-neutral-700);
  --color-secondary-foreground: var(--palette-neutral-25);
  --color-muted:                var(--palette-neutral-700);
  --color-muted-foreground:     var(--palette-neutral-400);
  --color-accent:               var(--palette-neutral-700);
  --color-accent-foreground:    var(--palette-neutral-25);
  --color-destructive:            var(--palette-red-dark);
  --color-destructive-foreground: var(--palette-neutral-25);
  --color-border:               var(--palette-border-dark);
  --color-input:                var(--palette-input-dark);
  --color-ring:                 var(--palette-neutral-500);
  --color-sidebar:                    var(--palette-neutral-800);
  --color-sidebar-foreground:         var(--palette-neutral-25);
  --color-sidebar-primary:            var(--palette-chart-dark-1);
  --color-sidebar-primary-foreground: var(--palette-neutral-25);
  --color-sidebar-accent:             var(--palette-neutral-700);
  --color-sidebar-accent-foreground:  var(--palette-neutral-25);
  --color-sidebar-border:             var(--palette-border-dark);
  --color-sidebar-ring:               var(--palette-neutral-500);
  --color-chart-1: var(--palette-chart-dark-1);
  --color-chart-2: var(--palette-chart-dark-2);
  --color-chart-3: var(--palette-chart-dark-3);
  --color-chart-4: var(--palette-chart-dark-4);
  --color-chart-5: var(--palette-chart-dark-5);
}

[data-theme="light"] {
  /* 비어 있음 — :root 라이트 defaults로 fall-through */
}

/* ── Tailwind v4 @theme block ─────────────────────────────── */
@theme inline {
  --color-background: var(--color-background);
  --color-foreground: var(--color-foreground);
  --color-card: var(--color-card);
  --color-card-foreground: var(--color-card-foreground);
  --color-popover: var(--color-popover);
  --color-popover-foreground: var(--color-popover-foreground);
  --color-primary: var(--color-primary);
  --color-primary-foreground: var(--color-primary-foreground);
  --color-secondary: var(--color-secondary);
  --color-secondary-foreground: var(--color-secondary-foreground);
  --color-muted: var(--color-muted);
  --color-muted-foreground: var(--color-muted-foreground);
  --color-accent: var(--color-accent);
  --color-accent-foreground: var(--color-accent-foreground);
  --color-destructive: var(--color-destructive);
  --color-destructive-foreground: var(--color-destructive-foreground);
  --color-border: var(--color-border);
  --color-input: var(--color-input);
  --color-ring: var(--color-ring);
  --color-chart-1: var(--color-chart-1);
  --color-chart-2: var(--color-chart-2);
  --color-chart-3: var(--color-chart-3);
  --color-chart-4: var(--color-chart-4);
  --color-chart-5: var(--color-chart-5);
  --color-sidebar: var(--color-sidebar);
  --color-sidebar-foreground: var(--color-sidebar-foreground);
  --color-sidebar-primary: var(--color-sidebar-primary);
  --color-sidebar-primary-foreground: var(--color-sidebar-primary-foreground);
  --color-sidebar-accent: var(--color-sidebar-accent);
  --color-sidebar-accent-foreground: var(--color-sidebar-accent-foreground);
  --color-sidebar-border: var(--color-sidebar-border);
  --color-sidebar-ring: var(--color-sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs:  var(--shadow-xs);
  --shadow-sm:  var(--shadow-sm);
  --shadow:     var(--shadow);
  --shadow-md:  var(--shadow-md);
  --shadow-lg:  var(--shadow-lg);
  --shadow-xl:  var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}

/* ── Custom text-size extension ──────────────────────────── */
@theme {
  --text-2xs: 0.625rem; /* 10px */
  --text-3xs: 0.5rem;   /* 8px (예약) */
}

/* ── Base layer ──────────────────────────────────────────── */
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
}

/* ── Reset ───────────────────────────────────────────────── */
html, body {
  @apply bg-background text-foreground font-sans antialiased;
  scrollbar-width: none;
  scroll-behavior: smooth !important;
}
@media (prefers-color-scheme: dark) {
  html, body { color-scheme: dark; }
}
::-webkit-scrollbar { display: none; }

/* ── Reduced motion ──────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}

/* ── Prose (blog article body) ───────────────────────────── */
.prose {
  @apply text-foreground;

  h1, h2, h3, h4, h5, h6,
  h1[id], h2[id], h3[id], h4[id], h5[id], h6[id] {
    @apply scroll-mt-12;
  }
  h1 { @apply text-3xl font-extrabold tracking-tight lg:text-5xl; }
  h2 { @apply mt-10 border-b pb-2 text-2xl font-semibold tracking-tight transition-colors first:mt-0; }
  h3 { @apply mt-8 text-xl font-semibold tracking-tight; }

  h1 a, h2 a, h3 a, h4 a, h5 a, h6 a { @apply no-underline; }

  p { @apply leading-7 [&:not(:first-child)]:mt-6; }
  a { @apply font-medium text-primary underline underline-offset-4; }
  blockquote { @apply mt-6 border-l-2 pl-6 italic; }

  ul { @apply my-6 ml-6 list-disc [&>li]:mt-2; }
  ol { @apply my-6 ml-6 list-decimal [&>li]:mt-2; }

  table { @apply w-full table-auto; }
  thead tr, tbody tr { @apply m-0 border-t p-0 even:bg-muted; }
  thead th { @apply border px-4 py-2 text-left font-bold break-words [&[align=center]]:text-center [&[align=right]]:text-right; }
  tbody td { @apply border px-4 py-2 text-left break-words [&[align=center]]:text-center [&[align=right]]:text-right; }

  div:has(> table) { @apply my-6 w-full overflow-y-auto; }
}

/* ── Scrollbar-TOC widget ────────────────────────────────── */
[data-bscroll-toc='true'] {
  @apply text-primary max-w-0 overflow-hidden whitespace-nowrap z-20 min-w-[20px] hidden lg:block;
  transition: max-width 300ms ease-in-out;
}
[data-bscroll-toc='true'] button {
  @apply relative min-w-[20px] text-left overflow-hidden whitespace-nowrap text-transparent ml-auto w-fit max-w-full hidden lg:block;
  transition: color 200ms ease-in-out;
  text-overflow: ellipsis;
}
[data-bscroll-toc='true'] button::before {
  content: '·';
  position: absolute;
  inset-inline-end: 0;
  top: 50%;
  transform: translateY(-50%);
  font-size: 3rem;
  color: var(--color-primary);
  opacity: 1;
  transition: opacity 200ms ease-in-out;
}
:is(body:has(.peer:hover),
    body:has([data-bscroll-toc='true']:hover)) [data-bscroll-toc='true'] {
  @apply max-w-[15dvh];
  will-change: max-width;
}
:is(body:has(.peer:hover),
    body:has([data-bscroll-toc='true']:hover)) [data-bscroll-toc='true'] button {
  @apply text-inherit;
}
:is(body:has(.peer:hover),
    body:has([data-bscroll-toc='true']:hover)) [data-bscroll-toc='true'] button::before {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  [data-bscroll-toc='true'],
  [data-bscroll-toc='true'] button,
  [data-bscroll-toc='true'] button::before { transition: none; }
}
```

---

## 17. Agent Prompt Guide

아래 프롬프트는 각 원형을 **토큰만 알려주면** 재현할 수 있도록 설계되었습니다. 실행 LLM은 이 DESIGN.md를 컨텍스트에 포함한 상태로 호출해야 합니다.

### 17‑1. Button 재현 프롬프트

```
DESIGN.md §10‑1을 참조해 "Button" 컴포넌트를 { stack } 에 맞게 생성하세요.
- 6개 variant (default/destructive/outline/secondary/ghost/link), 6개 size(default/sm/lg/icon/icon-sm/icon-lg).
- base 클래스는 정확히 §10‑1의 문자열을 사용. 변경 금지.
- 색은 모두 `var(--color-*)` 시맨틱 토큰만. hex 직접 금지.
- focus-visible 3px ring + `border-ring` + `ring-ring/50` 필수.
- Radix Slot 대체: `asChild` prop → 자식에 클래스 spread.
- 산출물: 컴포넌트 파일 한 개 + 사용 예시(변형 6×크기 6 중 6개 랜덤 조합).
```

### 17‑2. Signature Card 재현 프롬프트

```
DESIGN.md §10‑3을 참조해 "Card (post-card)" 컴포넌트를 { stack } 에 맞게 생성하세요.
- 루트: article.p-3 rounded shadow-sm border hover:shadow-md hover:bg-border/50 transition-all duration-150 flex flex-col gap-1.5
- 상태: notice(`border bg-border/50`), hidden(`opacity-25`)를 prop으로 노출.
- Header 슬롯(좌: badge, 우: time), Title 슬롯(text-base font-bold line-clamp-1) 필수.
- 색은 §3‑2 시맨틱 토큰만 사용. 인라인 hex 금지.
```

### 17‑3. Dark Mode Toggle 재현 프롬프트

```
DESIGN.md §4‑7을 참조해 "Theme Toggle" 컴포넌트를 { stack } 에 맞게 생성하세요.
- 상태: 'system' | 'light' | 'dark' 3단.
- `<html data-theme>` 속성 조작(class 토글 아님).
- 초기값: matchMedia('(prefers-color-scheme: dark)').matches 감지.
- localStorage.theme 키로 저장/복원. 'system' 값일 때만 matchMedia 이벤트 구독.
- 토글 순간 <html>에 `transition-none` 클래스 100ms 부여 후 제거(깜빡임 방지).
- UI: 아이콘 버튼(sun/moon/laptop). variant='ghost' size='icon'.
```

### 17‑4. Blog Page Shell 재현 프롬프트

```
DESIGN.md §8‑1, §11‑1~§11‑8을 참조해 "Blog layout shell"과 8개 Page를 { stack } 에 맞게 생성하세요.
- Root layout: <html lang="ko" data-theme> + <body class="antialiased relative bg-background text-foreground">.
- Blog layout: <header class="max-w-5xl mx-auto"><LayoutHeader/></header><main class="antialiased relative max-w-5xl mx-auto pb-10">{children}</main>
- 전역 포털 컴포넌트: ScrollbarToc, VirtualScroll, GoToTop, Toaster.
- 각 페이지는 §11의 정확한 클래스 체인과 섹션 순서를 보존.
- Markdown 렌더: `div.prose.p-3.5.text-primary.flex-shrink-0` 내부에 rehype된 HTML 삽입.
```

### 17‑5. Admin Table 재현 프롬프트

```
DESIGN.md §10‑11, §11‑6을 참조해 "Admin Data Table"을 { stack } 에 맞게 생성하세요.
- <div class="rounded-md border"> + <table class="w-full caption-bottom text-sm"> 구조.
- 상태 배지 색상 매핑은 §10‑11의 표를 정확히 따를 것.
- 액션 버튼은 `size-7` icon variant. `Trash` 아이콘은 AlertDialog로 감싸기.
- 반응형: 테이블 래퍼에 `overflow-x-auto`.
- hex/arbitrary 값 금지. 모든 색 = `var(--color-*)`.
```

### 17‑6. Combobox (Category/Tag Select) 재현 프롬프트

```
DESIGN.md §10‑14를 참조해 "Combobox"를 { stack } 에 맞게 생성하세요.
- 트리거: buttonVariants(variant='outline') w-full justify-between h-auto min-h-9.
- Popover: w-full p-0, align=start.
- 내부: cmdk(또는 수동 combobox pattern): Input(h-9 border-b) + List(max-h-[300px] overflow-y-auto) + Item(rounded-sm px-2 py-1.5 text-sm + data-[selected=true]:bg-accent).
- 태그 선택의 경우: 선택된 값들은 Badge(variant='secondary') 칩으로 트리거 내부에 gap-1 rounded-xs 스타일로 노출.
- 접근성: trigger에 role="combobox" aria-expanded aria-controls, listbox에 role="listbox".
```

### 17‑7. Scrollbar-TOC 재현 프롬프트

```
DESIGN.md §7, §16(마지막 섹션)을 참조해 "Scrollbar TOC" 위젯을 { stack } 에 맞게 생성하세요.
- 셀렉터: [data-bscroll-toc='true'], lg↑에서만 표시(hidden lg:block).
- 접힘 상태: max-w-0 min-w-[20px] z-20, 텍스트 invisible + ::before '·' 표시.
- 펼침 트리거: body:has(.peer:hover) 또는 body:has([data-bscroll-toc]:hover) → max-w-[15dvh].
- transition: max-width 300ms ease-in-out, color 200ms ease-in-out.
- prefers-reduced-motion: transition none.
- 원본 hover-peer 관계: 본문 헤딩 요소에 `peer` 클래스 부여 → 헤딩 hover 시 TOC 펼침.
```

### 17‑8. Master Recreation Prompt

```
BBlog 전체 재현 마스터 프롬프트

목표: DESIGN.md (§1~§18)를 유일한 레퍼런스로 삼아 BBlog의 시각·인터랙션을 { target stack } 에서 ~100% 재현.

절차:
1. §16의 @theme 블록을 전역 CSS로 그대로 이식.
2. §10의 16개 원형(11 primary + 5 supporting) 컴포넌트를 생성. 각 원형의 base 클래스 + variant 클래스를 §10 명세 그대로 적용.
3. §11의 8개 페이지 패턴(Home/Article List/Article Detail/Log/Editor Write/Editor Edit/Admin/Login/Not Found)을 생성.
4. §14의 Primitive Mapping을 따라 shadcn/Radix 의존성 제거.
5. §4‑7의 방식으로 다크 모드 토글 구현.
6. §18 검증 게이트 5개 통과 확인.

제약:
- 컴포넌트 CSS에 hex 금지. 오직 `var(--color-*)` 시맨틱 토큰.
- 라운드/웨이트/쉐도우 스케일은 §6의 정의 외 추가 금지.
- 포커스 링 3px + ring-ring/50 필수.
- 애니메이션은 §14‑6 CSS keyframes로 대체 가능.
```

---

## 18. Verification Checklist

### Gate 1 — Tree Coverage

- [x] `ui/` 내 22개 파일 모두 §15‑2에 leader 또는 instance로 등재.
- [x] `widgets/` 내 27개 파일 모두 §15‑3에 등재.
- [x] `features/` 내 시각 파일 7개 모두 §15‑4에 등재(hook/util 제외).
- [x] `app/` 내 page/layout 모두 §15‑5에 등재.
- [x] 모든 pattern leader는 §10에 대응하는 엔트리를 가짐.
- [x] 제외 경로(§15‑7)는 명시적으로 열거.

### Gate 2 — Token Usage

- [x] §16의 모든 `--color-*` 는 §10 또는 §11 또는 §3‑2/§4‑3에서 1회 이상 참조.
- [x] §16의 모든 `--shadow-*`는 §6‑4에 역할 매핑 있음(또는 "미사용 예약"으로 명시).
- [x] §16의 모든 `--text-*`는 §5‑5에 치수 있음.
- [x] §16의 모든 `--radius-*`는 §6‑2에 픽셀값 있음.
- [x] 다크 재바인딩(`[data-theme="dark"]` + `@media (prefers-color-scheme: dark)`)이 §16에 둘 다 포함.
- [x] 폰트 토큰 3종(sans/serif/mono)은 §5‑2에 전 스택 기재.
- [x] z-index 스케일(§7‑5)은 §16에는 노출하지 않음(로컬 컴포넌트 수준) — 의도적.

### Gate 3 — Prompt Validation

- [x] §17의 8개 프롬프트 각각이 "hex 금지", "시맨틱 토큰만", "radius 스케일 외 금지" 규칙을 명시.
- [x] 마스터 프롬프트(§17‑8)가 검증 단계를 포함.
- [ ] **런타임 검증(재구현자 측)**: 생성된 컴포넌트 파일에서 `#[0-9a-f]{3,8}` 검색 결과 0건(주석 제외).
- [ ] **런타임 검증(재구현자 측)**: 생성된 컴포넌트에서 `rounded-2xl`, `rounded-3xl` 등 금지 라운드 0건.

### Gate 4 — Framework Independence

- [x] 컴포넌트 해부(§10)에 `@radix-ui/*`, `next/*`, `cmdk`, `embla-*` 직접 참조 없음 (이름은 §14에서만).
- [x] 페이지 패턴(§11)의 anatomy는 HTML + ARIA + Tailwind만 사용.
- [x] 프레임워크 기본 측정값(§14‑4)이 절대 픽셀로 표기.
- [x] §14‑1의 매핑 표에 shadcn/Radix/Next 모든 primitive가 포함.

### Gate 5 — Statistical Consistency

- [x] 시맨틱 컬러 토큰 수(라이트): 32개 (`background/foreground/card/card-foreground/popover/popover-foreground/primary/primary-foreground/secondary/secondary-foreground/muted/muted-foreground/accent/accent-foreground/destructive/destructive-foreground/border/input/ring` = 19 + sidebar 8 + chart 5).
- [x] 다크 재바인딩 수: 라이트와 동일 32개(+ 다크 전용 alpha-based border/input 팔레트 2개).
- [x] 팔레트 raw 토큰: 9(neutral) + 2(red) + 5(light chart) + 5(dark chart) + 2(alpha border) = **23개**.
- [x] Radius 스케일: sm/md/lg/xl + xs + full = **6단**(§6‑2와 일치).
- [x] Shadow 스케일: 2xs/xs/sm/base/md/lg/xl/2xl = **8단**(§6‑4와 일치).
- [x] 폰트 weight: 5종(400/500/600/700/800). §5‑4와 일치.
- [x] 브레이크포인트: sm/md/lg/xl/2xl = **5개**(2xl 미사용으로 명시). §9와 일치.
- [x] Z-index 역할: 7개(base/sticky-top/sidebar/toc/header=go-to-top=overlay/virtual-scroll). §7‑5와 일치.
- [x] Pattern archetype 수: primary 11 + supporting 5 = **16개**. §10 헤더 선언과 §15‑2 leader 할당 수 일치.
- [x] Page pattern 수: 8개(Home/Article List/Article Detail/Log/Editor/Admin/Login/Not Found). §11, §17‑4와 일치.

---

*End of DESIGN.md — v1.0 · 2026-04-22 · BBlog · 프레임워크 중립 기준.*