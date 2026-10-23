# 🎨 Spoa 기반 HTML 슬라이드덱 디자인 시스템 (design.md)

> **레퍼런스 원본:** [Behance - Spoa](https://www.behance.net/gallery/234783133/Spoa)  
> **타이포그래피 기준:** `Pretendard` (단일 서체 체계)  
> **목적:** 추후 `week_07_01` HTML/CSS 슬라이드덱에 직접 이식할 디자인 스펙 및 컴포넌트 가이드

---

## 1. 디자인 철학 및 콘셉트 (Design Philosophy)

Behance의 **Spoa** 프로젝트는 감각적인 산업 디자인과 스위스 국제주의 타이포그래피, 그리고 부드러운 유기적 발광(Radial Aura Gradient)이 결합된 에디토리얼 테크 스타일을 띱니다.

1. **여백과 시각적 호흡 (Generous White Space)**:
   - 복잡한 선이나 그림자를 배제하고, 과감한 패딩과 정돈된 그리드로 차분하고 신뢰감 있는 톤을 형성합니다.
2. **한글 단독 위계 확장 (Korean-First Extended Hierarchy)**:
   - 원작의 [굵은 영문 헤드 + 연한 국문 서브] 2중 구조를 **[굵고 힘 있는 한글 리드문(Primary) + 차분하고 상세한 한글 설명문(Secondary)]**의 단일 한글 2단계 위계 구조로 전환하여 가독성과 내용 전달력을 극대화합니다.
3. **오가닉 방사형 그라디언트 (Radial Aura Glow)**:
   - 딱딱한 상자 형태의 카드가 아니라, 부드러운 곡률(20px~28px border-radius)과 보랏빛-푸른빛의 방사형 빛 번짐(Aura)을 시각 모티프로 삼습니다.
4. **리듬감 있는 다크 전환 (Inverted Dark Breaker)**:
   - 순백색(#FFFFFF) 기반 슬라이드 흐름 속에서 주제 전환 시 딥 블랙(#000000) 슬라이드를 배치하여 긴장감과 집중도를 환기합니다.

---

## 2. 타이포그래피 시스템 (Typography with Pretendard)

**Pretendard**(로컬 가변 폰트)를 단독 서체로 사용하며, 굵기(Weight)와 크기(Scale)의 대비만으로 정교한 계층 구조를 형성합니다.

```html
<!-- Pretendard: @font-face로 assets/fonts/PretendardVariable.woff2 로드 -->
```

### 🔤 타이포그래피 계층 표

| 구분 (Token) | Font Size | Weight | Line Height | Letter Spacing | 컬러 / 스타일 | 설명 및 용도 |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Category Tag** | 13px (0.81rem) | 500 (Medium) | 1.2 | +0.5px | `#767676` (Muted) | 슬라이드 상단 카테고리 (예: `Concept`, `Problem`, `Ch.02`) |
| **Slide Main Title** | 36px ~ 42px | 700 (Bold) | 1.25 | -0.5px | `#111111` (Deep Black) | 슬라이드 대제목 (2줄 이내로 간결하게 구성) |
| **Big Stat Number** | 96px ~ 120px | 700 (Bold) | 1.0 | -2.0px | `#111111` | 핵심 통계 수치 (예: `80%`, `p < 0.05`, `95% CI`) |
| **Lead Statement**<br>*(구 영문 자리)* | 18px ~ 20px | **500 (Medium)** | 1.6 | -0.2px | `#1a1a1a` (High Contrast) | **핵심 주장/결론 리드문 (Pretendard Medium)** |
| **Body Detail**<br>*(구 국문 자리)* | 14px ~ 15px | 400 (Regular) | 1.75 | 0px | `#767676` (Subtle Grey) | **원리와 세부 해설 (Pretendard)** |
| **Numbering Index** | 13px | 500 (Medium) | 1.0 | 0px | `#8E8E93` | 탭 및 리스트 인덱스 (`01`, `02`, `03`) |
| **Card / List Title** | 16px ~ 18px | 700 (Bold) | 1.4 | -0.2px | `#111111` | 카드 타이틀 (`01 베르누이 시행`, `02 이항분포`) |
| **Caption / Citations**| 12px | 400 (Regular) | 1.4 | 0px | `#999999` | 하단 각주 및 레퍼런스 출처 |

---

## 3. 컬러 시스템 (Spoa Color Matrix)

비핸스 Spoa 프로젝트의 공식 추출 색상 값입니다.

```css
:root {
  /* Spoa Brand Soft Palette */
  --spoa-soft-pink: #FFE3F2;     /* RGB(225, 247, 242) - 배경 틴트 및 소프트 하이라이트 */
  --spoa-pink:      #FF9CD2;     /* RGB(255, 156, 210) - 보조 악센트 / 경고 / 주의 */
  --spoa-purple:    #95A2FE;     /* RGB(149, 162, 254) - 중간 블렌딩 및 확률 영역 */
  --spoa-blue:      #408CFE;     /* RGB(64, 140, 254)  - 메인 브랜드 / 신뢰성 / 통계치 */

  /* Neutral & Surfaces */
  --bg-canvas:      #FAFAFC;     /* 앱 전체 배경 (극도로 맑은 연회색) */
  --bg-card:        #FFFFFF;     /* 슬라이드 덱 캔버스 */
  --bg-card-tint:   #F3F6FD;     /* 카드 컴포넌트용 소프트 블루 틴트 */
  --bg-dark:        #000000;     /* 전환용 딥 블랙 */

  /* Text Grayscale */
  --text-title:     #111111;     /* 제목 및 대형 숫자 */
  --text-lead:      #1E2024;     /* 리드 한글 본문 (굵고 또렷함) */
  --text-body:      #6B7280;     /* 세부 한글 설명문 (차분하고 정돈됨) */
  --text-muted:     #9CA3AF;     /* 보조 텍스트 및 넘버링 */

  /* Lines & Borders */
  --border-light:   #EBECEF;
  --border-subtle:  rgba(64, 140, 254, 0.15);

  /* Radius */
  --radius-sm:      8px;
  --radius-md:      16px;
  --radius-card:    24px;
  --radius-pill:    9999px;

  /* Spoa Glow Gradient Tokens */
  --spoa-aura-gradient: radial-gradient(
    circle at center,
    rgba(64, 140, 254, 0.75) 0%,
    rgba(149, 162, 254, 0.45) 45%,
    rgba(255, 156, 210, 0.25) 70%,
    rgba(255, 227, 242, 0) 100%
  );
}
```

---

## 4. 슬라이드 레이아웃 템플릿 아키텍처

Spoa 프로젝트의 핵심 화면 구성 5가지를 슬라이드 템플릿으로 구조화했습니다.

### 📐 Template A: 상단 분할 + 하단 3열 카드 (Top Split + 3-Cards)
가장 대표적인 Spoa 레이아웃입니다. (확률 분포 종류, 핵심 개념 3가지 비교 시 활용)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [Concept]                                                              │
│ 확률변수와 3가지 핵심 이산분포         여기에 한글 리드문을 굵게 작성합니다.     │
│ (Main Title - 38px Bold)              (Lead 한글 2~3줄: 18px Bold #1E2024)     │
│                                       그 아래 상세 설명을 넉넉하게 채웁니다.   │
│                                       (Detail 한글 2~3줄: 14px Regular #6B7280)│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐    │
│ │                   │  │                   │  │                   │    │
│ │   [그래프/수식]   │  │   [그래프/수식]   │  │   [그래프/수식]   │    │
│ │   (Soft Blue Tint)│  │   (Soft Blue Tint)│  │   (Soft Blue Tint)│    │
│ │                   │  │                   │  │                   │    │
│ └───────────────────┘  └───────────────────┘  └───────────────────┘    │
│  01                     02                     03                      │
│  베르누이 분포          이항 분포              포아송 분포             │
│                                                                        │
│ PNU Data Literacy                                  [Ref-1] citations.md │
└────────────────────────────────────────────────────────────────────────┘
```

### 📐 Template B: 빅 넘버 + 방사형 오라 그래픽 (Big Stat & Radial Aura)
가설검정 p값, 신뢰구간 95%, 오류율 등 핵심 통계 수치를 강조할 때 활용합니다.

- **좌측 영역 (45%)**:
  - 상단: `[Problem / Finding]` 태그 + 대제목
  - 중간: `80%` or `0.05` 거대 숫자 타이포그래피 (110px Bold)
  - 하단: **한글 리드문** (18px Bold) + **한글 상세 해설문** (14px Regular)
- **우측 영역 (55%)**:
  - 중심에 방사형 블러 그라디언트 구체 (`--spoa-aura-gradient`)
  - 점선 원형 가이드라인과 정밀한 수평 포인터 라인 + 라벨 (`귀무가설 기각역`, `유의수준 \alpha = 0.05`)

### 📐 Template C: 블랙 전환 인버티드 슬라이드 (Dark Mode Chapter Breaker)
새로운 챕터가 시작되거나 패러다임 전환을 알릴 때 사용합니다.

- 배경: `#000000` (순수 블랙)
- 텍스트: 완전 중앙 정렬 (Center Aligned)
- 태그: `Chapter 03 · Solution` (연보라 `#95A2FE` 또는 화이트)
- 대제목: `불확실성을 통제하는 추론의 시작, 베이즈 정리` (42px Bold 화이트)
- 본문:
  - 리드문: 20px Bold 화이트 (2줄)
  - 보조문: 15px Regular 연회색 `#9CA3AF` (3줄)

### 📐 Template D: 비대칭 2단 인터랙티브 차트 (Asymmetric Split View)
왼쪽에는 수식과 개념 설명, 오른쪽에는 Chart.js 인터랙티브 차트를 배치합니다.

- 좌측 (50%):
  - 카테고리 + 대제목
  - KaTeX 수식 박스 (소프트 핑크/블루 테두리 + 흰색 카드)
  - 한글 리드문 및 변수 정의 테이블
- 우측 (50%):
  - 부드러운 라운드 코너(24px)와 은은한 틴트 배경 안에 렌더링된 실시간 동적 차트

---

## 5. 확률과 통계 컴포넌트 스타일 규격

### 1) KaTeX 수식 박스 (Spoa Equation Card)
수식을 투박하지 않고 애플/스포아 느낌의 미니멀 오브젝트로 표현합니다.

```css
.spoa-formula-card {
  background: #FFFFFF;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 24px 32px;
  box-shadow: 0 4px 20px rgba(64, 140, 254, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 16px 0 24px 0;
}

.spoa-formula-card .katex-display {
  margin: 0;
  font-size: 1.45rem;
  color: var(--text-title);
}

.spoa-formula-caption {
  font-size: 13px;
  color: var(--spoa-blue);
  font-weight: 500;
  margin-top: 10px;
}
```

### 2) 한글 위계 텍스트 블록 (Korean-First Typography Block)
영어 영역까지 한글이 자연스럽게 확장되어 자리 잡는 클래스 규격입니다.

```html
<div class="spoa-text-block">
  <!-- 상단: 굵고 힘있는 리드 문장 (구 영문 헤드 자리) -->
  <p class="spoa-lead-text">
    모든 데이터는 불확실성을 포함하고 있습니다. 표본의 크기가 충분히 커질 때 표본평균의 분포는 모집단의 형태와 관계없이 정규분포에 수렴합니다.
  </p>
  <!-- 하단: 차분하고 섬세한 상세 해설 (구 국문 설명 자리) -->
  <p class="spoa-detail-text">
    중심극한정리(CLT)는 현대 추론 통계학의 근간입니다. 이를 통해 우리는 모집단의 분포를 직접 알지 못하더라도, 표본통계량을 활용하여 신뢰구간을 산출하고 통계적 의사결정을 내릴 수 있습니다.
  </p>
</div>
```

```css
.spoa-lead-text {
  font-family: 'Pretendard', sans-serif;
  font-size: 1.125rem; /* 18px */
  font-weight: 500;
  color: var(--text-lead);
  line-height: 1.6;
  letter-spacing: -0.02em;
  margin-bottom: 12px;
}

.spoa-detail-text {
  font-family: 'Pretendard', sans-serif;
  font-size: 0.9375rem; /* 15px */
  font-weight: 400;
  color: var(--text-body);
  line-height: 1.75;
  letter-spacing: -0.01em;
}
```

### 3) 넘버링 리스트 테이블 (Spoa Index Table)
슬라이드 내 용어 정리나 목차 나열 시 사용하는 미니멀 언더라인 목록입니다.

```css
.spoa-index-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
  padding: 14px 0;
}

.spoa-index-num {
  font-family: 'Pretendard', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  width: 40px;
}

.spoa-index-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-title);
  flex: 1;
}

.spoa-index-value {
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--spoa-blue);
}
```

---

## 6. HTML 구현 가이드라인 요약

1. **폰트 로딩**: `<head>`에 `Pretendard` (Weights: 400, 500, 700)을 반드시 링크합니다.
2. **이중 언어 구조의 전환**:
   - 기존 비핸스의 `[영문 + 한글]` 쌍을 **`[볼드 리드문 + 레귤러 보조문]`** 한글 2단계 블록으로 구현합니다.
   - 우측 상단 설명란의 너비(width)를 넉넉하게 450px~550px로 확보하여 한글 문장이 여유롭게 흐르도록 합니다.
3. **그래픽 요소**:
   - 원형 포자/에너지 느낌의 은은한 블루/퍼플 방사형 그라디언트를 CSS 원형 태그(`spoa-aura-circle`)로 구현하여 통계 수치나 차트 뒤에 블러(`filter: blur(40px)`) 처리하여 배치합니다.
4. **반응형 컨테이너**:
   - 16:9 비율(예: 1280×720 또는 1920×1080)을 유지하며 슬라이드 간 전환은 부드러운 opacity 및 미세한 translateY(약 8px) 트랜지션을 적용합니다.
