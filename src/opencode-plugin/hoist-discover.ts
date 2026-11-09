// Hoist discovery plugin for OpenCode. No runtime dependencies.
//
// On OpenCode startup it resolves each harness binary from the hoist
// catalog, reads its version, and writes ~/.cache/hoist/discovery.json.
// Hoist (src/main/installer) reads that file when it is fresher than five
// minutes and falls back to its own which + npm-global probe otherwise.
//
// Binary names mirror HARNESS_CATALOG in src/main/providers/harnesses.ts.
// Keep the two in sync when a harness is added.

import { execFile } from "node:child_process"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const HARNESSES: Record<string, string> = {
  "claude-code": "claude",
  opencode: "opencode",
  codex: "codex",
}

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 2_000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null)
    })
  })
}

async function discoverOne(binary: string): Promise<{ path: string; version: string | null } | null> {
  const path = await run("which", [binary])
  if (!path) return null
  const versionLine = await run(path, ["--version"])
  return { path: path.split("\n")[0], version: versionLine?.split("\n")[0] ?? null }
}

export async function writeDiscoveryCache(
  home: string = homedir(),
): Promise<Record<string, { path: string; version: string | null }>> {
  const found: Record<string, { path: string; version: string | null }> = {}
  await Promise.all(
    Object.entries(HARNESSES).map(async ([id, binary]) => {
      const entry = await discoverOne(binary)
      if (entry) found[id] = entry
    }),
  )
  const target = join(home, ".cache", "hoist", "discovery.json")
  await mkdir(dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  await writeFile(tmp, `${JSON.stringify(found, null, 2)}\n`, "utf8")
  await rename(tmp, target)
  return found
}

// OpenCode loads default-exported / named plugin functions and awaits them
// at startup. Discovery runs once here and never blocks startup on failure.
export const HoistDiscoverPlugin = async () => {
  try {
    await writeDiscoveryCache()
  } catch {
    // Hoist falls back to its own probe when the cache is absent.
  }
  return {}
}

export default HoistDiscoverPlugin
