---
number: 0001
date: 2026-06-26
status: accepted
---

# 0001. Secret Storage Backend Abstraction

## Context

Hoist stores AI provider API keys and credentials locally. Secrets must live
only in the Electron main process (never the renderer), encrypted at rest, while
letting users source keys from where they already keep them: the OS keychain, a
password manager (Bitwarden, 1Password), AWS Secrets Manager, or SOPS-encrypted
files. No single store covers every user; `safeStorage` is encryption-at-rest of
a blob we own, `keytar` gives addressable keychain items with biometric ACLs, and
password-manager / cloud stores are read-mostly and authored outside the app.

## Decision

A pluggable `SecretBackend` interface with per-secret runtime selection via a
`ChainedBackend` composite.

```ts
interface SecretBackend {
  readonly id: string
  label(): string
  availability(): Promise<BackendAvailability> | BackendAvailability
  get(id: SecretId): Promise<SecretValue | null>
  set?(id: SecretId, value: SecretValue): Promise<void>
  delete?(id: SecretId): Promise<boolean>
  list(): Promise<SecretEntry[]>
  unlock?(): Promise<void>
}
```

`set`/`delete` are optional so read-only backends type-check without stubs; the
renderer gates writes on `isWritable(backend)`.

Priority order of adapters:

1. **`safeStorage`** (default, read-write) — Electron async API
   (`encryptStringAsync`/`decryptStringAsync`), handling `shouldReEncrypt`.
   Ciphertext persisted as an atomically-written chmod-0600 blob under
   `app.getPath('userData')/vault.bin`. On Linux, reject the `basic_text`
   fallback unless the user explicitly opts in.
2. **`keytar`** (`@napi-rs/keytar`, read-write) — real keychain items keyed by
   `(com.echohello.hoist, id)` with macOS biometric ACLs. Opt-in via settings.
3. **`bitwarden`** — CLI (`bw`, manages `BW_SESSION`, RW-capable) and Secrets
   Manager SDK (access token, read-only).
4. **`1password`** — CLI (`op read` on `op://` references) + service-account
   token; read-only.
5. **`aws-secrets-manager`** — `@aws-sdk/client-secrets-manager` with an
   in-process TTL cache (cost control); read-write.
6. **`sops-age`** — shells out to bundled `sops`/`age`; read-only.

`ChainedBackend` tries backends in user-configured priority for `get` and routes
`set` to the first writable backend. The bootstrap credential that authenticates
*to* a remote backend (bw session, op token, AWS profile) lives in `safeStorage`
or `keytar` — the OS store is the root of trust.

Secrets never cross into the renderer. IPC handlers return masked values
(`sk-…abcd`) plus validity flags only; copy-to-clipboard runs in the main process
with auto-clear.

## Consequences

- Positive: one interface covers seven stores; users pick what they have;
  app-owned secrets default to the always-available OS-backed store.
- Negative / trade-offs: more surface area than a single store; `ChainedBackend`
  must handle partial availability and stale reads; keytar adds a native dep.
- Follow-ups: cache decrypted values in main-process memory with explicit
  eviction; redact secrets in logs (pino `redact`); migration path when the user
  switches primary backend.

## References

- Electron safeStorage: https://www.electronjs.org/docs/api/safe-storage
- @napi-rs/keytar: https://github.com/napi-rs/keytar
- Paseo `private-files.ts` atomic-write pattern (reference repo)
