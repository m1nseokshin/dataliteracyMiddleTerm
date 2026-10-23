// graph.js — network.json을 경로 탐색용 인접 리스트로 변환
// 노드는 역번호(id) 하나가 "호선별 승강장"이다. 같은 이름의 환승역은 id가 둘이고
// 두 노드를 환승 엣지(type: 'transfer')가 잇는다. 승차 엣지는 type: 'ride'.

export function buildGraph(network) {
  const nodes = new Map();   // id -> { id, name, line, order }
  const adj = new Map();     // id -> [{ to, timeSec, type, line, km }]
  const byName = new Map();  // 역명 -> [id, ...]
  const edgeIndex = new Map(); // `${from}|${to}` -> edge

  for (const st of network.stations) {
    nodes.set(st.id, st);
    adj.set(st.id, []);
    if (!byName.has(st.name)) byName.set(st.name, []);
    byName.get(st.name).push(st.id);
  }

  for (const e of network.edges) {
    const edge = { from: e.from, to: e.to, timeSec: e.time_sec, type: e.type, line: e.line ?? null, km: e.km ?? null };
    if (e.type === 'ride') {
      // 승차 엣지는 CSV에 한 방향만 있으므로 양방향으로 넣는다
      adj.get(e.from).push(edge);
      adj.get(e.to).push({ ...edge, from: e.to, to: e.from });
      edgeIndex.set(`${e.from}|${e.to}`, edge);
      edgeIndex.set(`${e.to}|${e.from}`, { ...edge, from: e.to, to: e.from });
    } else if (!edgeIndex.has(`${e.from}|${e.to}`)) {
      // 환승 엣지는 이미 양방향으로 들어 있다
      adj.get(e.from).push(edge);
      edgeIndex.set(`${e.from}|${e.to}`, edge);
    }
  }

  return {
    nodes,
    adj,
    byName,
    edge: (a, b) => edgeIndex.get(`${a}|${b}`),
    stationNames: () => [...byName.keys()],
  };
}
