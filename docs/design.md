# Hoist — Design Reference

> Visual + interaction design for the Hoist Electron app and CLI.
> Source of truth for "what does Hoist look like and why?"
> Pair with `docs/adr/` for the *why* (architectural decisions).

---

## 1. Design intent

Hoist is a desktop tool that **installs AI coding agent harnesses, manages provider keys, and routes them through gateways**. The product surface is small and concrete — config, install, probe, write — but the audience is technical and the actions have outsized consequence (a miswritten key blocks every Claude Code session).

That tension shapes the design:

| Principle | Translation |
|---|---|
| **Calm, not clever** | No animations, no tour overlays, no gamified checklist. Mirror the Linear onboarding stance: one input per moment, soft language. |
| **Show what's there** | Pre-populate detected harnesses and configured providers. Don't ask the user to discover what we already know. |
| **Surgical accent** | One brand color used on primary actions and active state only. Everything else is hairline-on-lift. 1Password Knox language. |
| **Keyboard first** | `⌘K` global palette with fuzzy match. Arrow keys everywhere. Power-user affordance is the front door, not a hidden shortcut. |
| **Power at the edges** | CLI does everything the app does. The app is the GUI layer over the same catalog/writers the CLI imports. |

### Lineage

Hoist's chrome borrows directly from:

- **1Password 8 / Knox** — 3-pane vault layout, hairline borders, single brand-blue accent, New Item catalogue modal, Quick Access palette. ([1password.com/blog/1password-8-for-windows-dark-mode-edition](https://1password.com/blog/1password-8-for-windows-dark-mode-edition))
- **Linear** — 4-step surface ladder, lavender-accent restraint, search-first config list, "killer feature introduced before the workspace is populated." ([candu.ai/blog/linear-onboarding-teardown](https://www.candu.ai/blog/linear-onboarding-teardown))
- **Raycast** — pure-near-black canvas, Inter with `ss03` stylistic set, command-palette-as-product. ([shadcn.io/design/raycast](https://www.shadcn.io/design/raycast))
- **Claude Code `/config`** — tabbed settings interface, status overlay, esc-to-revert, `/config key=value` pattern. ([code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings))

What we **don't** borrow: Light themes (Hoist is dark-only for now), decorative gradients, sidebars that are themselves apps (cf. 1Password's sidebar-of-vaults is *the* model).

---

## 2. Tokens

All values live in `src/renderer/styles/tokens.css`. Components consume them via CSS variables — never hard-coded.

### Surface ladder

```
--surface-canvas       #1d1d21   Page background
--surface-1            #26262c   Sidebar / right rail
--surface-2            #2f2f37   Cards / inputs / list rows
--surface-3            #393943   Hovered surface / list-row icon
--surface-4            #43434f   Selected row / focused control
```

Dark-only. Depth comes from surface ladder, never from drop shadows. Every chrome element is hairline-bordered against the surface below.

### Color

```
--accent               #157bf3   Single chromatic accent (1Password blue)
--accent-soft          rgba(21,123,243,0.14)   Selected row tint
--accent-strong        #2f8af6   Primary CTA hover
--text                 #f4f4f6
--text-muted           #b4b4b8
--text-subtle          #7e7e84
--border               #34343a   Hairline
--border-strong        #43434f

--status-ok            #2db55d
--status-warn          #d97a00
--status-bad           #d93535
--status-bad-soft      rgba(217,53,53,0.12)
```

Brand blue is used **only** for: primary CTAs (`+ Install`, `+ New key`, `Apply wiring`, `Re-probe all`), the selected row tint, and the active sidebar item. Nowhere else.

### Type

```
--font-sans    'Inter', system-ui, -apple-system, ...
--font-mono    'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace

font-feature-settings: 'calt', 'kern', 'liga', 'ss03'
```

Inter loaded from `rsms.me/inter` (self-hosted); `ss03` stylistic set enabled site-wide. Single-story `g` is the brand's signature typographic detail — turning it off makes Inter read generic.

| Token | Size | Weight | Tracking |
|---|---|---|---|
| `--display` | 22 px | 700 | `-0.04em` |
| `--title`   | 15 px | 600 | — |
| `--body`    | 13 px | 400 | `-0.011em` |
| `--caption` | 12 px | 400 | — |
| `--mono`    | 12 px | —    | — |

### Shape

```
--radius-card    12px     List rows, modals, stat cards
--radius-control  8px      Buttons, inputs, list-row icons
--radius-tile     6px      Icon tiles, list-row check
--radius-pill     9999px    Primary CTAs (1Password pattern)
```

Pill primary buttons + sharp cards is a deliberate tension — primary actions look "elevated" by their roundedness; everything else stays grounded.

### Spacing

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 px`. No 6s, no 18s.

---

## 3. Component catalogue

Lives in `src/renderer/styles/components.css`. Each class composes tokens only.

| Class | Purpose | Variants |
|---|---|---|
| `.btn` | Button base | `.btn-primary` (brand blue pill), `.btn-ghost` (transparent), `.btn-danger` (red text), `.btn-pill`, `.btn-sm`, `.btn-lg` |
| `.card` | Panel surface | `.card-pad-lg` |
| `.input` | Text input | `.input-lg` |
| `.badge` | Inline pill label | `.badge-ok`, `.badge-warn`, `.badge-bad`, `.badge-accent` |
| `.kbd` | Keyboard chip in palette/buttons | — |
| `.icon` | Inline SVG flex | `.icon-lg` |

### Iconography

All icons are Lucide (`lucide-react`). Stroke 2.25 by default. Color follows `currentColor` so they pick up text or accent tokens. Direct mapping:

| Concept | Lucide | Used in |
|---|---|---|
| Brand mark | `Zap` | Topbar brand |
| Harnesses sidebar + Claude Code row | `Zap` | — |
| Provider keys sidebar | `KeyRound` | — |
| Gateway sidebar + row | `Globe` | — |
| Watchtower sidebar | `ShieldCheck` | — |
| OpenCode row | `Terminal` | — |
| Codex row | `SquareTerminal` | — |
| OpenAI row + catalogue tile | `Circle` | — |
| Palette trigger | `Search` | — |
| Caret / dropdown | `ChevronDown` | Account menu, scope picker |
| Selected check | `Check` | Scope, gateway row |
| Close / cancel | `X` | Modals, danger actions |
| Refresh | `RotateCw` | Re-detect, Probe now |
| Update | `Download` | — |
| Edit | `Pencil` | — |

No emoji, no box-drawing glyphs, no inline SVG icons. Lucide ships tree-shakeable, so only used icons end up in the bundle (~10 KB added to renderer).

---

## 4. App shell architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Topbar   ⚡ hoist  | HARNESSES    ⌘K Search…    Help  +Add │
├──────────┬──────────────────────────────────────┬────────────┤
│ Sidebar  │ Main pane                            │ Detail rail │
│ ┌──────┐ │ ┌──────────────┐                     │             │
│ │vault │ │ │ Surface title │  Primary action     │ Context-    │
│ │      │ │ │               │                     │ aware        │
│ │ items│ │ ├───────────────┤                     │ inspector    │
│ │      │ │ │               │                     │             │
│ │health│ │ │  List rows    │                     │             │
│ │      │ │ │               │                     │             │
│ └──────┘ │ └───────────────┘                     │             │
│  Vault   │                                      │             │
│  unlocked │                                      │             │
└──────────┴──────────────────────────────────────┴────────────┘
```

**3-pane grid**: `232px / 1fr / 320px`, with breakpoints for narrower viewports. Implemented in `src/renderer/styles/layout.css`.

### Topbar

- **Left**: brand mark + section title (e.g., `HARNESSES`)
- **Center**: palette trigger button — looks like a search input but is a button (clicking opens palette, `⌘K` keyboard shortcut opens palette too)
- **Right**: Help ghost button + primary CTA (`+ Add key`)

### Sidebar

Two sections, both grouped:
- **Vault**: Harnesses, provider keys, gateway (each shows a count badge)
- **Health**: Watchtower

Each item has: icon (Lucide) + label + count badge. Selected item uses `accent-soft` background + accent text + inverted count badge.

Footer: Vault status pill (green dot = unlocked, see §10 for auto-lock) + version.

### Main pane

Each surface shares this layout:
- **Header**: title + subtitle + primary action pill (top-right)
- **Toolbar** (optional): filter input + scope picker
- **Body**: scrollable list of rows OR stat grid

### Detail rail

Context-aware right pane:
- **Harnesses** → binary path, provider, gateway, action buttons
- **Provider keys** → env var, last-probe, action buttons
- **Gateway** → which harnesses are wired + action buttons
- **Watchtower** → recent probes with status badges

---

## 5. Surfaces

### 5.1 Harnesses

**Purpose**: show installed state, surface install action.

**Layout**: list of harnesses (Claude Code, OpenCode, Codex). Each row: icon, title, description, version badge (`installed · v2.1.211` or `not installed`). Selected row shows the harness in the detail rail with binary, provider, gateway, and re-detect/update/uninstall actions.

**Pattern**: list rows with right-rail context (1Password unlocked vault).

### 5.2 Provider keys

**Purpose**: list of stored keys + scope picker + new-key flow.

**Layout**:
- `+ New key` primary CTA opens the **New Item catalogue** modal (1Password pattern)
- Scope picker dropdown: "All providers" / "Anthropic" / "OpenAI"
- List rows: provider glyph, name, kind badge (`API key` / `Cloud creds`), env var, masked preview, last-probe time

**Pattern**: list rows with kind tags + 1Password-style catalogue.

The New Item catalogue modal lists 6 credential kinds:
- **Anthropic API key** (featured, brand blue tint) — `sk-ant-…`
- **OpenAI API key** — `sk-…`
- **Azure OpenAI** — endpoint + deployment + key
- **Google Vertex AI** — project + region + ADC
- **AWS Bedrock** — profile + region
- **Custom OpenAI endpoint** — OpenAI-compatible URL

Each tile shows the kind icon (Lucide glyph), name, and monospace descriptor of required fields.

### 5.3 Gateway

**Purpose**: pick a gateway and apply wiring to all harnesses.

**Layout**: searchable list of 10 gateways (Corporate, TrueFoundry, LiteLLM, Cloudflare, Vercel, OpenRouter, Together, OpenCode Zen, ZenLayer, custom). Each row: `Globe` icon, label, URL in monospace, native-provider list, env var. Placeholder warnings inline (`<your-org>` for Corporate).

Right-rail: which harnesses are wired (`Claude Code ✓ env block`).

**Pattern**: searchable list + right-rail wiring inspector.

### 5.4 Watchtower

**Purpose**: health view, not a data view.

**Layout**: 6-card grid of stat tiles.
- Keys stored (11)
- Valid right now (9)
- Invalid (1)
- Expiring in 30d (1)
- Reused (0)
- Harnesses outdated (2)

Each tile: huge number + badge + sub line. Click-through drills down to the affected items.

Right-rail: recent probes with status badges.

**Pattern**: Watchtower dashboard — big numbers, color-coded badges, single primary CTA per card.

---

## 6. Command palette (`⌘K` / `Ctrl+K`)

Centered modal at the top of the viewport. Search input at the top, results below, footer with `↑↓ navigate · ↵ run · esc close`.

Each result row has three columns:
- **Kind badge** (80 px, monospace uppercase) — `ACTION` / `GATEWAY` / `NAVIGATE` / `REVEAL`
- **Label** (bold) — what it does
- **Hint** (muted, monospace) — extra detail (npm command, auth header, etc.)

Items registered today (13):

| Kind | Label | Hint |
|---|---|---|
| ACTION | Install Claude Code | `npm i -g @anthropic-ai/claude-code` |
| ACTION | Install OpenCode | `npm i -g opencode-ai` |
| ACTION | Install Codex | `npm i -g @openai/codex` |
| ACTION | Save Anthropic API key… | Vault · 30s clipboard auto-clear |
| ACTION | Probe Anthropic | `GET /v1/models · 5s timeout` |
| GATEWAY | Use TrueFoundry AI Gateway | Wires Claude Code · OpenCode · Codex |
| GATEWAY | Use Corporate AI gateway | Fill in `<your-org>` placeholder |
| NAVIGATE | Open Harnesses | Detect + install agent tools |
| NAVIGATE | Open Provider keys | New item catalogue |
| NAVIGATE | Open Gateway | 11 gateways · 18 providers |
| NAVIGATE | Open Watchtower | Key health · last probe |
| REVEAL | Reveal `~/.claude/settings.json` | Reveal in Finder |
| REVEAL | Reveal `~/.config/opencode/` | Reveal in Finder |
| REVEAL | Reveal `~/.codex/` | Reveal in Finder |

`Surfacing actions` (anything that writes to the system) get the `ACTION` badge. `Gateway` actions set up the wiring layer. `NAVIGATE` actions switch surfaces. `REVEAL` actions open Finder.

**Pattern**: cmdk / Raycast / 1Password Quick Access — focus stays in input, `aria-activedescendant` pattern (visual highlight via attribute, real focus on the input so the typed query doesn't get clobbered).

---

## 7. Status indicators

Three colors, used surgically:

| Color | Token | Used for |
|---|---|---|
| Green | `--status-ok` | Valid key · installed harness · wired gateway |
| Orange | `--status-warn` | Expiring soon · placeholder URL · harness outdated |
| Red | `--status-bad` | Invalid key · not installed |

Status always appears as a small badge in a list-row meta column, never as a color-filled surface. Color is *evidence*, not decoration.

---

## 8. Mocked vs real (today)

PR #22 (this design) is **visual only**. Every button works as a state update, but no IPC channel is wired.

| Surface | Mocked | Real (todo) |
|---|---|---|
| Harnesses | Hardcoded list with version | `harness.list` / `harness.discover` → live detection |
| Provider keys | Hardcoded 4 entries | `vault.list` / `vault.set` / `vault.delete` / `vault.copy` |
| Gateway | Hardcoded 10 entries | `gateway.list` / `gateway.apply` |
| Watchtower | Hardcoded stats | new `watchtower.summary` IPC + `probe.run` |
| Right rails | Hardcoded fields | Per-surface IPC reads |
| Palette | 13 items hardcoded | Read from a registry, group by category, recent-from-localStorage |

Wire each surface to its IPC in a separate PR so the visual + the data flow stay reviewable.

---

## 9. Adding to this design

### Add a provider

1. `src/main/providers/catalog.source.json` → add row
2. `npm run gen:catalog` → regenerates `catalog.generated.ts` (CI guard in #19 fails if stale)
3. If the provider needs a custom probe → `src/main/probes/<provider>.ts` + add to `runProbe` in `src/main/probes/index.ts`
4. CLI re-imports the catalog — no separate edit

### Add a surface

1. Add to `SurfaceId` union in `src/renderer/App.tsx`
2. Add a sidebar group item with icon, label, count
3. Write the `<XxxSurface>` component, share `PaneHeader` + `hoist-list-row` + `hoist-pane-toolbar`
4. Wire detail rail entries for the new surface in `DetailRail`
5. Add palette entries for `Open Xxx`

### Add a palette command

In `src/renderer/App.tsx`, append to `items` in `CommandPalette`. Pick a `kind` (`ACTION` / `GATEWAY` / `NAVIGATE` / `REVEAL`) and a 1-line hint.

### Add a status color

1. `src/renderer/styles/tokens.css` → add `--status-<name>`
2. `.badge-<name>` in `components.css`
3. Map it in the relevant surface

---

## 10. Future directions

These are open questions, not commitments:

- **Auto-lock the vault** after idle (1Password's Quick Access `Cmd+Shift+Space` re-prompts for master password; we should mirror that for the renderer when keys are read).
- **Discovered `.env` import** (1Password Watchtower pattern) — scan the user's filesystem for plaintext secrets, offer to vault them.
- **Theme picker** (Linear onboarding step 2). Currently dark-only; "Hoist Dark" is the only theme. A "Hoist Light" with the same surface ladder is straightforward to add since we use CSS variables.
- **Multi-window support** — currently a single `BrowserWindow`. The IPC handler is already window-agnostic; the renderer would just need a per-window `App.tsx` state slice.
- **Detail rail actions** — wire the buttons to actual IPC (Probe now → `probe.run`, Edit → opens a form, Delete → `vault.delete`).
- **Settings panel** — surface-level settings (theme, auto-lock timeout, keytar backend toggle, GitHub repo for issue tracking) in a modal. Mirrors Claude Code's `/config` tabbed interface.

---

## 11. File map

```
src/renderer/
  App.tsx                       3-pane shell + 4 surfaces + palette
  main.tsx                      React entry, imports the 3 stylesheets
  index.html                    <head> + Inter webfont + CSP
  index.css                     (empty — reserved for global resets)
  styles/
    tokens.css                  surface ladder, accent, radii, type, spacing
    components.css              .btn, .input, .card, .badge, .kbd, .icon
    layout.css                  3-pane grid + each surface's CSS

src/main/                        (unchanged — IPC layer)
  ipc.ts                         11 channels, vault/installer/probe/gateway
  providers/                     ProviderEntry + catalog + generator
  gateways/                      GatewayEntry + catalog + resolver
  wiring/                        Per-harness writers (claudeCode, codex, openCode)
  secrets/                       safeStorage backend (ADR-0001)
  probes/                        Anthropic probe + runProbe dispatcher

cli/src/                         (unchanged — CLI companion)
  index.ts                       hoist install / keys / gateway / harness commands

docs/
  design.md                     this file
  adr/
    0001-secret-storage-backend-abstraction.md
    0002-provider-registry-catalog.md
    0003-key-validity-and-expiry-probing.md
    0004-bundled-external-binaries.md
```

---

## 12. Verification checklist (for PR review)

Every visual change should pass this:

- [ ] All new colors reference tokens (`var(--accent)`, `var(--surface-2)`), never hex
- [ ] Icons are Lucide components with `size` and `strokeWidth`, never emoji or inline SVG
- [ ] Buttons use `.btn` (with `.btn-primary` for primary actions), never raw `<button>` styling
- [ ] Pills (`.btn-pill` + `.radius-pill`) only on primary CTAs — not on ghost/icon buttons
- [ ] Status badges use `.badge-ok` / `.badge-warn` / `.badge-bad`, never raw color spans
- [ ] List rows use `.hoist-list-row` + `.hoist-list-row-icon` + `.hoist-list-row-meta`, not bespoke divs
- [ ] Modal backdrop is `.hoist-modal-backdrop` + `.hoist-modal` (or `.hoist-modal-lg`)
- [ ] Keyboard shortcut labels are `.kbd` chips
- [ ] Surface title uses `.hoist-pane-title` + the surface header pattern (`<PaneHeader … />`)
- [ ] If the change adds a status field, update the Watchtower tiles too
- [ ] If the change adds an icon, pick from the Lucide mapping table (don't add a new package)

---

*Last updated: 2026-08 — written alongside PR #22.*
