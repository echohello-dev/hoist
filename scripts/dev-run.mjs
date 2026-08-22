#!/usr/bin/env -S node --no-warnings
// Dev launcher: runs the app through a Hoist-branded copy of the Electron
// bundle on macOS so the dock shows the "Hoist" name and the liquid glass
// app icon (compiled Assets.car from build/icon.icon) instead of the stock
// Electron name/icon. Other platforms launch the stock Electron binary.
//
// The branded bundle lives in node_modules/.hoist-dev/Hoist.app and is
// rebuilt when Electron changes. Run `npm run gen:icon` first after editing
// build/icon.icon so build/Assets.car and build/icon.icns are fresh.
'use strict'

import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronBin = createRequire(import.meta.url)('electron')

function ensureDevBundle() {
  const src = resolve(ROOT, 'node_modules/electron/dist/Electron.app')
  const dest = resolve(ROOT, 'node_modules/.hoist-dev/Hoist.app')
  const srcPlist = resolve(src, 'Contents/Info.plist')
  const marker = resolve(dest, 'Contents/.hoist-src-mtime')
  const mtime = String(statSync(srcPlist).mtimeMs)
  if (existsSync(marker) && readFileSync(marker, 'utf8') === mtime) {
    return resolve(dest, 'Contents/MacOS/Electron')
  }

  rmSync(resolve(dest, '..'), { recursive: true, force: true })
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true })

  const plist = resolve(dest, 'Contents/Info.plist')
  const pb = (args) => {
    const r = spawnSync('/usr/libexec/PlistBuddy', args, { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`PlistBuddy ${args[1]} failed: ${r.stderr}`)
  }
  pb(['-c', 'Set :CFBundleName Hoist', plist])
  pb(['-c', 'Set :CFBundleDisplayName Hoist', plist])
  pb(['-c', 'Set :CFBundleIconFile icon.icns', plist])
  pb(['-c', 'Add :CFBundleIconName string Icon', plist])

  const res = resolve(dest, 'Contents/Resources')
  mkdirSync(res, { recursive: true })
  const car = resolve(ROOT, 'build/Assets.car')
  const icns = resolve(ROOT, 'build/icon.icns')
  if (existsSync(car)) copyFileSync(car, resolve(res, 'Assets.car'))
  if (existsSync(icns)) copyFileSync(icns, resolve(res, 'icon.icns'))

  // Info.plist edits invalidate the stock signature; ad-hoc re-sign so
  // arm64 macOS will still launch it.
  const sign = spawnSync('codesign', ['--force', '--deep', '--sign', '-', dest], { encoding: 'utf8' })
  if (sign.status !== 0) throw new Error(`codesign failed: ${sign.stderr}`)
  spawnSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', dest])

  writeFileSync(marker, mtime)
  console.log('✓ dev bundle ready: node_modules/.hoist-dev/Hoist.app')
  return resolve(dest, 'Contents/MacOS/Electron')
}

function ensureRenamedBinary() {
  const distDir = resolve(ROOT, 'node_modules/electron/dist')
  if (process.platform === 'win32') {
    const src = resolve(distDir, 'electron.exe')
    const dest = resolve(distDir, 'Hoist.exe')
    if (!existsSync(dest) || statSync(dest).mtimeMs < statSync(src).mtimeMs) {
      copyFileSync(src, dest)
      // Patch version strings so taskbar/alt-tab show "Hoist" instead of
      // the Electron FileDescription. rcedit ships with electron-winstaller.
      const rcedit = resolve(ROOT, 'node_modules/electron-winstaller/vendor/rcedit.exe')
      if (existsSync(rcedit)) {
        const r = spawnSync(rcedit, [
          dest,
          '--set-version-string', 'FileDescription', 'Hoist',
          '--set-version-string', 'ProductName', 'Hoist',
          '--set-icon', resolve(ROOT, 'build/icon.ico'),
        ], { encoding: 'utf8' })
        if (r.status !== 0) console.error('rcedit failed (non-fatal):', r.stderr)
      }
      console.log('✓ dev binary: node_modules/electron/dist/Hoist.exe')
    }
    return dest
  }
  if (process.platform === 'linux') {
    const src = resolve(distDir, 'electron')
    const dest = resolve(distDir, 'hoist')
    if (!existsSync(dest) || statSync(dest).mtimeMs < statSync(src).mtimeMs) {
      rmSync(dest, { force: true })
      linkSync(src, dest)
      console.log('✓ dev binary: node_modules/electron/dist/hoist')
    }
    return dest
  }
  return electronBin
}

let bin = electronBin
if (process.platform === 'darwin') {
  try {
    bin = ensureDevBundle()
  } catch (err) {
    console.error('dev bundle setup failed, falling back to stock Electron:', err)
  }
} else {
  // win32/linux: the stock binary is named "electron(.exe)", which leaks
  // into alt-tab / taskbar / system monitors. Drop a renamed copy/hardlink
  // next to it (same dir, so resources still resolve) and launch that.
  try {
    bin = ensureRenamedBinary()
  } catch (err) {
    console.error('binary rename failed, falling back to stock Electron:', err)
  }
}

const child = spawnSync(bin, [resolve(ROOT, 'dist/main/index.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(child.status ?? 1)
