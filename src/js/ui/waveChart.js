// waveChart.js — 경로별 피로도 파동 그래프 (Spline Area, Chart.js)
// X: 이동 시간(분), Y: 체감 스트레스 0~100 (열차 혼잡 + 환승 보행 스파이크)
// 인터랙션:
//  1) 마우스 스크럽 크로스헤어 + 스케일 보정 글래스 툴팁
//  2) 하단 경로 알약 호버/클릭 및 좌측 경로 카드(.route-card) 호버 시 해당 경로 곡선 강조
//  3) 슬라이드 진입 시 부드러운 곡선 드로잉 리빌

const charts = new WeakMap();

function hexAlpha(hex, alphaHex) {
  if (!hex || !hex.startsWith('#')) return hex;
  return hex.length === 7 ? `${hex}${alphaHex}` : hex;
}

const interactiveOverlayPlugin = {
  id: 'waveInteractiveOverlay',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const focusId = chart.$focusRouteId || null;
    const hoverX = chart.$hoverCanvasX;

    ctx.save();

    // 1) 마우스 스크럽 수직 가이드선 + 교차점 글로우 포인트
    if (typeof hoverX === 'number' && hoverX >= chartArea.left && hoverX <= chartArea.right) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(hoverX, chartArea.top);
      ctx.lineTo(hoverX, chartArea.bottom);
      ctx.strokeStyle = 'rgba(64, 140, 254, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();

      const minVal = chart.scales.x.getValueForPixel(hoverX);
      chart.data.datasets.forEach((ds, di) => {
        if (!chart.isDatasetVisible(di)) return;
        if (focusId && ds.routeId !== focusId) return;
        const yVal = interpolateStress(ds.data, minVal);
        if (yVal == null) return;
        const py = chart.scales.y.getPixelForValue(yVal);
        ctx.beginPath();
        ctx.arc(hoverX, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = ds.baseColor || ds.borderColor;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      });
    }

    // 2) 환승 스파이크 역 이름 라벨
    ctx.font = '600 19px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    chart.data.datasets.forEach((ds, di) => {
      if (!chart.isDatasetVisible(di)) return;
      const dimmed = focusId && ds.routeId !== focusId;
      ctx.fillStyle = dimmed ? 'rgba(107, 114, 128, 0.28)' : '#1E2024';
      const meta = chart.getDatasetMeta(di);
      ds.data.forEach((pt, i) => {
        if (!pt.spike) return;
        const el = meta.data[i];
        if (!el) return;
        ctx.fillText(pt.station, el.x, el.y - 18);
      });
    });

    ctx.restore();
  },
};

function interpolateStress(pts, min) {
  if (!pts || !pts.length) return null;
  if (min < pts[0].x || min > pts[pts.length - 1].x) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (min >= a.x && min <= b.x) {
      const span = b.x - a.x;
      if (span <= 0) return b.y;
      const t = (min - a.x) / span;
      return a.y + (b.y - a.y) * t;
    }
  }
  return pts[pts.length - 1].y;
}

function findNearestSpike(pts, min) {
  if (!pts) return null;
  let best = null;
  let bestDist = 1.4;
  for (const p of pts) {
    if (!p.spike) continue;
    const d = Math.abs(p.x - min);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function toDataset(route, focusId = null) {
  const color = route.color;
  const isFocused = focusId && route.id === focusId;
  const isDimmed = focusId && route.id !== focusId;
  return {
    label: route.label,
    routeId: route.id,
    baseColor: color,
    data: route.wave.map((p) => ({ x: p.min, y: p.stress, spike: !!p.spike, station: p.station })),
    borderColor: isDimmed ? hexAlpha(color, '38') : color,
    backgroundColor: isFocused ? hexAlpha(color, '52') : isDimmed ? hexAlpha(color, '10') : hexAlpha(color, '30'),
    borderWidth: isFocused ? 5.5 : isDimmed ? 2.5 : 4,
    fill: true,
    cubicInterpolationMode: 'monotone',
    pointRadius: route.wave.map((p) => (p.spike ? (isDimmed ? 5 : isFocused ? 11 : 9) : 0)),
    pointBackgroundColor: isDimmed ? 'rgba(239, 68, 68, 0.35)' : '#EF4444',
    pointBorderColor: '#fff',
    pointBorderWidth: isDimmed ? 1.5 : 3,
    order: isFocused ? 0 : route.rank,
  };
}

function applyFocus(el, routeId) {
  const state = charts.get(el);
  if (!state) return;
  const { chart, scored, pillsEl } = state;
  const nextId = state.lockedRouteId || routeId || null;
  if (chart.$focusRouteId === nextId) return;
  chart.$focusRouteId = nextId;
  chart.data.datasets = scored.map((r) => toDataset(r, nextId));
  chart.update('none');

  if (pillsEl) {
    pillsEl.querySelectorAll('.chart-pill').forEach((btn) => {
      const active = nextId && btn.dataset.routeId === nextId;
      const dimmed = nextId && btn.dataset.routeId !== nextId;
      btn.classList.toggle('is-active', !!active);
      btn.classList.toggle('is-dimmed', !!dimmed);
    });
  }

  // 같은 슬라이드 안의 경로 카드도 하이라이트 동기화
  const slide = el.closest('.slide');
  if (slide) {
    slide.querySelectorAll('.route-card').forEach((card) => {
      card.classList.toggle('is-chart-focus', !!nextId && card.dataset.id === nextId);
      card.classList.toggle('is-chart-dim', !!nextId && card.dataset.id !== nextId);
    });
  }
}

export function highlightWaveRoute(slideOrContainer, routeId) {
  if (!slideOrContainer) return;
  const slide = slideOrContainer.closest?.('.slide') || slideOrContainer;
  slide.querySelectorAll('.chart-box').forEach((box) => {
    if (charts.has(box)) applyFocus(box, routeId);
  });
}

function bindWaveInteractions(el, state) {
  const { chart, wrap, tooltip, pillsEl } = state;
  const canvas = chart.canvas;

  const updateScrub = (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // 캔버스 CSS 크기(chart.width) 기준 스케일 보정 좌표
    const cx = ((e.clientX - rect.left) / rect.width) * chart.width;
    const cy = ((e.clientY - rect.top) / rect.height) * chart.height;
    const area = chart.chartArea;
    if (!area || cx < area.left || cx > area.right || cy < area.top - 16 || cy > area.bottom + 16) {
      clearScrub();
      return;
    }

    chart.$hoverCanvasX = cx;
    const minVal = Math.max(0, chart.scales.x.getValueForPixel(cx));
    const focusId = chart.$focusRouteId;

    const rows = [];
    for (const r of state.scored) {
      if (focusId && r.id !== focusId) continue;
      const ds = chart.data.datasets.find((d) => d.routeId === r.id);
      if (!ds) continue;
      const val = interpolateStress(ds.data, minVal);
      if (val == null) continue;
      const spike = findNearestSpike(ds.data, minVal);
      rows.push({
        label: r.label,
        color: r.color,
        stress: Math.round(val),
        spike: spike ? `${spike.station} 환승` : null,
      });
    }

    if (!rows.length) {
      clearScrub();
      return;
    }

    tooltip.innerHTML = `
      <div class="ct-head">${minVal.toFixed(1)}분 지점 체감 스트레스</div>
      ${rows.map((r) => `
        <div class="ct-row">
          <span class="ct-dot" style="background:${r.color}"></span>
          <span class="ct-name">${r.label}${r.spike ? ` <em>· ${r.spike}</em>` : ''}</span>
          <b class="ct-val">${r.stress}</b>
        </div>
      `).join('')}
    `;
    tooltip.classList.add('is-visible');

    const pctX = (cx / chart.width) * 100;
    tooltip.style.left = `${Math.min(82, Math.max(18, pctX)).toFixed(1)}%`;
    chart.draw();
  };

  const clearScrub = () => {
    if (chart.$hoverCanvasX == null) return;
    chart.$hoverCanvasX = null;
    tooltip.classList.remove('is-visible');
    chart.draw();
  };

  wrap.addEventListener('pointermove', updateScrub, { passive: true });
  wrap.addEventListener('mousemove', updateScrub, { passive: true });
  wrap.addEventListener('pointerleave', clearScrub, { passive: true });
  wrap.addEventListener('mouseleave', clearScrub, { passive: true });

  pillsEl.addEventListener('pointerover', (e) => {
    const pill = e.target.closest('.chart-pill');
    if (pill) applyFocus(el, pill.dataset.routeId);
  });
  pillsEl.addEventListener('pointerleave', () => {
    applyFocus(el, null);
  });
  pillsEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.chart-pill');
    if (!pill) return;
    const id = pill.dataset.routeId;
    state.lockedRouteId = state.lockedRouteId === id ? null : id;
    applyFocus(el, id);
  });
}

function renderPills(state) {
  const { pillsEl, scored } = state;
  if (!pillsEl) return;
  pillsEl.innerHTML = scored.map((r) => `
    <button type="button" class="chart-pill" data-route-id="${r.id}">
      <span class="chart-pill-dot" style="background:${r.color}"></span>
      <span class="chart-pill-label">${r.label}</span>
      <span class="chart-pill-meta">피크 ${Math.round(Math.max(...r.wave.map((w) => w.stress)))}</span>
    </button>
  `).join('');
}

export function renderWaveChart(scored, el = document.getElementById('wave-chart')) {
  if (!el) return;
  if (!scored.length) {
    charts.get(el)?.chart?.destroy();
    charts.delete(el);
    el.innerHTML = '<p class="empty">경로가 없습니다.</p>';
    return;
  }
  let state = charts.get(el);
  if (!state) {
    el.innerHTML = `
      <div class="canvas-wrap has-interactive-chart">
        <canvas></canvas>
        <div class="chart-floating-tooltip" aria-hidden="true"></div>
        <div class="chart-pills" role="group" aria-label="경로 강조 선택"></div>
      </div>`;
    const wrap = el.querySelector('.canvas-wrap');
    const tooltip = el.querySelector('.chart-floating-tooltip');
    const pillsEl = el.querySelector('.chart-pills');
    Chart.defaults.font.family = '"Pretendard", "Noto Sans KR", sans-serif';
    const chart = new Chart(el.querySelector('canvas'), {
      type: 'line',
      data: { datasets: [] },
      plugins: [interactiveOverlayPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1050, easing: 'easeOutQuart' },
        events: [],
        layout: { padding: { top: 30, right: 16, bottom: 4 } },
        scales: {
          x: { type: 'linear', min: 0, title: { display: true, text: '이동 시간 (분)', font: { size: 19 } }, ticks: { font: { size: 17 } }, grid: { display: false } },
          y: { min: 0, max: 100, title: { display: true, text: '체감 스트레스', font: { size: 19 } }, ticks: { font: { size: 17 }, stepSize: 25 }, grid: { color: '#E5E9F5' } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    });
    state = { chart, wrap, tooltip, pillsEl, scored: [], lockedRouteId: null };
    charts.set(el, state);
    bindWaveInteractions(el, state);
  }
  state.scored = scored;
  if (state.lockedRouteId && !scored.some((r) => r.id === state.lockedRouteId)) {
    state.lockedRouteId = null;
  }
  state.chart.$focusRouteId = state.lockedRouteId;
  state.chart.data.datasets = scored.map((r) => toDataset(r, state.lockedRouteId));
  renderPills(state);
  state.chart.update();
}

// 슬라이드 진입 시 차트 드로잉 애니메이션 재실행
document.addEventListener('slidechange', (e) => {
  const slide = e.detail?.slide;
  if (!slide) return;
  slide.querySelectorAll('.chart-box').forEach((box) => {
    const st = charts.get(box);
    if (st?.chart) {
      st.chart.reset();
      st.chart.update();
    }
  });
});
