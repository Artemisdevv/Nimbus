// Stars twinkling background for midnight theme
// Generates star elements inside #atmosphere and applies random twinkle animation.
// Adds occasional shooting stars (every 30–60s).

(function () {
  const atmosphere = document.getElementById('atmosphere');
  if (!atmosphere) return;

  function isMidnight() {
    return document.documentElement.dataset.theme === 'midnight';
  }

  function createStar() {
    const star = document.createElement('div');
    star.className = 'star';
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const size = 1 + Math.random() * 1.5;
    const baseOpacity = 0.3 + Math.random() * 0.7;
    const duration = 5 + Math.random() * 25;
    const delay = Math.random() * duration;

    star.style.cssText = `
      position: absolute;
      left: ${x}%;
      top: ${y}%;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: #fff;
      opacity: ${baseOpacity};
      pointer-events: none;
      animation: twinkle ${duration}s ease-in-out ${delay}s infinite alternate;
      will-change: opacity;
    `;
    return star;
  }

  function injectKeyframes() {
    if (document.getElementById('star-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'star-keyframes';
    style.textContent = `
      @keyframes twinkle {
        0%   { opacity: 0.15; transform: scale(1); }
        50%  { opacity: 1;    transform: scale(1.2); }
        100% { opacity: 0.15; transform: scale(1); }
      }
      @keyframes shooting-star {
        0%   { opacity: 0;   transform: translate3d(0, 0, 0) scale(1); }
        10%  { opacity: 1;   transform: translate3d(-8vw, 8vh, 0) scale(1); }
        90%  { opacity: 1;   transform: translate3d(-85vw, 85vh, 0) scale(0.5); }
        100% { opacity: 0;   transform: translate3d(-95vw, 95vh, 0) scale(0); }
      }
    `;
    document.head.appendChild(style);
  }

  function initStars() {
    if (!isMidnight()) return;
    injectKeyframes();
    const count = 40;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) fragment.appendChild(createStar());
    atmosphere.appendChild(fragment);
  }

  // Shooting star
  function spawnShootingStar() {
    if (!isMidnight()) return;
    const el = document.createElement('div');
    el.className = 'shooting-star';
    // Start from random top-right area
    const startX = 70 + Math.random() * 30; // 70-100%
    const startY = 0 + Math.random() * 30;  // 0-30%
    const duration = 1.2 + Math.random() * 0.8; // 1.2-2s
    el.style.cssText = `
      position: absolute;
      left: ${startX}%;
      top: ${startY}%;
      width: 2px;
      height: 2px;
      border-radius: 50%;
      background: linear-gradient(135deg, #fff, #a8c0ff);
      box-shadow: 0 0 6px #fff, 0 0 12px #a8c0ff;
      pointer-events: none;
      animation: shooting-star ${duration}s ease-out forwards;
      will-change: transform, opacity;
    `;
    atmosphere.appendChild(el);
    setTimeout(() => el.remove(), duration * 1000);
    // Schedule next
    scheduleNext();
  }

  let shootTimer = null;
  function scheduleNext() {
    if (shootTimer) clearTimeout(shootTimer);
    const interval = 30000 + Math.random() * 30000; // 30-60s
    shootTimer = setTimeout(spawnShootingStar, interval);
  }

  // Theme observer
  const observer = new MutationObserver(() => {
    atmosphere.querySelectorAll('.star, .shooting-star').forEach(s => s.remove());
    if (shootTimer) { clearTimeout(shootTimer); shootTimer = null; }
    if (isMidnight()) {
      initStars();
      scheduleNext();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Visibility
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (shootTimer) { clearTimeout(shootTimer); shootTimer = null; }
    } else if (isMidnight()) {
      scheduleNext();
    }
  });

  // Initial
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (isMidnight()) { initStars(); scheduleNext(); }
    });
  } else {
    if (isMidnight()) { initStars(); scheduleNext(); }
  }
})();