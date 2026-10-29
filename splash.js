/**
 * dsh-intro-animation — the boot splash (启动画面) that paints *before* the app does.
 *
 * A Client module cannot exist before the shell mounts, so the pre-mount surface has
 * to come from the served index document instead. `@deepseek-ai/dsh-host-webserver`
 * owns that seam: every index render emits `webserver/index-inject` with a table of
 * rows, and each row is applied in array order by whoever owns index serving.
 *
 * Contract facts this file depends on (see `lib/injections.js` of dsh-video-skin, which
 * this pattern is modelled on, and `renderIndexInjections` in dsh-host-webserver):
 *
 *   ① Rows apply in array order — no sorting by kind — so the `style` row must precede
 *      the `script` row that builds the DOM.
 *   ② `kind: 'script-src'` is a *deferred load* on some surfaces: a failed load rejects
 *      the boot readiness gate and the whole app never starts. Only `kind: 'script'`
 *      is used here (createElement + textContent + append: no await, no failure path).
 *   ③ `placement` only picks head vs body for `script`/`html`; `style` always lands in head.
 *   ④ The Electron shell collects this table once at host startup and hands the rows to
 *      a page-side interpreter before the app mounts — so editing this file needs a
 *      harness restart, not just a page reload.
 *
 * Fail-open by construction: no CSS hides anything on its own and the script never
 * throws out of the IIFE. If the script dies early the result is "no splash", never a
 * covered window. If it dies after mounting, the `holdMs` timer still tears it down.
 */

/** Route prefix the Host half serves the media under. */
export const ROUTE_PREFIX = '/dsh-intro-animation'

/** sessionStorage key shared with the Client half: set once the animation has played. */
export const SESSION_KEY = 'dsh.intro-animation.shown.v3'

/** sessionStorage marker: a boot splash owns this page load, so the overlay stays out. */
export const BOOT_KEY = 'dsh.intro-animation.booting'

/** Fade-out duration; also used for the Client half's own transition. */
export const FADE_MS = 560

/** Splash stylesheet (single `style` row, always rendered into head). */
export const SPLASH_CSS = `
#dsi-boot{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
background:radial-gradient(130% 100% at 50% 38%,#0f1a33 0%,#080c17 46%,#04060c 100%);
opacity:1;transition:opacity ${FADE_MS}ms ease;cursor:pointer;-webkit-user-select:none;user-select:none;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;color:#eaf3ff}
#dsi-boot[data-state="leaving"]{opacity:0;pointer-events:none}
#dsi-boot .dsi-boot-card{position:relative;height:min(86vh,1100px);aspect-ratio:3/4;border-radius:20px;
overflow:hidden;background:#05070d;
box-shadow:0 28px 90px rgba(0,0,0,.7),0 0 0 1px rgba(122,186,255,.2),0 0 90px rgba(64,150,255,.16)}
#dsi-boot video{display:block;width:100%;height:100%;object-fit:cover;background:#05070d}
#dsi-boot .dsi-boot-skip{position:absolute;top:14px;right:14px;display:flex;align-items:center;gap:6px;
padding:6px 12px;border-radius:999px;font-size:12px;line-height:1.4;letter-spacing:.02em;
background:rgba(8,13,26,.55);border:1px solid rgba(150,200,255,.26);backdrop-filter:blur(10px)}
#dsi-boot .dsi-boot-bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(140,190,255,.18)}
#dsi-boot .dsi-boot-fill{height:100%;width:100%;transform:scaleX(0);transform-origin:0 50%;
background:linear-gradient(90deg,#59c8ff,#4d6bfe,#8f5bff)}
html.dsi-boot,html.dsi-boot body{overflow:hidden!important}
@media (max-width:520px){#dsi-boot .dsi-boot-card{height:auto;width:92vw;border-radius:16px}}
`.trim()

/**
 * Splash runtime (single `script` row, placement `body`).
 *
 * Plain ES5 with no imports: it runs before any application code, inside whatever frame
 * the index document lives in, and must never assume a bundler, a module system or a
 * populated DOM.
 */
export const SPLASH_SCRIPT = `
(function () {
  try {
    var KEY = ${JSON.stringify(SESSION_KEY)};
    var BOOT = ${JSON.stringify(BOOT_KEY)};
    var FADE = ${FADE_MS};
    var HOLD_MS = 15000;
    var NO_FRAME_MS = 7000;
    var VIDEO = ${JSON.stringify(ROUTE_PREFIX + '/video')};
    var POSTER = ${JSON.stringify(ROUTE_PREFIX + '/poster')};

    var doc = document;
    var store = null;
    try { store = window.sessionStorage; } catch (e) { store = null; }

    function flag(key) {
      try { return store !== null && store.getItem(key) === '1'; } catch (e) { return false; }
    }
    function mark(key, on) {
      try {
        if (store === null) return;
        if (on) store.setItem(key, '1'); else store.removeItem(key);
      } catch (e) {}
    }

    // Already played in this browser session, or the user asked for less motion.
    if (flag(KEY)) return;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        mark(KEY, true);
        return;
      }
    } catch (e) {}
    mark(BOOT, true);

    var done = false;
    var started = false;
    var holdTimer = null;
    var frameTimer = null;

    function node(tag, cls, text) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    function close() {
      if (done) return;
      done = true;
      if (holdTimer !== null) clearTimeout(holdTimer);
      if (frameTimer !== null) clearTimeout(frameTimer);
      mark(KEY, true);
      mark(BOOT, false);
      try { doc.removeEventListener('keydown', onKey, false); } catch (e) {}
      try { doc.documentElement.classList.remove('dsi-boot'); } catch (e) {}
      var host = doc.getElementById('dsi-boot');
      if (!host) return;
      host.setAttribute('data-state', 'leaving');
      setTimeout(function () {
        try { if (host.parentNode) host.parentNode.removeChild(host); } catch (e) {}
      }, FADE + 80);
    }

    function onKey(event) {
      var key = event && event.key;
      if (key === 'Escape' || key === 'Esc') close();
    }

    function mount() {
      if (doc.getElementById('dsi-boot')) return;
      var body = doc.body;
      if (!body) return;

      var host = doc.createElement('div');
      host.id = 'dsi-boot';
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-label', '开场动画');

      var card = node('div', 'dsi-boot-card');
      var video = node('video');
      video.setAttribute('src', VIDEO);
      video.setAttribute('poster', POSTER);
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('preload', 'auto');
      video.muted = true;
      video.defaultMuted = true;

      var bar = node('div', 'dsi-boot-bar');
      var fill = node('div', 'dsi-boot-fill');
      bar.appendChild(fill);

      var skip = node('div', 'dsi-boot-skip');
      skip.appendChild(node('span', null, '跳过'));
      skip.appendChild(node('span', null, '✕'));

      card.appendChild(video);
      card.appendChild(bar);
      card.appendChild(skip);
      host.appendChild(card);

      host.addEventListener('click', close, false);
      doc.addEventListener('keydown', onKey, false);
      body.appendChild(host);
      try { doc.documentElement.classList.add('dsi-boot'); } catch (e) {}

      // Absolute safety net: whatever happens below, the window is uncovered again.
      holdTimer = setTimeout(close, HOLD_MS);
      // Nothing decoded at all — do not sit on a still frame until the hold expires.
      frameTimer = setTimeout(function () { if (!started) close(); }, NO_FRAME_MS);

      video.addEventListener('playing', function () { started = true; }, false);
      video.addEventListener('timeupdate', function () {
        try {
          if (video.duration > 0) {
            fill.style.transform = 'scaleX(' + Math.min(1, video.currentTime / video.duration).toFixed(4) + ')';
          }
        } catch (e) {}
      }, false);
      video.addEventListener('loadedmetadata', function () {
        // A longer drop-in clip gets its own budget instead of the fixed hold.
        try {
          if (isFinite(video.duration) && video.duration > 0) {
            if (holdTimer !== null) clearTimeout(holdTimer);
            holdTimer = setTimeout(close, Math.min(20000, video.duration * 1000 + 4000));
          }
        } catch (e) {}
      }, false);
      video.addEventListener('ended', close, false);
      video.addEventListener('error', close, false);

      try {
        var played = video.play();
        if (played && typeof played.then === 'function') played.then(null, function () {});
      } catch (e) {}
    }

    if (doc.body) mount();
    else doc.addEventListener('DOMContentLoaded', mount, false);
  } catch (e) {
    // Never let the splash break the boot document.
  }
})();
`.trim()

/**
 * The injection table rows this plugin contributes, in application order.
 * @returns {Array<{ kind: 'style' | 'script', text: string, placement?: 'head' | 'body' }>}
 */
export function buildSplashRows() {
  return [
    { kind: 'style', text: SPLASH_CSS },
    { kind: 'script', placement: 'body', text: SPLASH_SCRIPT },
  ]
}
