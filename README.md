# 🚇 부산 도시철도 체감 피로도 경로 탐색기 (Busan Comfort-First Metro Router)

**최단 시간**이 아니라 **덜 지치는 길**을 추천하는 경로 탐색기를 만들고, 이를 **16:9 PT 슬라이드덱(HTML)** 으로 발표합니다.
**최종 결과물 = 발표 자료.** 대시보드는 슬라이드 9번 '라이브 데모'로 들어갑니다. (week_07_01과 같은 1920×1080 슬라이드 방식)
부산교통공사 공공데이터(혼잡도·승하차·환승거리·역간 소요시간)로 경로별 **체감 피로도**를 계산하고,
사용자가 슬라이더로 정한 컨디션 가중치에 맞춰 후보 경로의 순위를 바로 다시 매깁니다.

- 원본 명세서: [`references/project_spec.md`](references/project_spec.md)
- 디자인 시스템: [`design.md`](design.md) (week_07_01의 Spoa 디자인 시스템을 그대로 가져옴)

---

## 📁 폴더 구조 안내

```text
middleTerm/
├── README.md                      # 프로젝트 개요 및 협업 규칙 (현재 파일)
├── design.md                      # 🎨 디자인 시스템 (Spoa · Pretendard · 컬러 토큰)
├── index.html                     # src/index.html로 넘겨주는 리다이렉트 페이지
├── 앱_열기.command                 # 더블클릭 → 로컬 서버 실행 + 슬라이드덱 열기 (F 전체화면, ← → 이동)
│
├── references/                    # 📚 레퍼런스 및 원본 자료
│   ├── project_spec.md            # 프로젝트 명세서 원본 (code_artifact.md)
│   ├── userInput/                 # 사용자가 전달할 원본 파일 (캡처, 노선도 등)
│   ├── links.md                   # 공공데이터포털 데이터셋 링크 및 메모
│   ├── citations.md               # 화면 각주 및 데이터 출처 표기
│   ├── data_research.md           # 공공데이터 리서치 결과 (실데이터 vs 추정 판정)
│   └── data/
│       └── raw/                   # 공공데이터포털에서 받은 원본 CSV 7종 (가공 전, 수정 금지)
│
├── planning/                      # 🤝 기획 및 AI-사용자 소통 공간
│   ├── outline.md                 # 🎤 발표 구성안: 11장 슬라이드 목록과 스토리
│   ├── slide_contents.md          # 🎤 슬라이드별 상세 문구 (리드문·상세문)
│   ├── scenarios.md               # 시나리오 A·B (동래→센텀시티, 모라→동래) 경로 정리
│   ├── scoring_model.md           # 피로도 수식 4종과 파라미터(α, β, γ, w) 결정 기록
│   ├── ui_layout.md               # 대시보드 화면 구성 및 컴포넌트 명세
│   ├── estimation_report.md       # 2~4호선 혼잡률 추정 과정·검증·한계 (스크립트가 자동 생성)
│   ├── sensitivity_report.md      # 민감도 분석: 추정값을 흔들어도 결론이 유지되는가 (자동 생성)
│   ├── feedback.md                # 수정 요청 사항 및 상호 질의응답
│   └── checklist.md               # 작업 진행 단계 및 TODO 현황판
│
├── src/                           # 💻 웹 애플리케이션 실제 구현 코드
│   ├── index.html                 # 슬라이드덱 (11장, 1920×1080 캔버스)
│   ├── css/
│   │   └── style.css              # 디자인 토큰(design.md) + 슬라이드 레이아웃
│   ├── data/                      # 앱이 읽는 가공 데이터 (JSON, scripts/가 생성 — 직접 수정 금지)
│   │   ├── network.json           # 역(노드) · 역간 구간 · 환승 엣지
│   │   ├── congestion.json        # 구간·시간대별 혼잡률 (1호선 실측 / 2~4호선 추정)
│   │   ├── ridership.json         # 역·시간대별 평일 평균 승차/하차 인원
│   │   ├── service.json           # 구간·시간대별 시간당 열차 수 (평일 시간표)
│   │   ├── transfers.json         # 환승역별 환승시간(추정)·편의시설 점수·밀집계수
│   │   ├── model_fit.json         # 혼잡률 추정 모델 계수와 검증 결과
│   │   └── scales.json            # 점수 0~100 정규화 고정 범위 (calibrate_scales.mjs가 생성)
│   ├── js/
│   │   ├── deck.js                # 슬라이드 이동·전체화면·화면 맞춤·수식(KaTeX)
│   │   ├── app.js                 # 진입점: 데이터 로드 → 엔진 → 화면 갱신 연결
│   │   ├── engine/                # 🧮 계산 로직 (화면과 분리)
│   │   │   ├── graph.js           # JSON → 그래프 구조 변환
│   │   │   ├── pathfinder.js      # k-최단 경로 / 환승역 경유 대안 경로 탐색
│   │   │   └── scoring.js         # S_congestion · S_transfer · P_seat · S_total
│   │   └── ui/                    # 🖥️ 화면 컴포넌트
│   │       ├── controls.js        # 가중치 슬라이더 4개 + 상황 프리셋 버튼
│   │       ├── routeCards.js      # 경로 카드 (순위 · 쾌적도 점수)
│   │       ├── waveChart.js       # 피로도 파동 그래프 (Spline Area)
│   │       ├── radarChart.js      # 5대 지표 레이더 차트
│   │       └── schematicMap.js    # 1~4호선 토폴로지 미니맵 (SVG + 파티클)
│   └── assets/
│       ├── icons/                 # 아이콘 (편의시설, 호선 배지 등)
│       └── images/                # 기타 이미지
│
└── scripts/                       # 🐍 데이터 준비 스크립트
    ├── preprocess_raw.py          # 원본 CSV → src/data/*.json + 추정 리포트 (python3 scripts/preprocess_raw.py)
    ├── calibrate_scales.mjs       # 고정 범위 계산 → src/data/scales.json (node)
    ├── sensitivity.mjs            # 추정값을 흔들어 결론이 유지되는지 확인 → planning/sensitivity_report.md
    └── test_engine.mjs            # 엔진 점검: 시나리오 A·B 경로와 점수 출력
```

### 한눈에 보는 데이터 흐름

```text
references/data/raw/*.csv ──(scripts/preprocess_raw.py)──▶ src/data/*.json ──▶ engine/ ──▶ ui/
                                                           (가공 데이터)        (계산)      (화면)
```

> **실제 공공데이터로 구축**합니다. 공개되지 않은 값(2~4호선 혼잡률, 환승시간)은 공개 데이터로 추정하고, 추정 과정과 한계는 `planning/estimation_report.md`에 남깁니다.

---

## 🔄 AI와 사용자의 협업 워크플로우

1. **1단계: 레퍼런스 투입 (사용자)**
   - 공공데이터 CSV는 `references/data/raw/`, 노선도 캡처 등은 `references/userInput/`에 넣습니다.
2. **2단계: 기획 합의 (AI ⟷ 사용자)**
   - AI가 `planning/` 문서(시나리오·수식·화면 구성) 초안을 작성하고, 사용자는 `planning/feedback.md`나 채팅으로 피드백합니다.
3. **3단계: 데이터 & 엔진 구현 (AI)**
   - Mock 데이터 생성 → 그래프 구성 → 경로 탐색 → 스코어링 순으로 구현합니다.
4. **4단계: 시각화 구현 (AI)**
   - 슬라이더 · 경로 카드 · 파동 그래프 · 레이더 차트 · 미니맵을 만들어 슬라이드 7~10번에 넣습니다.
5. **5단계: 발표 문구 확정 (AI ⟷ 사용자)**
   - 결과 숫자가 나오면 `slide_contents.md`의 `{결과}` 자리를 채우고 결론을 씁니다.
6. **6단계: 검토 및 리허설**
   - `앱_열기.command`로 열어 전체화면으로 발표 흐름과 시간을 점검합니다.

진행 상황은 [`planning/checklist.md`](planning/checklist.md)에서 확인합니다.
