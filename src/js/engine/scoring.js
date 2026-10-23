// scoring.js — project_spec.md 4장 수식 구현 (결정 사항은 planning/scoring_model.md)
//
// 지표 4개를 "부산 지하철 전체 기준 고정 범위"로 0~100에 맞춘 뒤 사용자 가중치로 합친다.
// 고정 범위(scales)는 네트워크의 대표 출발-도착 쌍에서 구한 95백분위로,
// 후보 경로가 바뀌어도 점수의 의미가 같다. scripts/calibrate_scales.mjs 가 만들어 src/data/scales.json 에 둔다.

import { buildGraph } from './graph.js';
import { findCandidateRoutes } from './pathfinder.js';

export const PARAMS = {
  alpha: 1.5,          // 4.1 혼잡 비선형 지수 (명세서 지정)
  beta1: 0.7,          // 4.2 환승 이동 부담(시간) 가중
  beta2: 0.3,          // 4.2 환승 동선(편의시설·경로복잡도) 가중
  gamma: 0.35,         // 4.3 착석 순유출 계수 (scoring_model.md 참고)
  transferRefSec: 300, // 환승시간을 0~1로 만드는 기준 (5분)
  crowdFloor: 0.5,     // M(k,t) = crowdFloor + 역 밀집계수(0~1) → 0.5~1.5
  maxComplexity: 10,   // 경로복잡도 점수의 기준 상한
  facilityWeight: 0.35, // F_k 에서 편의시설 부족분 비중 (나머지는 경로복잡도)
};

export const SLOTS = ['am_peak', 'midday', 'pm_peak', 'night'];

// ---------------------------------------------------------------- 조회 색인
const indexCache = new WeakMap();

function indexData(data) {
  if (indexCache.has(data)) return indexCache.get(data);

  const rate = new Map();
  const sums = new Map();
  for (const r of data.congestion.records) {
    rate.set(`${r.from}|${r.to}|${r.slot}`, r.rate);
    const k = `${r.line}|${r.slot}`;
    const s = sums.get(k) ?? [0, 0];
    sums.set(k, [s[0] + r.rate, s[1] + 1]);
  }
  const lineAvg = new Map([...sums].map(([k, [sum, n]]) => [k, sum / n]));

  const ride = new Map();
  for (const r of data.ridership.records) ride.set(`${r.id}|${r.slot}`, r);

  const transfer = new Map();
  for (const t of data.transfers.records) {
    transfer.set(`${t.from_id}|${t.to_id}`, t);
    transfer.set(`${t.to_id}|${t.from_id}`, t);
  }

  const idx = { rate, lineAvg, ride, transfer };
  indexCache.set(data, idx);
  return idx;
}

const edgeRate = (idx, e, slot) =>
  idx.rate.get(`${e.from}|${e.to}|${slot}`) ?? idx.lineAvg.get(`${e.line}|${slot}`) ?? 0;

// ---------------------------------------------------------------- 환승 부담 k
// (β1·L_k + β2·F_k)·M(k,t)
//  L_k: 환승 소요시간 / 5분  (환승 거리 데이터가 없어 시간으로 대신함)
//  F_k: 편의시설이 부족할수록, 대체 이동경로가 복잡할수록 커짐 (0~1)
//  M  : 그 시간대 환승역 이용객 밀집 (0.5~1.5)
function transferBurden(idx, t, slot) {
  const rec = idx.transfer.get(`${t.fromId}|${t.toId}`);
  const L = t.timeSec / PARAMS.transferRefSec;
  const complexity = rec?.route_complexity != null ? Math.min(1, rec.route_complexity / PARAMS.maxComplexity) : 0.5;
  const lacking = rec ? 1 - rec.facility_score : 0.5;
  const F = PARAMS.facilityWeight * lacking + (1 - PARAMS.facilityWeight) * complexity;
  const M = PARAMS.crowdFloor + (rec?.crowd_factor?.[slot] ?? 0.5);
  return (PARAMS.beta1 * L + PARAMS.beta2 * F) * M;
}

// ---------------------------------------------------------------- 원 지표 (정규화 전)
export function rawMetrics(route, data, slot, gamma = PARAMS.gamma) {
  const idx = indexData(data);

  // 4.1 구간별 열차 밀집 스트레스: Σ Δd · (C/100)^α   (Δd: 분)
  let congestion = 0;
  for (const e of route.rideEdges) {
    congestion += (e.timeSec / 60) * Math.pow(edgeRate(idx, e, slot) / 100, PARAMS.alpha);
  }

  // 4.2 환승 난이도 및 보행 피로
  let transfer = 0;
  for (const t of route.transfers) transfer += transferBurden(idx, t, slot);

  // 4.3 착석 가능성: 1 − Π(1 − max(0, γ·ΔN·(1 − C/150)))   (도착지 제외, 지나는 역마다)
  let noSeat = 1;
  for (let i = 0; i < route.rideEdges.length; i++) {
    const e = route.rideEdges[i];
    const isLastStop = i === route.rideEdges.length - 1;
    if (isLastStop) break;
    const r = idx.ride.get(`${e.to}|${slot}`);
    if (!r) continue;
    const dN = (r.alight - r.board) / (r.alight + r.board + 1);
    const c = edgeRate(idx, e, slot);
    noSeat *= 1 - Math.max(0, gamma * dN * (1 - c / 150));
  }

  return { timeMin: route.totalSec / 60, congestion, transfer, seatProb: 1 - noSeat };
}

// ---------------------------------------------------------------- 고정 범위
export function computeScales(data, gamma = PARAMS.gamma) {
  const graph = buildGraph(data.network);
  const names = graph.stationNames().sort();
  const samples = { time: [], congestion: {}, transfer: {} };
  for (const s of SLOTS) { samples.congestion[s] = []; samples.transfer[s] = []; }
  const burdens = [];
  const idx = indexData(data);

  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i === j || (i + j) % 3 !== 0) continue; // 대표 쌍 약 1/3
      const [route] = findCandidateRoutes(graph, names[i], names[j], { k: 1, pool: 1 });
      if (!route) continue;
      samples.time.push(route.totalSec / 60);
      for (const s of SLOTS) {
        const m = rawMetrics(route, data, s, gamma);
        samples.congestion[s].push(m.congestion);
        samples.transfer[s].push(m.transfer);
      }
    }
  }
  for (const t of data.transfers.records) {
    for (const s of SLOTS) burdens.push(transferBurden(idx, { fromId: t.from_id, toId: t.to_id, timeSec: t.transfer_time_sec }, s));
  }

  const p95 = (arr) => {
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
  };
  const all = (obj) => SLOTS.flatMap((s) => obj[s]);

  return {
    method: '대표 출발-도착 쌍(최단 경로)의 95백분위, 전 시간대 통합',
    pairs: samples.time.length,
    timeMin: p95(samples.time),
    congestion: p95(all(samples.congestion)),
    transfer: p95(all(samples.transfer)),
    transferSpike: Math.max(...burdens),   // 파동 그래프에서 환승 스파이크 100점 기준 (환승역 x 시간대 최대)
  };
}

const clamp100 = (x) => Math.max(0, Math.min(100, x));

// ---------------------------------------------------------------- 종합
// 사용자 슬라이더(0~100)를 합이 1이 되도록 바꿔 가중치로 쓴다. 모두 0이면 균등.
export function normalizeWeights(w) {
  const sum = w.time + w.congestion + w.transfer + w.seat;
  if (sum <= 0) return { time: 0.25, congestion: 0.25, transfer: 0.25, seat: 0.25 };
  return { time: w.time / sum, congestion: w.congestion / sum, transfer: w.transfer / sum, seat: w.seat / sum };
}

function waveFor(route, idx, slot, scales) {
  const pts = [];
  let min = 0;
  const transferAfterLeg = new Map(route.transfers.map((t) => [t.afterLeg, t]));
  let prevLeg = -1;

  route.rideEdges.forEach((e, i) => {
    if (e.legIndex !== prevLeg && prevLeg !== -1) {
      const t = transferAfterLeg.get(prevLeg);
      const spike = clamp100((100 * transferBurden(idx, t, slot)) / scales.transferSpike);
      const dur = t.timeSec / 60;
      pts.push({ min, stress: 0, kind: 'transfer', station: t.station });
      pts.push({ min: min + dur / 2, stress: spike, kind: 'transfer', station: t.station, spike: true });
      pts.push({ min: min + dur, stress: 0, kind: 'transfer', station: t.station });
      min += dur;
    }
    prevLeg = e.legIndex;
    const stress = clamp100(100 * Math.pow(edgeRate(idx, e, slot) / 100, PARAMS.alpha));
    pts.push({ min, stress, kind: 'ride', line: e.line, stationId: e.from });
    min += e.timeSec / 60;
    pts.push({ min, stress, kind: 'ride', line: e.line, stationId: e.to });
  });
  return pts;
}

export function scoreRoutes(routes, data, slot, weights, scales) {
  if (!routes.length) return [];
  const idx = indexData(data);
  const sc = scales ?? data.scales ?? computeScales(data);
  const w = normalizeWeights(weights);

  const scored = routes.map((route) => {
    const m = rawMetrics(route, data, slot);
    const n = {
      time: clamp100((100 * m.timeMin) / sc.timeMin),
      congestion: clamp100((100 * m.congestion) / sc.congestion),
      transfer: clamp100((100 * m.transfer) / sc.transfer),
      seat: clamp100(100 * m.seatProb),
    };
    // S_total = w1·T + w2·S_c + w3·S_t − w4·P  →  쾌적도 = 100 − S_total.
    // 점수가 0~100에 머물도록 착석 항을 (100 − P)로 바꿨다. 상수(100·w4)만 다르고 순위는 같다.
    const sTotal = w.time * n.time + w.congestion * n.congestion + w.transfer * n.transfer + w.seat * (100 - n.seat);
    const comfort = clamp100(100 - sTotal);
    return {
      ...route,
      raw: m,
      norm: n,
      comfort,
      radar: {
        '시간 효율': 100 - n.time,
        '열차 쾌적도': 100 - n.congestion,
        '환승 편의성': 100 - n.transfer,
        '착석 확률': n.seat,
        '체력 보존도': comfort,
      },
      wave: waveFor(route, idx, slot, sc),
    };
  });

  scored.sort((a, b) => b.comfort - a.comfort);
  scored.forEach((r, i) => { r.rank = i + 1; });
  return scored;
}
