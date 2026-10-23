// radarChart.js — 5대 지표 오각형 레이더 차트 (Chart.js)
// 축: 시간 효율 · 열차 쾌적도 · 환승 편의성 · 착석 확률 · 체력 보존도 (모두 높을수록 좋음, 0~100)
// 인터랙션:
//  1) 마우스 각도 기반 축 감지 + 축 하이라이트 + 경로별 점수 비교 툴팁
//  2) 하단 경로 알약 호버/클릭 시 노선 미니맵(schematicMap)과 양방향 하이라이트 동기화
//  3) 슬라이드 진입 시 오각형 확장 애니메이션

const charts = new WeakMap();

const radarAxisOverlay = {
  id: 'radarAxisOverlay',
  afterDatasetsDraw(chart) {
    const idx = chart.$hoverAxisIndex;
    if (typeof idx !== 'number' || idx < 0) return;
    const rScale = chart.scales.r;
    if (!rScale) return;
    const { ctx } = chart;
    const pt = rScale.getPointPositionForValue(idx, 100);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(rScale.xCenter, rScale.yCenter);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = 'rgba(64, 140, 254, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();

    chart.data.datasets.forEach((ds, di) => {
      if (!chart.isDatasetVisible(di)) return;
      const meta = chart.getDatasetMeta(di);
      const elPt = meta.data[idx];
      if (!elPt) return;
      ctx.beginPath();
      ctx.arc(elPt.x, elPt.y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = ds.baseColor || ds.borderColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
    ctx.restore();
  },
};

function buildDatasets(scored, focusId = null) {
  return scored.map((r) => {
    const isFocused = focusId && r.id === focusId;
    const isDimmed = focusId && r.id !== focusId;
    return {
      label: r.label,
      routeId: r.id,
      baseColor: r.color,
      data: Object.values(r.radar).map((v) => Math.round(v)),
      borderColor: isDimmed ? `${r.color}38` : r.color,
      backgroundColor: isFocused ? `${r.color}4D` : isDimmed ? `${r.color}10` : `${r.color}30`,
      borderWidth: isFocused ? 5 : isDimmed ? 2 : 4,
      pointRadius: isDimmed ? 3.5 : isFocused ? 7.5 : 6,
      pointBackgroundColor: isDimmed ? `${r.color}55` : r.color,
      order: isFocused ? 0 : r.rank,
    };
  });
}

function setFocus(el, routeId, broadcast = true) {
  const state = charts.get(el);
  if (!state) return;
  const next = state.lockedRouteId || routeId || null;
  if (state.focusRouteId === next) return;
  state.focusRouteId = next;
  state.chart.data.datasets = buildDatasets(state.scored, next);
  state.chart.update('none');
  state.pillsEl?.querySelectorAll('.chart-pill').forEach((btn) => {
    btn.classList.toggle('is-active', !!next && btn.dataset.routeId === next);
    btn.classList.toggle('is-dimmed', !!next && btn.dataset.routeId !== next);
  });
  if (broadcast) {
    document.dispatchEvent(new CustomEvent('overviewfocus', { detail: { routeId: next, source: 'radar' } }));
  }
}

export function renderRadarChart(scored, el = document.getElementById('radar-chart')) {
  if (!el) return;
  if (!scored.length) {
    charts.get(el)?.chart?.destroy();
    charts.delete(el);
    el.innerHTML = '<p class="empty">경로가 없습니다.</p>';
    return;
  }
  const labels = Object.keys(scored[0].radar);

  let state = charts.get(el);
  if (!state) {
    el.innerHTML = `
      <div class="canvas-wrap has-interactive-chart">
        <canvas></canvas>
        <div class="chart-floating-tooltip" aria-hidden="true"></div>
        <div class="chart-pills" role="group" aria-label="레이더 경로 선택"></div>
      </div>`;
    const wrap = el.querySelector('.canvas-wrap');
    const tooltip = el.querySelector('.chart-floating-tooltip');
    const pillsEl = el.querySelector('.chart-pills');
    Chart.defaults.font.family = '"Pretendard", "Noto Sans KR", sans-serif';
    const chart = new Chart(el.querySelector('canvas'), {
      type: 'radar',
      data: { labels, datasets: [] },
      plugins: [radarAxisOverlay],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1050, easing: 'easeOutQuart' },
        events: [],
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 25, backdropColor: 'transparent', font: { size: 15 }, color: '#9CA3AF' },
            pointLabels: { font: { size: 20, weight: '600' }, color: '#1E2024' },
            grid: { color: '#D9E1F5' },
            angleLines: { color: '#D9E1F5' },
          },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    state = { chart, wrap, tooltip, pillsEl, scored: [], focusRouteId: null, lockedRouteId: null };
    charts.set(el, state);

    const canvas = chart.canvas;
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const cx = ((e.clientX - rect.left) / rect.width) * chart.width;
      const cy = ((e.clientY - rect.top) / rect.height) * chart.height;
      const rScale = chart.scales.r;
      if (!rScale) return;
      const dist = Math.hypot(cx - rScale.xCenter, cy - rScale.yCenter);
      if (dist > rScale.drawingArea * 1.22 || dist < 10) {
        clearHover();
        return;
      }

      const lbls = chart.data.labels || [];
      let bestIdx = -1;
      let bestD = Infinity;
      lbls.forEach((_, i) => {
        const p = rScale.getPointPositionForValue(i, 85);
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < bestD) { bestD = d; bestIdx = i; }
      });

      if (bestIdx < 0) { clearHover(); return; }
      chart.$hoverAxisIndex = bestIdx;
      const axisName = lbls[bestIdx];

      tooltip.innerHTML = `
        <div class="ct-head">${axisName} 비교 (0~100)</div>
        ${state.scored.map((r) => {
          const v = Math.round(r.radar[axisName] ?? 0);
          return `<div class="ct-row"><span class="ct-dot" style="background:${r.color}"></span><span class="ct-name">${r.label}</span><b class="ct-val">${v}점</b></div>`;
        }).join('')}
      `;
      tooltip.classList.add('is-visible');
      tooltip.style.left = '50%';
      chart.draw();
    };

    const clearHover = () => {
      if (chart.$hoverAxisIndex == null) return;
      chart.$hoverAxisIndex = null;
      tooltip.classList.remove('is-visible');
      chart.draw();
    };

    wrap.addEventListener('pointermove', onMove, { passive: true });
    wrap.addEventListener('mousemove', onMove, { passive: true });
    wrap.addEventListener('pointerleave', clearHover, { passive: true });
    wrap.addEventListener('mouseleave', clearHover, { passive: true });

    pillsEl.addEventListener('pointerover', (e) => {
      const btn = e.target.closest('.chart-pill');
      if (btn) setFocus(el, btn.dataset.routeId, true);
    });
    pillsEl.addEventListener('pointerleave', () => setFocus(el, null, true));
    pillsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.chart-pill');
      if (!btn) return;
      const id = btn.dataset.routeId;
      state.lockedRouteId = state.lockedRouteId === id ? null : id;
      setFocus(el, id, true);
    });

    document.addEventListener('overviewfocus', (e) => {
      if (e.detail?.source === 'radar') return;
      setFocus(el, e.detail?.routeId ?? null, false);
    });
  }

  state.scored = scored;
  if (state.lockedRouteId && !scored.some((r) => r.id === state.lockedRouteId)) {
    state.lockedRouteId = null;
  }
  state.focusRouteId = state.lockedRouteId;
  state.chart.data.labels = labels;
  state.chart.data.datasets = buildDatasets(scored, state.focusRouteId);
  state.pillsEl.innerHTML = scored.map((r) => `
    <button type="button" class="chart-pill" data-route-id="${r.id}">
      <span class="chart-pill-dot" style="background:${r.color}"></span>
      <span class="chart-pill-label">${r.label}</span>
      <span class="chart-pill-meta">쾌적 ${Math.round(r.comfort)}</span>
    </button>
  `).join('');
  state.chart.update();
}

document.addEventListener('slidechange', (e) => {
  const slide = e.detail?.slide;
  if (!slide) return;
  slide.querySelectorAll('#radar-chart').forEach((box) => {
    const st = charts.get(box);
    if (st?.chart) {
      st.chart.reset();
      st.chart.update();
    }
  });
});
