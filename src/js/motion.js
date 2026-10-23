/* js/motion.js — Apple-style motion & interaction layer (vanilla, no deps) */
(() => {
  'use strict';
  if (window.__deckMotionInit) return;
  window.__deckMotionInit = true;

  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(mq && mq.matches);

  const STEP = 90;
  const MAX_STEPS = 14;
  const DUR = 1170;
  const CHAR_STEP = 42;
  const MAX_TILT = 4;
  const COUNT_DUR = 1560;

  const ITEM_SEL = [
    '.lead-tag', '.cover-title', '.slide-title', '.spoa-text-block', '.big-stat', '.problem-map-wrap',
    '.card', '.spoa-index-row', '.spoa-formula-card', '.panel-tint', '.panel-card',
    '.query-bar', '.cover-copy', '.bridge', '.ft', '.chart-box', '.route-cards'
  ].join(',');
  const TILT_SEL = '.card, .panel-tint, .panel-card, .spoa-formula-card';
  const BLOCK_SEL = 'button, input, select, textarea, label, a[href], [role="button"], [role="slider"], [contenteditable="true"], [class*="preset"], [data-no-nav]';
  const NO_TILT_INNER = 'input, select, textarea, [data-no-nav]';

  let deck = null;
  let slides = [];
  let current = null;
  let prevIdx = -1;
  let enterRaf = 0;
  let doneTimer = 0;
  let progressEl = null;
  let hoverEl = null;
  let loopId = 0;
  let auras = [];
  let auraStart = 0;

  const tilts = new Map();
  const cuTokens = new WeakMap();
  const mouse = { nx: 0, ny: 0 };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const addCls = (el, c) => { if (!el.classList.contains(c)) el.classList.add(c); };
  const remCls = (el, c) => { if (el.classList.contains(c)) el.classList.remove(c); };

  /* ---------- Title character split (per-character reveal) ---------- */
  function splitTitle(title) {
    if (title.dataset.mSplit === '1' || title.querySelector(':scope .m-char')) {
      return title.querySelectorAll(':scope .m-char').length;
    }
    const plain = (title.textContent || '').replace(/\s+/g, ' ').trim();
    if (plain && !title.hasAttribute('aria-label')) {
      title.setAttribute('aria-label', plain);
    }
    const nodes = Array.from(title.childNodes);
    const frag = document.createDocumentFragment();
    let ci = 0;

    const appendChars = (str) => {
      for (const ch of Array.from(str)) {
        if (ch === '\n' || ch === '\r') continue;
        const wrap = document.createElement('span');
        wrap.className = 'm-char';
        wrap.setAttribute('aria-hidden', 'true');
        const inner = document.createElement('span');
        inner.className = 'm-char-inner';
        inner.style.setProperty('--m-c', String(ci++));
        inner.textContent = ch === ' ' ? '\u00A0' : ch;
        wrap.appendChild(inner);
        frag.appendChild(wrap);
      }
    };

    nodes.forEach((n) => {
      if (n.nodeName === 'BR') {
        frag.appendChild(document.createElement('br'));
      } else if (n.nodeType === 3) {
        appendChars(n.textContent.replace(/^\s+|\s+$/g, (m) => (m.includes(' ') ? ' ' : '')));
      } else if (n.nodeType === 1) {
        appendChars(n.textContent || '');
      }
    });

    title.replaceChildren(frag);
    title.dataset.mSplit = '1';
    return ci;
  }

  /* ---------- Prepare stagger items ---------- */
  function prepare(slide) {
    slide.querySelectorAll('.apple-walk-headline').forEach((t) => splitTitle(t));
    const all = Array.from(slide.querySelectorAll(ITEM_SEL));
    const tops = new Map();
    let k = 0, last = 0, maxChars = 0;

    for (const el of all) {
      let anc = null;
      for (let p = el.parentElement; p && p !== slide; p = p.parentElement) {
        if (tops.has(p)) { anc = p; break; }
      }

      if (el.classList.contains('slide-title') || el.classList.contains('cover-title')) {
        const chars = splitTitle(el);
        maxChars = Math.max(maxChars, chars);
        addCls(el, 'm-title');
        remCls(el, 'm-item');
        if (anc) {
          el.style.setProperty('--m-i', String(tops.get(anc)));
        } else {
          const st = Math.min(k++, MAX_STEPS - 1);
          tops.set(el, st);
          el.style.setProperty('--m-i', String(st));
          last = Math.max(last, st);
        }
        continue;
      }

      if (anc) { remCls(el, 'm-item'); continue; }

      const st = Math.min(k++, MAX_STEPS - 1);
      tops.set(el, st);
      addCls(el, 'm-item');
      el.style.setProperty('--m-i', String(st));
      last = Math.max(last, st);
    }

    return { total: last * STEP + DUR + maxChars * CHAR_STEP + 300 };
  }

  /* ---------- Progress bar ---------- */
  function ensureProgress() {
    progressEl = document.getElementById('deck-progress');
    if (!progressEl) {
      progressEl = document.createElement('div');
      progressEl.id = 'deck-progress';
      progressEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(progressEl);
    }
  }
  function updateProgress(idx) {
    if (!progressEl || !slides.length) return;
    progressEl.style.width = (((idx + 1) / slides.length) * 100).toFixed(3) + '%';
  }

  /* ---------- Page number flash ---------- */
  function flashPg(slide) {
    let pgs = Array.from(slide.querySelectorAll('.pg'));
    if (!pgs.length) pgs = Array.from(document.querySelectorAll('.pg')).filter((p) => !p.closest('.slide'));
    pgs.forEach((pg) => {
      pg.classList.remove('m-pg-flash');
      void pg.offsetWidth;
      pg.classList.add('m-pg-flash');
    });
  }

  /* ---------- Count-up ---------- */
  function parseCount(el) {
    const src = String(el.dataset.countup || '').trim();
    const raw = src.replace(/,/g, '');
    const value = parseFloat(raw);
    if (!isFinite(value)) return null;
    const decPart = (raw.split('.')[1] || '').match(/^\d*/)[0];
    return {
      value,
      dec: decPart.length,
      group: src.indexOf(',') !== -1 || el.hasAttribute('data-countup-group'),
      prefix: el.dataset.countupPrefix || '',
      suffix: el.dataset.countupSuffix || ''
    };
  }
  function fmt(spec, n) {
    return spec.prefix + n.toLocaleString('en-US', {
      minimumFractionDigits: spec.dec,
      maximumFractionDigits: spec.dec,
      useGrouping: spec.group
    }) + spec.suffix;
  }
  function finishCountups(slide) {
    slide.querySelectorAll('[data-countup]').forEach((el) => {
      const spec = parseCount(el);
      cuTokens.set(el, {});
      if (spec) el.textContent = fmt(spec, spec.value);
    });
  }
  function runCountups(slide) {
    slide.querySelectorAll('[data-countup]').forEach((el) => {
      const spec = parseCount(el);
      if (!spec) return;
      const tok = {};
      cuTokens.set(el, tok);
      const host = el.closest('.m-item, .m-title');
      const st = host ? (parseFloat(host.style.getPropertyValue('--m-i')) || 0) : 0;
      el.textContent = fmt(spec, 0);
      setTimeout(() => {
        if (cuTokens.get(el) !== tok) return;
        const t0 = performance.now();
        const step = (now) => {
          if (cuTokens.get(el) !== tok) return;
          const p = Math.min(1, (now - t0) / COUNT_DUR);
          const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
          el.textContent = fmt(spec, spec.value * e);
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = fmt(spec, spec.value);
        };
        requestAnimationFrame(step);
      }, st * STEP + 150);
    });
  }

  /* ---------- Aura drift + parallax ---------- */
  function clearAuras(resetTranslate) {
    auras.forEach((a) => {
      a.el.style.removeProperty('will-change');
      if (resetTranslate) a.el.style.removeProperty('translate');
    });
    auras = [];
  }
  function setupAuras(slide) {
    clearAuras(false);
    if (reduced) return;
    auras = Array.from(slide.querySelectorAll('.spoa-aura-circle')).map((el, i) => {
      el.style.willChange = 'translate';
      return {
        el,
        depth: 8 + ((i * 5) % 13),
        period: 12 + ((i * 2.7) % 6),
        phase: i * 1.9,
        amp: 24 + (i % 3) * 10,
        px: 0,
        py: 0
      };
    });
    auraStart = performance.now();
    ensureLoop();
  }

  /* ---------- Tilt + glow ---------- */
  function prepGlow(el) {
    addCls(el, 'm-glow');
    if (getComputedStyle(el).position === 'static') addCls(el, 'm-rel');
  }
  function release(el) {
    if (!el) return;
    const s = tilts.get(el);
    if (s) { s.hover = false; s.tx = 0; s.ty = 0; }
    el.style.setProperty('--m-glow', '0');
    ensureLoop();
  }
  function releaseAll() {
    tilts.forEach((s, el) => {
      el.style.transform = s.orig;
      el.style.removeProperty('will-change');
      el.style.setProperty('--m-glow', '0');
    });
    tilts.clear();
    hoverEl = null;
  }

  function onPointerMove(e) {
    mouse.nx = (e.clientX / (window.innerWidth || 1)) * 2 - 1;
    mouse.ny = (e.clientY / (window.innerHeight || 1)) * 2 - 1;
    if (reduced || !root.classList.contains('motion-ready')) return;

    const t = e.target instanceof Element ? e.target : null;
    const el = t ? t.closest(TILT_SEL) : null;
    const valid = el && current && current.contains(el) ? el : null;

    if (hoverEl && hoverEl !== valid) release(hoverEl);
    hoverEl = valid;
    if (!valid) return;

    let s = tilts.get(valid);
    if (!s) {
      prepGlow(valid);
      s = { rx: 0, ry: 0, tx: 0, ty: 0, hover: true, orig: valid.style.transform };
      tilts.set(valid, s);
    }
    s.hover = true;

    const r = valid.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = clamp((e.clientY - r.top) / r.height, 0, 1);

    valid.style.setProperty('--mx', (px * 100).toFixed(2) + '%');
    valid.style.setProperty('--my', (py * 100).toFixed(2) + '%');
    valid.style.setProperty('--m-glow', '1');

    const blocked = e.buttons !== 0 ||
      (t && t.closest(BLOCK_SEL)) ||
      valid.closest('[data-no-nav]') ||
      valid.querySelector(NO_TILT_INNER);

    s.tx = blocked ? 0 : (0.5 - py) * 2 * MAX_TILT;
    s.ty = blocked ? 0 : (px - 0.5) * 2 * MAX_TILT;
    ensureLoop();
  }
  function onPointerDown() {
    if (!hoverEl) return;
    const s = tilts.get(hoverEl);
    if (s) { s.tx = 0; s.ty = 0; ensureLoop(); }
  }
  function onPointerLeave() {
    if (hoverEl) release(hoverEl);
    hoverEl = null;
    mouse.nx = 0;
    mouse.ny = 0;
  }

  /* ---------- Shared rAF loop ---------- */
  function ensureLoop() {
    if (!loopId && !reduced && (tilts.size || auras.length)) loopId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (loopId) cancelAnimationFrame(loopId);
    loopId = 0;
  }
  function tick(now) {
    loopId = 0;

    tilts.forEach((s, el) => {
      if (!el.isConnected) { tilts.delete(el); return; }
      s.rx += (s.tx - s.rx) * 0.12;
      s.ry += (s.ty - s.ry) * 0.12;
      if (!s.hover && Math.abs(s.rx) < 0.01 && Math.abs(s.ry) < 0.01) {
        el.style.transform = s.orig;
        el.style.removeProperty('will-change');
        tilts.delete(el);
        return;
      }
      el.style.willChange = 'transform';
      el.style.transform = 'perspective(1000px) rotateX(' + s.rx.toFixed(3) + 'deg) rotateY(' + s.ry.toFixed(3) + 'deg)';
    });

    if (auras.length) {
      const t = now / 1000;
      const rp = clamp((now - auraStart) / 1500, 0, 1);
      const ramp = 1 - Math.pow(1 - rp, 3);
      for (const a of auras) {
        if (!a.el.isConnected) continue;
        a.px += (-mouse.nx * a.depth - a.px) * 0.05;
        a.py += (-mouse.ny * a.depth - a.py) * 0.05;
        const w = (Math.PI * 2) / a.period;
        const x = Math.sin(t * w + a.phase) * a.amp * ramp + a.px;
        const y = Math.cos(t * (w / 1.27) + a.phase) * a.amp * 0.7 * ramp + a.py;
        a.el.style.translate = x.toFixed(2) + 'px ' + y.toFixed(2) + 'px';
      }
    }

    ensureLoop();
  }

  /* ---------- Slide enter ---------- */
  function enter(slide) {
    const idx = slides.indexOf(slide);
    const dir = (prevIdx < 0 || idx >= prevIdx) ? 1 : -1;
    prevIdx = idx;

    if (current && current !== slide) {
      remCls(current, 'm-in');
      remCls(current, 'm-done');
      releaseAll();
    }
    current = slide;

    updateProgress(idx);
    flashPg(slide);
    setupAuras(slide);

    if (reduced || !root.classList.contains('motion-ready')) {
      finishCountups(slide);
      return;
    }

    const info = prepare(slide);
    slide.style.setProperty('--m-dx', dir > 0 ? '24px' : '-24px');

    clearTimeout(doneTimer);
    if (enterRaf) cancelAnimationFrame(enterRaf);
    remCls(slide, 'm-in');
    remCls(slide, 'm-done');
    void slide.offsetWidth;

    enterRaf = requestAnimationFrame(() => {
      enterRaf = 0;
      if (current !== slide) return;
      slide.classList.add('m-in');
      doneTimer = setTimeout(() => {
        if (current === slide) addCls(slide, 'm-done');
      }, info.total);
    });

    runCountups(slide);
  }

  function sync(preferred) {
    try {
      const actives = slides.filter((s) => s.classList.contains('active'));
      if (!actives.length) return;
      const target = (preferred && actives.indexOf(preferred) !== -1)
        ? preferred
        : (actives.find((s) => s !== current) || actives[0]);
      if (target === current) return;
      enter(target);
    } catch (err) {
      root.classList.remove('motion-ready');
      if (window.console) console.warn('[motion]', err);
    }
  }

  function onSlideChange(e) {
    const d = e && e.detail;
    sync(d && d.slide instanceof Element ? d.slide : null);
  }

  function onReducedChange(e) {
    reduced = !!e.matches;
    if (reduced) {
      root.classList.remove('motion-ready');
      stopLoop();
      releaseAll();
      clearAuras(true);
      slides.forEach((s) => { remCls(s, 'm-in'); remCls(s, 'm-done'); });
      if (current) finishCountups(current);
    } else {
      root.classList.add('motion-ready');
      const c = current;
      current = null;
      if (c && c.classList.contains('active')) enter(c);
      else sync();
    }
  }

  /* ---------- Init ---------- */
  function init() {
    deck = document.querySelector('.deck-container');
    if (!deck) return;
    slides = Array.from(deck.querySelectorAll('.slide'));
    if (!slides.length) return;

    ensureProgress();

    document.addEventListener('slidechange', onSlideChange);
    window.addEventListener('slidechange', onSlideChange);

    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('mousemove', onPointerMove, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    root.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave);

    if ('MutationObserver' in window) {
      const mo = new MutationObserver(() => sync());
      slides.forEach((s) => mo.observe(s, { attributes: true, attributeFilter: ['class'] }));
    }

    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onReducedChange);
      else if (mq.addListener) mq.addListener(onReducedChange);
    }

    if (!reduced) root.classList.add('motion-ready');
    sync();
  }

  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  } catch (err) {
    root.classList.remove('motion-ready');
    if (window.console) console.warn('[motion]', err);
  }
})();
