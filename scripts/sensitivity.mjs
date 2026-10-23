// 추정값을 흔들어도 시나리오 순위가 유지되는지 확인한다: node scripts/sensitivity.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGraph } from '../src/js/engine/graph.js';
import { findCandidateRoutes } from '../src/js/engine/pathfinder.js';
import { scoreRoutes, computeScales, PARAMS, SLOTS } from '../src/js/engine/scoring.js';
import { PRESETS } from '../src/js/ui/controls.js';

const lines = [];
const log = (t) => { console.log(t); lines.push(t); };
const read = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url)));
const base = Object.fromEntries(['network', 'congestion', 'ridership', 'transfers', 'service'].map((n) => [n, read(n)]));
const graph = buildGraph(base.network);
const scales = computeScales(base);

const cases = [
  { name: 'A 동래→센텀시티', o: '동래', d: '센텀시티', via: [['서면'], ['연산', '수영']], target: '서면' },
  { name: 'B 모라→동래', o: '모라', d: '동래', via: [['서면'], ['덕천', '연산']], target: '서면' },
];
const weightSets = [{ label: '기본', w: { time: 60, congestion: 60, transfer: 50, seat: 40 } },
  ...PRESETS.map((p) => ({ label: p.label, w: p.weights }))];

const clone = (d) => ({ ...d, congestion: { ...d.congestion, records: d.congestion.records.map((r) => ({ ...r })) },
  transfers: { ...d.transfers, records: d.transfers.records.map((r) => ({ ...r })) } });

const scenarios = [
  ['기준', (d) => d],
  ['2~4호선 혼잡 추정 ×0.7', (d) => { d.congestion.records.forEach((r) => { if (r.source === 'estimated') r.rate *= 0.7; }); return d; }],
  ['2~4호선 혼잡 추정 ×1.3', (d) => { d.congestion.records.forEach((r) => { if (r.source === 'estimated') r.rate *= 1.3; }); return d; }],
  ['3호선만 ×2 (환승객 누락 보정)', (d) => { d.congestion.records.forEach((r) => { if (r.line === 3) r.rate *= 2; }); return d; }],
  ['3호선만 ×3', (d) => { d.congestion.records.forEach((r) => { if (r.line === 3) r.rate *= 3; }); return d; }],
  ['환승시간 가정값 ×0.5 (서면·수영·동래)', (d) => { d.transfers.records.forEach((r) => { if (r.transfer_time_basis === 'assumed') r.transfer_time_sec *= 0.5; }); return d; }],
  ['환승시간 가정값 ×1.5', (d) => { d.transfers.records.forEach((r) => { if (r.transfer_time_basis === 'assumed') r.transfer_time_sec *= 1.5; }); return d; }],
  ['환승 가중 β1/β2 = 0.3/0.7', (d) => { PARAMS.beta1 = 0.3; PARAMS.beta2 = 0.7; return d; }, () => { PARAMS.beta1 = 0.7; PARAMS.beta2 = 0.3; }],
  ['착석 계수 γ = 0.15', (d) => { PARAMS.gamma = 0.15; return d; }, () => { PARAMS.gamma = 0.35; }],
  ['착석 계수 γ = 0.7', (d) => { PARAMS.gamma = 0.7; return d; }, () => { PARAMS.gamma = 0.35; }],
];

for (const c of cases) {
  log(`\n### ${c.name} — "${c.target} 환승" 경로가 꼴찌(가장 피로)로 나온 횟수 / 시간대 4 × 가중치 5 = 20조합\n\n| 흔든 조건 | 꼴찌 | 1위 |\n| :-- | --: | --: |`);
  for (const [label, mutate, restore] of scenarios) {
    const d = mutate(clone(base));
    let last = 0, total = 0; const ranks = [];
    for (const slot of SLOTS) for (const ws of weightSets) {
      const routes = findCandidateRoutes(graph, c.o, c.d, { mustInclude: c.via });
      const out = scoreRoutes(routes, d, slot, ws.w, scales);
      const r = out.find((x) => x.transfers.map((t) => t.station).join(',') === c.target);
      total++; ranks.push(r.rank); if (r.rank === out.length) last++;
    }
    restore?.();
    const best = ranks.filter((x) => x === 1).length;
    log(`| ${label} | ${last}/${total} | ${best}/${total} |`);
  }
}

const header = `# 🎚️ 민감도 분석 (자동 생성)

> \`scripts/sensitivity.mjs\`가 만든 문서입니다. 추정값과 설계 계수를 흔들었을 때 시나리오 결론이 유지되는지 확인합니다.
> 비교 대상은 두 시나리오에서 "서면을 거치는 경로"입니다. 시간대 4개(출근·낮·퇴근·야간) × 가중치 5세트(기본 + 프리셋 4개) = 20조합에서 이 경로가 몇 번 가장 피로한 경로로 나오는지 셉니다.
`;
writeFileSync(new URL('../planning/sensitivity_report.md', import.meta.url), header + lines.join('\n') + '\n');
