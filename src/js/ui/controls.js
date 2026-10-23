// controls.js — 컨디션 가중치 슬라이더 4개 + 상황 프리셋 버튼 4개
// 값이 바뀔 때마다 onChange(weights)를 즉시 호출한다

export const SLIDERS = [
  { key: 'time',       label: '빠른 이동 우선' },
  { key: 'congestion', label: '열차 내 여유(혼잡 회피)' },
  { key: 'transfer',   label: '환승 보행 최소화' },
  { key: 'seat',       label: '착석 가능성 선호' },
];

// 가중치 초안 (0~100). 확정은 planning/ui_layout.md 3장
export const PRESETS = [
  { label: '출근길 지옥철 회피',   weights: { time: 30,  congestion: 90, transfer: 40, seat: 60 } },
  { label: '무거운 짐/비 오는 날', weights: { time: 30,  congestion: 40, transfer: 95, seat: 40 } },
  { label: '체력 방전/앉아가기',   weights: { time: 20,  congestion: 60, transfer: 50, seat: 95 } },
  { label: '최단 시간 돌파',       weights: { time: 100, congestion: 10, transfer: 20, seat: 0 } },
];

export const DEFAULT_WEIGHTS = { time: 60, congestion: 60, transfer: 50, seat: 40 };

export function initControls(onChange) {
  const presetBox = document.getElementById('presets');
  const sliderBox = document.getElementById('sliders');
  const weights = { ...DEFAULT_WEIGHTS };

  const inputs = {};
  const valueLabels = {};

  const paint = (input) => input.style.setProperty('--pct', `${input.value}%`);

  const emit = () => onChange({ ...weights });

  sliderBox.innerHTML = '';
  for (const { key, label } of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.innerHTML = `
      <label for="w-${key}">
        <span class="slider-name">${label}</span>
        <span class="slider-value" id="v-${key}"></span>
      </label>
      <input type="range" id="w-${key}" min="0" max="100" step="1">`;
    sliderBox.appendChild(row);
    inputs[key] = row.querySelector('input');
    valueLabels[key] = row.querySelector('.slider-value');
    inputs[key].addEventListener('input', () => {
      weights[key] = Number(inputs[key].value);
      sync();
      clearPresetSelection();
      emit();
    });
  }

  function sync() {
    for (const { key } of SLIDERS) {
      inputs[key].value = weights[key];
      valueLabels[key].textContent = weights[key];
      paint(inputs[key]);
    }
  }

  const presetButtons = PRESETS.map((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    btn.textContent = preset.label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      Object.assign(weights, preset.weights);
      sync();
      clearPresetSelection();
      btn.setAttribute('aria-pressed', 'true');
      emit();
    });
    return btn;
  });
  presetBox.replaceChildren(...presetButtons);

  function clearPresetSelection() {
    presetButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }

  sync();
  emit();
}
