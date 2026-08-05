# Hoist — Project Brief

> *"Install agent harnesses. Manage your keys. Wire up your gateway."*

## What We're Building

A cross-platform Electron desktop app that installs, configures, and wires up AI
coding agent harnesses — and manages the API keys / credentials those tools need.
Think of it as the setup wizard *and* the key vault before the workbench: get
your tools installed, your providers configured, your keys stored and validated,
and your gateway wired, so you can start coding.

## Why

Organisations and individuals adopting AI coding tools face a fragmented setup:
no unified installer for harnesses (Claude Code, Codex, OpenCode, …); manual env
var configuration to route through enterprise AI gateways; no SSO-bridged setup;
keys scattered across `~/.zshrc`, tool config files, and password managers with
no visibility into whether they still work. Existing tools (harnss, CCS, ai-gate,
OpenGUI) handle parts of this; none deliver install + key vault + gateway wiring
in one app.

## What It Does

| Capability | Details |
|------------|---------|
| **Install agent harnesses** | Claude Code, Codex, OpenCode, OpenPi (npm/Homebrew) |
| **SSO authentication** | Okta, Azure AD, Google Workspace |
| **Gateway routing** | Configure `ANTHROPIC_BASE_URL` and equivalents to an internal AI gateway |
| **Provider setup (BYOK)** | Multi-provider key management across ~150 providers |
| **Key vault** | Encrypted at rest (safeStorage default), pluggable backends (keychain, Bitwarden, 1Password, AWS Secrets Manager, SOPS+age) |
| **Key validity & expiry** | Probe provider APIs; budget remaining where exposed; OAuth token expiry; user review dates |
| **Handy key actions** | Copy with auto-clear, inject into `.envrc`, write to tool configs, export as env |
| **Version management** | Discover, install, update, pin versions of local tools |

## Product Boundaries

| Product | Role |
|---------|------|
| **Hoist** | Install, configure, update, wire up agent harnesses; store and validate keys |
| **OpenPi** | Day-to-day Pi-first coding workbench (relies on Hoist for setup) |

## Target Users

- Enterprise developers adopting AI coding tools behind corporate SSO/gateways.
- Platform teams rolling out AI coding tools to their org.
- Individual developers who want a clean, managed setup + key vault.

## Technical Approach

A thin Electron (35) + React (19) + Vite (6) + TypeScript (5.8) wrapper around:
1. CLI installer layer (npm/Homebrew).
2. Local OAuth proxy (Node.js) for SSO token exchange + gateway routing.
3. Secret vault with pluggable backends (ADR-0001).
4. Provider registry (ADR-0002) and probe layer (ADR-0003).

## Target Platforms

macOS (`.dmg`, Apple Silicon + Intel), Windows (`.exe`, x64 + ARM64),
Linux (`.AppImage`).

## Scope (v1)

- [x] Rename weldable → hoist (Phase 0).
- [x] Electron shell with sidebar: Harnesses / Keys / Gateway / Done.
- [x] Secret vault: safeStorage default (ADR-0001).
- [x] Provider catalog (18 entries, JSON source + generator) + custom OpenAI-compatible (ADR-0002).
- [x] Key validity + budget via provider probe (Anthropic first; Bedrock / Vertex / Azure next) (ADR-0003).
- [x] Handy actions: copy with 30 s clipboard auto-clear.
- [x] Install Claude Code / OpenCode / Codex via npm.
- [x] Gateway catalog (11 gateways: TrueFoundry, LiteLLM, Cloudflare, Vercel, OpenRouter, Together, OpenCode Zen, ZenLayer, plus Corporate + custom slots).
- [x] Gateway picker UI + per-harness wiring (Claude Code `~/.claude/settings.json` env, Codex `~/.codex/config.toml` model_provider block, OpenCode `~/.config/opencode/opencode.json` provider block).
- [x] Clipboard URL suggestion in the Gateway step.
- [x] CLI companion (`hoist install / keys / gateway use / harness config / list`) with single-file cross-platform binaries via `bun build --compile`.
- [x] release-please CalVer (`YYYY.MM.PATCH`) + multi-platform GitHub Actions release workflow.
- [ ] SSO login flow (one provider first, likely Okta).
- [ ] Local OAuth proxy for SSO token exchange.
- [ ] Bundled bw/op/sops/age binaries (ADR-0004) for the keychain/password-manager backends.
- [ ] OAuth token expiry surface (Claude Code + Codex auth files).

## Out of Scope

- The coding workbench itself (that's OpenPi).
- Building/managing AI gateways (configure against existing ones).

## Name

**hoist** — hoist your keys up where your tools can reach them. Short, active,
memorable.
