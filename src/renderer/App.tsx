import { useEffect, useState } from 'react'
import {
  Zap,
  Search,
  KeyRound,
  Globe,
  ShieldCheck,
  ChevronDown,
  Check,
  X,
  RotateCw,
  Download,
  Pencil,
  Terminal,
  SquareTerminal,
  Circle,
} from 'lucide-react'
import type { HoistAPI } from '../preload/api'

declare global {
  interface Window {
    hoist: HoistAPI
  }
}

type SurfaceId = 'harnesses' | 'keys' | 'gateway' | 'status'
type ScopeId = 'all' | 'anthropic' | 'openai'

interface SidebarSection {
  id: string
  label: string
  icon: React.ReactNode
  count?: number
  active?: boolean
}

interface SidebarGroup {
  label: string
  items: SidebarSection[]
}

export function App() {
  const [surface, setSurface] = useState<SurfaceId>('harnesses')
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="hoist">
      <TopBar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="hoist-body">
        <Sidebar
          surface={surface}
          onSurface={setSurface}
          statusCounts={{ harnesses: 3, keys: 4, gateway: 1, status: 2 }}
        />
        <main className="hoist-main">
          {surface === 'harnesses' && <HarnessesSurface />}
          {surface === 'keys' && <KeysSurface />}
          {surface === 'gateway' && <GatewaySurface />}
          {surface === 'status' && <StatusSurface />}
        </main>
        <DetailRail surface={surface} />
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onSelect={(id) => { setSurface(id); setPaletteOpen(false) }} />}
    </div>
  )
}

function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="hoist-topbar">
      <div className="hoist-topbar-left">
        <Zap className="hoist-mark" size={16} strokeWidth={2.25} />
        <span className="hoist-brand">hoist</span>
        <span className="hoist-section-divider" />
        <span className="hoist-section-label">Harnesses</span>
      </div>
      <button className="hoist-palette-trigger" onClick={onOpenPalette}>
        <Search className="hoist-palette-icon" size={14} />
        <span>Search providers, gateways, harnesses</span>
        <span className="kbd">⌘</span>
        <span className="kbd">K</span>
      </button>
      <div className="hoist-topbar-right">
        <button className="btn btn-ghost btn-sm">Help</button>
        <button className="btn btn-primary btn-sm btn-pill">+ Add key</button>
      </div>
    </header>
  )
}

function Sidebar({
  surface, onSurface, statusCounts,
}: {
  surface: SurfaceId
  onSurface: (s: SurfaceId) => void
  statusCounts: Record<SurfaceId, number>
}) {
  const groups: SidebarGroup[] = [
    {
      label: 'Vault',
      items: [
        { id: 'harnesses', label: 'Harnesses', icon: <Zap size={14} strokeWidth={2.25} />, count: statusCounts.harnesses, active: surface === 'harnesses' },
        { id: 'keys', label: 'Provider keys', icon: <KeyRound size={14} strokeWidth={2.25} />, count: statusCounts.keys, active: surface === 'keys' },
        { id: 'gateway', label: 'Gateway', icon: <Globe size={14} strokeWidth={2.25} />, count: statusCounts.gateway, active: surface === 'gateway' },
      ],
    },
    {
      label: 'Health',
      items: [
        { id: 'status', label: 'Watchtower', icon: <ShieldCheck size={14} strokeWidth={2.25} />, count: statusCounts.status, active: surface === 'status' },
      ],
    },
  ]
  return (
    <aside className="hoist-sidebar">
      <button className="hoist-sidebar-account">
        <div className="hoist-account-mark">H</div>
        <div className="hoist-account-meta">
          <div className="hoist-account-name">hoist</div>
          <div className="hoist-account-sub">Personal vault</div>
        </div>
        <ChevronDown className="hoist-account-caret" size={14} />
      </button>
      <div className="hoist-sidebar-section">
        {groups.map((g) => (
          <div key={g.label} className="hoist-sidebar-group">
            <div className="hoist-sidebar-group-label">{g.label}</div>
            {g.items.map((it) => (
              <button
                key={it.id}
                onClick={() => onSurface(it.id as SurfaceId)}
                className={`hoist-sidebar-item${it.active ? ' is-active' : ''}`}
              >
                <span className="hoist-sidebar-item-icon">{it.icon}</span>
                <span className="hoist-sidebar-item-label">{it.label}</span>
                {typeof it.count === 'number' && <span className="hoist-sidebar-item-count">{it.count}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="hoist-sidebar-footer">
        <div className="hoist-status-pill"><span className="hoist-dot-ok" /> Vault unlocked</div>
        <div className="hoist-version">v0.0.1-preview</div>
      </div>
    </aside>
  )
}

/* ───── Harnesses surface ────────────────────────────────────────── */

function HarnessesSurface() {
  const harnesses = [
    { id: 'claude-code', name: 'Claude Code', desc: "Anthropic's official agentic coding CLI.", version: '2.1.211', exec: '/usr/local/bin/claude' },
    { id: 'opencode',    name: 'OpenCode',    desc: 'Open-source AI coding agent with a TUI.', version: '1.18.3', exec: '/usr/local/bin/opencode' },
    { id: 'codex',       name: 'Codex',       desc: "OpenAI's terminal coding agent.",         version: '—',     exec: null },
  ]
  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Harnesses"
        subtitle="Detect and install the agent harnesses your team uses."
        primaryAction={<button className="btn btn-primary btn-pill">+ Install</button>}
      />
      <div className="hoist-pane-body">
        <div className="hoist-list">
          {harnesses.map((h, i) => (
            <button key={h.id} className={`hoist-list-row${i === 0 ? ' is-selected' : ''}`}>
              <span className="hoist-list-row-icon">
                {h.id === 'claude-code' ? <Zap size={16} strokeWidth={2.25} /> : h.id === 'opencode' ? <Terminal size={16} strokeWidth={2.25} /> : <SquareTerminal size={16} strokeWidth={2.25} />}
              </span>
              <div className="hoist-list-row-body">
                <div className="hoist-list-row-title">{h.name}</div>
                <div className="hoist-list-row-sub muted">{h.desc}</div>
              </div>
              <div className="hoist-list-row-meta">
                {h.version !== '—' ? (
                  <span className="badge badge-ok">v{h.version}</span>
                ) : (
                  <span className="badge">not installed</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───── Keys surface (1Password item-catalogue pattern) ───────── */

function KeysSurface() {
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [scope, setScope] = useState<ScopeId>('all')

  const entries = [
    { id: 'anthropic',  name: 'Anthropic',   kind: 'api_key', env: 'ANTHROPIC_API_KEY',  preview: 'sk-ant-…9def', status: 'ok',   lastProbe: '12 min ago' },
    { id: 'openai',     name: 'OpenAI',      kind: 'api_key', env: 'OPENAI_API_KEY',     preview: 'sk-…81ab2',  status: 'ok',   lastProbe: '4 min ago' },
    { id: 'vertex',     name: 'Google Vertex', kind: 'cloud_creds', env: '—',             preview: 'project: acme-prod · region: us-central1', status: 'ok', lastProbe: '1h ago' },
    { id: 'bedrock',    name: 'AWS Bedrock', kind: 'cloud_creds', env: '—',             preview: 'profile: default · region: us-east-1',    status: 'bad', lastProbe: 'never' },
  ]

  const visible = entries.filter((e) => scope === 'all' || e.id === scope)

  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Provider keys"
        subtitle="Encrypted at rest in safeStorage. Validated against each provider."
        primaryAction={<button className="btn btn-primary btn-pill" onClick={() => setCatalogueOpen(true)}>+ New key</button>}
      />
      <div className="hoist-pane-toolbar">
        <ScopePicker value={scope} onChange={setScope} />
        <input className="input hoist-search" placeholder="Filter keys…" />
      </div>
      <div className="hoist-pane-body">
        <div className="hoist-list">
          {visible.map((e, i) => (
            <button key={e.id} className={`hoist-list-row${i === 0 ? ' is-selected' : ''}`}>
              <span className="hoist-list-row-icon">{providerGlyph(e.id)}</span>
              <div className="hoist-list-row-body">
                <div className="hoist-list-row-title">
                  {e.name}
                  <span className="badge">{e.kind === 'api_key' ? 'API key' : 'Cloud creds'}</span>
                </div>
                <div className="hoist-list-row-sub muted">
                  <span className="mono">{e.env}</span>
                  <span className="hoist-dot-sep">·</span>
                  <span className="mono">{e.preview}</span>
                </div>
              </div>
              <div className="hoist-list-row-meta">
                {e.status === 'ok'
                  ? <span className="badge badge-ok">valid</span>
                  : <span className="badge badge-bad">invalid</span>}
                <span className="muted hoist-last-probe">{e.lastProbe}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {catalogueOpen && <NewItemCatalogue onClose={() => setCatalogueOpen(false)} />}
    </section>
  )
}

function providerGlyph(id: string): React.ReactNode {
  switch (id) {
    case 'anthropic': return <span style={{fontWeight:600, fontSize: 13}}>A</span>
    case 'openai':    return <Circle size={14} />
    case 'vertex':    return <span style={{fontWeight:600, fontSize: 13}}>V</span>
    case 'bedrock':   return <span style={{fontWeight:600, fontSize: 13}}>B</span>
    case 'groq':      return <span style={{fontWeight:600, fontSize: 13}}>G</span>
    default:          return <Circle size={14} />
  }
}

function ScopePicker({ value, onChange }: { value: ScopeId; onChange: (v: ScopeId) => void }) {
  const opts: { id: ScopeId; label: string }[] = [
    { id: 'all', label: 'All providers' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
  ]
  return (
    <div className="hoist-scope-picker">
      <button className="hoist-scope-trigger">
        <ChevronDown className="hoist-scope-icon" size={12} />
        <span>{opts.find((o) => o.id === value)?.label}</span>
      </button>
      <div className="hoist-scope-menu">
        {opts.map((o) => (
          <button
            key={o.id}
            className={`hoist-scope-item${o.id === value ? ' is-active' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {o.id === value && <Check className="hoist-scope-check" size={12} strokeWidth={2.5} />}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NewItemCatalogue({ onClose }: { onClose: () => void }) {
  const tiles = [
    { id: 'anthropic',    title: 'Anthropic API key',     desc: 'sk-ant-…',          icon: 'A', accent: true },
    { id: 'openai',       title: 'OpenAI API key',        desc: 'sk-…',              icon: <Circle size={18} strokeWidth={2.25} /> },
    { id: 'azure',        title: 'Azure OpenAI',          desc: 'endpoint + deployment + key', icon: 'Az' },
    { id: 'vertex',       title: 'Google Vertex AI',      desc: 'project + region + ADC',     icon: 'V' },
    { id: 'bedrock',      title: 'AWS Bedrock',           desc: 'profile + region',           icon: 'B' },
    { id: 'custom-openai', title: 'Custom OpenAI endpoint', desc: 'OpenAI-compatible URL',      icon: '·' },
  ]
  return (
    <div className="hoist-modal-backdrop" onClick={onClose}>
      <div className="hoist-modal hoist-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="hoist-modal-header">
          <h3>What would you like to add?</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="hoist-modal-body">
          <input className="input input-lg" placeholder="Search by provider…" />
          <div className="hoist-catalogue-grid">
            {tiles.map((t) => (
              <button key={t.id} className={`hoist-catalogue-tile${t.accent ? ' is-featured' : ''}`}>
                <div className="hoist-catalogue-tile-icon">{t.icon}</div>
                <div>
                  <div className="hoist-catalogue-tile-title">{t.title}</div>
                  <div className="hoist-catalogue-tile-sub muted mono">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───── Gateway surface (searchable list with clip-on suggestion) ─ */

function GatewaySurface() {
  const gateways = [
    { id: 'corporate',  label: 'Corporate AI gateway',  url: 'https://gateway.<your-org>.com',     placeholder: true,  native: 'anthropic, openai',       env: 'GATEWAY_API_KEY' },
    { id: 'truefoundry',label: 'TrueFoundry AI Gateway', url: 'https://gateway.truefoundry.ai',      placeholder: false, native: 'anthropic, openai, bedrock, vertex, azure-foundry', env: 'TFY_API_KEY' },
    { id: 'litellm',    label: 'LiteLLM Proxy',         url: 'http://localhost:4000',              placeholder: false, native: 'anthropic, openai, azure, vertex, bedrock', env: 'LITELLM_API_KEY' },
    { id: 'cloudflare', label: 'Cloudflare AI Gateway', url: 'https://gateway.ai.cloudflare.com/v1/<account_id>', placeholder: true, native: 'openai, anthropic, workers-ai', env: 'CF_API_TOKEN' },
    { id: 'vercel',     label: 'Vercel AI Gateway',     url: 'https://api.vercel.com/v1/ai',        placeholder: false, native: 'openai, anthropic, google', env: 'VERCEL_API_KEY' },
    { id: 'openrouter', label: 'OpenRouter',            url: 'https://openrouter.ai/api/v1',       placeholder: false, native: 'openai, anthropic, google, meta, mistral', env: 'OPENROUTER_API_KEY' },
    { id: 'together',   label: 'Together AI',           url: 'https://api.together.xyz/v1',        placeholder: false, native: 'openai-compat', env: 'TOGETHER_API_KEY' },
    { id: 'opencode',   label: 'OpenCode Zen',          url: 'https://opencode.ai/zen/v1',         placeholder: false, native: 'anthropic, openai, google', env: 'OPENCODE_ZEN_API_KEY' },
    { id: 'zenlayer',   label: 'ZenLayer AI Gateway',   url: 'https://gateway.theturbo.ai',        placeholder: false, native: 'openai, anthropic, google', env: 'ZENLAYER_API_KEY' },
    { id: 'claude-code-compatible', label: 'Claude Code-compatible (custom)', url: '(custom)', placeholder: true, native: 'anthropic', env: 'ANTHROPIC_API_KEY' },
  ]
  const [selected, setSelected] = useState('truefoundry')
  const [filter, setFilter] = useState('')

  const filtered = gateways.filter((g) =>
    !filter || g.label.toLowerCase().includes(filter.toLowerCase()) || g.id.includes(filter.toLowerCase()),
  )

  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Gateway"
        subtitle="Point your tools at a hosted gateway or a custom OpenAI/Anthropic-compatible URL."
        primaryAction={<button className="btn btn-primary btn-pill">Apply wiring →</button>}
      />
      <div className="hoist-pane-toolbar">
        <input
          className="input hoist-search"
          placeholder="Filter gateways…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="hoist-pane-body">
        <div className="hoist-list">
          {filtered.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelected(g.id)}
              className={`hoist-list-row${selected === g.id ? ' is-selected' : ''}`}
            >
              <span className="hoist-list-row-icon"><Globe size={16} strokeWidth={2.25} /></span>
              <div className="hoist-list-row-body">
                <div className="hoist-list-row-title">
                  {g.label}
                  {g.placeholder && <span className="badge badge-warn">placeholder</span>}
                </div>
                <div className="hoist-list-row-sub muted mono">{g.url}</div>
                <div className="hoist-list-row-sub muted" style={{ marginTop: 2 }}>
                  native: {g.native} · env: <span className="mono">{g.env}</span>
                </div>
              </div>
              <div className="hoist-list-row-meta">
                {selected === g.id && <Check className="hoist-list-row-check" size={12} strokeWidth={3} />}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───── Watchtower status surface ───────────────────────────────── */

function StatusSurface() {
  const stats = [
    { key: 'stored',    value: 11, label: 'Keys stored',       badge: 'ok',   sub: 'across 4 providers' },
    { key: 'valid',     value: 9,  label: 'Valid right now',   badge: 'ok',   sub: 'last probe < 1h' },
    { key: 'invalid',   value: 1,  label: 'Invalid',           badge: 'bad',  sub: 'Bedrock · never probed' },
    { key: 'expiring',  value: 1,  label: 'Expiring in 30d',   badge: 'warn', sub: 'OpenAI key · set 2025-12' },
    { key: 'reused',    value: 0,  label: 'Reused',            badge: 'ok',   sub: 'across providers' },
    { key: 'harnesses', value: 2,  label: 'Harnesses outdated', badge: 'warn', sub: 'Codex · latest 0.144.3' },
  ]
  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Watchtower"
        subtitle="A health view of your secrets and harnesses."
        primaryAction={<button className="btn btn-primary btn-pill">Re-probe all</button>}
      />
      <div className="hoist-pane-body">
        <div className="hoist-stat-grid">
          {stats.map((s) => (
            <button key={s.key} className={`hoist-stat-card`}>
              <div className="hoist-stat-value">{s.value}</div>
              <div className={`badge badge-${s.badge}`}>{s.label}</div>
              <div className="hoist-stat-sub muted">{s.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───── Right rail (context-aware detail) ─────────────────────────── */

function DetailRail({ surface }: { surface: SurfaceId }) {
  return (
    <aside className="hoist-rail">
      {surface === 'harnesses' && (
        <>
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label">Claude Code</div>
            <Field label="Status" value={<span className="badge badge-ok">installed · v2.1.211</span>} />
            <Field label="Binary" value={<span className="mono">/usr/local/bin/claude</span>} />
            <Field label="Provider" value="Anthropic (configured)" />
            <Field label="Gateway" value="Direct — no gateway" />
          </div>
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label">Actions</div>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}><RotateCw size={14} /> Re-detect</button>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}><Download size={14} /> Update</button>
            <button className="btn btn-ghost btn-sm btn-danger" style={{ width: '100%', justifyContent: 'flex-start' }}><X size={14} /> Uninstall</button>
          </div>
        </>
      )}
      {surface === 'keys' && (
        <>
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label">Anthropic</div>
            <Field label="Status" value={<span className="badge badge-ok">valid</span>} />
            <Field label="Environment variable" value={<span className="mono">ANTHROPIC_API_KEY</span>} />
            <Field label="Last probed" value="12 min ago" />
            <Field label="Preview" value={<span className="mono">sk-ant-…9def</span>} />
          </div>
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label">Actions</div>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}><RotateCw size={14} /> Probe now</button>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}>⎘ Copy (auto-clears 30s)</button>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}><Pencil size={14} /> Edit</button>
            <button className="btn btn-ghost btn-sm btn-danger" style={{ width: '100%', justifyContent: 'flex-start' }}><X size={14} /> Delete</button>
          </div>
        </>
      )}
      {surface === 'gateway' && (
        <>
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label">TrueFoundry AI Gateway</div>
            <Field label="Status" value={<span className="badge badge-accent">configured</span>} />
            <Field label="Base URL" value={<span className="mono">https://gateway.truefoundry.ai</span>} />
            <Field label="Auth header" value={<span className="mono">Authorization: Bearer TFY_API_KEY</span>} />
            <Field label="Native providers" value="anthropic, openai, bedrock, vertex, azure-foundry" />
          </div>
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label">Wired into</div>
            <ul className="hoist-rail-list">
              <li><span className="badge badge-ok">Claude Code</span> <span className="muted mono">env block</span></li>
              <li><span className="badge badge-ok">OpenCode</span> <span className="muted mono">provider block</span></li>
              <li><span className="badge badge-warn">Codex</span> <span className="muted mono">not installed</span></li>
            </ul>
          </div>
        </>
      )}
      {surface === 'status' && (
        <>
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label">Recent probes</div>
            <ul className="hoist-rail-list">
              <li><span className="badge badge-ok">Anthropic</span> <span className="muted">12 min ago</span></li>
              <li><span className="badge badge-ok">OpenAI</span> <span className="muted">4 min ago</span></li>
              <li><span className="badge badge-ok">Vertex</span> <span className="muted">1 hour ago</span></li>
              <li><span className="badge badge-bad">Bedrock</span> <span className="muted">never</span></li>
            </ul>
          </div>
        </>
      )}
    </aside>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="hoist-field">
      <div className="hoist-field-label">{label}</div>
      <div className="hoist-field-value">{value}</div>
    </div>
  )
}

function PaneHeader({
  title, subtitle, primaryAction,
}: { title: string; subtitle?: string; primaryAction?: React.ReactNode }) {
  return (
    <div className="hoist-pane-header">
      <div>
        <h2 className="hoist-pane-title">{title}</h2>
        {subtitle && <p className="hoist-pane-sub muted">{subtitle}</p>}
      </div>
      <div className="hoist-pane-actions">{primaryAction}</div>
    </div>
  )
}

/* ───── Command palette (Quick Access) ────────────────────────────── */

function CommandPalette({ onClose, onSelect }: { onClose: () => void; onSelect: (s: SurfaceId) => void }) {
  const [query, setQuery] = useState('')

  const items = [
    { id: 'install-claude-code', label: 'Install Claude Code',                hint: 'npm i -g @anthropic-ai/claude-code', kind: 'Action' },
    { id: 'install-opencode',    label: 'Install OpenCode',                   hint: 'npm i -g opencode-ai',                 kind: 'Action' },
    { id: 'install-codex',       label: 'Install Codex',                      hint: 'npm i -g @openai/codex',               kind: 'Action' },
    { id: 'keys-set-anthropic',  label: 'Save Anthropic API key…',            hint: 'Vault · 30s clipboard auto-clear',     kind: 'Action' },
    { id: 'keys-probe-anthropic',label: 'Probe Anthropic',                    hint: 'GET /v1/models · 5s timeout',          kind: 'Action' },
    { id: 'gateway-use-truefoundry', label: 'Use TrueFoundry AI Gateway',     hint: 'Wires Claude Code · OpenCode · Codex', kind: 'Gateway' },
    { id: 'gateway-use-corporate',  label: 'Use Corporate AI gateway',      hint: 'Fill in <your-org> placeholder',        kind: 'Gateway' },
    { id: 'surface-harnesses',   label: 'Open Harnesses',                     hint: 'Detect + install agent tools',         kind: 'Navigate' },
    { id: 'surface-keys',        label: 'Open Provider keys',                 hint: 'New item catalogue',                   kind: 'Navigate' },
    { id: 'surface-gateway',     label: 'Open Gateway',                       hint: '11 gateways · 18 providers',           kind: 'Navigate' },
    { id: 'surface-status',      label: 'Open Watchtower',                    hint: 'Key health · last probe',              kind: 'Navigate' },
    { id: 'open-claude-settings',label: 'Reveal ~/.claude/settings.json',      hint: 'Reveal in Finder',                     kind: 'Reveal' },
    { id: 'open-opencode',       label: 'Reveal ~/.config/opencode/',         hint: 'Reveal in Finder',                     kind: 'Reveal' },
    { id: 'open-codex',          label: 'Reveal ~/.codex/',                   hint: 'Reveal in Finder',                     kind: 'Reveal' },
  ]

  const filtered = items.filter((it) =>
    !query || it.label.toLowerCase().includes(query.toLowerCase()) || it.hint.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="hoist-modal-backdrop" onClick={onClose}>
      <div className="hoist-palette" onClick={(e) => e.stopPropagation()}>
        <div className="hoist-palette-input-row">
        <Search className="hoist-palette-icon" size={14} />
          <input
            autoFocus
            className="hoist-palette-input"
            placeholder="Search actions, providers, gateways…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="hoist-palette-body">
          {filtered.map((it) => (
            <button
              key={it.id}
              className="hoist-palette-row"
              onClick={() => {
                if (it.id.startsWith('surface-')) onSelect(it.id.replace('surface-', '') as SurfaceId)
                else onClose()
              }}
            >
              <span className="hoist-palette-row-kind">{it.kind}</span>
              <span className="hoist-palette-row-label">{it.label}</span>
              <span className="hoist-palette-row-hint muted">{it.hint}</span>
            </button>
          ))}
        </div>
        <div className="hoist-palette-footer muted">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> run</span>
          <span><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </div>
  )
}