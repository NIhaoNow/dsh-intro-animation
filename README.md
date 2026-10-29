# dsh-intro-animation

A DeepSeek Harness **bundle plugin** that plays a video as the launch animation of the
Web UI: a full-window **boot splash** painted into the served `index.html` *before the
app mounts*, so it is already on screen while the harness itself is still starting.
Skippable, theme-aware, and replaceable with your own clip. A `shell.overlay` entry
plays the same clip as a fallback when the boot path is unavailable.

https://github.com/NIhaoNow/dsh-intro-animation

![The overlay playing the bundled clip](docs/preview.png)

<sub>The overlay as rendered by this plugin's markup and CSS in Chromium, playing the
bundled clip served from the harness route (screenshot taken 2026-10-29).</sub>


- **Client half** registers one entry in the `shell.overlay` slot: a backdrop, a
  vertical 3:4 card, the `<video>`, a progress hairline, and a skip control.
- **Host half** serves the media over the harness `webServer` service at
  `/dsh-intro-animation/*`, because plugin bundles have no static-asset route.
- The bundled clip is a 10 s vertical animation, re-encoded to H.264 + `faststart`
  with the audio track stripped: **810×1080, ~1.0 MiB**, so it loads instantly and
  is small enough to live in git.

## Requirements

- DeepSeek Harness with the Web UI (the plugin targets the `web` client platform).
- Chromium/Electron that can decode H.264 — any stock harness build.
- No network access at runtime: the video ships inside the package.

## Install

From this directory (a local checkout):

```
plugin_manager  action: install_bundle  target: <absolute path to this folder>
```

or, once published, by package spec:

```
plugin_manager  action: install_bundle  target: github:NIhaoNow/dsh-intro-animation
```

The plugin manager owns the profile `package.json` and bundle list — do not edit
those by hand, and do not run a package manager inside the profile. The bundle
activates through the normal client-module reload; if the Web UI was already open,
reload the page.

After installing, confirm the row exists in the Cordis composition (`intro-animation`,
name `dsh-intro-animation`) and that the route answers:

```
curl http://127.0.0.1:53926/dsh-intro-animation/info
```

## When it plays

The clip reaches the screen through two paths, and both use the same file:

| Path | Painted where | Played |
| --- | --- | --- |
| **Boot splash** (default) | into `index.html` as a `style` row and an inline `script` row, before any app code runs | first paint of a page in a tab |
| **Overlay** (fallback) | the `shell.overlay` slot, inside the mounted app | only when the splash did not run |

| Situation | Behaviour |
| --- | --- |
| Launching the app / opening a tab | splash plays before the UI paints |
| Reload inside the same tab | skipped (`sessionStorage`) |
| New tab / new window | plays |
| `…/#intro` or `…/index.html?intro=1` | the overlay always plays (useful for testing) |
| `Esc`, the 跳过 ✕ pill, or a backdrop click | closes immediately |
| Video fails to load or metadata never arrives | closes itself, never traps the UI |
| Autoplay blocked | shows a play button instead of hanging |

Playback is muted, which is what makes browser autoplay policy allow it; there is no
audio track in the bundled clip either. The splash marks `sessionStorage` and the
overlay honours that mark, so the two paths can never double-play one load.

![The boot splash before the app paints](docs/boot.png)

<sub>The splash as the served index executes it: hand-rendered from `SPLASH_CSS` and
`SPLASH_SCRIPT` in Chromium on 2026-10-29, with the app placeholder still hidden behind
it. Same bytes, same row order as the real index.</sub>

### The splash needs one restart

The row table is collected once, when the Host starts (`webserver/index-inject`), so a
freshly installed or upgraded plugin shows up on the **next launch** of the harness —
not after a page reload. The overlay half is client-side and applies on reload.

Two boot animations cannot share a launch: if another plugin paints one too (for
example `dsh-video-skin` with `boot.src` configured), both will stack. Disable one of
them; this plugin's rows are only added when it finds a video to play, so an
uninstalled or disabled bundle contributes nothing.

## Use your own video

Drop files into `$DSH_HOME/dsh-intro-animation/` (on Windows usually
`C:\Users\<you>\.dsh\dsh-intro-animation\`). A user file wins over the bundled one and
is re-resolved per request, so **no restart is needed**:

```
$DSH_HOME/dsh-intro-animation/opening.mp4    # or .webm / .mov / .m4v
$DSH_HOME/dsh-intro-animation/poster.jpg     # optional; .jpeg / .png / .webp also work
```

Encode it into the shipped shape first — H.264 high profile, `yuv420p`, `+faststart`,
video only:

```
node scripts/encode.mjs "C:\path\to\clip.mp4" --poster 0.2
node scripts/encode.mjs clip.mp4 --width 900 --crf 26 --fps 30
```

`--poster <seconds>` also writes `media/poster.jpg` from that timestamp. ffmpeg must be
on `PATH`, or pass `FFMPEG=C:\path\to\ffmpeg.exe`. Keep the clip under ~3 MiB: it is
copied into the profile and rendered before the first frame of chat.

HEVC/H.265 sources will not play reliably in the Electron renderer — re-encode them.

## How it works

```
index.js            Host half: boot-splash rows, webServer prefix route, MIME map, fstat-safe streaming
splash.js           The rows themselves: SPLASH_CSS + the inline bootstrap script
client.js           Client half: shell.overlay entry, video element, lifecycle
cordis.patch.yml    Inserts the `intro-animation` row into the bundle composition
media/opening.mp4   Bundled clip        media/poster.jpg  First-frame poster
locale/{en,zh}.json Plugin title/description shown in Settings
icon.svg            Package icon
scripts/            encode.mjs, smoke.mjs, preview-page.mjs, preview-boot.mjs
```

- The splash is two injection rows in that order — `style`, then an inline `script`.
  Rows are applied in array order and are not sorted, so the stylesheet is in place
  before the script runs. The script row is deliberately `kind: 'script'` (inline text)
  rather than `script-src`: a refused load would take the harness boot down with it,
  while inline text cannot fail.
- The overlay is the frame-wide `shell.overlay` layer, which is click-through by
  default; the root element opts back in with `pointer-events: auto` so the skip
  control and backdrop work.
- Chrome (backdrop, skip button, progress bar) uses harness theme tokens
  (`--dsw-alias-bg-base`, `--dsw-alias-brand-primary`, `--dsw-alias-border-l1/l2`,
  `--dsw-alias-label-*`, `--dsw-alias-bg-overlay`), so light and dark both look right;
  the video keeps its own colours. The splash runs before the tokens exist, so it
  carries its own dark surface and reads the theme only as an enhancement.
- Text goes through the harness locale service (`ctx.get('locale')`) with an
  English/Chinese fallback, so no string is hard-coded into the render path.
- `content-length` is taken from the descriptor the stream actually opened
  (`fstat` on `open`), never from a separate `stat` — a file replaced between the two
  would otherwise declare more bytes than it sends, and the response would neither
  finish nor error.
- `/dsh-intro-animation/info` reports which asset is in use (`bundled` or `user`),
  which is the quickest way to check an override took effect.

## Routes

| Route | Returns |
| --- | --- |
| `/dsh-intro-animation/` or `/info` | JSON: resolved video/poster, source, MIME |
| `/dsh-intro-animation/video` (`.mp4`) | the video stream |
| `/dsh-intro-animation/poster` (`.jpg`) | the poster image |

`GET` and `HEAD` only; anything else is `405`.

## Checking it works

```
node scripts/smoke.mjs        # mounts the Host route on a throwaway http server and
                              # checks the two injection rows are well-formed
node scripts/preview-boot.mjs # http://127.0.0.1:8778/ — renders the exact splash rows
                              # and proxies the media route from a running harness
node scripts/preview-page.mjs # writes .preview/intro-preview.html with this plugin's
                              # own CSS + markup pointed at the running harness
```

`smoke.mjs` exercises `/info`, `/video`, `/poster`, an unknown path and a `POST`,
fails if a body length disagrees with `content-length`, and validates the boot rows
(kind, placement, no closing `</script` in inline text, script parses). `preview-boot.mjs`
imports `SPLASH_CSS`/`SPLASH_SCRIPT` from `splash.js` — it never copies them — so what
it renders is what the served index will execute; drop `#` in favour of nothing and it
also proves the row order leaves nothing behind once the clip ends. `preview-page.mjs`
copies the CSS array out of `client.js` for the same reason.

After installing into a harness, the fastest live checks are
`curl http://127.0.0.1:<port>/dsh-intro-animation/info` and the slot inspector for
`shell.overlay` (an entry with id `intro-animation` should be `active`).

## Uninstall

```
plugin_manager  action: set_bundle  target: dsh-intro-animation  enabled: false
```

…then remove the directory once the harness reports it gone. Nothing outside the
package and `$DSH_HOME/dsh-intro-animation/` is written.

## Licence

Code: MIT (see `LICENSE`).

`media/opening.mp4` and `media/poster.jpg` are a derivative of footage supplied by the
package author and are covered by the same MIT grant for use with this plugin. Replace
them with your own material if you redistribute the plugin commercially — the plugin
works exactly the same with any clip that meets the encoding notes above.
