// app.js — 데이터 로드 → 경로 탐색 → 점수 계산 → 화면 갱신
// 슬라이더가 바뀌면 경로 탐색은 건너뛰고 점수 계산부터 다시 한다 (0초 지연 목표)

import { buildGraph } from './engine/graph.js';
import { findCandidateRoutes } from './engine/pathfinder.js';
import { scoreRoutes, computeScales } from './engine/scoring.js';
import { initControls, DEFAULT_WEIGHTS } from './ui/controls.js';
import { renderRouteCards, ROUTE_COLORS } from './ui/routeCards.js';
import { renderWaveChart } from './ui/waveChart.js';
import { renderRadarChart } from './ui/radarChart.js';
import { renderSchematicMap } from './ui/schematicMap.js';
import { renderFitChart } from './ui/fitChart.js';

const TIME_SLOTS = [
  { key: 'am_peak', label: '출근', hour: '08시' },
  { key: 'midday',  label: '낮',   hour: '14시' },
  { key: 'pm_peak', label: '퇴근', hour: '18시' },
  { key: 'night',   label: '야간', hour: '21시' },
];

// 발표용 시나리오 (planning/scenarios.md). mustInclude: 스펙에 명시된 환승역 조합은 상위 k개 밖이어도 보여 준다
const SCENARIOS = {
  a: { origin: '동래', destination: '센텀시티', via: [['서면'], ['연산', '수영']] },
  b: { origin: '모라', destination: '동래',     via: [['서면'], ['덕천', '연산']] },
};

async function loadData() {
  const names = ['network', 'congestion', 'ridership', 'transfers', 'service'];
  const files = await Promise.all(names.map((name) => fetch(`data/${name}.json`).then((res) => res.json())));
  const data = Object.fromEntries(names.map((name, i) => [name, files[i]]));
  // 고정 범위는 scripts/calibrate_scales.mjs 가 만든 파일을 쓰고, 없으면 그 자리에서 계산한다
  data.fit = await fetch('data/model_fit.json').then((r) => r.json());
  data.scales = await fetch('data/scales.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) ?? computeScales(data);
  return data;
}

const stationNames = (network) => [...new Set(network.stations.map((s) => s.name))];

function fillSelect(select, names, selected) {
  select.replaceChildren(...names.map((name) => {
    const option = new Option(name, name);
    option.selected = name === selected;
    return option;
  }));
}

function renderTimeSlots(box, current, onSelect) {
  box.replaceChildren(...TIME_SLOTS.map((slot) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `${slot.label}<small>${slot.hour}</small>`;
    btn.setAttribute('aria-pressed', String(slot.key === current));
    btn.addEventListener('click', () => { onSelect(slot.key); renderTimeSlots(box, slot.key, onSelect); });
    return btn;
  }));
}

// 실제 데이터에서 센 숫자만 보여준다
function renderDataStats(data) {
  const lines = new Set(data.network.stations.map((s) => s.line));
  const stats = [
    { num: stationNames(data.network).length, label: '개 역' },
    { num: lines.size, label: '개 호선' },
    { num: data.transfers.records.length, label: '개 환승 구간' },
    { num: data.ridership.meta.weekdays_used, label: '일 평일 승하차 집계' },
  ];
  const statsEl = document.getElementById('data-stats');
  if (!statsEl) return; // 해당 장표를 뺀 경우
  statsEl.innerHTML = stats
    .map((s) => `<div class="stat"><span class="stat-num">${s.num}</span><span class="stat-label">${s.label}</span></div>`)
    .join('');
}

// 후보 경로에 식별 색을 붙인다 (시간 순서 기준, 순위가 바뀌어도 그대로)
function colorize(routes) {
  routes.forEach((r, i) => { r.color = ROUTE_COLORS[i % ROUTE_COLORS.length]; });
  return routes;
}

// 시나리오 결과 문장: 슬라이드 2번에서 소개한 두 경로(서면 경유 vs 스펙의 대안)를 비교하고, 가장 쾌적한 경로를 덧붙인다
function scenarioSentence(scored, via, slotLabel) {
  const find = (stations) => scored.find((r) => r.transfers.map((t) => t.station).join(',') === stations.join(','));
  const a = find(via[0]);
  const b = find(via[1]);
  if (!a || !b) return '비교할 후보 경로가 부족합니다.';
  const dMin = Math.round(Math.abs(a.totalSec - b.totalSec) / 60);
  const dScore = Math.round(Math.abs(a.comfort - b.comfort));
  const time = a.totalSec > b.totalSec ? `${dMin}분 더 걸리고` : a.totalSec < b.totalSec ? `${dMin}분 빠르고` : '비슷한 시간이 걸리고';
  const score = a.comfort < b.comfort ? `${dScore}점 낮습니다` : `${dScore}점 높습니다`;
  let text = `${slotLabel} 기준 <strong>${a.label}</strong> 경로(환승 ${a.transferCount}회)는 <strong>${b.label}</strong> 경로(환승 ${b.transferCount}회)보다 ${time} 쾌적도는 ${score}.`;
  if (scored[0] !== a && scored[0] !== b) text += ` 가장 쾌적한 경로는 <strong>${scored[0].label}</strong>입니다.`;
  return text;
}

function runScenario(graph, data, key) {
  const sc = SCENARIOS[key];
  const slot = 'am_peak';
  const routes = colorize(findCandidateRoutes(graph, sc.origin, sc.destination, { mustInclude: sc.via }));
  const scored = scoreRoutes(routes, data, slot, DEFAULT_WEIGHTS, data.scales);
  renderRouteCards(scored, document.getElementById(`scenario-${key}-cards`));
  renderWaveChart(scored, document.getElementById(`scenario-${key}-wave`));
  const lead = document.getElementById(`scenario-${key}-lead`);
  if (lead) {
    lead.innerHTML = scenarioSentence(scored, sc.via, '출근 08시');
    lead.closest('.slide')?.querySelector('.result-pending')?.classList.remove('result-pending');
  }
  return scored;
}

async function main() {
  const data = await loadData();
  const graph = buildGraph(data.network);
  renderDataStats(data);
  renderFitChart(data.fit);

  // 시나리오 슬라이드(7·8)
  runScenario(graph, data, 'a');
  runScenario(graph, data, 'b');

  // 라이브 데모(9) + 한눈에 비교(10)
  const query = { origin: '동래', destination: '센텀시티', timeSlot: 'am_peak' };
  let weights = null;
  let routes = [];

  const update = () => {
    if (!weights) return;
    const scored = scoreRoutes(routes, data, query.timeSlot, weights, data.scales);
    renderRouteCards(scored);
    renderWaveChart(scored);
    renderRadarChart(scored);
    renderSchematicMap(data.network, scored);
  };

  const search = () => {
    const via = Object.values(SCENARIOS).find((s) => s.origin === query.origin && s.destination === query.destination)?.via ?? [];
    routes = colorize(findCandidateRoutes(graph, query.origin, query.destination, { mustInclude: via }));
    update();
  };

  const names = stationNames(data.network);
  const originSelect = document.getElementById('origin');
  const destinationSelect = document.getElementById('destination');
  fillSelect(originSelect, names, query.origin);
  fillSelect(destinationSelect, names, query.destination);
  originSelect.addEventListener('change', () => { query.origin = originSelect.value; search(); });
  destinationSelect.addEventListener('change', () => { query.destination = destinationSelect.value; search(); });
  renderTimeSlots(document.getElementById('time-slots'), query.timeSlot, (key) => { query.timeSlot = key; update(); });

  initControls((next) => { weights = next; update(); });
  search();
}

main().catch((err) => { window.__appError = err; console.error('앱 초기화 실패:', err); });
