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

The Hoist designs (in `design.pen`) lay out **five shells** (Three-pane · Sidebar-only · Tabs · Harness grid · CLI-first) and pick the Three-pane as the recommended shell. They document **three real surfaces** (Library · Harness Detail · Install Wizard) with the Library as the canonical harness-management view. The document also defines a **six-component grammar** (install status filled · install status outlined · action buttons · ⌘K command bar · harness table · terminal output) and a **four-card spec** (where each shell wins · one color one state · six tokens three status additions · posture rules).

What we **don't** borrow: Light themes (Hoist is dark-only for now), decorative gradients, sidebars that are themselves apps (cf. 1Password's sidebar-of-vaults is *the* model).

---

## 2. Tokens

All values live in `src/renderer/styles/tokens.css`. Components consume them via CSS variables — never hard-coded.

### Surface ladder

```
--surface-canvas       #1d1d21   Page background
--surface-recessed     #0f0f12   Deeper than canvas (rail backdrop, terminal code block)
--surface-1            #26262c   Sidebar / panel backgrounds
--surface-2            #2f2f37   Elevated surface (hovered tile, input)
--surface-3            #393943   Cards / list rows
--surface-4            #43434f   Selected row / focused surface
```

Dark-only. Depth comes from surface ladder, never from drop shadows. Every chrome element is hairline-bordered against the surface below. The `--surface-recessed` token is reserved for the icon-only nav rail and the terminal code block — surfaces that should feel "behind" the active canvas.

### Rail + sidebar widths

```
--rail-width           56px      Icon-only nav rail (Library: 5 icons + ?)
--sidebar-width         232px    Expanded sidebar w/ labels (extended state)
```

The Library surface uses the rail — a 56px column with a `H` vault mark, 5 nav icons (Harnesses · Keys · Gateway · Account · Settings), and a `?` help button at the bottom. The design system explicitly chose the rail over the sidebar for the Library because the harness list is the primary surface and the icons map 1:1 to it. The 232 px sidebar lives on the other surfaces (Provider keys, Gateway, Watchtower) where the sidebar doubles as a scope picker.

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

/* Status — 5 colors mapped to the design's harness state vocabulary.
   Mapping: installed → ok, installing → info, available → accent,
            deprecated → merged, failed → bad. */
--status-ok            #2da44e   installed
--status-ok-soft       rgba(45,164,78,0.14)
--status-info          #157bf3   installing (reuses accent)
--status-info-soft     rgba(21,123,243,0.14)
--status-accent        #3ec1f3   available (cyan)
--status-accent-soft   rgba(62,193,243,0.14)
--status-merged        #a371f7   deprecated / merged
--status-merged-soft   rgba(163,113,247,0.14)
--status-warn          #d97a00
--status-warn-soft     rgba(217,122,0,0.14)
--status-bad            #cf222e   failed
--status-bad-soft      rgba(207,34,46,0.14)
```

Brand blue is used **only** for: primary CTAs (`+ Install`, `+ New key`, `Apply wiring`, `Re-probe all`), the selected row tint, and the active sidebar item. Nowhere else.

The status palette is wider than the typical 3-color red/yellow/green — it's 5 statuses because harnesses have 5 lifecycle states (installed · installing · available · deprecated · failed). All status badges are **filled** (not outlined), matching the design's pills.

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
| `.badge` | Inline filled pill label | `.badge-ok`, `.badge-ok-faded`, `.badge-info`, `.badge-info-faded`, `.badge-accent`, `.badge-accent-faded`, `.badge-merged`, `.badge-merged-faded`, `.badge-warn`, `.badge-bad`, `.badge-bad-faded` |
| `.kbd` | Keyboard chip in palette/buttons | — |
| `.icon` | Inline SVG flex | `.icon-lg` |

### Badge treatment

**Filled**, not outlined. The design's `installed` badge is a solid green pill (`#2da44e` on white text), not a green outline. Use the `-faded` variant when the badge sits on a tinted background (`accent-soft`) so the color doesn't dominate.

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

The canonical shell is **Three-pane** (rail · list · main · inspector). The design's 5-shell comparison document (`design.pen` → "Layouts Lab → 01 Shells") reaches the same conclusion: *"Three-pane with rail, harness list, focused overview, and inspector — covers Hoist."*

```
┌─────────────────────────────────────────────────────────────┐
│ Topbar   ⚡ hoist  | App · Library · claude-code   ⌘K  +Add │
├──────┬──────────────────────────────────────────┬──────────┤
│ Rail │  List (filter pills, items)         │  Detail   │
│ 56px │  280px                                │  Inspector│
│      │  ┌───────┐                            │  280px   │
│  5   │  │ Main  │                            │           │
│ ico  │  │       │                            │           │
│  + ? │  └───────┘                            │           │
│      │  fills rest                            │           │
└──────┴──────────────────────────────────────────┴──────────┘
```

**3-pane grid**: `56px / 280px / 1fr / 280px` plus the topbar. Implemented in `src/renderer/styles/layout.css`. Other surfaces (Provider keys, Gateway, Watchtower) hide the rail and use the `232px` sidebar instead.

### Topbar

- **Left**: brand mark + section title (e.g., `HARNESSES`) — crumb format `App · Library · claude-code` for the Library surface
- **Center**: palette trigger button — looks like a search input but is a button (clicking opens palette, `⌘K` keyboard shortcut opens palette too)
- **Right**: Help ghost button + primary CTA (`+ Add key`)

### Rail (Library default)

56 px icon-only nav with: `H` vault mark, Harnesses (`Zap`), Keys (`KeyRound`), Gateway (`Globe`), Account (`User`), Settings (`Settings`), spacer, `?` help. Selected item uses `accent-soft` background + accent text + inverted count badge.

### Sidebar (other surfaces)

232 px expanded sidebar with: vault mark + name, item groups (`VAULT` / `HEALTH`), items with icon + label + count badge. Footer: Vault status pill (green dot = unlocked) + version.

### Main pane

Each surface shares this layout:
- **Header**: title + subtitle + primary action pill (top-right)
- **Toolbar** (optional): filter input + scope picker
- **Body**: scrollable list of rows OR stat grid

### Detail rail

Context-aware right pane:
- **Library** → INSTALL (KV pairs), REINSTALL (terminal code block), HEALTH (4 KV pairs with green accent values)
- **Harnesses** → binary path, provider, gateway, action buttons
- **Provider keys** → env var, last-probe, action buttons
- **Gateway** → which harnesses are wired + action buttons
- **Watchtower** → recent probes with status badges

---

## 5. Surfaces

### 5.1 Library (the chosen shell)

**Purpose**: harness-management view — list installed + available harnesses in one place, configure + open each one, see Install + Health + Reinstall in a right rail.

**Layout** (matches `design.pen → Hoist App — Library`):

- **Rail (56 px)**: vault mark + 5 nav icons + `?` help
- **List (280 px)**: title + count, search input, filter pills (`All / Installed / Available / Updates`), then 7 list rows (Claude Code · Codex CLI · Amp · Cursor · OpenCode · Aider · Cline). Each row: 2-letter avatar square, name, version, **filled** status badge (installed = green, installing = blue, available = cyan, failed = red, deprecated = purple)
- **Main**: harness title + comma-separated model links, `Configure` (outlined) + `Open` (filled blue) buttons, description lede, "What you get" checklist with hyphen bullets
- **Inspector (280 px)**: three stacked sections — INSTALL (KV pairs), REINSTALL (terminal code block), HEALTH (4 KV pairs)

**Pattern**: list rows with right-rail context (1Password unlocked vault).

### 5.2 Provider keys

**Purpose**: list of stored keys + scope picker + new-key flow.

**Layout**:
- `+ New key` primary CTA opens the **New Item catalogue** modal
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

Each tile shows the kind icon, name, and monospace descriptor of required fields.

### 5.3 Gateway

**Purpose**: pick a gateway and apply wiring to all harnesses.

**Layout**: searchable list of 11 gateways (Corporate, TrueFoundry, LiteLLM, Cloudflare, Vercel, OpenRouter, Together, OpenCode Zen, ZenLayer, 2 custom). Each row: `Globe` icon, label, URL in monospace, native-provider list, env var. Placeholder warnings inline (`<your-org>` for Corporate).

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

## 6. Component grammar (the design system)

The `design.pen → Layouts Lab → 03 Grammar` section defines 6 reusable component patterns. All should be reflected in the codebase.

| Pattern | Where it lives |
|---|---|
| **Install status · filled** | Status badge in list row: `installed` (green) / `installing` (blue) / `available` (cyan) / `failed` (red) / `deprecated` (purple) |
| **Install status · outlined** | Faded variants (`.badge-*-faded`) for use on tinted backgrounds |
| **Action buttons** | `.btn-primary` (filled blue) for primary, `.btn-ghost` for secondary, `.btn-danger` for destructive |
| **Input + ⌘K command bar** | Palette trigger button hiding inside the topbar |
| **Harness table** | List rows with avatar + name + version + status badge — the core `.hoist-list-row` template |
| **Terminal output** | Code block with `--surface-recessed` background, `font-mono`, dark variant of rail |

---

## 7. Command palette (`⌘K` / `Ctrl+K`)

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

**Pattern**: cmdk / Raycast / 1Password Quick Access — focus stays in input, `aria-activedescendant` pattern.

---

## 8. Status indicators

The design's 5-color status palette maps to the harness lifecycle:

| State | Token | Used for |
|---|---|---|
| `installed` | `--status-ok` (green `#2da44e`) | Valid key · installed harness |
| `installing` | `--status-info` (blue `#157bf3`) | In-progress install |
| `available` | `--status-accent` (cyan `#3ec1f3`) | Listed but not installed |
| `deprecated` | `--status-merged` (purple `#a371f7`) | Older version, no longer recommended |
| `failed` | `--status-bad` (red `#cf222e`) | Install / probe failure |
| `warning` | `--status-warn` (orange `#d97a00`) | Expiring soon, placeholder URL |

Status always appears as a small badge in a list-row meta column, never as a color-filled surface. Color is *evidence*, not decoration.

---

## 9. Mocked vs real (today)

PR #22 (this design) is **visual only**. Every button works as a state update, but no IPC channel is wired.

| Surface | Mocked | Real (todo) |
|---|---|---|
| Harnesses | Hardcoded list with version | `harness.list` / `harness.discover` → live detection |
| Provider keys | Hardcoded 4 entries | `vault.list` / `vault.set` / `vault.delete` / `vault.copy` |
| Gateway | Hardcoded 11 entries | `gateway.list` / `gateway.apply` |
| Watchtower | Hardcoded stats | new `watchtower.summary` IPC + `probe.run` |
| Right rails | Hardcoded fields | Per-surface IPC reads |
| Palette | 13 items hardcoded | Read from a registry, group by category, recent-from-localStorage |

Wire each surface to its IPC in a separate PR so the visual + the data flow stay reviewable.

---

## 10. Adding to this design

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

1. `src/renderer/styles/tokens.css` → add `--status-<name>` + matching soft variant
2. `.badge-<name>` in `components.css` (filled + `-faded` variants)
3. Map it in the relevant surface

---

## 11. Future directions

These are open questions, not commitments:

- **Auto-lock the vault** after idle (1Password's Quick Access `Cmd+Shift+Space` re-prompts for master password; we should mirror that for the renderer when keys are read).
- **Discovered `.env` import** (1Password Watchtower pattern) — scan the user's filesystem for plaintext secrets, offer to vault them.
- **Theme picker** (Linear onboarding step 2). Currently dark-only; "Hoist Dark" is the only theme. A "Hoist Light" with the same surface ladder is straightforward to add since we use CSS variables.
- **Multi-window support** — currently a single `BrowserWindow`. The IPC handler is already window-agnostic; the renderer would just need a per-window `App.tsx` state slice.
- **Detail rail actions** — wire the buttons to actual IPC (Probe now → `probe.run`, Edit → opens a form, Delete → `vault.delete`).
- **Settings panel** — surface-level settings (theme, auto-lock timeout, keytar backend toggle, GitHub repo for issue tracking) in a modal. Mirrors Claude Code's `/config` tabbed interface.
- **The five shells** — `design.pen` lays out three-pane (chosen), sidebar-only, tabs, harness grid, CLI-first. We might want to build the harness-grid shell as an alternate "manager view" for power users who want to see all 7 harnesses in one screen rather than navigating into each.

---

## 12. File map

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

## 13. Verification checklist (for PR review)

Every visual change should pass this:

- [ ] All new colors reference tokens (`var(--accent)`, `var(--surface-2)`), never hex
- [ ] Icons are Lucide components with `size` and `strokeWidth`, never emoji or inline SVG
- [ ] Buttons use `.btn` (with `.btn-primary` for primary actions), never raw `<button>` styling
- [ ] Pills (`.btn-pill` + `.radius-pill`) only on primary CTAs — not on ghost/icon buttons
- [ ] Status badges are **filled** (matching the design's pills) and use `.badge-ok` / `.badge-info` / `.badge-accent` / `.badge-merged` / `.badge-warn` / `.badge-bad`
- [ ] List rows use `.hoist-list-row` + `.hoist-list-row-icon` + `.hoist-list-row-meta`, not bespoke divs
- [ ] Modal backdrop is `.hoist-modal-backdrop` + `.hoist-modal` (or `.hoist-modal-lg`)
- [ ] Keyboard shortcut labels are `.kbd` chips
- [ ] Surface title uses `.hoist-pane-title` + the surface header pattern (`<PaneHeader … />`)
- [ ] If the change adds a status field, update the Watchtower tiles too
- [ ] If the change adds an icon, pick from the Lucide mapping table (don't add a new package)
- [ ] If the change adds a new state to the harness lifecycle, add the matching `--status-*` token + `.badge-*` variant rather than reusing an existing one

---

*Last updated: 2026-08 — written alongside PR #22, refreshed after the `design.pen` review.*
