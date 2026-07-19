---
number: 0003
date: 2026-06-26
status: accepted
---

# 0003. Key Validity and Expiry Probing

## Context

Users want to know whether a key still works and whether it's about to run out.
Static LLM API keys carry **no expiry metadata**, so true "expiry" is not
directly knowable. What is checkable: (1) is the key valid now, (2) usage/budget
remaining (only some providers), (3) OAuth token expiry (real `expires_at`),
(4) user-set review dates.

## Decision

Probes in `src/main/probes/`, dispatched by `probeKind`. Result:

```ts
interface ProbeResult {
  valid: boolean
  status: 'ok' | 'invalid' | 'expired' | 'quota_exceeded' | 'error'
  detail?: string
  budgetRemaining?: number
  budgetTotal?: number
  expiresAt?: string
  checkedAt: string
}
```

**Validity (universal):** default `GET {base}/models` (Bearer) or provider
variants (`anthropicModels` `x-api-key`+version, `geminiModels` `?key=`). 5s
timeout, browser-suppression env so OAuth fails fast.

**Budget (special-case ~6):** `openrouterKey` (`GET /api/v1/key`, richest),
`deepseekBalance`, `togetherOrg`, `fireworksKeys`, `cohereCheck`, `hfWhoami`.
Others report validity only.

**OAuth token expiry:** parse `~/.codex/auth.json` and Claude Code OAuth
`expires_at`; countdown + refresh.

**User review dates:** every key record has optional `reviewOn`; hoist nags past
that date regardless of provider — the provider-agnostic expiry substitute.

**Trigger model:** on-demand (Validate button / per-key menu) **plus** launch
refresh that re-probes keys not checked in N hours. Both throttled; no background
timers while closed. All requests go through a redacting fetch wrapper (pino
`redact`).

## Consequences

- Positive: every key gets validity; ~6 give real budget; OAuth gets expiry;
  review dates cover the rest.
- Negative / trade-offs: launch probes hit provider APIs (visible, throttled);
  validity ≠ lifespan for static keys; budget endpoints drift.
- Follow-ups: short-TTL result cache; disable-launch-refresh toggle; surface
  probe failures as "unknown" not "invalid".

## References

- OpenRouter key endpoint: https://openrouter.ai/docs#limits
- LiteLLM `check_valid_key`: https://docs.litellm.ai/docs/set_keys
