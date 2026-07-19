---
number: 0004
date: 2026-06-26
status: accepted
---

# 0004. Bundled External Binaries for Secret Backends

## Context

Several backends (ADR-0001) depend on external tools: `bw`, `op`, `sops`, `age`.
Requiring them on `$PATH` makes backends unreliable and pushes install burden on
the user.

## Decision

Bundle `bw`, `op`, `sops`, `age` via `electron-builder` `extraResources`; resolve
at runtime through `resolveBinary(name)` that prefers the bundled copy and falls
back to `$PATH`.

- Binaries under `resources/bin/<platform>/<arch>/`, referenced by absolute path.
- Code-signed + notarized (macOS) in the release build.
- Per-platform/arch builds include only that platform's binaries.
- Version-pinned; upgrades ship with app releases; version shown in settings.
- `@napi-rs/keytar` (native module) and AWS / Bitwarden SM SDKs (pure JS) ship as
  npm deps in the asar, not bundled binaries.

## Consequences

- Positive: backends work out of the box; predictable versions.
- Negative / trade-offs: +~40–80 MB app size; notarization must sign extras;
  possible version skew with user installs (bundled wins, so consistent).
- Follow-ups: lazy-load a backend's adapter only when enabled; surface version +
  checksum in diagnostics; document `$PATH` fallback for power users.

## References

- electron-builder extraResources: https://www.electron.build/configuration/contents#extraresources
- Bitwarden CLI · 1Password CLI · SOPS · age (see ADR-0001 refs)
