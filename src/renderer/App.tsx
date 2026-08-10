import { useCallback, useEffect, useRef, useState } from 'react'
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
  CircleHelp,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
  Copy,
  AlertTriangle,
  Activity,
} from 'lucide-react'
import type { HoistAPI, LibraryEntry } from '../preload/api'
import { analyzeLibrary, type DoctorFinding } from '../shared/doctor'

declare global {
  interface Window {
    hoist: HoistAPI
  }
}

type SurfaceId = 'library' | 'harnesses' | 'keys' | 'gateway' | 'status' | 'doctor'
type ScopeId = 'all' | 'anthropic' | 'openai'
type LibraryFilter = 'all' | 'harnesses' | 'runtimes' | 'package-managers' | 'installed' | 'available'

interface SidebarSection {
  id: SurfaceId
  label: string
  icon: React.ReactNode
  count?: number
  active?: boolean
}

interface SidebarGroup {
  label: string
  items: SidebarSection[]
}

type HarnessStatus = 'installed' | 'installing' | 'available' | 'failed' | 'deprecated'

const WIDTH_KEYS = {
  sidebar: 'hoist.width.sidebar',
  detail: 'hoist.width.detail',
} as const

function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.round(n)))
  } catch {
    return fallback
  }
}

function useResizableWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(() => readStoredWidth(key, initial, min, max))
  const widthRef = useRef(width)
  widthRef.current = width
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(key, String(width)) } catch { /* ignore */ }
  }, [key, width])

  /** dir: +1 grows when pointer moves right; -1 grows when pointer moves left */
  const beginResize = useCallback((dir: 1 | -1) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widthRef.current
    setDragging(true)
    document.body.classList.add('is-col-resizing')

    const onMove = (ev: MouseEvent) => {
      const next = Math.min(max, Math.max(min, Math.round(startW + dir * (ev.clientX - startX))))
      setWidth(next)
    }
    const onUp = () => {
      setDragging(false)
      document.body.classList.remove('is-col-resizing')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [min, max])

  return { width, dragging, beginResize }
}

export function App() {
  const [surface, setSurface] = useState<SurfaceId>('library')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [library, setLibrary] = useState<LibraryEntry[]>([])
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('claude-code')

  const sidebar = useResizableWidth(WIDTH_KEYS.sidebar, 232, 180, 420)
  const detail = useResizableWidth(WIDTH_KEYS.detail, 400, 320, 720)
  const [navExpanded, setNavExpanded] = useState(() => {
    try {
      const v = localStorage.getItem('hoist.nav.expanded')
      return v === null ? true : v === '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try { localStorage.setItem('hoist.nav.expanded', navExpanded ? '1' : '0') } catch { /* ignore */ }
  }, [navExpanded])

  useEffect(() => {
    let alive = true
    window.hoist.library
      .list()
      .then((entries) => {
        if (!alive) return
        setLibrary(entries)
        if (entries.length > 0 && !entries.some((e) => e.id === selectedLibraryId)) {
          setSelectedLibraryId(entries[0].id)
        }
      })
      .catch(() => { /* monotonic guard */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setNavExpanded((v) => !v)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectedLibrary = library.find((h) => h.id === selectedLibraryId) ?? library[0]
  const doctorReport = analyzeLibrary(library)
  const doctorIssues = doctorReport.summary.error + doctorReport.summary.warn
  const statusCounts = {
    library: library.length || 7,
    harnesses: 3,
    keys: 4,
    gateway: 1,
    status: 2,
    doctor: doctorIssues,
  }

  const shellStyle = {
    ['--sidebar-width' as string]: `${sidebar.width}px`,
    ['--detail-width' as string]: `${detail.width}px`,
  }

  return (
    <div className="hoist" style={shellStyle}>
      <TopBar onOpenPalette={() => setPaletteOpen(true)} surface={surface} />
      <div className={`hoist-body${navExpanded ? '' : ' is-rail'}`}>
        <NavSidebar
          surface={surface}
          onSurface={setSurface}
          statusCounts={statusCounts}
          expanded={navExpanded}
          onToggleExpand={() => setNavExpanded((v) => !v)}
        />
        {navExpanded && (
          <button
            type="button"
            aria-label="Resize sidebar"
            className={`hoist-resize hoist-resize-sidebar${sidebar.dragging ? ' is-active' : ''}`}
            onMouseDown={sidebar.beginResize(1)}
          />
        )}
        <main className="hoist-main">
          {surface === 'library' && (
            <LibrarySurface
              library={library}
              selectedId={selectedLibraryId}
              onSelect={setSelectedLibraryId}
            />
          )}
          {surface === 'harnesses' && <HarnessesSurface />}
          {surface === 'keys' && <KeysSurface />}
          {surface === 'gateway' && <GatewaySurface />}
          {surface === 'status' && <StatusSurface />}
          {surface === 'doctor' && (
            <DoctorSurface
              report={doctorReport}
              onOpenLibrary={(catalogId) => {
                const hit = library.find((e) => e.catalogId === catalogId && e.primary)
                  ?? library.find((e) => e.catalogId === catalogId)
                if (hit) setSelectedLibraryId(hit.id)
                setSurface('library')
              }}
            />
          )}
        </main>
        <button
          type="button"
          aria-label="Resize detail panel"
          className={`hoist-resize hoist-resize-detail${detail.dragging ? ' is-active' : ''}`}
          onMouseDown={detail.beginResize(-1)}
        />
        <DetailRail surface={surface} selectedLibrary={selectedLibrary} />
      </div>
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onSelect={(id) => {
            setSurface(id)
            setPaletteOpen(false)
          }}
        />
      )}
    </div>
  )
}

function TopBar({ onOpenPalette, surface }: { onOpenPalette: () => void; surface: SurfaceId }) {
  const sectionLabel = surface === 'library' ? 'Library'
    : surface === 'harnesses' ? 'Harnesses'
    : surface === 'keys' ? 'Provider keys'
    : surface === 'gateway' ? 'Gateway'
    : surface === 'doctor' ? 'Doctor'
    : 'Watchtower'
  return (
    <header className="hoist-topbar">
      <div className="hoist-topbar-left">
        <Zap className="hoist-mark" size={16} strokeWidth={2.25} />
        <span className="hoist-brand">hoist</span>
        <span className="hoist-section-divider" />
        <span className="hoist-section-label">{sectionLabel}</span>
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

interface NavSidebarProps {
  surface: SurfaceId
  onSurface: (s: SurfaceId) => void
  statusCounts: Record<SurfaceId, number>
  expanded: boolean
  onToggleExpand: () => void
}

function NavSidebar({ surface, onSurface, statusCounts, expanded, onToggleExpand }: NavSidebarProps) {
  const groups: SidebarGroup[] = [
    {
      label: 'Vault',
      items: [
        { id: 'library', label: 'Library', icon: <Zap size={expanded ? 14 : 16} strokeWidth={2.25} />, count: statusCounts.library, active: surface === 'library' },
        { id: 'harnesses', label: 'Harnesses', icon: <Terminal size={expanded ? 14 : 16} strokeWidth={2.25} />, count: statusCounts.harnesses, active: surface === 'harnesses' },
        { id: 'keys', label: 'Provider keys', icon: <KeyRound size={expanded ? 14 : 16} strokeWidth={2.25} />, count: statusCounts.keys, active: surface === 'keys' },
        { id: 'gateway', label: 'Gateway', icon: <Globe size={expanded ? 14 : 16} strokeWidth={2.25} />, count: statusCounts.gateway, active: surface === 'gateway' },
      ],
    },
    {
      label: 'Health',
      items: [
        { id: 'status', label: 'Watchtower', icon: <ShieldCheck size={expanded ? 14 : 16} strokeWidth={2.25} />, count: statusCounts.status, active: surface === 'status' },
        { id: 'doctor', label: 'Doctor', icon: <Stethoscope size={expanded ? 14 : 16} strokeWidth={2.25} />, count: statusCounts.doctor, active: surface === 'doctor' },
      ],
    },
  ]

  if (!expanded) {
    return (
      <aside className="hoist-rail" aria-label="Navigation">
        <button type="button" className="hoist-rail-account" title="hoist · Personal vault">
          <div className="hoist-account-mark">H</div>
        </button>
        <div className="hoist-rail-section">
          {groups.map((g) => (
            <div key={g.label} className="hoist-rail-group">
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSurface(it.id)}
                  className={`hoist-rail-item${it.active ? ' is-active' : ''}`}
                  title={it.label}
                  aria-label={it.label}
                  aria-current={it.active ? 'page' : undefined}
                >
                  <span className="hoist-rail-item-icon">{it.icon}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="hoist-rail-footer">
          <button
            type="button"
            className="hoist-rail-item"
            title="Expand sidebar (⌘B)"
            aria-label="Expand sidebar"
            onClick={onToggleExpand}
          >
            <span className="hoist-rail-item-icon"><PanelLeftOpen size={16} strokeWidth={2.25} /></span>
          </button>
          <button type="button" className="hoist-rail-item" title="Help" aria-label="Help">
            <span className="hoist-rail-item-icon"><CircleHelp size={16} strokeWidth={2.25} /></span>
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="hoist-sidebar" aria-label="Navigation">
      <div className="hoist-sidebar-top">
        <button type="button" className="hoist-sidebar-account">
          <div className="hoist-account-mark">H</div>
          <div className="hoist-account-meta">
            <div className="hoist-account-name">hoist</div>
            <div className="hoist-account-sub">Personal vault</div>
          </div>
          <ChevronDown className="hoist-account-caret" size={14} />
        </button>
        <button
          type="button"
          className="hoist-sidebar-collapse"
          title="Collapse sidebar (⌘B)"
          aria-label="Collapse sidebar"
          onClick={onToggleExpand}
        >
          <PanelLeftClose size={16} strokeWidth={2.25} />
        </button>
      </div>
      <div className="hoist-sidebar-section">
        {groups.map((g) => (
          <div key={g.label} className="hoist-sidebar-group">
            <div className="hoist-sidebar-group-label">{g.label}</div>
            {g.items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onSurface(it.id)}
                className={`hoist-sidebar-item${it.active ? ' is-active' : ''}`}
                aria-current={it.active ? 'page' : undefined}
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

const LIBRARY_FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'harnesses', label: 'Harnesses' },
  { id: 'runtimes', label: 'Runtimes' },
  { id: 'package-managers', label: 'Pkg mgrs' },
  { id: 'installed', label: 'Installed' },
  { id: 'available', label: 'Available' },
]

/**
 * Normalize version strings. The discover result sometimes returns
 * the harness name as a suffix (e.g. "2.1.211 (Claude Code)") — strip
 * it so the row label stays compact and the right rail can show the
 * bare version separately.
 */
function cleanVersion(v: string | null | undefined, name: string): string {
  if (!v) return ''
  const suffix = `(${name})`
  if (v.endsWith(suffix)) return v.slice(0, -suffix.length).trim()
  return v
}

function statusToBadgeClass(status: HarnessStatus): string {
  switch (status) {
    case 'installed':   return 'badge-ok'
    case 'installing':  return 'badge-info'
    case 'available':   return 'badge-accent'
    case 'failed':      return 'badge-bad'
    case 'deprecated':  return 'badge-merged'
  }
}

function statusLabel(status: HarnessStatus): string {
  switch (status) {
    case 'installed':   return 'installed'
    case 'installing':  return 'installing'
    case 'available':   return 'available'
    case 'failed':      return 'failed'
    case 'deprecated':  return 'deprecated'
  }
}

function homebrewLabel(h: LibraryEntry['homebrew']): string | null {
  if (h === 'formula') return 'Homebrew'
  if (h === 'cask') return 'Homebrew Cask'
  if (h === 'node') return 'Homebrew Node'
  return null
}

/** Second line under a library row. */
function rowSub(h: LibraryEntry): string {
  const bits: string[] = []
  const brew = homebrewLabel(h.homebrew)
  if (brew) bits.push(brew)
  else if (h.packageManager) bits.push(`via ${h.packageManager}`)
  else if (h.source) bits.push(h.source)
  if (h.homebrew === 'node') bits.push('via npm')
  if (h.config.activeModel) bits.push(h.config.activeModel)
  else if (h.path && h.installs.length > 1) bits.push(h.path)
  else if (h.path && !brew && !h.packageManager) bits.push(h.path)
  return bits.join(' · ')
}

function kindLabel(kind: LibraryEntry['kind']): string {
  switch (kind) {
    case 'harness': return 'Harness'
    case 'runtime': return 'Runtime'
    case 'package-manager': return 'Package manager'
  }
}

function LibrarySurface({
  library,
  selectedId,
  onSelect,
}: {
  library: LibraryEntry[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [search, setSearch] = useState('')

  const filtered = library.filter((h) => {
    if (filter === 'harnesses' && h.kind !== 'harness') return false
    if (filter === 'runtimes' && h.kind !== 'runtime') return false
    if (filter === 'package-managers' && h.kind !== 'package-manager') return false
    if (filter === 'installed' && h.status !== 'installed') return false
    if (filter === 'available' && h.status !== 'available') return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${h.name} ${h.id} ${h.catalogId} ${h.source ?? ''} ${h.packageManager ?? ''} ${h.path ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const selected = library.find((h) => h.id === selectedId) ?? library[0]
  const hasSelection = Boolean(selected)

  return (
    <section className="hoist-pane hoist-library">
      <PaneHeader
        title="Library"
        subtitle="Harnesses, runtimes, and package managers detected on this machine."
        primaryAction={
          hasSelection && selected.status === 'installed' ? (
            <button type="button" className="btn btn-ghost btn-pill">Refresh</button>
          ) : (
            <button type="button" className="btn btn-primary btn-pill" disabled={!hasSelection}>
              Install
            </button>
          )
        }
      />
      <div className="hoist-pane-toolbar">
        <div className="hoist-library-filters">
          {LIBRARY_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`hoist-library-filter${filter === f.id ? ' is-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input hoist-search"
          placeholder="Filter tools…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="hoist-pane-body">
        {filtered.length === 0 ? (
          <div className="muted" style={{ padding: 8 }}>
            {library.length === 0 ? 'Scanning PATH and config…' : 'No tools match this filter.'}
          </div>
        ) : (
          <div className="hoist-list">
            {filtered.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onSelect(h.id)}
                className={`hoist-library-row${selectedId === h.id ? ' is-selected' : ''}${rowSub(h) ? ' has-sub' : ''}`}
              >
                <span className="hoist-library-avatar" aria-hidden>{h.avatar}</span>
                <span className="hoist-library-row-name">
                  {h.name}
                  {h.installs.length > 1 && !h.primary && (
                    <span className="hoist-library-row-dup"> · {h.source}</span>
                  )}
                </span>
                {h.version && <span className="hoist-library-ver">{cleanVersion(h.version, h.name)}</span>}
                <span className={`badge ${statusToBadgeClass(h.status)}`}>
                  {h.status === 'installed' && h.installs.length > 1 && h.primary
                    ? `${h.installs.length} installs`
                    : statusLabel(h.status)}
                </span>
                {rowSub(h) && (
                  <span className="hoist-library-row-sub muted mono">{rowSub(h)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function LibraryInspectionPanel({ entry }: { entry: LibraryEntry | undefined }) {
  const [cardOpen, setCardOpen] = useState(true)
  if (!entry) {
    return (
      <aside className="hoist-rail hoist-rail-detail">
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label muted">Select a tool</div>
        </div>
      </aside>
    )
  }
  const v = cleanVersion(entry.version, entry.name)
  const cfg = entry.config
  const installable = entry.exec != null
  return (
    <aside className="hoist-rail hoist-rail-detail">
      <div className="hoist-rail-section hoist-rail-hero">
        <div className="hoist-rail-hero-top">
          <span className="hoist-rail-hero-avatar" aria-hidden>{entry.avatar}</span>
          <div className="hoist-rail-hero-meta">
            <div className="hoist-rail-hero-heading">
              <h2 className="hoist-rail-hero-title">{entry.name}</h2>
              <div className="hoist-rail-hero-actions">
                {entry.status === 'installed' ? (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm">Open</button>
                    <button type="button" className="btn btn-ghost btn-sm">Configure</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm btn-pill">Install</button>
                )}
              </div>
            </div>
            <div className="hoist-rail-hero-badges">
              <span className={`badge ${statusToBadgeClass(entry.status)}`}>{statusLabel(entry.status)}</span>
              <span className="badge">{kindLabel(entry.kind)}</span>
              {entry.homebrew ? (
                <span className="badge badge-ok-faded">{homebrewLabel(entry.homebrew)}</span>
              ) : (
                <span className="badge badge-merged-faded">not Homebrew</span>
              )}
              {entry.packageManager && entry.packageManager !== 'homebrew' && (
                <span className="badge badge-info-faded">via {entry.packageManager}</span>
              )}
            </div>
            {v && <div className="hoist-rail-hero-sub mono">{v}</div>}
            {entry.source && (
              <div className="hoist-rail-hero-sub">
                {entry.source}{entry.primary ? ' · PATH primary' : ''}
              </div>
            )}
          </div>
        </div>
        <p className="hoist-rail-hero-desc">{entry.desc}</p>
        {cfg.activeModel && (
          <div className="hoist-rail-hero-live">
            <span className="hoist-rail-hero-live-label">Active model</span>
            <span className="hoist-rail-hero-live-value mono">{cfg.activeModel}</span>
          </div>
        )}
      </div>

      <div className="hoist-rail-section">
        <button type="button" className="hoist-rail-section-collapse" onClick={() => setCardOpen((open) => !open)}>
          <span className="hoist-rail-section-label">
            {entry.installs.length > 1 ? `INSTALLS · ${entry.installs.length}` : 'INSTALL'}
          </span>
          <ChevronDown
            className="hoist-rail-section-caret"
            size={12}
            style={{
              opacity: cardOpen ? 1 : 0.4,
              transform: cardOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 120ms ease',
            }}
          />
        </button>
        {cardOpen && (
          <>
            {entry.installs.length > 1 ? (
              <ul className="hoist-rail-install-list">
                {entry.installs.map((inst) => (
                  <li
                    key={inst.realPath}
                    className={`hoist-rail-install-item${inst.path === entry.path ? ' is-current' : ''}`}
                  >
                    <div className="hoist-rail-install-head">
                      <span className="hoist-rail-install-source">{inst.source}</span>
                      {inst.primary && <span className="badge badge-info-faded">PATH</span>}
                      {inst.homebrew ? (
                        <span className="badge badge-ok-faded">{homebrewLabel(inst.homebrew)}</span>
                      ) : (
                        <span className="badge badge-merged-faded">not Homebrew</span>
                      )}
                      {inst.packageManager && inst.packageManager !== 'homebrew' && (
                        <span className="badge badge-info-faded">{inst.packageManager}</span>
                      )}
                      {inst.version && <span className="hoist-rail-install-ver mono">{inst.version}</span>}
                    </div>
                    <div className="hoist-rail-install-path mono">{inst.path}</div>
                    {inst.realPath !== inst.path && (
                      <div className="hoist-rail-install-real mono muted">→ {inst.realPath}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hoist-rail-kv">
                <KV k="version" v={<span className="mono">{v || '—'}</span>} />
                <KV k="path" v={<span className="mono">{entry.exec || '—'}</span>} />
                <KV k="homebrew" v={homebrewLabel(entry.homebrew) ?? 'no'} />
                <KV k="source" v={entry.source || '—'} />
                <KV k="via" v={entry.packageManager || '—'} />
                <KV k="kind" v={kindLabel(entry.kind)} />
                <KV k="id" v={<span className="mono">{entry.catalogId}</span>} />
                <KV k="status" v={entry.status} />
                <KV k="exec" v={<span className="mono">{installable ? 'on PATH' : '—'}</span>} />
              </div>
            )}
          </>
        )}
      </div>

      {entry.kind === 'harness' && (
      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">CONFIG</div>
        <div className="hoist-rail-kv">
          <KV k="active model" v={<span className="mono">{cfg.activeModel || '—'}</span>} />
          <KV k="provider" v={cfg.provider || '—'} />
          <KV k="auth" v={<span className="mono">{cfg.authStatus || '—'}</span>} />
          {cfg.installDir && <KV k="install dir" v={<span className="mono">{cfg.installDir}</span>} />}
        </div>
      </div>
      )}

      {entry.kind === 'harness' && cfg.models.length > 0 && (
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label">MODELS ({cfg.models.length})</div>
          <ul className="hoist-rail-model-list">
            {cfg.models.map((m) => (
              <li key={m} className="hoist-rail-model-item">
                <span className="hoist-rail-model-glyph">›</span>
                <span className="hoist-rail-model-name">{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">REINSTALL</div>
        <pre className="hoist-terminal">{`$ hoist install ${entry.catalogId}${v ? `\n# latest ${v}` : ''}`}</pre>
      </div>
    </aside>
  )
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="hoist-rail-kvrow">
      <span className="hoist-rail-kvkey">{k}</span>
      <span className="hoist-rail-kvval">{v}</span>
    </div>
  )
}

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
          {harnesses.map((tool, i) => (
            <button key={tool.id} className={`hoist-list-row${i === 0 ? ' is-selected' : ''}`}>
              <span className="hoist-list-row-icon">
                {tool.id === 'claude-code' ? <Zap size={16} strokeWidth={2.25} /> : tool.id === 'opencode' ? <Terminal size={16} strokeWidth={2.25} /> : <SquareTerminal size={16} strokeWidth={2.25} />}
              </span>
              <div className="hoist-list-row-body">
                <div className="hoist-list-row-title">{tool.name}</div>
                <div className="hoist-list-row-sub muted">{tool.desc}</div>
              </div>
              <div className="hoist-list-row-meta">
                {tool.version !== '—' ? (
                  <span className="badge badge-ok">v{tool.version}</span>
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

function KeysSurface() {
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [scope, setScope] = useState<ScopeId>('all')
  const entries = [
    { id: 'anthropic',  name: 'Anthropic',   kind: 'api_key', env: 'ANTHROPIC_API_KEY',  preview: 'sk-ant-…9def', status: 'ok',   lastProbe: '12 min ago' },
    { id: 'openai',     name: 'OpenAI',      kind: 'api_key', env: 'OPENAI_API_KEY',     preview: 'sk-…81ab2',  status: 'ok',   lastProbe: '4 min ago' },
    { id: 'vertex',     name: 'Google Vertex', kind: 'cloud_creds', env: '—',           preview: 'project: acme-prod · region: us-central1', status: 'ok', lastProbe: '1h ago' },
    { id: 'bedrock',    name: 'AWS Bedrock', kind: 'cloud_creds', env: '—',           preview: 'profile: default · region: us-east-1',    status: 'bad', lastProbe: 'never' },
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
    case 'anthropic': return <span style={{ fontWeight: 600, fontSize: 13 }}>A</span>
    case 'openai':    return <Circle size={14} />
    case 'vertex':    return <span style={{ fontWeight: 600, fontSize: 13 }}>V</span>
    case 'bedrock':   return <span style={{ fontWeight: 600, fontSize: 13 }}>B</span>
    case 'groq':      return <span style={{ fontWeight: 600, fontSize: 13 }}>G</span>
    default:          return <Circle size={14} />
  }
}

function ScopePicker({ value, onChange }: { value: ScopeId; onChange: (v: ScopeId) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const opts: { id: ScopeId; label: string }[] = [
    { id: 'all', label: 'All providers' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
  ]

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`hoist-scope-picker${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="hoist-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown className="hoist-scope-icon" size={12} strokeWidth={2.5} />
        <span>{opts.find((o) => o.id === value)?.label}</span>
      </button>
      {open && (
        <div className="hoist-scope-menu" role="listbox">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              className={`hoist-scope-item${o.id === value ? ' is-active' : ''}`}
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
            >
              <span className="hoist-scope-check-slot">
                {o.id === value && <Check className="hoist-scope-check" size={12} strokeWidth={2.5} />}
              </span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewItemCatalogue({ onClose }: { onClose: () => void }) {
  const tiles = [
    { id: 'anthropic',    title: 'Anthropic API key',     desc: 'sk-ant-…',              icon: <span style={{ fontWeight: 600 }}>A</span>, accent: true },
    { id: 'openai',       title: 'OpenAI API key',        desc: 'sk-…',                   icon: <Circle size={18} strokeWidth={2.25} /> },
    { id: 'azure',        title: 'Azure OpenAI',          desc: 'endpoint + deployment + key', icon: <span style={{ fontWeight: 600 }}>Az</span> },
    { id: 'vertex',       title: 'Google Vertex AI',      desc: 'project + region + ADC',     icon: <span style={{ fontWeight: 600 }}>V</span> },
    { id: 'bedrock',      title: 'AWS Bedrock',           desc: 'profile + region',           icon: <span style={{ fontWeight: 600 }}>B</span> },
    { id: 'custom-openai', title: 'Custom OpenAI endpoint', desc: 'OpenAI-compatible URL',      icon: <Circle size={18} strokeWidth={2.25} /> },
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

function GatewaySurface() {
  const gateways = [
    { id: 'corporate',   label: 'Corporate AI gateway',  url: 'https://gateway.<your-org>.com',     placeholder: true,  native: 'anthropic, openai',       env: 'GATEWAY_API_KEY' },
    { id: 'truefoundry', label: 'TrueFoundry AI Gateway', url: 'https://gateway.truefoundry.ai',      placeholder: false, native: 'anthropic, openai, bedrock, vertex, azure-foundry', env: 'TFY_API_KEY' },
    { id: 'litellm',     label: 'LiteLLM Proxy',         url: 'http://localhost:4000',              placeholder: false, native: 'anthropic, openai, azure, vertex, bedrock', env: 'LITELLM_API_KEY' },
    { id: 'cloudflare',  label: 'Cloudflare AI Gateway', url: 'https://gateway.ai.cloudflare.com/v1/<account_id>', placeholder: true,  native: 'openai, anthropic, workers-ai', env: 'CF_API_TOKEN' },
    { id: 'vercel',      label: 'Vercel AI Gateway',     url: 'https://api.vercel.com/v1/ai',        placeholder: false, native: 'openai, anthropic, google', env: 'VERCEL_API_KEY' },
    { id: 'openrouter',  label: 'OpenRouter',            url: 'https://openrouter.ai/api/v1',       placeholder: false, native: 'openai, anthropic, google, meta, mistral', env: 'OPENROUTER_API_KEY' },
    { id: 'together',    label: 'Together AI',           url: 'https://api.together.xyz/v1',        placeholder: false, native: 'openai-compat', env: 'TOGETHER_API_KEY' },
    { id: 'opencode',    label: 'OpenCode Zen',          url: 'https://opencode.ai/zen/v1',         placeholder: false, native: 'anthropic, openai, google', env: 'OPENCODE_ZEN_API_KEY' },
    { id: 'zenlayer',    label: 'ZenLayer AI Gateway',   url: 'https://gateway.theturbo.ai',        placeholder: false, native: 'openai, anthropic, google', env: 'ZENLAYER_API_KEY' },
    { id: 'claude-code-compatible', label: 'Claude Code-compatible (custom)', url: '(custom)', placeholder: true, native: 'anthropic', env: 'ANTHROPIC_API_KEY' },
    { id: 'custom-openai', label: 'Custom OpenAI-compatible endpoint', url: '(custom)', placeholder: true, native: 'openai-compat', env: 'PROVIDER_API_KEY' },
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
            <button key={s.key} type="button" className={`hoist-stat-card is-${s.badge}`}>
              <div className="hoist-stat-value">{s.value}</div>
              <span className={`badge badge-${s.badge}`}>{s.label}</span>
              <div className="hoist-stat-sub">{s.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function doctorSeverityBadge(severity: DoctorFinding['severity']): string {
  switch (severity) {
    case 'error': return 'badge-bad'
    case 'warn': return 'badge-warn'
    case 'info': return 'badge-info-faded'
    case 'ok': return 'badge-ok'
  }
}

function DoctorSurface({
  report,
  onOpenLibrary,
}: {
  report: ReturnType<typeof analyzeLibrary>
  onOpenLibrary: (catalogId: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(report.findings[0]?.id ?? null)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <section className="hoist-pane hoist-doctor">
      <PaneHeader
        title="Doctor"
        subtitle="PATH shadows, mixed install channels, and package-manager conflicts."
        primaryAction={
          <button type="button" className="btn btn-ghost btn-pill" onClick={() => window.location.reload()}>
            Re-scan
          </button>
        }
      />
      <div className="hoist-pane-body">
        <div className="hoist-doctor-summary">
          <div className={`hoist-doctor-pill is-error${report.summary.error ? ' is-hot' : ''}`}>
            <AlertTriangle size={14} strokeWidth={2.25} />
            <span className="hoist-doctor-pill-n">{report.summary.error}</span>
            <span>errors</span>
          </div>
          <div className={`hoist-doctor-pill is-warn${report.summary.warn ? ' is-hot' : ''}`}>
            <Activity size={14} strokeWidth={2.25} />
            <span className="hoist-doctor-pill-n">{report.summary.warn}</span>
            <span>warnings</span>
          </div>
          <div className="hoist-doctor-pill is-info">
            <span className="hoist-doctor-pill-n">{report.summary.info}</span>
            <span>info</span>
          </div>
          <div className="hoist-doctor-pill is-ok">
            <Check size={14} strokeWidth={2.5} />
            <span className="hoist-doctor-pill-n">{report.summary.ok}</span>
            <span>clear</span>
          </div>
        </div>

        <div className="hoist-doctor-list">
          {report.findings.map((f) => {
            const open = openId === f.id
            return (
              <article key={f.id} className={`hoist-doctor-card is-${f.severity}${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="hoist-doctor-card-head"
                  onClick={() => setOpenId(open ? null : f.id)}
                  aria-expanded={open}
                >
                  <span className={`badge ${doctorSeverityBadge(f.severity)}`}>{f.severity}</span>
                  <span className="hoist-doctor-card-title">{f.title}</span>
                  <ChevronDown
                    size={14}
                    className="hoist-doctor-card-caret"
                    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
                {open && (
                  <div className="hoist-doctor-card-body">
                    <p className="hoist-doctor-card-detail">{f.detail}</p>

                    {f.installs && f.installs.length > 0 && (
                      <div className="hoist-doctor-installs">
                        <div className="hoist-doctor-section-label">Installs on PATH</div>
                        <ul className="hoist-rail-install-list">
                          {f.installs.map((inst) => (
                            <li
                              key={inst.path}
                              className={`hoist-rail-install-item${inst.primary ? ' is-current' : ''}`}
                            >
                              <div className="hoist-rail-install-head">
                                <span className="hoist-rail-install-source">{inst.source}</span>
                                {inst.primary && <span className="badge badge-info-faded">PATH</span>}
                                {inst.homebrew && (
                                  <span className="badge badge-ok-faded">
                                    {inst.homebrew === 'cask' ? 'Homebrew Cask' : inst.homebrew === 'node' ? 'Homebrew Node' : 'Homebrew'}
                                  </span>
                                )}
                                {!inst.homebrew && (
                                  <span className="badge badge-merged-faded">not Homebrew</span>
                                )}
                                {inst.version && (
                                  <span className="hoist-rail-install-ver mono">{inst.version}</span>
                                )}
                              </div>
                              <div className="hoist-rail-install-path mono">{inst.path}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="hoist-doctor-resolutions">
                      <div className="hoist-doctor-section-label">Resolve</div>
                      {f.resolutions.map((r, i) => {
                        const cid = `${f.id}:res:${i}`
                        return (
                          <div key={cid} className="hoist-doctor-res">
                            <div className="hoist-doctor-res-label">{r.label}</div>
                            {r.note && <div className="hoist-doctor-res-note muted">{r.note}</div>}
                            {r.command && (
                              <div className="hoist-doctor-cmd">
                                <pre className="hoist-terminal">{r.command}</pre>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => copy(r.command!, cid)}
                                  title="Copy command"
                                >
                                  {copied === cid ? <Check size={14} /> : <Copy size={14} />}
                                  {copied === cid ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {f.catalogId && (
                      <div className="hoist-doctor-card-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onOpenLibrary(f.catalogId!)}
                        >
                          Open in Library
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function DetailRail({ surface, selectedLibrary }: { surface: SurfaceId; selectedLibrary: LibraryEntry | undefined }) {
  if (surface === 'library') return <LibraryInspectionPanel entry={selectedLibrary} />
  if (surface === 'doctor') {
    return (
      <aside className="hoist-rail hoist-rail-detail">
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label">Doctor</div>
          <p className="hoist-rail-hero-desc" style={{ marginTop: 8 }}>
            Findings come from live PATH discovery. Fix PATH shadows first — mixed channels and version skew usually clear once one install owns each tool.
          </p>
        </div>
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label">Checklist</div>
          <ul className="hoist-rail-model-list">
            <li className="hoist-rail-model-item"><span className="hoist-rail-model-glyph">1</span><span className="hoist-rail-model-name">One install per harness on PATH</span></li>
            <li className="hoist-rail-model-item"><span className="hoist-rail-model-glyph">2</span><span className="hoist-rail-model-name">One channel (brew *or* asdf *or* npm)</span></li>
            <li className="hoist-rail-model-item"><span className="hoist-rail-model-glyph">3</span><span className="hoist-rail-model-name">One JS package manager per project</span></li>
            <li className="hoist-rail-model-item"><span className="hoist-rail-model-glyph">4</span><span className="hoist-rail-model-name">New shell after PATH changes</span></li>
          </ul>
        </div>
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label">Quick probes</div>
          <pre className="hoist-terminal">{`which -a claude opencode codex node npm bun`}</pre>
        </div>
      </aside>
    )
  }
  return (
    <aside className="hoist-rail hoist-rail-detail">
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

function CommandPalette({ onClose, onSelect }: { onClose: () => void; onSelect: (s: SurfaceId) => void }) {
  const [query, setQuery] = useState('')
  const items = [
    { id: 'install-claude-code', label: 'Install Claude Code', hint: 'npm i -g @anthropic-ai/claude-code', kind: 'Action' },
    { id: 'install-opencode',    label: 'Install OpenCode',    hint: 'npm i -g opencode-ai',                 kind: 'Action' },
    { id: 'install-codex',       label: 'Install Codex',       hint: 'npm i -g @openai/codex',               kind: 'Action' },
    { id: 'keys-set-anthropic',  label: 'Save Anthropic API key…', hint: 'Vault · 30s clipboard auto-clear',     kind: 'Action' },
    { id: 'keys-probe-anthropic',label: 'Probe Anthropic',     hint: 'GET /v1/models · 5s timeout',          kind: 'Action' },
    { id: 'gateway-use-truefoundry', label: 'Use TrueFoundry AI Gateway', hint: 'Wires Claude Code · OpenCode · Codex', kind: 'Gateway' },
    { id: 'gateway-use-corporate',  label: 'Use Corporate AI gateway', hint: 'Fill in <your-org> placeholder',        kind: 'Gateway' },
    { id: 'surface-library',    label: 'Open Library',        hint: 'Detected + available harnesses',        kind: 'Navigate' },
    { id: 'surface-harnesses',  label: 'Open Harnesses',      hint: 'Install + discover agent tools',        kind: 'Navigate' },
    { id: 'surface-keys',       label: 'Open Provider keys',  hint: 'New item catalogue',                   kind: 'Navigate' },
    { id: 'surface-gateway',    label: 'Open Gateway',        hint: '11 gateways · 18 providers',           kind: 'Navigate' },
    { id: 'surface-status',     label: 'Open Watchtower',     hint: 'Key health · last probe',              kind: 'Navigate' },
    { id: 'surface-doctor',     label: 'Open Doctor',         hint: 'PATH conflicts · install channels',    kind: 'Navigate' },
    { id: 'open-claude-settings',label: 'Reveal ~/.claude/settings.json', hint: 'Reveal in Finder', kind: 'Reveal' },
    { id: 'open-opencode',      label: 'Reveal ~/.config/opencode/', hint: 'Reveal in Finder', kind: 'Reveal' },
    { id: 'open-codex',         label: 'Reveal ~/.codex/',     hint: 'Reveal in Finder',                     kind: 'Reveal' },
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
                if (it.id.startsWith('surface-')) {
                  onSelect(it.id.replace('surface-', '') as SurfaceId)
                } else {
                  onClose()
                }
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
