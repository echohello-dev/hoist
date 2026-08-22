#!/usr/bin/env -S node --no-warnings
// Regenerate build/icon.icns and build/icon.png from build/icon.icon
// (the Icon Composer / liquid glass source of truth).
//
// Requires macOS with Xcode 26+ (actool) for the .icns, and ImageMagick
// (`magick`) for the flattened .png used by the dev dock icon and win/linux.
// Run manually after editing build/icon.icon: `npm run gen:icon`.
'use strict'

import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ICON = resolve(ROOT, 'build/icon.icon')
const tmp = mkdtempSync(resolve(tmpdir(), 'hoist-icon-'))

try {
  if (!existsSync(ICON)) throw new Error(`missing ${ICON}`)

  // actool: compile the Icon Composer bundle -> Icon.icns (+ Assets.car)
  // The input dir must be named Icon.icon for --app-icon Icon to match.
  const out = resolve(tmp, 'out')
  const iconIn = resolve(tmp, 'Icon.icon')
  cpSync(ICON, iconIn, { recursive: true })
  mkdirSync(out, { recursive: true })
  const actool = spawnSync('actool', [
    iconIn, '--compile', out,
    '--output-format', 'human-readable-text',
    '--output-partial-info-plist', resolve(out, 'info.plist'),
    '--app-icon', 'Icon', '--include-all-app-icons',
    '--enable-on-demand-resources', 'NO',
    '--development-region', 'en',
    '--target-device', 'mac',
    '--minimum-deployment-target', '26.0',
    '--platform', 'macosx',
  ], { encoding: 'utf8' })
  if (actool.status !== 0) {
    throw new Error(`actool failed (needs Xcode 26+):\n${actool.stdout}\n${actool.stderr}`)
  }
  copyFileSync(resolve(out, 'Icon.icns'), resolve(ROOT, 'build/icon.icns'))
  console.log('✓ build/icon.icns')
  if (existsSync(resolve(out, 'Assets.car'))) {
    copyFileSync(resolve(out, 'Assets.car'), resolve(ROOT, 'build/Assets.car'))
    console.log('✓ build/Assets.car (used by the dev app bundle)')
  }

  // magick: flatten fill + layers (bottom-to-top) -> icon.png
  const spec = JSON.parse(readFileSync(resolve(ICON, 'icon.json'), 'utf8'))
  const [r, g, b] = spec.fill.solid.replace('srgb:', '').split(',').map(Number)
  const hex = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
  const bg = `#${hex(r)}${hex(g)}${hex(b)}`
  const layers = spec.groups
    .flatMap((grp) => grp.layers)
    .filter((l) => !l.hidden)
    .reverse()
    .map((l) => resolve(ICON, 'Assets', l['image-name']))
  const png = resolve(ROOT, 'build/icon.png')
  const magick = spawnSync('magick', [
    '-size', '1024x1024', `xc:${bg}`,
    ...layers.flatMap((p) => [p, '-composite']),
    png,
  ], { encoding: 'utf8' })
  if (magick.status !== 0) throw new Error(`magick failed:\n${magick.stderr}`)
  console.log('✓ build/icon.png')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
