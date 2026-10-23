// fitChart.js — 1호선 실측 혼잡률 vs 모델 예측 산점도 (슬라이드 5)
// 인터랙션:
//  1) 시간대별 알약 필터 (호버/클릭 시 해당 시간대 점 강조)
//  2) 마우스 이동 시 스케일 보정 최근접 포인트 탐색 + 타깃 링 + 실측/예측/오차 글래스 툴팁
//  3) 슬라이드 진입 시 드로잉 애니메이션 재실행

const SLOT = {
  am_peak: { label: '출근 08시', color: '#408CFE' },
  midday:  { label: '낮 14시',   color: '#95A2FE' },
  pm_peak: { label: '퇴근 18시', color: '#FF9CD2' },
  night:   { label: '야간 21시', color: '#9CA3AF' },
};

const charts = new WeakMap();

const hoverRingPlugin = {
  id: 'fitHoverRing',
  afterDatasetsDraw(chart) {
    const hp = chart.$hoverPoint;
    if (!hp) return;
    const { ctx } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hp.px, hp.py, 13, 0, Math.PI * 2);
    ctx.strokeStyle = hp.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hp.px, hp.py, 6, 0, Math.PI * 2);
    ctx.fillStyle = hp.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  },
};

function buildDatasets(fit, max, focusSlot = null) {
  const ds = Object.entries(SLOT).map(([key, s]) => {
    const isFocused = focusSlot && focusSlot === key;
    const isDimmed = focusSlot && focusSlot !== key;
    return {
      label: s.label,
      slotKey: key,
      baseColor: s.color,
      data: fit.points.filter((p) => p.slot === key).map((p) => ({ x: p.obs, y: p.pred, slot: key })),
      backgroundColor: isDimmed ? `${s.color}22` : isFocused ? `${s.color}E6` : `${s.color}99`,
      borderColor: isDimmed ? `${s.color}44` : s.color,
      borderWidth: isFocused ? 2.5 : 1.5,
      pointRadius: isDimmed ? 4 : isFocused ? 8.5 : 6.5,
    };
  });
  ds.push({
    label: '완벽히 일치 (y = x)',
    type: 'line',
    data: [{ x: 0, y: 0 }, { x: max, y: max }],
    borderColor: '#111',
    borderWidth: 2,
    borderDash: [8, 6],
    pointRadius: 0,
    fill: false,
  });
  return ds;
}

export function renderFitChart(fit, el = document.getElementById('fit-chart')) {
  if (!el || !fit?.points?.length) return;
  charts.get(el)?.chart?.destroy();

  el.innerHTML = `
    <div class="canvas-wrap has-interactive-chart">
      <canvas></canvas>
      <div class="chart-floating-tooltip" aria-hidden="true"></div>
      <div class="chart-pills" role="group" aria-label="시간대별 혼잡률 필터"></div>
    </div>`;

  const wrap = el.querySelector('.canvas-wrap');
  const tooltip = el.querySelector('.chart-floating-tooltip');
  const pillsEl = el.querySelector('.chart-pills');
  Chart.defaults.font.family = '"Pretendard", "Noto Sans KR", sans-serif';

  const max = Math.ceil(Math.max(...fit.points.flatMap((p) => [p.obs, p.pred])) / 10) * 10;

  const chart = new Chart(el.querySelector('canvas'), {
    type: 'scatter',
    data: { datasets: buildDatasets(fit, max, null) },
    plugins: [hoverRingPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1050, easing: 'easeOutQuart' },
      events: [],
      scales: {
        x: { min: 0, max, title: { display: true, text: '실측 혼잡률 (%)', font: { size: 19 } }, ticks: { font: { size: 17 } }, grid: { color: '#E5E9F5' } },
        y: { min: 0, max, title: { display: true, text: '모델 예측 (%)', font: { size: 19 } }, ticks: { font: { size: 17 } }, grid: { color: '#E5E9F5' } },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });

  const state = { chart, fit, max, focusSlot: null, lockedSlot: null };
  charts.set(el, state);

  pillsEl.innerHTML = Object.entries(SLOT).map(([key, s]) => `
    <button type="button" class="chart-pill" data-slot="${key}">
      <span class="chart-pill-dot" style="background:${s.color}"></span>
      <span class="chart-pill-label">${s.label}</span>
    </button>
  `).join('');

  const applySlotFocus = (slotKey) => {
    const next = state.lockedSlot || slotKey || null;
    if (state.focusSlot === next) return;
    state.focusSlot = next;
    chart.data.datasets = buildDatasets(fit, max, next);
    chart.update('none');
    pillsEl.querySelectorAll('.chart-pill').forEach((btn) => {
      btn.classList.toggle('is-active', !!next && btn.dataset.slot === next);
      btn.classList.toggle('is-dimmed', !!next && btn.dataset.slot !== next);
    });
  };

  pillsEl.addEventListener('pointerover', (e) => {
    const btn = e.target.closest('.chart-pill');
    if (btn) applySlotFocus(btn.dataset.slot);
  });
  pillsEl.addEventListener('pointerleave', () => applySlotFocus(null));
  pillsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chart-pill');
    if (!btn) return;
    const k = btn.dataset.slot;
    state.lockedSlot = state.lockedSlot === k ? null : k;
    applySlotFocus(k);
  });

  const canvas = chart.canvas;
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cx = ((e.clientX - rect.left) / rect.width) * chart.width;
    const cy = ((e.clientY - rect.top) / rect.height) * chart.height;
    const area = chart.chartArea;
    if (!area || cx < area.left || cx > area.right || cy < area.top || cy > area.bottom) {
      clearHover();
      return;
    }

    let best = null;
    let bestDist = 28;
    chart.data.datasets.forEach((ds, di) => {
      if (!ds.slotKey) return;
      if (state.focusSlot && ds.slotKey !== state.focusSlot) return;
      const meta = chart.getDatasetMeta(di);
      ds.data.forEach((pt, i) => {
        const elPt = meta.data[i];
        if (!elPt) return;
        const d = Math.hypot(elPt.x - cx, elPt.y - cy);
        if (d < bestDist) {
          bestDist = d;
          best = { pt, px: elPt.x, py: elPt.y, label: ds.label, color: ds.baseColor };
        }
      });
    });

    if (!best) {
      clearHover();
      return;
    }

    chart.$hoverPoint = best;
    const err = best.pt.pred - best.pt.obs;
    const sign = err > 0 ? '+' : '';
    tooltip.innerHTML = `
      <div class="ct-head"><span class="ct-dot" style="background:${best.color}"></span>${best.label} 구간</div>
      <div class="ct-row"><span class="ct-name">1호선 실측</span><b class="ct-val">${best.pt.obs.toFixed(1)}%</b></div>
      <div class="ct-row"><span class="ct-name">모델 예측</span><b class="ct-val">${best.pt.pred.toFixed(1)}%</b></div>
      <div class="ct-row"><span class="ct-name">예측 오차</span><b class="ct-val">${sign}${err.toFixed(1)}%p</b></div>
    `;
    tooltip.classList.add('is-visible');
    const pctX = (best.px / chart.width) * 100;
    tooltip.style.left = `${Math.min(80, Math.max(20, pctX)).toFixed(1)}%`;
    chart.draw();
  };

  const clearHover = () => {
    if (!chart.$hoverPoint) return;
    chart.$hoverPoint = null;
    tooltip.classList.remove('is-visible');
    chart.draw();
  };

  wrap.addEventListener('pointermove', onMove, { passive: true });
  wrap.addEventListener('mousemove', onMove, { passive: true });
  wrap.addEventListener('pointerleave', clearHover, { passive: true });
  wrap.addEventListener('mouseleave', clearHover, { passive: true });
}

document.addEventListener('slidechange', (e) => {
  const slide = e.detail?.slide;
  if (!slide) return;
  slide.querySelectorAll('#fit-chart').forEach((box) => {
    const st = charts.get(box);
    if (st?.chart) {
      st.chart.reset();
      st.chart.update();
    }
  });
});
