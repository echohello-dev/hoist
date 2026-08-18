---
number: 0005
date: 2026-08-18
status: accepted
supersedes: 0004
---

# 0005. Bundled Vendor Binaries for Secret Backends

## Context

ADR-0001 enumerates six secret backends (`safeStorage`, `keytar`, `bitwarden`,
`1password`, `aws-secrets-manager`, `sops-age`). The first two run in-process
(`@napi-rs/keytar` is a native module; the AWS and Bitwarden SM SDKs are pure
JS). The other four shell out to a vendor CLI:

| Backend        | External binary             | Why a CLI                         |
| -------------- | --------------------------- | --------------------------------- |
| `bitwarden`    | `bw`                        | Manages `BW_SESSION`, vault unlock |
| `1password`    | `op`                        | `op read op://...` resolve, service-account auth |
| `sops-age`     | `sops`, `age`               | Decrypt SOPS-encrypted YAML/env   |

ADR-0004 reserved the decision to bundle these but left sourcing, layout,
signing, and resolution semantics as follow-ups. Without a concrete plan the
backends stay unusable out of the box, which is exactly the gap that makes
"Hoi st works without a setup ritual" a lie.

The current `installer/index.ts:resolveBinaryPath` already establishes a
convention: prefer `which()` on `$PATH`, fall back to `~/.local/share/hoist/bin`.
New code should reuse that pattern rather than invent a parallel one.

## Decision

### 1. What ships in the bundle vs. as an npm dep

| Artifact                                | Ships as      | Reason |
| --------------------------------------- | ------------- | ------ |
| `bw` CLI                                | `extraResources` | Vendor-signed, platform tarball |
| `op` CLI                                | `extraResources` | Vendor-signed, platform tarball |
| `sops`                                  | `extraResources` | Go binary, single static file per platform/arch |
| `age`, `age-keygen`                     | `extraResources` | Go binary, single static file per platform/arch |
| `@napi-rs/keytar`                       | npm (asar)    | Native module — must be rebuilt per electron version |
| `@aws-sdk/client-secrets-manager`       | npm (asar)    | Pure JS |
| `@bitwarden/sdk-secrets-manager`        | npm (asar)    | Pure JS |

### 2. Layout

```
resources/
  bin/
    darwin-arm64/
      bw, op, sops, age, age-keygen
    darwin-x64/
      bw, op, sops, age, age-keygen
    linux-x64/
      bw, op, sops, age, age-keygen
    win32-x64/
      bw.exe, op.exe, sops.exe, age.exe, age-keygen.exe
```

Per-platform filter so each installer only carries its triplet:

```yaml
# electron-builder.yml (excerpt)
extraResources:
  - from: "resources/bin/darwin-${env.ELECTRON_BUILDER_ARCH}"
    to: "bin"
    filter: ["**/*"]
    when: target.name == "mac"
  - from: "resources/bin/linux-x64"
    to: "bin"
    when: target.name == "AppImage"
  - from: "resources/bin/win32-x64"
    to: "bin"
    when: target.name == "nsis"
```

### 3. Sourcing (build-time fetch)

A single script, `scripts/fetch-vendor-binaries.mjs`, downloads and verifies
all four per platform/arch and writes them into the layout above. The script
runs as the first step of `npm run release:app` (and locally for dev installs).
It is **deterministic and pinned**: no `latest` tags, no version discovery —
versions live in `scripts/vendor-versions.json` and are updated by a deliberate
PR.

| Binary   | Source URL pattern (per version)                               | Verification        |
|----------|----------------------------------------------------------------|--------------------|
| `bw`     | `https://github.com/bitwarden/clients/releases/download/cli-v{VER}/bw-{OS}-{ARCH}-{VER}.zip` (macOS, Linux, Windows) | checksum file from same release |
| `op`     | `https://cache.agilebits.com/dist-op/pkg/v{VER}/op_{OS}_{ARCH}_{VER}.zip` (op2 CLI) | vendor signature; fall back to sha256 if no sig |
| `sops`   | `https://github.com/getsops/sops/releases/download/v{VER}/sops-v{VER}.{OS}.{ARCH}` | GitHub-published sha256 sums + (optional) cosign verify |
| `age`    | `https://github.com/FiloSottile/age/releases/download/v{VER}/age-v{VER}-{OS}-{ARCH}.tar.gz` | sha256 from release page |

Vendoring `op2` (the next-gen Go CLI) over legacy `op` v1 is non-negotiable —
v1 is deprecated and stops receiving security updates.

### 4. Runtime resolution

```ts
// src/main/vendor/binaries.ts
export type VendorBinary = 'bw' | 'op' | 'sops' | 'age' | 'age-keygen'

export async function resolveBinary(name: VendorBinary): Promise<string | null> {
  // 1. Explicit env override — escape hatch for power users / broken bundles.
  const envKey = `HOIST_${name.toUpperCase().replace(/-/g, '_')}_BIN`
  if (process.env[envKey]) return process.env[envKey]!

  // 2. PATH lookup — the user's own copy wins.
  try { return await which(name) } catch {}

  // 3. Bundled copy in extraResources (Electron) or dev layout (vite).
  const bundled = bundledPath(name)
  if (bundled && await isExecutable(bundled)) return bundled

  return null
}
```

The "PATH first, bundled last" order is **deliberate and opposite to ADR-0004**:

- `bw` and `op` carry auth state (`BW_SESSION`, biometric unlock, op service
  account) the user has already established with their installed copy. The
  bundled binary would shadow a working toolchain and force the user to re-auth
  inside Hoist.
- `sops` and `age` are stateless, so bundling wins on convenience — but the
  PATH-first policy is uniform and easier to reason about.
- Versions stay predictable in practice because Hoist vendors a known-good
  version; users with newer installs simply get the newer one (which is what
  we want).

### 5. Lazy backend loading

The `SecretBackend` adapter for `bitwarden`/`1password`/`sops-age` registers
only when the user enables that backend in settings. The `resolveBinary` call
for that backend's binary is deferred until the first `get`/`list` so we don't
spawn a vendor process on every app launch.

### 6. macOS signing

`bw` and `op` binaries are vendor-signed by Bitwarden / AgileBits and propagate
their Developer ID through to our notarised bundle. `sops` and `age` ship
unsigned; we strip any ad-hoc signature on the way in and **re-sign with our
Developer ID Application** so the bundle passes `xcrun notarytool`. The fetch
script runs `codesign --force --sign "${DEVELOPER_ID_APPLICATION}" --timestamp`
after the sha256 check. Without this, Gatekeeper quarantines the bundled binary
on first run and `exec()` fails.

Linux/Windows users are unaffected — they don't have Gatekeeper.

### 7. Diagnostics surface

Settings → Diagnostics gains one row per vendor binary:

```
bw          2026.7.0   /Applications/Hoist.app/Contents/Resources/bin/bw
op          2.31.0    /Applications/Hoist.app/Contents/Resources/bin/op
sops        3.9.2     $PATH (sops)
age         1.2.1     $PATH (age)
```

This makes "is Hoist using my install or the bundle?" answerable in one click
and turns "bw auth broken" into "bw 2026.7.0 — needs `bw login`" in support
threads.

## Consequences

- Positive: `bitwarden` / `1password` / `sops-age` backends work out of the box
  with predictable versions; user installs still take precedence; first-run
  signing kills the Gatekeeper hit; diagnostics make support tractable.
- Negative / trade-offs:
  - +~50 MB on macOS, +~35 MB on Linux, +~30 MB on Windows. `sops` is the
    largest single contributor (~25 MB).
  - `vendor-versions.json` becomes a chore; bump cadence is tied to Hoist
    releases unless we add a hot-update channel (we won't, for v1).
  - macOS re-signing step is a CI-only secret dependency (`DEVELOPER_ID_APPLICATION`
    + App Store Connect API key); dev builds on Linux/Windows stay unsigned.
  - Opposite-of-ADR-0004 resolution order will surprise people who read the
    original ADR in isolation. Mitigate by linking 0005 from 0004's header
    (done) and from `docs/brand/` onboarding.
- Follow-ups:
  - `op` CLI v2 service-account mode requires `OP_SERVICE_ACCOUNT_TOKEN` env;
    document the bootstrap path in user docs.
  - Decide whether to ship a `bw` desktop helper integration (browser
    extension hand-off) — out of scope for this ADR.
  - Surface a "vendor binary update available" banner in diagnostics when a
    user's PATH copy is ahead of the bundled one.

## References

- ADR-0001 (backend abstraction)
- ADR-0004 (superseded stub)
- Bitwarden CLI releases: https://github.com/bitwarden/clients/releases?q=cli-
- 1Password CLI v2: https://developer.1password.com/docs/cli/get-started/
- SOPS releases: https://github.com/getsops/sops/releases
- age releases: https://github.com/FiloSottile/age/releases
- electron-builder `extraResources`:
  https://www.electron.build/configuration/contents#extraresources
- Apple notarisation:
  https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution