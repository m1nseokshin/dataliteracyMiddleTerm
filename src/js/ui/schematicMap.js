// schematicMap.js — 부산 1~4호선 토폴로지 미니맵 (SVG + 인터랙티브 호버·툴팁·레이더 연동)
// 역 좌표는 OpenStreetMap 의 실제 위경도(ui/stationGeo.js)를 평면에 투영해 쓴다.

const SVG_NS = 'http://www.w3.org/2000/svg';
import { GEO, GEO_VIEW } from './stationGeo.js';

const VIEW = GEO_VIEW;

const LINE_COLOR = { 1: '#FF6B00', 2: '#2ECC71', 3: '#D4A359', 4: '#3B82F6' };

const TRANSFER_NAMES = ['서면', '연산', '수영', '덕천', '미남', '동래'];

const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
};

// ---------------------------------------------------------------- 좌표 계산
const posByName = new Map();
{
  const acc = new Map();
  for (const line of Object.values(GEO)) {
    for (const [name, [x, y]] of Object.entries(line)) {
      const a = acc.get(name) ?? [0, 0, 0];
      acc.set(name, [a[0] + x, a[1] + y, a[2] + 1]);
    }
  }
  for (const [name, [x, y, n]] of acc) posByName.set(name, [x / n, y / n]);
}

export function layoutStations(network) {
  const pos = new Map();
  for (const st of network.stations) {
    const p = posByName.get(st.name);
    if (p) pos.set(st.id, p);
  }
  return pos;
}

// ---------------------------------------------------------------- 선 단순화
function simplify(pts, keep, tol) {
  const marks = new Set(pts.map((_, i) => i).filter((i) => keep[i]));
  const rdp = (a, b) => {
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1;
    let dmax = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
      if (d > dmax) { dmax = d; worst = i; }
    }
    if (worst < 0) return;
    marks.add(worst);
    rdp(a, worst);
    rdp(worst, b);
  };
  const forced = [...marks].sort((x, y) => x - y);
  for (let k = 0; k < forced.length - 1; k++) rdp(forced[k], forced[k + 1]);
  return [...marks].sort((x, y) => x - y).map((i) => pts[i]);
}

// ---------------------------------------------------------------- 그리기
const states = new WeakMap();

function buildBase(network, pos, svg) {
  const defs = el('defs', {}, svg);
  const glow = el('filter', { id: 'route-glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
  el('feGaussianBlur', { stdDeviation: '6', result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);

  const base = el('g', { class: 'map-base' }, svg);
  for (const line of [1, 2, 3, 4]) {
    const sts = network.stations.filter((st) => st.line === line && pos.get(st.id)).sort((a, b) => a.order - b.order);
    const pts = sts.map((st) => pos.get(st.id));
    const keep = sts.map((st, i) => TRANSFER_NAMES.includes(st.name) || i === 0 || i === sts.length - 1);
    const simple = simplify(pts, keep, 6);
    el('path', {
      d: simple.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
      fill: 'none', stroke: LINE_COLOR[line], 'stroke-width': 8, 'stroke-opacity': 0.28,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, base);
  }
  const dots = el('g', { class: 'map-transfer-dots' }, svg);
  const drawn = new Set();
  for (const st of network.stations) {
    const p = pos.get(st.id);
    if (!p || !TRANSFER_NAMES.includes(st.name) || drawn.has(st.name)) continue;
    drawn.add(st.name);
    el('circle', {
      cx: p[0], cy: p[1], r: 10, fill: '#fff', stroke: '#111', 'stroke-width': 3,
      class: 'map-station-dot', 'data-station': st.name,
    }, dots);
  }
  const labels = el('g', { 'font-family': 'Pretendard, sans-serif', 'paint-order': 'stroke', stroke: '#F3F6FD', 'stroke-width': 5, 'stroke-linejoin': 'round' }, svg);
  const put = (name, dx, dy, weight, size, anchor = 'start') => {
    const p = posByName.get(name);
    if (!p) return;
    const t = el('text', { x: p[0] + dx, y: p[1] + dy, 'font-size': size, 'font-weight': weight, fill: weight >= 700 ? '#111' : '#6B7280', 'text-anchor': anchor }, labels);
    t.textContent = name;
  };
  put('서면', -16, 8, 700, 20, 'end');
  put('연산', 18, -12, 700, 20);
  put('수영', -12, 34, 700, 20, 'end');
  put('덕천', -16, 8, 700, 20, 'end');
  put('미남', -16, 6, 700, 20, 'end');
  put('동래', 16, -10, 700, 20);
  put('다대포해수욕장', 12, 6, 500, 16);
  put('노포', 12, 6, 500, 16);
  put('양산', 12, 6, 500, 16);
  put('대저', 12, 6, 500, 16);
  put('안평', 12, 6, 500, 16);
  put('센텀시티', 14, 30, 500, 16);

  const legend = el('g', { class: 'map-legend', 'font-family': 'Pretendard, sans-serif', 'font-size': 17, fill: '#6B7280' }, svg);
  [1, 2, 3, 4].forEach((line, i) => {
    el('rect', { x: i * 92, y: 0, width: 28, height: 8, rx: 4, fill: LINE_COLOR[line] }, legend);
    const t = el('text', { x: 34 + i * 92, y: 10 }, legend);
    t.textContent = `${line}호선`;
  });
  return legend;
}

function pathD(route, pos) {
  const pts = [];
  for (const id of route.nodePath) {
    const p = pos.get(id);
    if (!p) continue;
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

function drawRoutes(layer, scored, pos, focusId = null) {
  layer.replaceChildren();
  const activeId = focusId || scored[0]?.id;
  const ordered = [...scored].sort((a, b) => (a.id === activeId ? 1 : b.id === activeId ? -1 : b.rank - a.rank));

  ordered.forEach((route) => {
    const isTop = route.id === activeId;
    const isDimmed = focusId && !isTop;
    const d = pathD(route, pos);
    const pathId = `route-path-${route.rank}`;

    // 넓은 투명 히트 영역 (마우스 호버 감지용)
    el('path', {
      d, fill: 'none', stroke: 'transparent', 'stroke-width': 26,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      class: 'map-route-hit', 'data-route-id': route.id,
      style: 'cursor:pointer',
    }, layer);

    el('path', {
      id: pathId, d, fill: 'none', stroke: route.color,
      'stroke-width': isTop ? 12 : 6,
      'stroke-opacity': isTop ? 1 : isDimmed ? 0.22 : 0.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      class: isTop ? 'map-route-line is-active' : 'map-route-line',
      'data-route-id': route.id,
      style: 'pointer-events:none',
      ...(isTop ? { filter: 'url(#route-glow)' } : {}),
    }, layer);

    if (isTop) {
      const len = 6;
      const dur = Math.max(4, route.totalSec / 60 / 4);
      for (let i = 0; i < len; i++) {
        const c = el('circle', { r: 6.5, fill: '#fff', stroke: route.color, 'stroke-width': 3, style: 'pointer-events:none' }, layer);
        const m = el('animateMotion', { dur: `${dur}s`, begin: `${(-dur * i) / len}s`, repeatCount: 'indefinite' }, c);
        el('mpath', { href: `#${pathId}` }, m);
      }
    }

    route.nodePath.forEach((id, i, arr) => {
      const p = pos.get(id);
      const same = (j) => { const q = pos.get(arr[j]); return q && p && q[0] === p[0] && q[1] === p[1]; };
      const key = i === 0 || i === arr.length - 1 || (i > 0 && same(i - 1)) || (i < arr.length - 1 && same(i + 1));
      if (p && key) {
        el('circle', {
          cx: p[0], cy: p[1], r: isTop ? 6 : 4,
          fill: route.color, 'fill-opacity': isTop ? 1 : isDimmed ? 0.25 : 0.6,
          style: 'pointer-events:none',
        }, layer);
      }
    });
  });

  const first = scored.find((r) => r.id === activeId) || scored[0];
  if (first) {
    const g = el('g', { 'font-family': 'Pretendard, sans-serif', 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 6, 'stroke-linejoin': 'round', style: 'pointer-events:none' }, layer);
    [[first.nodePath[0], '출발'], [first.nodePath[first.nodePath.length - 1], '도착']].forEach(([id, tag]) => {
      const p = pos.get(id);
      if (!p) return;
      const badge = el('text', { x: p[0], y: p[1] + 40, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#408CFE' }, g);
      badge.textContent = tag;
    });
  }
}

function fitView(state, container, scored) {
  const pts = scored.flatMap((r) => r.nodePath.map((id) => state.pos.get(id)).filter(Boolean));
  let x0 = 0, y0 = 0, w = VIEW.w, h = VIEW.h;
  if (pts.length) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 110;
    x0 = Math.min(...xs) - pad; y0 = Math.min(...ys) - pad;
    w = Math.max(...xs) + pad - x0; h = Math.max(...ys) + pad - y0;
    w = Math.max(w, 420);
    h = Math.max(h, 300);
    const ar = (container.clientWidth || 640) / (container.clientHeight || 450);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const my = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (w / h < ar) w = h * ar; else h = w / ar;
    x0 = mx - w / 2; y0 = my - h / 2;
  }
  state.svg.setAttribute('viewBox', `${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`);
  const k = w / 760;
  state.legend.setAttribute('transform', `translate(${(x0 + w - 380 * k - 16).toFixed(0)} ${(y0 + h - 26 * k).toFixed(0)}) scale(${k.toFixed(3)})`);
}

function updateMapFocus(state, routeId, broadcast = true) {
  const next = state.lockedRouteId || routeId || null;
  if (state.focusRouteId === next) return;
  state.focusRouteId = next;
  drawRoutes(state.layer, state.scored, state.pos, next);

  const activeRoute = state.scored.find((r) => r.id === (next || state.scored[0]?.id));
  if (state.tooltip && activeRoute && next) {
    state.tooltip.innerHTML = `
      <div class="ct-head"><span class="ct-dot" style="background:${activeRoute.color}"></span>${activeRoute.label}</div>
      <div class="ct-row"><span class="ct-name">소요 시간 · 환승</span><b class="ct-val">${Math.round(activeRoute.totalSec / 60)}분 · ${activeRoute.transferCount}회</b></div>
      <div class="ct-row"><span class="ct-name">종합 쾌적도</span><b class="ct-val">${Math.round(activeRoute.comfort)}점</b></div>
    `;
    state.tooltip.classList.add('is-visible');
    state.tooltip.style.left = '50%';
  } else if (state.tooltip) {
    state.tooltip.classList.remove('is-visible');
  }

  if (broadcast) {
    document.dispatchEvent(new CustomEvent('overviewfocus', { detail: { routeId: next, source: 'map' } }));
  }
}

export function renderSchematicMap(network, scored, container = document.getElementById('schematic-map')) {
  if (!container) return;
  let state = states.get(container);
  if (!state) {
    const pos = layoutStations(network);
    container.innerHTML = '';
    container.classList.add('has-interactive-map');
    const svg = el('svg', { viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, class: 'map-svg', role: 'img', 'aria-label': '부산 도시철도 노선 개략도' });
    container.appendChild(svg);
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-floating-tooltip';
    container.appendChild(tooltip);

    const legend = buildBase(network, pos, svg);
    const layer = el('g', { class: 'map-routes' }, svg);
    state = { pos, layer, svg, legend, tooltip, scored: [], signature: '', focusRouteId: null, lockedRouteId: null };
    states.set(container, state);

    svg.addEventListener('pointerover', (e) => {
      const hit = e.target.closest('[data-route-id]');
      if (hit) updateMapFocus(state, hit.getAttribute('data-route-id'), true);
    });
    svg.addEventListener('pointerleave', () => {
      updateMapFocus(state, null, true);
    });
    svg.addEventListener('click', (e) => {
      const hit = e.target.closest('[data-route-id]');
      if (!hit) return;
      const id = hit.getAttribute('data-route-id');
      state.lockedRouteId = state.lockedRouteId === id ? null : id;
      updateMapFocus(state, id, true);
    });

    document.addEventListener('overviewfocus', (e) => {
      if (e.detail?.source === 'map') return;
      updateMapFocus(state, e.detail?.routeId ?? null, false);
    });
  }

  state.scored = scored;
  const signature = scored.map((r) => `${r.id}:${r.rank}`).join(',');
  if (signature === state.signature) return;
  state.signature = signature;
  state.lockedRouteId = null;
  state.focusRouteId = null;
  drawRoutes(state.layer, scored, state.pos, null);
  fitView(state, container, scored);
}
