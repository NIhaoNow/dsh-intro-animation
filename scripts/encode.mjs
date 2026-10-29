#!/usr/bin/env node
/**
 * Re-encode a source video into the shape this plugin ships:
 *   - H.264 (high profile) + yuv420p + faststart, so every Chromium/Electron build plays it;
 *   - no audio track (the opening animation is muted anyway, and audio is most of the
 *     bytes a first-load splash should not spend);
 *   - 810x1080 (3:4), which keeps the original vertical framing and stays around 1 MiB.
 *
 * Usage:
 *   node scripts/encode.mjs <input> [--poster <seconds>] [--width 810] [--crf 28] [--fps 24]
 *   FFMPEG=/path/to/ffmpeg node scripts/encode.mjs <input>
 *
 * Writes media/opening.mp4 and (with --poster) media/poster.jpg next to package.json.
 * ffmpeg must be on PATH or given via the FFMPEG environment variable.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MEDIA = join(PACKAGE_ROOT, 'media')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

function parseArgs(argv) {
  const args = { input: undefined, poster: undefined, width: 810, crf: 28, fps: 24 }
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--poster') args.poster = Number(argv[(i += 1)])
    else if (value === '--width') args.width = Number(argv[(i += 1)])
    else if (value === '--crf') args.crf = Number(argv[(i += 1)])
    else if (value === '--fps') args.fps = Number(argv[(i += 1)])
    else if (!args.input && !value.startsWith('--')) args.input = value
  }
  return args
}

const { input, poster, width, crf, fps } = parseArgs(process.argv.slice(2))
if (!input) {
  console.error('usage: node scripts/encode.mjs <input> [--poster <seconds>] [--width 810] [--crf 28] [--fps 24]')
  process.exit(1)
}
// 3:4 canvas, even dimensions (H.264 requires both to be divisible by 2).
const height = Math.round((width * 4) / 3 / 2) * 2
const output = join(MEDIA, 'opening.mp4')
mkdirSync(MEDIA, { recursive: true })

console.log(`ffmpeg: ${FFMPEG}\ninput : ${resolve(input)}\noutput: ${output} (${width}x${height}, crf ${crf}, ${fps} fps)`)

execFileSync(
  FFMPEG,
  [
    '-y',
    '-i',
    resolve(input),
    '-an',
    '-vf',
    `scale=${width}:${height}:flags=lanczos,fps=${fps}`,
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    String(crf),
    '-preset',
    'veryslow',
    '-g',
    String(fps * 2),
    '-movflags',
    '+faststart',
    output,
  ],
  { stdio: 'inherit' },
)

console.log(`wrote ${output} (${(statSync(output).size / 1048576).toFixed(2)} MiB)`)

if (poster !== undefined) {
  const posterPath = join(MEDIA, 'poster.jpg')
  execFileSync(
    FFMPEG,
    ['-y', '-ss', String(poster), '-i', output, '-frames:v', '1', '-q:v', '4', posterPath],
    { stdio: 'inherit' },
  )
  console.log(`wrote ${posterPath} (${(statSync(posterPath).size / 1024).toFixed(0)} KiB)`)
}
