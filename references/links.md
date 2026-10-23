# 🔗 참고 링크

## 공공데이터 (data.go.kr · 부산교통공사)
> 상세 판정과 처리 방식은 [`data_research.md`](data_research.md) 참고
| 데이터셋 | 링크 | 메모 |
| :--- | :--- | :--- |
| 시간대별 승하차인원 | [3057229](https://www.data.go.kr/data/3057229/fileData.do) | 역·일·시간대별, 2026년 1~8월. 연산은 1·3호선 분리, 수영은 2호선에 2·3호선 합산 |
| 역간 거리 및 소요시간 정보 | [3033564](https://www.data.go.kr/data/3033564/fileData.do) | 그래프 엣지용. 역간거리(km)·소요시간(분) |
| 1호선 열차혼잡도 정보 (2021) | [15139787](https://www.data.go.kr/data/15139787/fileData.do) | **1호선만 있음**. 차량(1~8호차)별 혼잡률(%). 2~4호선은 추정 필요 |
| 도시철도 역사정보 | [15043686](https://www.data.go.kr/data/15043686/fileData.do) | 환승역 구분, 위도·경도 → 미니맵 좌표 참고 |
| 역사 편의시설현황 | [15052664](https://www.data.go.kr/data/15052664/fileData.do) | 에스컬레이터 등 → facility_score |
| 엘리베이터 정보 | [15119875](https://www.data.go.kr/data/15119875/fileData.do) | facility_score 보조 |
| 교통약자 대체 이동경로 | [15151579](https://www.data.go.kr/data/15151579/fileData.do) | 환승역 여부·경로 복잡도 등급 → facility_score |
| 역명정보 (2025-10) | [3077187](https://www.data.go.kr/data/3077187/fileData.do) | 역명 최신화 |
| 레일포털 Open API | [KRIC](https://data.kric.go.kr/rips/M_01_02/intro.do) | 역사별 환승정보·환승 이동경로 (서비스키 필요, 필드 미확인) |
| 환승거리 / 환승소요시간 | 없음 (검색 기준) | 직접 데이터 없음 → 추정값 사용, 출처 명시 |

## 디자인 / 시각화 참고
- [Behance - Spoa](https://www.behance.net/gallery/234783133/Spoa) — `design.md` 원본 레퍼런스
