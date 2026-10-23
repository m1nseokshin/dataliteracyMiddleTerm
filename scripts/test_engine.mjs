// 엔진 점검용: node scripts/test_engine.mjs [gamma]
import { readFileSync } from 'node:fs';
import { buildGraph } from '../src/js/engine/graph.js';
import { findCandidateRoutes } from '../src/js/engine/pathfinder.js';
import { scoreRoutes, computeScales, rawMetrics, SLOTS } from '../src/js/engine/scoring.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url)));
const data = Object.fromEntries(['network', 'congestion', 'ridership', 'transfers', 'service'].map((n) => [n, read(n)]));
const graph = buildGraph(data.network);
const gamma = process.argv[2] ? Number(process.argv[2]) : undefined;

console.time('scales');
const scales = computeScales(data, gamma);
console.timeEnd('scales');
console.log('scales', scales);

const W = { time: 60, congestion: 60, transfer: 50, seat: 40 };
const cases = [['동래', '센텀시티', [['서면'], ['연산', '수영']]], ['모라', '동래', [['서면'], ['덕천', '연산']]]];
for (const slot of SLOTS) {
  for (const [o, d, via] of cases) {
    const routes = findCandidateRoutes(graph, o, d, { mustInclude: via });
    const out = scoreRoutes(routes, data, slot, W, scales);
    console.log(`\n[${slot}] ${o} → ${d}`);
    for (const r of out) {
      console.log(` #${r.rank} ${r.label.padEnd(10)} 쾌적도 ${r.comfort.toFixed(1)} | 시간 ${r.raw.timeMin.toFixed(1)}분(${r.norm.time.toFixed(0)}) 혼잡 ${r.raw.congestion.toFixed(2)}(${r.norm.congestion.toFixed(0)}) 환승 ${r.raw.transfer.toFixed(2)}(${r.norm.transfer.toFixed(0)}) 착석 ${r.raw.seatProb.toFixed(2)}`);
    }
  }
}
