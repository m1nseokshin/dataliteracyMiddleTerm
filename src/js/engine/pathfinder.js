// pathfinder.js — 후보 경로 탐색
// 1) Yen의 k-최단 경로로 소요시간 순 후보를 넓게 뽑고
// 2) 환승역 조합이 같은 경로는 하나로 합친 뒤
// 3) 너무 돌아가는 경로(최단의 maxDetour 배 초과)와 환승 3회 초과 경로를 걸러 상위 k개를 돌려준다
// 출발/도착은 역 이름이다. 환승역은 호선별 노드가 둘이므로 가상 시작/끝 노드로 묶어 처리한다.

const SRC = '^src';
const DST = '$dst';

function makeNeighbors(graph, originIds, destIds) {
  const dest = new Set(destIds);
  return (u) => {
    if (u === SRC) return originIds.map((id) => ({ to: id, timeSec: 0 }));
    const out = graph.adj.get(u).map((e) => ({ to: e.to, timeSec: e.timeSec }));
    if (dest.has(u)) out.push({ to: DST, timeSec: 0 });
    return out;
  };
}

// 노드가 100개 남짓이라 우선순위 큐 대신 선형 탐색으로 충분하다
function dijkstra(neighbors, source, target, bannedNodes, bannedEdges) {
  const dist = new Map([[source, 0]]);
  const prev = new Map();
  const done = new Set();
  const open = new Set([source]);
  while (open.size) {
    let u = null;
    let best = Infinity;
    for (const n of open) if (dist.get(n) < best) { best = dist.get(n); u = n; }
    open.delete(u);
    if (u === target) break;
    done.add(u);
    for (const { to, timeSec } of neighbors(u)) {
      if (done.has(to) || bannedNodes.has(to) || bannedEdges.has(`${u}|${to}`)) continue;
      const nd = best + timeSec;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, u);
        open.add(to);
      }
    }
  }
  if (!dist.has(target)) return null;
  const path = [target];
  while (path[0] !== source) path.unshift(prev.get(path[0]));
  return { path, cost: dist.get(target) };
}

function pathCost(neighbors, path) {
  let cost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    cost += neighbors(path[i]).find((n) => n.to === path[i + 1]).timeSec;
  }
  return cost;
}

function yen(neighbors, source, target, K) {
  const first = dijkstra(neighbors, source, target, new Set(), new Set());
  if (!first) return [];
  const accepted = [first];
  const candidates = [];
  const seen = new Set([first.path.join('>')]);

  while (accepted.length < K) {
    const last = accepted[accepted.length - 1].path;
    for (let i = 0; i < last.length - 1; i++) {
      const spur = last[i];
      const root = last.slice(0, i + 1);
      const bannedEdges = new Set();
      for (const a of accepted) {
        if (a.path.length > i + 1 && root.every((n, j) => a.path[j] === n)) {
          bannedEdges.add(`${a.path[i]}|${a.path[i + 1]}`);
        }
      }
      const bannedNodes = new Set(root.slice(0, -1));
      const spurPath = dijkstra(neighbors, spur, target, bannedNodes, bannedEdges);
      if (!spurPath) continue;
      const path = [...root.slice(0, -1), ...spurPath.path];
      const key = path.join('>');
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ path, cost: pathCost(neighbors, path) });
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => a.cost - b.cost);
    accepted.push(candidates.shift());
  }
  return accepted;
}

// 노드 경로 -> 호선별 구간(leg) + 환승 + 승차 엣지 목록
export function buildRoute(graph, nodePath) {
  const rideEdges = [];
  const transfers = [];
  const legs = [];
  let leg = null;
  let totalSec = 0;

  for (let i = 0; i < nodePath.length - 1; i++) {
    const a = nodePath[i];
    const b = nodePath[i + 1];
    const e = graph.edge(a, b);
    totalSec += e.timeSec;
    if (e.type === 'ride') {
      if (!leg) {
        leg = { line: e.line, stations: [graph.nodes.get(a)], timeSec: 0 };
        legs.push(leg);
      }
      leg.stations.push(graph.nodes.get(b));
      leg.timeSec += e.timeSec;
      rideEdges.push({ from: a, to: b, line: e.line, timeSec: e.timeSec, km: e.km, legIndex: legs.length - 1 });
    } else {
      transfers.push({
        station: graph.nodes.get(a).name,
        fromId: a, toId: b,
        fromLine: graph.nodes.get(a).line, toLine: graph.nodes.get(b).line,
        timeSec: e.timeSec,
        afterLeg: legs.length - 1,
      });
      leg = null;
    }
  }

  const first = nodePath[0];
  const last = nodePath[nodePath.length - 1];
  const transferNames = transfers.map((t) => t.station);
  return {
    id: `${first}>${last}:${transferNames.join('+') || 'direct'}`,
    nodePath,
    origin: graph.nodes.get(first).name,
    destination: graph.nodes.get(last).name,
    legs,
    transfers,
    rideEdges,
    totalSec,
    transferCount: transfers.length,
    signature: `${legs.map((l) => l.line).join('>')}@${transferNames.join(',')}`,
    label: transferNames.length ? `${transferNames.join('·')} 환승` : '직통',
  };
}

export function findCandidateRoutes(graph, origin, destination, options = {}) {
  const { k = 3, pool = 40, maxTransfers = 3, maxDetour = 1.8, mustInclude = [] } = options;
  const originIds = graph.byName.get(origin);
  const destIds = graph.byName.get(destination);
  if (!originIds || !destIds || origin === destination) return [];

  const neighbors = makeNeighbors(graph, originIds, destIds);
  const raw = yen(neighbors, SRC, DST, pool);

  const bySignature = new Map();
  for (const { path } of raw) {
    const nodePath = path.slice(1, -1);
    const route = buildRoute(graph, nodePath);
    if (route.transferCount > maxTransfers) continue;
    // 출발역·도착역에서 승강장만 갈아타는 경로는 환승이 아니라 시작/끝 승강장 선택의 부산물이다
    if (route.transfers.some((t) => t.afterLeg === -1)) continue;
    if (graph.edge(nodePath.at(-2), nodePath.at(-1))?.type === 'transfer') continue;
    if (!bySignature.has(route.signature)) bySignature.set(route.signature, route);
  }
  const all = [...bySignature.values()].sort((a, b) => a.totalSec - b.totalSec);
  if (!all.length) return [];

  const limit = all[0].totalSec * maxDetour;
  const picked = all.filter((r) => r.totalSec <= limit).slice(0, k);

  // 발표용 시나리오처럼 반드시 보여 주고 싶은 환승역 조합은 상위 k개 밖이어도 포함한다
  for (const via of mustInclude) {
    const key = via.join(',');
    if (picked.some((r) => r.transfers.map((t) => t.station).join(',') === key)) continue;
    const found = all.find((r) => r.transfers.map((t) => t.station).join(',') === key);
    if (found) picked.push(found);
  }
  return picked.sort((a, b) => a.totalSec - b.totalSec);
}
