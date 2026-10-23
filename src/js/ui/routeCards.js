// routeCards.js — 후보 경로 카드 (순위 · 쾌적도 점수 · 환승역 · 지표 4개 + 파동 그래프 양방향 하이라이트)
// 순위가 바뀌면 카드가 제자리를 찾아 부드럽게 이동한다 (FLIP 트랜지션)

import { highlightWaveRoute } from './waveChart.js';

// 경로 식별 색 (순위가 아니라 경로마다 고정 → 순위가 바뀌어도 색은 그대로)
export const ROUTE_COLORS = ['#408CFE', '#95A2FE', '#FF9CD2', '#9CA3AF'];

const LINE_CLASS = { 1: 'l1', 2: 'l2', 3: 'l3', 4: 'l4' };

// 카드 아래에 한 줄로 보여 주는 지표 (모두 높을수록 좋음, 0~100)
const METRICS = [
  { key: 'time', label: '시간', value: (r) => 100 - r.norm.time },
  { key: 'congestion', label: '혼잡', value: (r) => 100 - r.norm.congestion },
  { key: 'transfer', label: '환승', value: (r) => 100 - r.norm.transfer },
  { key: 'seat', label: '착석', value: (r) => r.norm.seat },
];

function pathHtml(route) {
  const stops = route.legs.map((leg) => ({ line: leg.line, name: leg.stations[0].name }));
  const parts = stops.map((s) => `<span class="rc-stop"><i class="dot ${LINE_CLASS[s.line]}"></i>${s.name}</span>`);
  parts.push(`<span class="rc-stop">${route.destination}</span>`);
  return parts.join('<b>→</b>');
}

function cardHtml(route) {
  const metrics = METRICS.map((m) => {
    const val = Math.round(m.value(route));
    return `<li><span class="rc-m-head"><span>${m.label}</span><b>${val}</b></span><i class="rc-m-bar"><u style="width:${val}%"></u></i></li>`;
  }).join('');
  return `
    <span class="rc-aura" aria-hidden="true"></span>
    <div class="rc-main">
      <div class="rc-id">
        <div class="rc-line">
          <span class="rc-rank"></span><i class="rc-swatch"></i>
          <h4 class="rc-name">${route.label}</h4>
          <span class="rc-badge">가장 쾌적</span>
        </div>
        <p class="rc-meta">${Math.round(route.totalSec / 60)}분 · 환승 ${route.transferCount}회</p>
      </div>
      <div class="rc-score"><span class="rc-num">0</span><span class="rc-unit">쾌적도</span></div>
    </div>
    <p class="rc-path">${pathHtml(route)}</p>
    <ul class="rc-metrics">${metrics}</ul>`;
}

const numTweens = new WeakMap();
function tweenNumber(el, target, dur = 550) {
  const to = Math.round(target);
  el.dataset.countup = String(to);
  const prev = parseFloat(el.dataset.val ?? el.textContent);
  el.dataset.val = String(to);
  if (!Number.isFinite(prev) || prev === to || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = String(to);
    return;
  }
  const tok = {};
  numTweens.set(el, tok);
  const t0 = performance.now();
  const step = (now) => {
    if (numTweens.get(el) !== tok) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(prev + (to - prev) * e));
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = String(to);
  };
  requestAnimationFrame(step);
}

const boundContainers = new WeakSet();
function ensureCardHoverBinding(el) {
  if (boundContainers.has(el)) return;
  boundContainers.add(el);
  el.addEventListener('pointerover', (e) => {
    const card = e.target.closest('.route-card');
    if (card) highlightWaveRoute(el, card.dataset.id);
  });
  el.addEventListener('pointerleave', () => {
    highlightWaveRoute(el, null);
  });
}

export function renderRouteCards(scored, el = document.getElementById('route-cards')) {
  if (!el) return;
  el.classList.add('route-cards'); // 시나리오 슬라이드의 컨테이너도 카드 간격 규칙을 받도록
  ensureCardHoverBinding(el);
  if (!scored.length) {
    el.innerHTML = '<p class="empty">출발역과 도착역을 다르게 골라 주세요.</p>';
    return;
  }
  if (el.querySelector('.empty')) el.innerHTML = '';

  // 1) 이동 전 위치 기록
  const before = new Map();
  el.querySelectorAll('.route-card').forEach((n) => before.set(n.dataset.id, n.getBoundingClientRect()));

  // 2) 카드 생성/갱신 (경로가 같으면 재사용)
  const existing = new Map([...el.querySelectorAll('.route-card')].map((n) => [n.dataset.id, n]));
  const keep = new Set(scored.map((r) => r.id));
  existing.forEach((n, id) => { if (!keep.has(id)) n.remove(); });

  scored.forEach((route) => {
    let card = existing.get(route.id);
    if (!card) {
      card = document.createElement('article');
      card.className = 'route-card';
      card.dataset.id = route.id;
      card.innerHTML = cardHtml(route);
    }
    card.style.setProperty('--rc', route.color ?? ROUTE_COLORS[0]);
    card.classList.toggle('is-top', route.rank === 1);
    card.querySelector('.rc-rank').textContent = String(route.rank).padStart(2, '0');
    tweenNumber(card.querySelector('.rc-num'), route.comfort);
    const bList = card.querySelectorAll('.rc-metrics b');
    const barList = card.querySelectorAll('.rc-metrics .rc-m-bar u');
    METRICS.forEach((m, i) => {
      const v = Math.round(m.value(route));
      if (bList[i]) tweenNumber(bList[i], v, 420);
      if (barList[i]) barList[i].style.width = `${v}%`;
    });
    el.appendChild(card); // 순위 순서로 재배치
  });

  // 3) FLIP: 이동한 만큼 되돌려 놓았다가 0으로 풀어 준다
  el.querySelectorAll('.route-card').forEach((n) => {
    const prev = before.get(n.dataset.id);
    if (!prev) return;
    const now = n.getBoundingClientRect();
    const dx = prev.left - now.left;
    const dy = prev.top - now.top;
    if (!dx && !dy) return;
    // 캔버스가 scale 되어 있으므로 화면 좌표 차이를 scale로 나눠 준다
    const scale = parseFloat(getComputedStyle(n.closest('.deck-container') ?? document.body).getPropertyValue('--deck-scale')) || 1;
    n.style.transition = 'none';
    n.style.transform = `translate(${dx / scale}px, ${dy / scale}px)`;
    requestAnimationFrame(() => {
      n.style.transition = 'transform .58s cubic-bezier(.2,.8,.2,1)';
      n.style.transform = '';
    });
  });
}
