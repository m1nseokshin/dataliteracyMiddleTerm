// deck.js — 슬라이드 이동 (좌우 키 · 마우스 휠) + 1번 슬라이드 예외적 Apple 웹 스크롤 인터랙션 + 1920×1080 캔버스 축소

document.addEventListener("DOMContentLoaded", () => {
  const slides = [...document.querySelectorAll(".slide")];
  const total = slides.length;
  const deck = document.querySelector(".deck-container");
  let current = 0;

  // 높이 1080 기준으로 맞추고, 16:9보다 가로가 넓은 화면은 캔버스 폭을 늘려 채운다
  function fitDeck() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const wide = vw / vh > 1920 / 1080;
    const scale = wide ? vh / 1080 : vw / 1920;
    deck.style.setProperty("--deck-scale", scale);
    deck.style.setProperty("--deck-w", (wide ? vw / scale : 1920) + "px");
  }
  window.addEventListener("resize", fitDeck);
  fitDeck();

  // 페이지 번호
  slides.forEach((slide, i) => {
    const pg = slide.querySelector(".ft .pg");
    if (pg) pg.textContent = `${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  });

  // ===== Apple 웹 스크롤 컨트롤러 (1번 표지 <-> 아래에서 올라오는 걷는 모션 문제제기) =====
  const appleSlide = slides[0];
  let sp = 0;         // 현재 렌더링 진행도 (0 = 표지, 1 = 풀스크린 걷는 모션 문제제기)
  let targetSp = 0;   // 목표 진행도
  let spRaf = 0;
  let snapTimer = 0;
  let settleHoldUntil = 0;

  function applySp(val) {
    sp = Math.max(0, Math.min(1, val));
    if (!appleSlide) return;
    appleSlide.style.setProperty("--sp", sp.toFixed(4));
    const revealed = sp > 0.52;
    if (appleSlide.classList.contains("walk-revealed") !== revealed) {
      appleSlide.classList.toggle("walk-revealed", revealed);
      const vid = appleSlide.querySelector(".apple-walk-video");
      if (vid && revealed) vid.play().catch(() => {});
    }
  }

  function tickSp() {
    spRaf = 0;
    const diff = targetSp - sp;
    if (Math.abs(diff) < 0.0015) {
      applySp(targetSp);
      return;
    }
    // 부드러운 감쇠 스프링 (1.3배 여유 있는 호흡)
    applySp(sp + diff * 0.105);
    spRaf = requestAnimationFrame(tickSp);
  }

  function animateSpTo(nextTarget, holdMs = 750) {
    targetSp = Math.max(0, Math.min(1, nextTarget));
    settleHoldUntil = performance.now() + holdMs;
    if (!spRaf) spRaf = requestAnimationFrame(tickSp);
  }

  function setSpImmediate(val) {
    if (spRaf) { cancelAnimationFrame(spRaf); spRaf = 0; }
    clearTimeout(snapTimer);
    targetSp = val;
    applySp(val);
  }

  function go(index, opts = {}) {
    if (index < 0 || index >= total) return;
    clearTimeout(snapTimer);
    settleHoldUntil = performance.now() + 850;
    const prev = current;
    slides.forEach((slide, i) => {
      slide.classList.toggle("active", i === index);
      if (i !== index) slide.classList.remove("from-vertical-scroll");
    });
    current = index;

    if (index === 0) {
      setSpImmediate(opts.appleSp ?? 0);
    } else if (prev === 0 && index === 1) {
      slides[1].classList.add("from-vertical-scroll");
    }

    history.replaceState(null, "", `#${index + 1}`);
    window.dispatchEvent(new Event("resize")); // 차트 크기 재계산
    document.dispatchEvent(new CustomEvent("slidechange", { detail: { index, slide: slides[index] } }));
  }

  function stepOrGo(delta) {
    if (current === 0 && appleSlide?.dataset.appleScroll === "1") {
      if (delta > 0 && targetSp < 0.95) {
        animateSpTo(1, 900);
        return;
      }
      if (delta < 0 && targetSp > 0.05) {
        animateSpTo(0, 900);
        return;
      }
    }
    if (delta < 0 && current === 1 && appleSlide?.dataset.appleScroll === "1") {
      go(0, { appleSp: 1 });
      settleHoldUntil = performance.now() + 700;
      return;
    }
    go(current + (delta > 0 ? 1 : -1));
  }

  window.goToSlide = go;
  window.stepOrGo = stepOrGo;
  window.getCurrentSlideIndex = () => current;
  window.getAppleScrollProgress = () => sp;

  // 수식 렌더링 (KaTeX auto-render)
  function renderMath() {
    if (window.renderMathInElement) {
      window.renderMathInElement(deck, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        throwOnError: false,
      });
    } else {
      setTimeout(renderMath, 200);
    }
  }
  renderMath();

  // 조작: 방향키 / 스페이스바
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      stepOrGo(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      stepOrGo(-1);
    }
  });

  // 마우스 휠 / 트랙패드 스크롤:
  // 1번 슬라이드에서는 Apple 웹사이트처럼 연속 스크롤 스크럽 + 마그네틱 스냅을 지원하고,
  // 1번 슬라이드 끝(sp=1)에서 한 번 더 스크롤하면 2번 슬라이드로 부드럽게 넘어간다.
  let wheelLock = false;
  document.addEventListener("wheel", (e) => {
    if (e.target.closest("select, [data-no-nav]")) return;
    e.preventDefault();
    const now = performance.now();
    if (wheelLock || now < settleHoldUntil || Math.abs(e.deltaY) < 6) return;

    if (current === 0 && appleSlide?.dataset.appleScroll === "1") {
      // 아직 걷는 모션이 안 올라왔을 때 아래로 스크롤 -> Apple 스크롤 전환 시작 (0 -> 1)
      if (e.deltaY > 0 && targetSp < 0.5) {
        wheelLock = true;
        animateSpTo(1, 950);
        setTimeout(() => { wheelLock = false; }, 950);
        return;
      }
      // 걷는 모션이 올라와 있을 때 위로 스크롤 -> 다시 표지로 복귀 (1 -> 0)
      if (e.deltaY < 0 && targetSp > 0.5) {
        wheelLock = true;
        animateSpTo(0, 950);
        setTimeout(() => { wheelLock = false; }, 950);
        return;
      }
    }

    wheelLock = true;
    stepOrGo(e.deltaY > 0 ? 1 : -1);
    setTimeout(() => { wheelLock = false; }, 850);
  }, { passive: false });

  // 안내 문구 자동 숨김
  const hint = document.getElementById("presentation-hint");
  if (hint) setTimeout(() => { hint.style.opacity = "0"; setTimeout(() => hint.remove(), 600); }, 3500);

  // 시작 슬라이드: URL 해시(#3)가 있으면 그 장부터
  const start = Number(location.hash.slice(1)) - 1;
  go(Number.isInteger(start) && start >= 0 && start < total ? start : 0);
});
