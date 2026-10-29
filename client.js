/* eslint-disable */
/**
 * dsh-intro-animation — Client half.
 *
 * Registers one entry into the frame-wide `shell.overlay` slot and plays the opening
 * animation served by the Host half at /dsh-intro-animation/video.
 *
 * Behaviour:
 *  - plays once per browser tab session (sessionStorage), so a refresh or an HMR
 *    reload never replays it; open a new tab, or load the page with `#intro`
 *    (`.../#intro` or `?intro=1`), to see it again;
 *  - skippable with the button, `Esc`, or by clicking the backdrop;
 *  - closes by itself when the video ends or fails, and never traps the user:
 *    if playback is blocked it offers a play button instead of hanging.
 */
window.__ModuleLoader__.load({
  id: 'dsh-intro-animation',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect } = React

    const NAME = 'dsh-intro-animation'
    const SLOT = 'shell.overlay'
    const SLOT_ID = 'intro-animation'
    // Bump the suffix when the animation should play once more for people who have
    // already seen the previous one (the stored flag lives in sessionStorage).
    const SESSION_KEY = 'dsh.intro-animation.shown.v2'
    const FADE_OUT_MS = 520
    const CSS_TAG = 'dsh-intro-animation/style.css'

    /** Root-absolute media URLs on this Host's web server. */
    function mediaUrl(leaf) {
      const path = '/dsh-intro-animation/' + leaf
      try {
        return new URL(path, document.baseURI).href
      } catch (error) {
        return path
      }
    }
    const VIDEO_URL = mediaUrl('video')
    const POSTER_URL = mediaUrl('poster')

    const DICTIONARY = {
      en: { skip: 'Skip', play: 'Play', intro: 'Opening animation' },
      zh: { skip: '跳过', play: '播放', intro: '开场动画' },
    }

    function log(...values) {
      try {
        if (typeof console !== 'undefined' && console.warn) console.warn('[' + NAME + ']', ...values)
      } catch (error) {
        /* never let logging break the render */
      }
    }

    /** Should this page load start the intro? */
    function shouldPlay() {
      try {
        if (String(window.location.hash || '') === '#intro') return true
        if (String(window.location.search || '').indexOf('intro=1') >= 0) return true
        return window.sessionStorage.getItem(SESSION_KEY) !== '1'
      } catch (error) {
        return true
      }
    }

    function markShown() {
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1')
      } catch (error) {
        /* private mode: replaying every load is the safe fallback */
      }
    }

    /**
     * Translate through the Client locale service when it is available, and fall back
     * to the browser language otherwise (three strings are not worth a hard dependency).
     */
    function makeTranslator(ctx) {
      const fallback =
        String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase().indexOf('zh') === 0
          ? DICTIONARY.zh
          : DICTIONARY.en
      const read = (key) => (fallback[key] === undefined ? key : fallback[key])
      let locale
      try {
        locale = ctx.get('locale')
      } catch (error) {
        locale = undefined
      }
      if (!locale) return read
      if (typeof locale.register === 'function') {
        for (const id of ['en', 'zh-CN', 'zh']) {
          const dict = id.indexOf('zh') === 0 ? DICTIONARY.zh : DICTIONARY.en
          ctx.effect(() => {
            try {
              return locale.register(NAME, id, dict)
            } catch (error) {
              return () => {}
            }
          }, NAME + ': locale ' + id)
        }
      }
      if (typeof locale.bind !== 'function') return read
      let bound
      try {
        bound = locale.bind(NAME)
      } catch (error) {
        return read
      }
      return (key) => {
        let value
        try {
          value = bound(key)
        } catch (error) {
          value = undefined
        }
        return typeof value === 'string' && value && value !== key ? value : read(key)
      }
    }

    /** Play triangle, drawn inline so the bundle needs no icon package. */
    function playIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 26, height: 26, 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M8 5.2v13.6L19.4 12z', fill: 'currentColor' }),
      )
    }

    function closeIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 11, height: 11, 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M3.2 3.2l9.6 9.6M12.8 3.2l-9.6 9.6',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          fill: 'none',
        }),
      )
    }

    /** All styles for this overlay. Chrome uses theme tokens; the video keeps its own colours. */
    const CSS = [
      '.dsi-root{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;',
      'font-family:inherit;color:var(--dsw-alias-label-primary,#e8eaf2);pointer-events:auto;opacity:0;',
      'transition:opacity 380ms ease;isolation:isolate}',
      '.dsi-root[data-phase="live"]{opacity:1}',
      '.dsi-root[data-phase="out"]{opacity:0;transition-duration:' + FADE_OUT_MS + 'ms}',
      '.dsi-backdrop{position:absolute;inset:0;background:var(--dsw-alias-bg-base,#0b0f1a);',
      'background:radial-gradient(58% 46% at 50% 38%,color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 24%,transparent),transparent 72%),',
      'var(--dsw-alias-bg-base,#0b0f1a)}',
      '.dsi-card{position:relative;height:min(84vh,760px);aspect-ratio:3/4;max-width:92vw;border-radius:22px;',
      'overflow:hidden;background:#05080f;transform:translateY(12px) scale(.972);opacity:0;',
      'box-shadow:0 30px 90px -24px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.07) inset;',
      'transition:transform 620ms cubic-bezier(.16,.84,.3,1),opacity 460ms ease}',
      '.dsi-root[data-phase="live"] .dsi-card{transform:none;opacity:1}',
      '.dsi-video{display:block;width:100%;height:100%;object-fit:cover;background:#05080f}',
      '.dsi-bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.12)}',
      '.dsi-bar>i{display:block;height:100%;transform-origin:left center;transform:scaleX(0);',
      'background:var(--dsw-alias-brand-primary,#4d6bfe);transition:transform 160ms linear}',
      '.dsi-skip{position:absolute;top:22px;right:22px;display:inline-flex;align-items:center;gap:7px;',
      'padding:8px 14px;border-radius:999px;cursor:pointer;font:inherit;font-size:12px;line-height:1;',
      'letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#c8cddd);',
      'border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.18));',
      'background:var(--dsw-alias-bg-overlay,rgba(18,22,34,.78));backdrop-filter:blur(10px);',
      'transition:color 160ms,border-color 160ms}',
      '.dsi-skip:hover{color:var(--dsw-alias-label-primary,#fff);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.4))}',
      '.dsi-skip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
      '.dsi-play{position:absolute;inset:0;display:grid;place-items:center;border:0;padding:0;cursor:pointer;',
      'background:transparent;color:#fff}',
      '.dsi-play>span{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;',
      'background:rgba(8,12,22,.55);border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(6px);',
      'padding-left:4px;transition:transform 180ms ease,background 180ms ease}',
      '.dsi-play:hover>span{transform:scale(1.06);background:rgba(8,12,22,.72)}',
      '.dsi-play:focus-visible>span{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:3px}',
      '@media (prefers-reduced-motion:reduce){.dsi-root,.dsi-card,.dsi-bar>i,.dsi-play>span{transition:none!important}',
      '.dsi-card{transform:none}}',
    ].join('')

    /**
     * Insert this package's stylesheet once. Prefers the platform `styles` module and
     * falls back to a tagged <style> element (removed again on dispose) when it is not
     * part of the shared module table.
     * @returns {() => void} disposer
     */
    function installStyles() {
      let stylesModule
      try {
        stylesModule = require('styles')
      } catch (error) {
        stylesModule = undefined
      }
      if (stylesModule && typeof stylesModule.insert === 'function') {
        const dispose = stylesModule.insert(CSS)
        return typeof dispose === 'function' ? dispose : () => {}
      }
      if (typeof document === 'undefined' || !document.head) return () => {}
      if (document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]')) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = NAME
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        if (tag.parentNode) tag.parentNode.removeChild(tag)
      }
    }

    /**
     * @param {any} ctx Client Cordis context.
     */
    function apply(ctx) {
      const t = makeTranslator(ctx)
      ctx.effect(installStyles, NAME + ': styles')

      // One overlay instance exists at a time; this keeps the <video> element
      // reachable from the play button without an extra hook.
      let videoElement = null

      function IntroOverlay() {
        const [phase, setPhase] = useState(() => (shouldPlay() ? 'enter' : 'gone'))
        const [progress, setProgress] = useState(0)
        const [needsGesture, setNeedsGesture] = useState(false)
        // Mutable per-instance flags, readable from timers and handlers without
        // re-running effects.
        const [flags] = useState(() => ({ metadata: false, played: false, closed: false }))

        const close = () => {
          if (flags.closed) return
          flags.closed = true
          if (videoElement) {
            try {
              videoElement.pause()
            } catch (error) {
              /* ignore */
            }
          }
          setPhase((current) => (current === 'gone' || current === 'out' ? current : 'out'))
        }

        // enter -> live one tick later, so the CSS transition has a start value.
        useEffect(() => {
          if (phase !== 'enter') return undefined
          const id = window.setTimeout(() => setPhase((current) => (current === 'enter' ? 'live' : current)), 40)
          return () => window.clearTimeout(id)
        }, [phase])

        // out -> gone (unmount).
        useEffect(() => {
          if (phase !== 'out') return undefined
          const id = window.setTimeout(() => setPhase('gone'), FADE_OUT_MS + 40)
          return () => window.clearTimeout(id)
        }, [phase])

        // Start playback once the element exists.
        useEffect(() => {
          if (phase !== 'enter' && phase !== 'live') return undefined
          const element = videoElement
          if (!element) return undefined
          try {
            element.muted = true
            const attempt = element.play()
            if (attempt && typeof attempt.catch === 'function') {
              attempt.catch((error) => {
                log('autoplay blocked', error && error.message)
                setNeedsGesture(true)
              })
            }
          } catch (error) {
            setNeedsGesture(true)
          }
          return undefined
        }, [phase])

        // Leave the user a way out: Esc skips, exactly like the button.
        useEffect(() => {
          if (phase === 'gone' || phase === 'out') return undefined
          const onKey = (event) => {
            if (event.key === 'Escape' || event.key === 'Esc') close()
          }
          window.addEventListener('keydown', onKey)
          return () => window.removeEventListener('keydown', onKey)
        }, [phase])

        // Never trap the page behind a video that will not load.
        useEffect(() => {
          if (phase !== 'enter' && phase !== 'live') return undefined
          const id = window.setTimeout(() => {
            if (!flags.metadata) {
              log('video metadata did not arrive in time')
              close()
            } else if (!flags.played) {
              setNeedsGesture(true)
            }
          }, 4000)
          return () => window.clearTimeout(id)
        }, [phase])

        if (phase === 'gone') return null

        const onPlaying = () => {
          flags.played = true
          setNeedsGesture(false)
          markShown()
        }
        const onLoadedMetadata = () => {
          flags.metadata = true
        }
        const onTimeUpdate = (event) => {
          const element = event.currentTarget
          const duration = element && element.duration
          if (!duration || !isFinite(duration)) return
          const ratio = element.currentTime / duration
          setProgress(ratio > 1 ? 1 : ratio < 0 ? 0 : ratio)
        }
        const requestPlay = () => {
          const element = videoElement
          if (!element) return
          setNeedsGesture(false)
          try {
            const attempt = element.play()
            if (attempt && typeof attempt.catch === 'function') {
              attempt.catch(() => setNeedsGesture(true))
            }
          } catch (error) {
            setNeedsGesture(true)
          }
        }

        return h(
          'div',
          {
            className: 'dsi-root',
            'data-phase': phase,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('intro'),
          },
          h('div', { className: 'dsi-backdrop', 'aria-hidden': 'true', onClick: close }),
          h(
            'div',
            { className: 'dsi-card' },
            h('video', {
              ref: (element) => {
                videoElement = element
                if (element) element.muted = true
              },
              className: 'dsi-video',
              src: VIDEO_URL,
              poster: POSTER_URL,
              autoPlay: true,
              muted: true,
              playsInline: true,
              preload: 'auto',
              controls: false,
              disablePictureInPicture: true,
              onPlaying,
              onLoadedMetadata,
              onTimeUpdate,
              onEnded: close,
              onError: () => {
                log('video failed to load', VIDEO_URL)
                close()
              },
            }),
            needsGesture
              ? h(
                  'button',
                  {
                    className: 'dsi-play',
                    type: 'button',
                    'aria-label': t('play'),
                    title: t('play'),
                    onClick: requestPlay,
                  },
                  h('span', null, playIcon()),
                )
              : null,
            h(
              'div',
              { className: 'dsi-bar', 'aria-hidden': 'true' },
              h('i', { style: { transform: 'scaleX(' + progress + ')' } }),
            ),
          ),
          h(
            'button',
            { className: 'dsi-skip', type: 'button', title: t('skip'), onClick: close },
            h('span', null, t('skip')),
            closeIcon(),
          ),
        )
      }

      ctx.slots.inject(SLOT, function* () {
        yield ctx.slots.register({ name: SLOT, id: SLOT_ID, order: 40, label: () => t('intro') }, IntroOverlay)
      })
    }

    return { apply, inject: ['slots'], name: NAME }
  },
})
