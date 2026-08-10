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
import type {
  GatewaySummary,
  HarnessWiringResult,
  HoistAPI,
  LibraryEntry,
  ProbeResult,
  ProviderSummary,
  VaultEntry,
} from '../preload/api'
import {
  analyzeLibrary,
  catalogBinaryName,
  type DoctorAction,
  type DoctorFinding,
} from '../shared/doctor'
import { providerIdFromSecretId, secretIdForProvider } from '../shared/secrets'

declare global {
  interface Window {
    hoist: HoistAPI
  }
}

type SurfaceId = 'library' | 'harnesses' | 'keys' | 'gateway' | 'status' | 'doctor'
type LibraryFilter = 'all' | 'harnesses' | 'runtimes' | 'package-managers' | 'installed' | 'available'

interface KeyRow {
  secretId: string
  providerId: string
  name: string
  env: string
  preview: string
  updatedAt?: string
  probe?: ProbeResult
}

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
  const [selectedHarnessId, setSelectedHarnessId] = useState<string>('claude-code')
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [keysBusy, setKeysBusy] = useState(false)
  const [harnessBusy, setHarnessBusy] = useState(false)
  const [addKeyOpen, setAddKeyOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [gateways, setGateways] = useState<GatewaySummary[]>([])
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('truefoundry')
  const [gatewayBusy, setGatewayBusy] = useState(false)
  const [lastWiring, setLastWiring] = useState<HarnessWiringResult[] | null>(null)

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

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }, [])

  const refreshLibrary = useCallback(async () => {
    try {
      const entries = await window.hoist.library.list()
      setLibrary(entries)
      setSelectedLibraryId((cur) => (
        entries.some((e) => e.id === cur) ? cur : (entries[0]?.id ?? cur)
      ))
      setSelectedHarnessId((cur) => {
        const harnesses = entries.filter((e) => e.kind === 'harness')
        return harnesses.some((e) => e.id === cur || e.catalogId === cur)
          ? cur
          : (harnesses.find((e) => e.primary)?.id ?? harnesses[0]?.id ?? cur)
      })
    } catch {
      // ignore
    }
  }, [])

  const refreshKeys = useCallback(async () => {
    try {
      const [vaultRes, providerList] = await Promise.all([
        window.hoist.vault.list(),
        window.hoist.provider.list(),
      ])
      setProviders(providerList)
      if (!vaultRes.ok) {
        setKeys([])
        return
      }
      const byId = new Map(providerList.map((p) => [p.id, p]))
      const rows: KeyRow[] = vaultRes.entries.map((e: VaultEntry) => {
        const pid = providerIdFromSecretId(e.id) ?? e.id
        const prov = byId.get(pid)
        return {
          secretId: e.id,
          providerId: pid,
          name: e.label || prov?.label || pid,
          env: prov?.envKeys?.[0] ?? '—',
          preview: e.preview ?? '••••',
          updatedAt: e.updatedAt,
        }
      })
      setKeys(rows)
      setSelectedKeyId((cur) => {
        if (cur && rows.some((r) => r.secretId === cur)) return cur
        return rows[0]?.secretId ?? null
      })
    } catch {
      setKeys([])
    }
  }, [])

  const refreshGateways = useCallback(async () => {
    try {
      const list = await window.hoist.gateway.list()
      setGateways(list)
      setSelectedGatewayId((cur) => (
        list.some((g) => g.id === cur) ? cur : (list[0]?.id ?? cur)
      ))
    } catch {
      setGateways([])
    }
  }, [])

  useEffect(() => {
    void refreshLibrary()
    void refreshKeys()
    void refreshGateways()
  }, [refreshLibrary, refreshKeys, refreshGateways])

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
  const harnessEntries = library.filter((e) => e.kind === 'harness')
  const selectedHarness =
    harnessEntries.find((h) => h.id === selectedHarnessId || h.catalogId === selectedHarnessId)
    ?? harnessEntries.find((h) => h.primary)
    ?? harnessEntries[0]
  const selectedKey = keys.find((k) => k.secretId === selectedKeyId) ?? keys[0]

  const installHarness = useCallback(async (catalogId: string) => {
    setHarnessBusy(true)
    try {
      const res = await window.hoist.harness.install(catalogId)
      if (!res.ok) {
        showToast(res.error ?? 'Install failed')
      } else {
        showToast(`Installed ${catalogId}`)
      }
      await refreshLibrary()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
    } finally {
      setHarnessBusy(false)
    }
  }, [refreshLibrary, showToast])

  const probeKey = useCallback(async (row: KeyRow) => {
    setKeysBusy(true)
    try {
      const res = await window.hoist.probe.run({
        providerId: row.providerId,
        secretId: row.secretId,
      })
      if (!res.ok || !res.result) {
        showToast(res.error ?? 'Probe failed')
        return
      }
      setKeys((prev) => prev.map((k) => (
        k.secretId === row.secretId ? { ...k, probe: res.result } : k
      )))
      showToast(res.result.valid ? `${row.name} valid` : `${row.name}: ${res.result.detail ?? res.result.status}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
    } finally {
      setKeysBusy(false)
    }
  }, [showToast])

  const deleteKey = useCallback(async (secretId: string) => {
    setKeysBusy(true)
    try {
      const res = await window.hoist.vault.delete(secretId)
      if (!res.ok) showToast(res.error ?? 'Delete failed')
      else showToast('Key deleted')
      await refreshKeys()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
    } finally {
      setKeysBusy(false)
    }
  }, [refreshKeys, showToast])

  const copyKey = useCallback(async (secretId: string) => {
    try {
      const res = await window.hoist.vault.copy(secretId)
      if (!res.ok) showToast(res.error ?? 'Copy failed')
      else showToast(`Copied · clears in ${(res.clearedInMs ?? 30000) / 1000}s`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
    }
  }, [showToast])

  const saveKey = useCallback(async (providerId: string, value: string, label: string) => {
    const id = secretIdForProvider(providerId)
    const res = await window.hoist.vault.set({ id, value, label })
    if (!res.ok) throw new Error(res.error ?? 'Failed to save key')
    await refreshKeys()
    setSelectedKeyId(id)
    // Best-effort probe after save
    void window.hoist.probe.run({ providerId, secretId: id }).then((pr) => {
      if (pr.ok && pr.result) {
        setKeys((prev) => prev.map((k) => (
          k.secretId === id ? { ...k, probe: pr.result } : k
        )))
      }
    })
    showToast(`Saved ${label}`)
  }, [refreshKeys, showToast])

  const runDoctorAction = useCallback(async (action: DoctorAction) => {
    try {
      if (action.type === 'navigate') {
        setSurface(action.surface)
        return
      }
      if (action.type === 'reconfigure') {
        const hit = library.find((e) => e.catalogId === action.harnessId && e.primary)
          ?? library.find((e) => e.catalogId === action.harnessId)
        if (hit) setSelectedLibraryId(hit.id)
        setSurface('library')
        showToast(`Configure ${action.harnessId} in Library → Lifecycle / Configure`)
        return
      }
      if (action.type === 'uninstall') {
        setHarnessBusy(true)
        const res = await window.hoist.harness.uninstall({
          id: action.harnessId,
          prefer: action.prefer,
        })
        showToast(res.message)
        await refreshLibrary()
        return
      }
      if (action.type === 'install' || action.type === 'upgrade') {
        setHarnessBusy(true)
        const res = await window.hoist.harness.install({
          id: action.harnessId,
          prefer: action.prefer,
          force: action.type === 'upgrade' || action.force,
          version: action.type === 'install' ? action.version : undefined,
        })
        if (!res.ok) showToast(res.error ?? 'Install failed')
        else showToast(action.type === 'upgrade' ? `Upgraded ${action.harnessId}` : `Installed ${action.harnessId}`)
        await refreshLibrary()
        return
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
    } finally {
      setHarnessBusy(false)
    }
  }, [library, refreshLibrary, showToast])

  const applyGateway = useCallback(async (opts: {
    gatewayId: string
    baseUrl: string
    providerId: string
    secretId: string
    harnessIds: string[]
  }) => {
    setGatewayBusy(true)
    setLastWiring(null)
    try {
      const res = await window.hoist.gateway.apply({
        gatewayId: opts.gatewayId,
        baseUrl: opts.baseUrl,
        providerId: opts.providerId,
        secretId: opts.secretId,
        harnessIds: opts.harnessIds,
      })
      if (res.wiring) setLastWiring(res.wiring)
      if (!res.ok) {
        showToast(res.error ?? 'Gateway apply failed')
      } else {
        const okN = res.wiring?.filter((w) => w.ok).length ?? 0
        showToast(`Wired ${okN} harness${okN === 1 ? '' : 'es'}${res.effectiveBaseUrl ? ` → ${res.effectiveBaseUrl}` : ''}`)
      }
      return res
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setGatewayBusy(false)
    }
  }, [showToast])

  const doctorReport = analyzeLibrary(library)
  const doctorIssues = doctorReport.summary.error + doctorReport.summary.warn
  const installedHarnessCount = harnessEntries.filter((h) => h.status === 'installed' && h.primary).length
  const selectedGateway = gateways.find((g) => g.id === selectedGatewayId) ?? gateways[0]
  const statusCounts = {
    library: library.length,
    harnesses: installedHarnessCount || harnessEntries.length,
    keys: keys.length,
    gateway: gateways.length,
    status: 2,
    doctor: doctorIssues,
  }

  const shellStyle = {
    ['--sidebar-width' as string]: `${sidebar.width}px`,
    ['--detail-width' as string]: `${detail.width}px`,
  }

  return (
    <div className="hoist" style={shellStyle}>
      <TopBar
        onOpenPalette={() => setPaletteOpen(true)}
        surface={surface}
        onAddKey={() => {
          setSurface('keys')
          setAddKeyOpen(true)
        }}
      />
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
              onRefresh={() => void refreshLibrary()}
            />
          )}
          {surface === 'harnesses' && (
            <HarnessesSurface
              harnesses={harnessesPrimary(harnessEntries)}
              selectedId={selectedHarness?.id ?? null}
              onSelect={setSelectedHarnessId}
              busy={harnessBusy}
              onInstall={(id) => void installHarness(id)}
              onRefresh={() => void refreshLibrary()}
            />
          )}
          {surface === 'keys' && (
            <KeysSurface
              keys={keys}
              providers={providers}
              selectedId={selectedKey?.secretId ?? null}
              onSelect={setSelectedKeyId}
              onAdd={() => setAddKeyOpen(true)}
              busy={keysBusy}
            />
          )}
          {surface === 'gateway' && (
            <GatewaySurface
              gateways={gateways}
              selectedId={selectedGateway?.id ?? null}
              onSelect={setSelectedGatewayId}
              onRefresh={() => void refreshGateways()}
            />
          )}
          {surface === 'status' && (
            <StatusSurface
              keys={keys}
              library={library}
              doctorSummary={doctorReport.summary}
              onReprobeAll={() => {
                void (async () => {
                  for (const k of keys) await probeKey(k)
                })()
              }}
              busy={keysBusy}
            />
          )}
          {surface === 'doctor' && (
            <DoctorSurface
              report={doctorReport}
              busy={harnessBusy}
              onOpenLibrary={(catalogId) => {
                const hit = library.find((e) => e.catalogId === catalogId && e.primary)
                  ?? library.find((e) => e.catalogId === catalogId)
                if (hit) setSelectedLibraryId(hit.id)
                setSurface('library')
              }}
              onAction={(action) => void runDoctorAction(action)}
              onRescan={() => void refreshLibrary()}
            />
          )}
        </main>
        <button
          type="button"
          aria-label="Resize detail panel"
          className={`hoist-resize hoist-resize-detail${detail.dragging ? ' is-active' : ''}`}
          onMouseDown={detail.beginResize(-1)}
        />
        <DetailRail
          surface={surface}
          selectedLibrary={selectedLibrary}
          selectedHarness={selectedHarness}
          selectedKey={selectedKey}
          selectedGateway={selectedGateway}
          recentKeys={keys}
          keys={keys}
          providers={providers}
          library={library}
          doctorReport={doctorReport}
          harnessOptions={harnessesPrimary(harnessEntries)}
          lastWiring={lastWiring}
          harnessBusy={harnessBusy}
          keysBusy={keysBusy}
          gatewayBusy={gatewayBusy}
          onRedetectHarness={() => void refreshLibrary()}
          onInstallHarness={(id) => void installHarness(id)}
          onProbeKey={(row) => void probeKey(row)}
          onCopyKey={(id) => void copyKey(id)}
          onDeleteKey={(id) => void deleteKey(id)}
          onApplyGateway={(opts) => applyGateway(opts)}
          onNavigate={setSurface}
          onOpenLibrary={(catalogId) => {
            const hit = library.find((e) => e.catalogId === catalogId && e.primary)
              ?? library.find((e) => e.catalogId === catalogId)
            if (hit) setSelectedLibraryId(hit.id)
            setSurface('library')
          }}
          onReprobeAll={() => {
            void (async () => {
              for (const k of keys) await probeKey(k)
            })()
          }}
          onToast={showToast}
        />
      </div>
      {addKeyOpen && (
        <AddKeyModal
          providers={providers}
          existingIds={new Set(keys.map((k) => k.providerId))}
          onClose={() => setAddKeyOpen(false)}
          onSave={async (providerId, value, label) => {
            await saveKey(providerId, value, label)
            setAddKeyOpen(false)
          }}
        />
      )}
      {toast && <div className="hoist-toast" role="status">{toast}</div>}
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

function harnessesPrimary(entries: LibraryEntry[]): LibraryEntry[] {
  // One row per catalog family — prefer primary installed, else first.
  const map = new Map<string, LibraryEntry>()
  for (const e of entries) {
    const prev = map.get(e.catalogId)
    if (!prev) {
      map.set(e.catalogId, e)
      continue
    }
    if (e.primary && e.status === 'installed') map.set(e.catalogId, e)
    else if (e.status === 'installed' && prev.status !== 'installed') map.set(e.catalogId, e)
  }
  return [...map.values()]
}

function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const sec = Math.round((Date.now() - t) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function probeBadge(probe?: ProbeResult): { cls: string; label: string } {
  if (!probe) return { cls: '', label: 'not probed' }
  if (probe.status === 'ok' && probe.valid) return { cls: 'badge-ok', label: 'valid' }
  if (probe.status === 'invalid') return { cls: 'badge-bad', label: 'invalid' }
  if (probe.status === 'quota_exceeded') return { cls: 'badge-warn', label: 'quota' }
  if (probe.status === 'expired') return { cls: 'badge-warn', label: 'expired' }
  return { cls: 'badge-bad', label: probe.status }
}

function TopBar({
  onOpenPalette,
  surface,
  onAddKey,
}: {
  onOpenPalette: () => void
  surface: SurfaceId
  onAddKey: () => void
}) {
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
      <button type="button" className="hoist-palette-trigger" onClick={onOpenPalette}>
        <Search className="hoist-palette-icon" size={14} />
        <span>Search providers, gateways, harnesses</span>
        <span className="kbd">⌘</span>
        <span className="kbd">K</span>
      </button>
      <div className="hoist-topbar-right">
        <button type="button" className="btn btn-ghost btn-sm">Help</button>
        <button type="button" className="btn btn-primary btn-sm btn-pill" onClick={onAddKey}>+ Add key</button>
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
  onRefresh,
}: {
  library: LibraryEntry[]
  selectedId: string
  onSelect: (id: string) => void
  onRefresh?: () => void
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

  return (
    <section className="hoist-pane hoist-library">
      <PaneHeader
        title="Library"
        subtitle="Harnesses, runtimes, and package managers detected on this machine."
        primaryAction={
          <button type="button" className="btn btn-ghost btn-pill" onClick={onRefresh}>
            Refresh
          </button>
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

function LibraryInspectionPanel({
  entry,
  onRefresh,
  onToast,
}: {
  entry: LibraryEntry | undefined
  onRefresh?: () => void
  onToast?: (msg: string) => void
}) {
  const [cardOpen, setCardOpen] = useState(true)
  const [configOpen, setConfigOpen] = useState(true)
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
                {entry.status === 'installed' && entry.kind === 'harness' ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfigOpen(true)}
                  >
                    Configure
                  </button>
                ) : entry.status !== 'installed' ? (
                  <button type="button" className="btn btn-primary btn-sm btn-pill">Install</button>
                ) : null}
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

      <PathPriorityPanel
        catalogId={entry.catalogId}
        installs={entry.installs}
        currentPath={entry.path}
      />

      <div className="hoist-rail-section">
        <button type="button" className="hoist-rail-section-collapse" onClick={() => setCardOpen((open) => !open)}>
          <span className="hoist-rail-section-label">DETAILS</span>
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
      </div>

      {entry.kind === 'harness' && (
        <>
          <HarnessConfigEditor
            entry={entry}
            open={configOpen}
            onToggle={() => setConfigOpen((o) => !o)}
            onRefresh={onRefresh}
            onToast={onToast}
          />
          <HarnessLifecyclePanel
            entry={entry}
            onRefresh={onRefresh}
            onToast={onToast}
          />
        </>
      )}

      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">REINSTALL</div>
        <pre className="hoist-terminal">{`$ hoist install ${entry.catalogId}${v ? `\n# latest ${v}` : ''}`}</pre>
      </div>
    </aside>
  )
}

function HarnessConfigEditor({
  entry,
  open,
  onToggle,
  onRefresh,
  onToast,
}: {
  entry: LibraryEntry
  open: boolean
  onToggle: () => void
  onRefresh?: () => void
  onToast?: (msg: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [path, setPath] = useState<string | null>(null)
  const [activeModel, setActiveModel] = useState(entry.config.activeModel ?? '')
  const [presets, setPresets] = useState<string[]>([])
  const [discovered, setDiscovered] = useState<string[]>(entry.config.models ?? [])
  const [excerpt, setExcerpt] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [customModel, setCustomModel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const view = await window.hoist.harness.configShow(entry.catalogId)
      if (!view.ok) {
        onToast?.(view.error ?? 'Could not read config')
        return
      }
      setPath(view.path ?? null)
      setActiveModel(view.activeModel ?? entry.config.activeModel ?? '')
      setPresets(view.modelPresets ?? [])
      setExcerpt(view.excerpt ?? null)
      setNotes(view.notes ?? [])
      // Merge live discovered models (OpenCode) with presets
      const merged = [...new Set([
        ...(view.activeModel ? [view.activeModel] : []),
        ...(view.modelPresets ?? []),
        ...(entry.config.models ?? []),
      ])]
      setDiscovered(merged)
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [entry.catalogId, entry.config.activeModel, entry.config.models, onToast])

  useEffect(() => {
    if (open && entry.kind === 'harness') void load()
  }, [open, entry.id, entry.kind, load])

  const saveModel = async (model: string) => {
    const m = model.trim()
    if (!m) return
    setSaving(true)
    try {
      const res = await window.hoist.harness.configSet({ harnessId: entry.catalogId, model: m })
      if (!res.ok) onToast?.(res.error ?? 'Save failed')
      else {
        onToast?.(res.note ?? `Model set to ${m}`)
        setActiveModel(m)
        onRefresh?.()
        void load()
      }
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const resetConfig = async () => {
    if (!window.confirm(`Reset Hoist-managed config for ${entry.name}? This clears gateway env wiring and the active model field.`)) {
      return
    }
    setSaving(true)
    try {
      const res = await window.hoist.harness.configReset({ harnessId: entry.catalogId, clearModel: true })
      if (!res.ok) onToast?.(res.error ?? 'Reset failed')
      else {
        onToast?.(res.note ?? 'Config reset')
        setActiveModel('')
        onRefresh?.()
        void load()
      }
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hoist-rail-section">
      <button type="button" className="hoist-rail-section-collapse" onClick={onToggle}>
        <span className="hoist-rail-section-label">CONFIGURE</span>
        <ChevronDown
          className="hoist-rail-section-caret"
          size={12}
          style={{
            opacity: open ? 1 : 0.4,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
        />
      </button>
      {open && (
        <div className="hoist-config-panel">
          {loading ? (
            <p className="muted" style={{ fontSize: 12 }}>Loading config…</p>
          ) : (
            <>
              <div className="hoist-rail-kv">
                <KV k="active model" v={<span className="mono">{activeModel || '—'}</span>} />
                <KV k="provider" v={entry.config.provider || '—'} />
                <KV k="auth" v={<span className="mono">{entry.config.authStatus || '—'}</span>} />
                {path && <KV k="config file" v={<span className="mono">{path}</span>} />}
              </div>

              <div className="hoist-field-label" style={{ marginTop: 12 }}>Set model</div>
              {discovered.length > 0 ? (
                <select
                  className="input"
                  value={activeModel}
                  disabled={saving}
                  onChange={(e) => {
                    const m = e.target.value
                    setActiveModel(m)
                    if (m) void saveModel(m)
                  }}
                >
                  <option value="">Select a model…</option>
                  {discovered.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {presets.length === 0 ? 'No model list discovered for this harness.' : 'Pick a preset or type a custom id.'}
                </p>
              )}

              {presets.length > 0 && discovered.length === 0 && (
                <div className="hoist-model-presets">
                  {presets.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`hoist-model-chip${activeModel === m ? ' is-active' : ''}`}
                      disabled={saving}
                      onClick={() => void saveModel(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              <div className="hoist-config-custom">
                <input
                  className="input"
                  placeholder="Custom model id…"
                  value={customModel}
                  disabled={saving}
                  onChange={(e) => setCustomModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customModel.trim()) void saveModel(customModel)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={saving || !customModel.trim()}
                  onClick={() => void saveModel(customModel)}
                >
                  Set
                </button>
              </div>

              {notes.length > 0 && (
                <ul className="hoist-config-notes muted">
                  {notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}

              {excerpt && (
                <details className="hoist-config-excerpt">
                  <summary>View config file</summary>
                  <pre className="hoist-terminal">{excerpt}</pre>
                </details>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger"
                style={{ width: '100%', justifyContent: 'flex-start', marginTop: 8 }}
                disabled={saving}
                onClick={() => void resetConfig()}
              >
                Reset Hoist config
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function HarnessLifecyclePanel({
  entry,
  onRefresh,
  onToast,
}: {
  entry: LibraryEntry
  onRefresh?: () => void
  onToast?: (msg: string) => void
}) {
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState<import('../preload/api').HarnessVersionCheck | null>(null)
  const [targetVersion, setTargetVersion] = useState('')
  const [prefer, setPrefer] = useState<'brew' | 'npm'>(entry.homebrew ? 'brew' : 'npm')
  const [rangeChangelog, setRangeChangelog] = useState<import('../preload/api').HarnessChangelogEntry[]>([])

  const current = entry.version

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.hoist.harness.versions({
        id: entry.catalogId,
        current,
      })
      setCheck(res)
      if (res.ok && res.latest) setTargetVersion(res.latest)
      if (res.ok) setRangeChangelog(res.changelog)
      if (!res.ok) onToast?.(res.error ?? 'Version check failed')
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [entry.catalogId, current, onToast])

  useEffect(() => {
    if (open) void loadVersions()
  }, [open, entry.id, loadVersions])

  const loadDiff = async (from: string | null, to: string) => {
    setLoading(true)
    try {
      const res = await window.hoist.harness.versions({
        id: entry.catalogId,
        current: from,
        from,
        to,
      })
      if (res.ok) {
        setRangeChangelog(res.changelog)
        setCheck((prev) => prev ? { ...prev, changelog: res.changelog, compareUrl: res.compareUrl } : res)
      }
    } finally {
      setLoading(false)
    }
  }

  const doInstall = async (opts: { version?: string; force?: boolean }) => {
    setBusy(true)
    try {
      const res = await window.hoist.harness.install({
        id: entry.catalogId,
        version: opts.version,
        prefer,
        force: opts.force,
      })
      if (!res.ok) onToast?.(res.error ?? 'Install failed')
      else onToast?.(opts.version ? `Installed ${entry.name} @ ${opts.version}` : `Updated ${entry.name}`)
      onRefresh?.()
      void loadVersions()
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const doUninstall = async () => {
    if (!window.confirm(`Uninstall ${entry.name}? This removes the ${prefer} package/cask.`)) return
    setBusy(true)
    try {
      const res = await window.hoist.harness.uninstall({ id: entry.catalogId, prefer })
      onToast?.(res.message)
      onRefresh?.()
      void loadVersions()
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const outdated = check?.outdated
  const latest = check?.latest

  return (
    <div className="hoist-rail-section">
      <button type="button" className="hoist-rail-section-collapse" onClick={() => setOpen((o) => !o)}>
        <span className="hoist-rail-section-label">
          LIFECYCLE
          {outdated ? ' · update available' : ''}
        </span>
        <ChevronDown
          className="hoist-rail-section-caret"
          size={12}
          style={{
            opacity: open ? 1 : 0.4,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
        />
      </button>
      {open && (
        <div className="hoist-lifecycle">
          <div className="hoist-rail-kv">
            <KV k="installed" v={<span className="mono">{current || '—'}</span>} />
            <KV
              k="latest"
              v={
                loading && !check ? '…' : (
                  <span className="mono">
                    {latest || '—'}
                    {outdated && <span className="badge badge-warn" style={{ marginLeft: 6 }}>update</span>}
                    {latest && current && !outdated && latest === current && (
                      <span className="badge badge-ok" style={{ marginLeft: 6 }}>current</span>
                    )}
                  </span>
                )
              }
            />
            {check?.packageName && <KV k="package" v={<span className="mono">{check.packageName}</span>} />}
          </div>

          <div className="hoist-field-label" style={{ marginTop: 10 }}>Install method</div>
          <div className="hoist-lifecycle-methods">
            <label className="hoist-gateway-check">
              <input type="radio" name={`m-${entry.id}`} checked={prefer === 'brew'} onChange={() => setPrefer('brew')} />
              <span>Homebrew</span>
            </label>
            <label className="hoist-gateway-check">
              <input type="radio" name={`m-${entry.id}`} checked={prefer === 'npm'} onChange={() => setPrefer('npm')} />
              <span>npm global</span>
            </label>
          </div>

          <div className="hoist-field-label" style={{ marginTop: 10 }}>Version</div>
          <select
            className="input"
            value={targetVersion}
            disabled={busy || loading || !check?.versions.length}
            onChange={(e) => {
              const v = e.target.value
              setTargetVersion(v)
              if (v) void loadDiff(current, v)
            }}
          >
            <option value="">{check?.versions.length ? 'Select version…' : 'No versions loaded'}</option>
            {(check?.versions ?? []).map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}{v.latest ? ' (latest)' : ''}{v.version === current ? ' (installed)' : ''}
              </option>
            ))}
          </select>

          <div className="hoist-lifecycle-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !targetVersion}
              onClick={() => void doInstall({ version: prefer === 'npm' ? targetVersion : undefined, force: prefer === 'brew' })}
              title={prefer === 'brew' ? 'Brew casks install latest; use npm to pin a version' : `npm i -g pkg@${targetVersion}`}
            >
              {busy ? 'Working…' : entry.status === 'installed' ? (prefer === 'npm' && targetVersion && targetVersion !== current ? `Install ${targetVersion}` : 'Upgrade / reinstall') : 'Install'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy || loading}
              onClick={() => void loadVersions()}
            >
              Check updates
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-danger"
              disabled={busy || entry.status !== 'installed'}
              onClick={() => void doUninstall()}
            >
              Uninstall
            </button>
          </div>
          {prefer === 'brew' && (
            <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
              Homebrew installs/upgrades the latest cask. Pin a specific version with npm.
            </p>
          )}

          {(rangeChangelog.length > 0 || (check?.changelog.length ?? 0) > 0) && (
            <div className="hoist-changelog">
              <div className="hoist-field-label">
                Changelog
                {current && targetVersion ? (
                  <span className="muted"> · {current} → {targetVersion}</span>
                ) : outdated && latest ? (
                  <span className="muted"> · {current} → {latest}</span>
                ) : null}
              </div>
              {check?.compareUrl && (
                <a className="hoist-doc-link" href={check.compareUrl} target="_blank" rel="noreferrer">
                  Full diff on GitHub ↗
                </a>
              )}
              <div className="hoist-changelog-list">
                {(rangeChangelog.length ? rangeChangelog : (check?.changelog ?? [])).map((c) => (
                  <details key={c.version} className="hoist-changelog-item" open={c.version === latest || c.version === targetVersion}>
                    <summary className="mono">{c.version}</summary>
                    <pre className="hoist-changelog-body">{c.body || '(no notes)'}</pre>
                  </details>
                ))}
              </div>
            </div>
          )}

          {!loading && check && rangeChangelog.length === 0 && (check.changelog?.length ?? 0) === 0 && (
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              No changelog entries for this range.
              {check.homepage ? <> See <a className="hoist-doc-link" href={check.homepage} target="_blank" rel="noreferrer">homepage</a>.</> : null}
            </p>
          )}
        </div>
      )}
    </div>
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

/**
 * Shows PATH resolution order for a tool: #1 is what a bare `claude` / `node` runs.
 */
function PathPriorityPanel({
  catalogId,
  installs,
  currentPath,
}: {
  catalogId: string
  installs: LibraryEntry['installs']
  currentPath?: string | null
}) {
  const bin = catalogBinaryName(catalogId)
  if (!installs.length) {
    return (
      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">PATH priority</div>
        <p className="hoist-path-empty muted">
          <span className="mono">{bin}</span> is not on PATH.
        </p>
        <pre className="hoist-terminal">{`which -a ${bin}`}</pre>
      </div>
    )
  }

  const winner = installs.find((i) => i.primary) ?? installs[0]

  return (
    <div className="hoist-rail-section">
      <div className="hoist-rail-section-label">PATH priority · {bin}</div>
      <p className="hoist-path-lead">
        Bare <span className="mono">{bin}</span> resolves to{' '}
        <span className="mono">{winner.path}</span>
        {winner.version ? <> · <span className="mono">{winner.version}</span></> : null}
      </p>
      <ol className="hoist-path-list">
        {installs.map((inst, idx) => {
          const isCurrent = currentPath ? inst.path === currentPath : inst.primary
          return (
            <li
              key={inst.realPath}
              className={`hoist-path-item${inst.primary ? ' is-winner' : ''}${isCurrent ? ' is-current' : ''}`}
            >
              <span className="hoist-path-rank mono">{idx + 1}</span>
              <div className="hoist-path-body">
                <div className="hoist-path-meta">
                  <span className="hoist-path-source">{inst.source}</span>
                  {inst.primary && <span className="badge badge-ok-faded">wins PATH</span>}
                  {inst.homebrew && (
                    <span className="badge badge-info-faded">
                      {inst.homebrew === 'cask' ? 'cask' : inst.homebrew === 'node' ? 'brew node' : 'formula'}
                    </span>
                  )}
                  {inst.version && <span className="hoist-path-ver mono">{inst.version}</span>}
                </div>
                <div className="hoist-path-bin mono">{inst.path}</div>
                {inst.realPath !== inst.path && (
                  <div className="hoist-path-real mono muted">→ {inst.realPath}</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <pre className="hoist-terminal">{`which -a ${bin}`}</pre>
    </div>
  )
}

function harnessIcon(catalogId: string): React.ReactNode {
  if (catalogId === 'claude-code') return <Zap size={16} strokeWidth={2.25} />
  if (catalogId === 'opencode') return <Terminal size={16} strokeWidth={2.25} />
  return <SquareTerminal size={16} strokeWidth={2.25} />
}

function HarnessesSurface({
  harnesses,
  selectedId,
  onSelect,
  busy,
  onInstall,
  onRefresh,
}: {
  harnesses: LibraryEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  busy: boolean
  onInstall: (catalogId: string) => void
  onRefresh: () => void
}) {
  const selected = harnesses.find((h) => h.id === selectedId) ?? harnesses[0]
  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Harnesses"
        subtitle="Live installs detected on PATH. Install missing tools or re-detect."
        primaryAction={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-pill" onClick={onRefresh} disabled={busy}>
              Re-detect
            </button>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              disabled={busy || !selected || selected.status === 'installed'}
              onClick={() => selected && onInstall(selected.catalogId)}
            >
              {busy ? 'Working…' : selected?.status === 'installed' ? 'Installed' : '+ Install'}
            </button>
          </div>
        }
      />
      <div className="hoist-pane-body">
        {harnesses.length === 0 ? (
          <div className="muted" style={{ padding: 8 }}>Scanning harnesses…</div>
        ) : (
          <div className="hoist-list">
            {harnesses.map((tool) => {
              const installed = tool.status === 'installed'
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onSelect(tool.id)}
                  className={`hoist-list-row${selectedId === tool.id ? ' is-selected' : ''}`}
                >
                  <span className="hoist-list-row-icon">{harnessIcon(tool.catalogId)}</span>
                  <div className="hoist-list-row-body">
                    <div className="hoist-list-row-title">{tool.name}</div>
                    <div className="hoist-list-row-sub muted">
                      {tool.desc}
                      {tool.path ? <> · <span className="mono">{tool.path}</span></> : null}
                    </div>
                  </div>
                  <div className="hoist-list-row-meta">
                    {installed && tool.version ? (
                      <span className="badge badge-ok">v{tool.version}</span>
                    ) : (
                      <span className="badge">not installed</span>
                    )}
                    {tool.installs.length > 1 && (
                      <span className="badge badge-warn">{tool.installs.length} installs</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function KeysSurface({
  keys,
  providers,
  selectedId,
  onSelect,
  onAdd,
  busy,
}: {
  keys: KeyRow[]
  providers: ProviderSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  busy: boolean
}) {
  const [scope, setScope] = useState<string>('all')
  const [search, setSearch] = useState('')
  const scopes = [
    { id: 'all', label: 'All providers' },
    ...providers.filter((p) => p.featured).map((p) => ({ id: p.id, label: p.label })),
  ]
  const visible = keys.filter((e) => {
    if (scope !== 'all' && e.providerId !== scope) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${e.name} ${e.providerId} ${e.env}`.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Provider keys"
        subtitle="Encrypted at rest in safeStorage. Probe validates against each provider API."
        primaryAction={
          <button type="button" className="btn btn-primary btn-pill" onClick={onAdd} disabled={busy}>
            + New key
          </button>
        }
      />
      <div className="hoist-pane-toolbar">
        <ScopePicker
          value={scope}
          options={scopes}
          onChange={setScope}
        />
        <input
          className="input hoist-search"
          placeholder="Filter keys…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="hoist-pane-body">
        {visible.length === 0 ? (
          <div className="hoist-empty">
            <p className="muted">{keys.length === 0 ? 'No keys in the vault yet.' : 'No keys match this filter.'}</p>
            <button type="button" className="btn btn-primary btn-sm btn-pill" onClick={onAdd}>Add a key</button>
          </div>
        ) : (
          <div className="hoist-list">
            {visible.map((e) => {
              const pb = probeBadge(e.probe)
              return (
                <button
                  key={e.secretId}
                  type="button"
                  onClick={() => onSelect(e.secretId)}
                  className={`hoist-list-row${selectedId === e.secretId ? ' is-selected' : ''}`}
                >
                  <span className="hoist-list-row-icon">{providerGlyph(e.providerId)}</span>
                  <div className="hoist-list-row-body">
                    <div className="hoist-list-row-title">
                      {e.name}
                      <span className="badge">API key</span>
                    </div>
                    <div className="hoist-list-row-sub muted">
                      <span className="mono">{e.env}</span>
                      <span className="hoist-dot-sep">·</span>
                      <span className="mono">{e.preview}</span>
                    </div>
                  </div>
                  <div className="hoist-list-row-meta">
                    <span className={`badge ${pb.cls}`}>{pb.label}</span>
                    <span className="muted hoist-last-probe">
                      {e.probe?.checkedAt ? relativeTime(e.probe.checkedAt) : relativeTime(e.updatedAt)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
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
    case 'google':    return <span style={{ fontWeight: 600, fontSize: 13 }}>G</span>
    default:          return <Circle size={14} />
  }
}

function ScopePicker({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
        <span>{options.find((o) => o.id === value)?.label ?? 'All'}</span>
      </button>
      {open && (
        <div className="hoist-scope-menu" role="listbox">
          {options.map((o) => (
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

function AddKeyModal({
  providers,
  existingIds,
  onClose,
  onSave,
}: {
  providers: ProviderSummary[]
  existingIds: Set<string>
  onClose: () => void
  onSave: (providerId: string, value: string, label: string) => Promise<void>
}) {
  const [step, setStep] = useState<'pick' | 'enter'>('pick')
  const [picked, setPicked] = useState<ProviderSummary | null>(null)
  const [query, setQuery] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const list = providers
    .filter((p) => p.envKeys && p.envKeys.length > 0)
    .filter((p) => {
      if (!query) return true
      const q = query.toLowerCase()
      return p.label.toLowerCase().includes(q) || p.id.includes(q)
    })
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.label.localeCompare(b.label))

  const submit = async () => {
    if (!picked || !value.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(picked.id, value.trim(), picked.label)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="hoist-modal-backdrop" onClick={onClose}>
      <div className="hoist-modal hoist-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="hoist-modal-header">
          <h3>{step === 'pick' ? 'What would you like to add?' : `Add ${picked?.label} key`}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="hoist-modal-body">
          {step === 'pick' ? (
            <>
              <input
                className="input input-lg"
                placeholder="Search by provider…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <div className="hoist-catalogue-grid">
                {list.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`hoist-catalogue-tile${p.featured ? ' is-featured' : ''}`}
                    onClick={() => {
                      setPicked(p)
                      setStep('enter')
                    }}
                  >
                    <div className="hoist-catalogue-tile-icon">{providerGlyph(p.id)}</div>
                    <div>
                      <div className="hoist-catalogue-tile-title">
                        {p.label}
                        {existingIds.has(p.id) && <span className="badge" style={{ marginLeft: 6 }}>stored</span>}
                      </div>
                      <div className="hoist-catalogue-tile-sub muted mono">{p.envKeys[0]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="hoist-addkey-form">
              <p className="muted" style={{ marginTop: 0 }}>
                Stored as <span className="mono">{secretIdForProvider(picked!.id)}</span>.
                Env: <span className="mono">{picked!.envKeys[0]}</span>
              </p>
              <label className="hoist-field-label" htmlFor="key-value">API key</label>
              <input
                id="key-value"
                className="input input-lg"
                type="password"
                autoFocus
                placeholder="Paste secret…"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
              />
              {error && <p className="hoist-form-error">{error}</p>}
              <div className="hoist-addkey-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('pick')} disabled={saving}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-pill"
                  disabled={saving || !value.trim()}
                  onClick={() => void submit()}
                >
                  {saving ? 'Saving…' : 'Save key'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/<([a-zA-Z0-9_-]+)>/g, (_, key: string) => {
    const v = values[key]
    return v && v.trim() ? v.trim() : `<${key}>`
  })
}

function GatewayApplyPanel({
  gateway,
  keys,
  providers,
  harnesses,
  busy,
  lastWiring,
  onApply,
}: {
  gateway: GatewaySummary
  keys: KeyRow[]
  providers: ProviderSummary[]
  harnesses: LibraryEntry[]
  busy: boolean
  lastWiring: HarnessWiringResult[] | null
  onApply?: (opts: {
    gatewayId: string
    baseUrl: string
    providerId: string
    secretId: string
    harnessIds: string[]
  }) => void
}) {
  const placeholders = gateway.placeholders ?? []
  const [phValues, setPhValues] = useState<Record<string, string>>({})
  const [baseUrlOverride, setBaseUrlOverride] = useState(gateway.baseUrl)
  const [secretId, setSecretId] = useState<string>(keys[0]?.secretId ?? '')
  const [providerId, setProviderId] = useState<string>(
    keys[0]?.providerId
    ?? gateway.nativeProviders.find((p) => p === 'anthropic' || p === 'openai')
    ?? gateway.nativeProviders[0]
    ?? 'anthropic',
  )
  const [harnessIds, setHarnessIds] = useState<string[]>(() =>
    harnesses.filter((h) => h.status === 'installed').map((h) => h.catalogId),
  )

  // Reset form when gateway changes
  useEffect(() => {
    setPhValues({})
    setBaseUrlOverride(gateway.baseUrl)
    const preferred = keys.find((k) => gateway.nativeProviders.includes(k.providerId)) ?? keys[0]
    if (preferred) {
      setSecretId(preferred.secretId)
      setProviderId(preferred.providerId)
    }
    setHarnessIds(harnesses.filter((h) => h.status === 'installed').map((h) => h.catalogId))
  }, [gateway.id])

  const resolvedUrl = placeholders.length > 0
    ? fillPlaceholders(gateway.baseUrl, phValues)
    : baseUrlOverride

  const unresolved = (resolvedUrl.match(/<[^>]+>/g) ?? [])
  const canApply = unresolved.length === 0 && !!secretId && harnessIds.length > 0 && !busy

  const toggleHarness = (id: string) => {
    setHarnessIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const providerChoices = (() => {
    const fromKeys = keys.map((k) => ({ id: k.providerId, label: k.name, secretId: k.secretId }))
    // Ensure native providers appear even without keys (user must add key first)
    const seen = new Set(fromKeys.map((p) => p.id))
    for (const pid of gateway.nativeProviders) {
      if (seen.has(pid)) continue
      const prov = providers.find((p) => p.id === pid)
      fromKeys.push({ id: pid, label: prov?.label ?? pid, secretId: '' })
    }
    return fromKeys
  })()

  return (
    <>
      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">{gateway.label}</div>
        <Field
          label="Auth"
          value={<span className="mono">{gateway.auth.header}: {gateway.auth.scheme} {`$${gateway.auth.envVar}`}</span>}
        />
        <Field label="Model format" value={<span className="mono">{gateway.modelIdFormat}</span>} />
        <Field label="Native providers" value={gateway.nativeProviders.join(', ')} />
        {gateway.notes && <p className="hoist-rail-hero-desc" style={{ marginTop: 8 }}>{gateway.notes}</p>}
        {gateway.docUrl && (
          <a className="hoist-doc-link" href={gateway.docUrl} target="_blank" rel="noreferrer">
            Docs ↗
          </a>
        )}
      </div>

      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">Wire harnesses</div>

        {placeholders.length > 0 ? (
          <div className="hoist-gateway-fields">
            {placeholders.map((ph) => (
              <label key={ph} className="hoist-gateway-field">
                <span className="hoist-field-label">{ph}</span>
                <input
                  className="input"
                  placeholder={`<${ph}>`}
                  value={phValues[ph] ?? ''}
                  onChange={(e) => setPhValues((prev) => ({ ...prev, [ph]: e.target.value }))}
                />
              </label>
            ))}
            <div className="hoist-field-label">Resolved URL</div>
            <div className="mono hoist-gateway-resolved">{resolvedUrl}</div>
          </div>
        ) : (
          <label className="hoist-gateway-field">
            <span className="hoist-field-label">Base URL</span>
            <input
              className="input"
              value={baseUrlOverride}
              onChange={(e) => setBaseUrlOverride(e.target.value)}
            />
          </label>
        )}

        <label className="hoist-gateway-field" style={{ marginTop: 10 }}>
          <span className="hoist-field-label">Vault key</span>
          {keys.length === 0 ? (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              No keys saved. Add one under Provider keys first.
            </p>
          ) : (
            <select
              className="input"
              value={secretId}
              onChange={(e) => {
                const sid = e.target.value
                setSecretId(sid)
                const row = keys.find((k) => k.secretId === sid)
                if (row) setProviderId(row.providerId)
              }}
            >
              {keys.map((k) => (
                <option key={k.secretId} value={k.secretId}>
                  {k.name} · {k.preview}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="hoist-gateway-field" style={{ marginTop: 10 }}>
          <span className="hoist-field-label">Provider profile</span>
          <select
            className="input"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          >
            {providerChoices.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.secretId && !keys.some((k) => k.providerId === p.id)}>
                {p.label}{!keys.some((k) => k.providerId === p.id) ? ' (no key)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="hoist-field-label" style={{ marginTop: 12 }}>Harnesses</div>
        <div className="hoist-gateway-harnesses">
          {harnesses.length === 0 && <span className="muted">No harness catalog loaded.</span>}
          {harnesses.map((h) => (
            <label key={h.catalogId} className="hoist-gateway-check">
              <input
                type="checkbox"
                checked={harnessIds.includes(h.catalogId)}
                onChange={() => toggleHarness(h.catalogId)}
              />
              <span>{h.name}</span>
              <span className={`badge ${h.status === 'installed' ? 'badge-ok' : ''}`}>
                {h.status === 'installed' ? (h.version ? `v${h.version}` : 'installed') : 'missing'}
              </span>
            </label>
          ))}
        </div>

        {unresolved.length > 0 && (
          <p className="hoist-form-error" style={{ marginTop: 8 }}>
            Fill placeholders: {unresolved.join(', ')}
          </p>
        )}

        <button
          type="button"
          className="btn btn-primary btn-sm btn-pill"
          style={{ width: '100%', marginTop: 12 }}
          disabled={!canApply}
          onClick={() => onApply?.({
            gatewayId: gateway.id,
            baseUrl: resolvedUrl,
            providerId,
            secretId,
            harnessIds,
          })}
        >
          {busy ? 'Applying…' : 'Apply wiring →'}
        </button>
      </div>

      {lastWiring && lastWiring.length > 0 && (
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label">Last apply</div>
          <ul className="hoist-rail-list">
            {lastWiring.map((w, i) => (
              <li key={`${w.harnessId}-${i}`}>
                <span className={`badge ${w.ok ? 'badge-ok' : 'badge-bad'}`}>{w.harnessName}</span>{' '}
                <span className="muted">{w.ok ? (w.note || w.path || 'updated') : (w.error || 'failed')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function GatewaySurface({
  gateways,
  selectedId,
  onSelect,
  onRefresh,
}: {
  gateways: GatewaySummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
}) {
  const [filter, setFilter] = useState('')
  const filtered = gateways.filter((g) =>
    !filter
    || g.label.toLowerCase().includes(filter.toLowerCase())
    || g.id.includes(filter.toLowerCase())
    || g.baseUrl.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Gateway"
        subtitle="Point harnesses at a hosted gateway or custom OpenAI/Anthropic-compatible URL."
        primaryAction={
          <button type="button" className="btn btn-ghost btn-pill" onClick={onRefresh}>
            Refresh catalog
          </button>
        }
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
        {filtered.length === 0 ? (
          <div className="muted" style={{ padding: 8 }}>
            {gateways.length === 0 ? 'Loading gateway catalog…' : 'No gateways match this filter.'}
          </div>
        ) : (
          <div className="hoist-list">
            {filtered.map((g) => {
              const needsFill = (g.placeholders?.length ?? 0) > 0
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onSelect(g.id)}
                  className={`hoist-list-row${selectedId === g.id ? ' is-selected' : ''}`}
                >
                  <span className="hoist-list-row-icon"><Globe size={16} strokeWidth={2.25} /></span>
                  <div className="hoist-list-row-body">
                    <div className="hoist-list-row-title">
                      {g.label}
                      {needsFill && <span className="badge badge-warn">needs URL</span>}
                    </div>
                    <div className="hoist-list-row-sub muted mono">{g.baseUrl}</div>
                    <div className="hoist-list-row-sub muted" style={{ marginTop: 2 }}>
                      native: {g.nativeProviders.join(', ')} · env:{' '}
                      <span className="mono">{g.auth.envVar}</span>
                    </div>
                  </div>
                  <div className="hoist-list-row-meta">
                    {selectedId === g.id && <Check className="hoist-list-row-check" size={12} strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

/** Lightweight SVG donut — no chart library. */
function DonutChart({
  segments,
  size = 140,
  thickness = 18,
  center,
}: {
  segments: { value: number; color: string; label: string }[]
  size?: number
  thickness?: number
  center?: React.ReactNode
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="hoist-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={thickness}
        />
        {segments.map((seg) => {
          if (seg.value <= 0) return null
          const len = (seg.value / total) * c
          const el = (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offset += len
          return el
        })}
      </svg>
      {center && <div className="hoist-donut-center">{center}</div>}
    </div>
  )
}

function BarChart({
  rows,
}: {
  rows: { label: string; value: number; max: number; color: string; hint?: string }[]
}) {
  return (
    <div className="hoist-barchart">
      {rows.map((row) => {
        const pct = row.max > 0 ? Math.max(2, Math.round((row.value / row.max) * 100)) : 0
        return (
          <div key={row.label} className="hoist-barchart-row">
            <div className="hoist-barchart-label">{row.label}</div>
            <div className="hoist-barchart-track">
              <div
                className="hoist-barchart-fill"
                style={{ width: `${pct}%`, background: row.color }}
              />
            </div>
            <div className="hoist-barchart-value mono">
              {row.value}{row.hint ? ` · ${row.hint}` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SparkBars({
  points,
  color = 'var(--accent)',
}: {
  points: number[]
  color?: string
}) {
  const max = Math.max(1, ...points)
  return (
    <div className="hoist-spark" aria-hidden>
      {points.map((p, i) => (
        <span
          key={i}
          className="hoist-spark-bar"
          style={{ height: `${Math.max(8, Math.round((p / max) * 100))}%`, background: color }}
        />
      ))}
    </div>
  )
}

function StatusSurface({
  keys,
  library,
  doctorSummary,
  onReprobeAll,
  busy,
}: {
  keys: KeyRow[]
  library: LibraryEntry[]
  doctorSummary: { error: number; warn: number; info: number; ok: number }
  onReprobeAll: () => void
  busy: boolean
}) {
  const valid = keys.filter((k) => k.probe?.valid && k.probe.status === 'ok').length
  const invalid = keys.filter((k) => k.probe && (!k.probe.valid || k.probe.status === 'invalid')).length
  const unprobed = keys.length - valid - invalid
  const quota = keys.filter((k) => k.probe?.status === 'quota_exceeded').length

  const harnesses = library.filter((e) => e.kind === 'harness')
  const harnessPrimary = harnessesPrimary(harnesses)
  const harnessInstalled = harnessPrimary.filter((h) => h.status === 'installed').length
  const harnessMulti = harnessPrimary.filter((h) => h.installs.length > 1).length
  const harnessMissing = harnessPrimary.filter((h) => h.status !== 'installed').length

  const runtimes = library.filter((e) => e.kind === 'runtime' && e.primary && e.status === 'installed')
  const pms = library.filter((e) => e.kind === 'package-manager' && e.primary && e.status === 'installed')

  // Channel mix across installed primaries
  const channelCounts: Record<string, number> = {}
  for (const e of library.filter((x) => x.primary && x.status === 'installed')) {
    const ch = e.homebrew === 'formula' ? 'Homebrew'
      : e.homebrew === 'cask' ? 'Cask'
      : e.homebrew === 'node' ? 'npm·HB'
      : e.source === 'asdf' ? 'asdf'
      : e.source === 'Bun' || e.packageManager === 'bun' ? 'Bun'
      : e.source === 'System' ? 'System'
      : (e.packageManager || e.source || 'other')
    channelCounts[ch] = (channelCounts[ch] || 0) + 1
  }
  const channelRows = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      value,
      max: Math.max(...Object.values(channelCounts), 1),
      color: label.startsWith('Homebrew') || label === 'Cask' ? 'var(--status-ok)'
        : label === 'asdf' ? 'var(--status-warn)'
        : label === 'Bun' ? '#f472b6'
        : label === 'System' ? 'var(--text-subtle)'
        : 'var(--accent)',
    }))

  // Synthetic 14-day activity from probe timestamps + key updates (bucketed)
  const days = 14
  const activity = Array.from({ length: days }, () => 0)
  const now = Date.now()
  for (const k of keys) {
    const ts = k.probe?.checkedAt ? Date.parse(k.probe.checkedAt) : (k.updatedAt ? Date.parse(k.updatedAt) : NaN)
    if (!Number.isFinite(ts)) continue
    const dayAgo = Math.floor((now - ts) / 86400000)
    if (dayAgo >= 0 && dayAgo < days) activity[days - 1 - dayAgo] += 1
  }
  // Ensure some visual baseline when empty
  const activityPoints = activity.every((n) => n === 0)
    ? activity.map((_, i) => (i === days - 1 ? Math.max(keys.length, 1) : 0))
    : activity

  const keyDonut = [
    { value: valid, color: 'var(--status-ok)', label: 'valid' },
    { value: invalid, color: 'var(--status-bad)', label: 'invalid' },
    { value: quota, color: 'var(--status-warn)', label: 'quota' },
    { value: Math.max(0, unprobed - quota), color: 'var(--surface-4)', label: 'unprobed' },
  ]

  const harnessDonut = [
    { value: harnessInstalled - harnessMulti, color: 'var(--status-ok)', label: 'installed' },
    { value: harnessMulti, color: 'var(--status-warn)', label: 'multi' },
    { value: harnessMissing, color: 'var(--surface-4)', label: 'missing' },
  ]

  type StatBadge = 'ok' | 'bad' | 'warn'
  const doctorBadge: StatBadge = doctorSummary.error ? 'bad' : doctorSummary.warn ? 'warn' : 'ok'
  const harnessBadge: StatBadge = harnessMulti ? 'warn' : 'ok'
  const stats: { key: string; value: number; label: string; badge: StatBadge; sub: string }[] = [
    { key: 'stored', value: keys.length, label: 'Keys stored', badge: 'ok', sub: `${providersLabel(keys)} providers` },
    { key: 'valid', value: valid, label: 'Valid', badge: 'ok', sub: unprobed ? `${unprobed} not probed` : 'all probed' },
    { key: 'invalid', value: invalid, label: 'Invalid', badge: 'bad', sub: invalid ? 'needs rotation' : 'none' },
    { key: 'doctor', value: doctorSummary.error + doctorSummary.warn, label: 'Doctor issues', badge: doctorBadge, sub: `${doctorSummary.error} err · ${doctorSummary.warn} warn` },
    { key: 'harnesses', value: harnessInstalled, label: 'Harnesses live', badge: harnessBadge, sub: harnessMulti ? `${harnessMulti} multi-install` : `${harnessMissing} available` },
    { key: 'runtimes', value: runtimes.length, label: 'Runtimes', badge: 'ok', sub: `${pms.length} package managers` },
  ]

  return (
    <section className="hoist-pane">
      <PaneHeader
        title="Watchtower"
        subtitle="Live health of vault keys, harness installs, and install channels."
        primaryAction={
          <button
            type="button"
            className="btn btn-primary btn-pill"
            disabled={busy || keys.length === 0}
            onClick={onReprobeAll}
          >
            {busy ? 'Probing…' : 'Re-probe all'}
          </button>
        }
      />
      <div className="hoist-pane-body hoist-watchtower">
        <div className="hoist-stat-grid">
          {stats.map((s) => (
            <div key={s.key} className={`hoist-stat-card is-${s.badge}`}>
              <div className="hoist-stat-value">{s.value}</div>
              <span className={`badge badge-${s.badge}`}>{s.label}</span>
              <div className="hoist-stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="hoist-chart-grid">
          <div className="hoist-chart-card">
            <div className="hoist-chart-head">
              <h3 className="hoist-chart-title">Key health</h3>
              <span className="muted mono">{keys.length} total</span>
            </div>
            <div className="hoist-chart-body hoist-chart-body-row">
              <DonutChart
                segments={keyDonut}
                center={
                  <div className="hoist-donut-label">
                    <strong>{keys.length ? Math.round((valid / Math.max(keys.length, 1)) * 100) : 0}%</strong>
                    <span>valid</span>
                  </div>
                }
              />
              <ul className="hoist-legend">
                {keyDonut.map((s) => (
                  <li key={s.label}>
                    <span className="hoist-legend-swatch" style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span className="mono">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="hoist-chart-card">
            <div className="hoist-chart-head">
              <h3 className="hoist-chart-title">Harness coverage</h3>
              <span className="muted mono">{harnessPrimary.length} catalog</span>
            </div>
            <div className="hoist-chart-body hoist-chart-body-row">
              <DonutChart
                segments={harnessDonut}
                center={
                  <div className="hoist-donut-label">
                    <strong>{harnessInstalled}/{harnessPrimary.length || 0}</strong>
                    <span>live</span>
                  </div>
                }
              />
              <ul className="hoist-legend">
                {harnessDonut.map((s) => (
                  <li key={s.label}>
                    <span className="hoist-legend-swatch" style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span className="mono">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="hoist-chart-card">
            <div className="hoist-chart-head">
              <h3 className="hoist-chart-title">Install channels</h3>
              <span className="muted">where binaries come from</span>
            </div>
            <div className="hoist-chart-body">
              {channelRows.length === 0 ? (
                <p className="muted">No installs discovered yet.</p>
              ) : (
                <BarChart rows={channelRows} />
              )}
            </div>
          </div>

          <div className="hoist-chart-card">
            <div className="hoist-chart-head">
              <h3 className="hoist-chart-title">Vault activity</h3>
              <span className="muted">last 14 days</span>
            </div>
            <div className="hoist-chart-body">
              <SparkBars points={activityPoints} />
              <div className="hoist-spark-axis muted">
                <span>−14d</span>
                <span>today</span>
              </div>
              <p className="hoist-chart-footnote muted">
                Counts key saves and successful probes bucketed by day.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function providersLabel(keys: KeyRow[]): number {
  return new Set(keys.map((k) => k.providerId)).size
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
  onAction,
  onRescan,
  busy,
}: {
  report: ReturnType<typeof analyzeLibrary>
  onOpenLibrary: (catalogId: string) => void
  onAction: (action: DoctorAction) => void
  onRescan: () => void
  busy?: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(
    report.findings.find((f) => f.severity === 'warn' || f.severity === 'error')?.id
    ?? report.findings[0]?.id
    ?? null,
  )
  const [copied, setCopied] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // ignore
    }
  }

  const runFix = async (action: DoctorAction, id: string) => {
    setRunningId(id)
    try {
      onAction(action)
    } finally {
      setTimeout(() => setRunningId(null), 400)
    }
  }

  return (
    <section className="hoist-pane hoist-doctor">
      <PaneHeader
        title="Doctor"
        subtitle="PATH shadows and install channels — with one-click fix and reconfigure actions."
        primaryAction={
          <button type="button" className="btn btn-ghost btn-pill" onClick={onRescan} disabled={busy}>
            {busy ? 'Scanning…' : 'Re-scan'}
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
            const fixActions = f.resolutions.filter((r) => r.action)
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
                  {fixActions.length > 0 && !open && (
                    <span className="badge badge-info-faded">{fixActions.length} fix{fixActions.length === 1 ? '' : 'es'}</span>
                  )}
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

                    {fixActions.length > 0 && (
                      <div className="hoist-doctor-fixbar">
                        <div className="hoist-doctor-section-label">One-click fixes</div>
                        <div className="hoist-doctor-fixbar-row">
                          {fixActions.map((r, i) => {
                            const cid = `${f.id}:fix:${i}`
                            const isPrimary = r.primary
                            const label =
                              r.action?.type === 'upgrade' ? 'Upgrade'
                              : r.action?.type === 'uninstall' ? 'Uninstall duplicate'
                              : r.action?.type === 'reconfigure' ? 'Reconfigure'
                              : r.action?.type === 'install' ? 'Install'
                              : r.label
                            return (
                              <button
                                key={cid}
                                type="button"
                                className={`btn btn-sm ${isPrimary ? 'btn-primary' : 'btn-ghost'}`}
                                disabled={busy || runningId === cid}
                                onClick={() => void runFix(r.action!, cid)}
                                title={r.note || r.label}
                              >
                                {runningId === cid ? 'Working…' : label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="hoist-doctor-resolutions">
                      <div className="hoist-doctor-section-label">Details & commands</div>
                      {f.resolutions.map((r, i) => {
                        const cid = `${f.id}:res:${i}`
                        return (
                          <div key={cid} className={`hoist-doctor-res${r.action ? ' has-action' : ''}`}>
                            <div className="hoist-doctor-res-head">
                              <div className="hoist-doctor-res-label">{r.label}</div>
                              {r.action && (
                                <button
                                  type="button"
                                  className={`btn btn-sm ${r.primary ? 'btn-primary' : 'btn-ghost'}`}
                                  disabled={busy || runningId === `${f.id}:fix-inline:${i}`}
                                  onClick={() => void runFix(r.action!, `${f.id}:fix-inline:${i}`)}
                                >
                                  {runningId === `${f.id}:fix-inline:${i}`
                                    ? '…'
                                    : r.action.type === 'reconfigure'
                                      ? 'Reconfigure'
                                      : r.action.type === 'upgrade'
                                        ? 'Run upgrade'
                                        : r.action.type === 'uninstall'
                                          ? 'Run uninstall'
                                          : 'Run'}
                                </button>
                              )}
                            </div>
                            {r.note && <div className="hoist-doctor-res-note muted">{r.note}</div>}
                            {r.command && (
                              <div className="hoist-doctor-cmd">
                                <pre className="hoist-terminal">{r.command}</pre>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => void copy(r.command!, cid)}
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
                        {f.catalogId === 'claude-code' || f.catalogId === 'opencode' || f.catalogId === 'codex' ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => onAction({ type: 'reconfigure', harnessId: f.catalogId! })}
                          >
                            Reconfigure
                          </button>
                        ) : null}
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

function DetailRail({
  surface,
  selectedLibrary,
  selectedHarness,
  selectedKey,
  selectedGateway,
  recentKeys = [],
  keys = [],
  providers = [],
  library = [],
  doctorReport,
  harnessOptions = [],
  lastWiring = null,
  harnessBusy,
  keysBusy,
  gatewayBusy,
  onRedetectHarness,
  onInstallHarness,
  onProbeKey,
  onCopyKey,
  onDeleteKey,
  onApplyGateway,
  onNavigate,
  onOpenLibrary,
  onReprobeAll,
  onToast,
}: {
  surface: SurfaceId
  selectedLibrary: LibraryEntry | undefined
  selectedHarness?: LibraryEntry
  selectedKey?: KeyRow
  selectedGateway?: GatewaySummary
  recentKeys?: KeyRow[]
  keys?: KeyRow[]
  providers?: ProviderSummary[]
  library?: LibraryEntry[]
  doctorReport?: ReturnType<typeof analyzeLibrary>
  harnessOptions?: LibraryEntry[]
  lastWiring?: HarnessWiringResult[] | null
  harnessBusy?: boolean
  keysBusy?: boolean
  gatewayBusy?: boolean
  onRedetectHarness?: () => void
  onInstallHarness?: (catalogId: string) => void
  onProbeKey?: (row: KeyRow) => void
  onCopyKey?: (secretId: string) => void
  onDeleteKey?: (secretId: string) => void
  onApplyGateway?: (opts: {
    gatewayId: string
    baseUrl: string
    providerId: string
    secretId: string
    harnessIds: string[]
  }) => void
  onNavigate?: (s: SurfaceId) => void
  onOpenLibrary?: (catalogId: string) => void
  onReprobeAll?: () => void
  onToast?: (msg: string) => void
}) {
  if (surface === 'library') {
    return (
      <LibraryInspectionPanel
        entry={selectedLibrary}
        onRefresh={() => onRedetectHarness?.()}
        onToast={onToast}
      />
    )
  }
  if (surface === 'doctor') {
    return (
      <DoctorDetailRail
        report={doctorReport}
        library={library}
        onOpenLibrary={onOpenLibrary}
        onNavigate={onNavigate}
      />
    )
  }
  return (
    <aside className="hoist-rail hoist-rail-detail">
      {surface === 'harnesses' && (
        selectedHarness ? (
          <>
            <div className="hoist-rail-section">
              <div className="hoist-rail-section-label">{selectedHarness.name}</div>
              <Field
                label="Status"
                value={
                  selectedHarness.status === 'installed' ? (
                    <span className="badge badge-ok">
                      installed{selectedHarness.version ? ` · v${selectedHarness.version}` : ''}
                    </span>
                  ) : (
                    <span className="badge">not installed</span>
                  )
                }
              />
              <Field label="Binary" value={<span className="mono">{selectedHarness.path || '—'}</span>} />
              <Field label="Source" value={selectedHarness.source || '—'} />
              <Field label="Homebrew" value={selectedHarness.homebrew ? (selectedHarness.homebrew === 'cask' ? 'Cask' : selectedHarness.homebrew === 'node' ? 'Node prefix' : 'Formula') : 'no'} />
              <Field label="Via" value={selectedHarness.packageManager || '—'} />
              {selectedHarness.config.activeModel && (
                <Field label="Active model" value={<span className="mono">{selectedHarness.config.activeModel}</span>} />
              )}
            </div>
            <div className="hoist-rail-section">
              <div className="hoist-rail-section-label">Actions</div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                disabled={harnessBusy}
                onClick={onRedetectHarness}
              >
                <RotateCw size={14} /> Re-detect
              </button>
              {selectedHarness.status !== 'installed' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  disabled={harnessBusy}
                  onClick={() => onInstallHarness?.(selectedHarness.catalogId)}
                >
                  <Download size={14} /> Install
                </button>
              )}
            </div>
            <PathPriorityPanel
              catalogId={selectedHarness.catalogId}
              installs={selectedHarness.installs}
              currentPath={selectedHarness.path}
            />
          </>
        ) : (
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label muted">Select a harness</div>
          </div>
        )
      )}
      {surface === 'keys' && (
        selectedKey ? (
          <>
            <div className="hoist-rail-section">
              <div className="hoist-rail-section-label">{selectedKey.name}</div>
              <Field
                label="Status"
                value={
                  <span className={`badge ${probeBadge(selectedKey.probe).cls}`}>
                    {probeBadge(selectedKey.probe).label}
                  </span>
                }
              />
              <Field label="Environment variable" value={<span className="mono">{selectedKey.env}</span>} />
              <Field label="Secret id" value={<span className="mono">{selectedKey.secretId}</span>} />
              <Field
                label="Last probed"
                value={selectedKey.probe?.checkedAt ? relativeTime(selectedKey.probe.checkedAt) : 'never'}
              />
              <Field label="Preview" value={<span className="mono">{selectedKey.preview}</span>} />
              {selectedKey.probe?.detail && (
                <Field label="Detail" value={selectedKey.probe.detail} />
              )}
            </div>
            <div className="hoist-rail-section">
              <div className="hoist-rail-section-label">Actions</div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                disabled={keysBusy}
                onClick={() => onProbeKey?.(selectedKey)}
              >
                <RotateCw size={14} /> Probe now
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => onCopyKey?.(selectedKey.secretId)}
              >
                <Pencil size={14} /> Copy (30s)
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                disabled={keysBusy}
                onClick={() => onDeleteKey?.(selectedKey.secretId)}
              >
                <X size={14} /> Delete
              </button>
            </div>
          </>
        ) : (
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label muted">No key selected</div>
            <p className="hoist-rail-hero-desc">Add a provider key to probe and wire gateways.</p>
          </div>
        )
      )}
      {surface === 'gateway' && (
        selectedGateway ? (
          <GatewayApplyPanel
            gateway={selectedGateway}
            keys={keys}
            providers={providers}
            harnesses={harnessOptions}
            busy={!!gatewayBusy}
            lastWiring={lastWiring}
            onApply={onApplyGateway}
          />
        ) : (
          <div className="hoist-rail-section">
            <div className="hoist-rail-section-label muted">Select a gateway</div>
          </div>
        )
      )}
      {surface === 'status' && (
        <WatchtowerDetailRail
          keys={recentKeys}
          library={library}
          doctorReport={doctorReport}
          keysBusy={keysBusy}
          onReprobeAll={onReprobeAll}
          onNavigate={onNavigate}
          onOpenLibrary={onOpenLibrary}
        />
      )}
    </aside>
  )
}

function DoctorDetailRail({
  report,
  library,
  onOpenLibrary,
  onNavigate,
}: {
  report?: ReturnType<typeof analyzeLibrary>
  library: LibraryEntry[]
  onOpenLibrary?: (catalogId: string) => void
  onNavigate?: (s: SurfaceId) => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const summary = report?.summary ?? { error: 0, warn: 0, info: 0, ok: 0 }
  const top = (report?.findings ?? [])
    .filter((f) => f.severity === 'error' || f.severity === 'warn' || f.severity === 'info')
    .slice(0, 5)

  const pathWinners = library
    .filter((e) => e.kind === 'harness' && e.primary && e.status === 'installed')
    .map((e) => ({
      name: e.name,
      bin: catalogBinaryName(e.catalogId),
      path: e.path,
      version: e.version,
      source: e.source,
      multi: e.installs.length,
      catalogId: e.catalogId,
    }))

  const copy = async (cmd: string, id: string) => {
    try {
      await navigator.clipboard.writeText(cmd)
      setCopied(id)
      setTimeout(() => setCopied(null), 1200)
    } catch { /* ignore */ }
  }

  const multiCmd = `which -a ${pathWinners.map((w) => w.bin).join(' ') || 'claude opencode codex'} node npm bun`

  return (
    <aside className="hoist-rail hoist-rail-detail">
      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">Snapshot</div>
        <div className="hoist-rail-kv" style={{ marginTop: 8 }}>
          <KV k="errors" v={<span className={summary.error ? 'hoist-sev-bad' : ''}>{summary.error}</span>} />
          <KV k="warnings" v={<span className={summary.warn ? 'hoist-sev-warn' : ''}>{summary.warn}</span>} />
          <KV k="info" v={summary.info} />
          <KV k="clear" v={summary.ok} />
        </div>
        <p className="hoist-rail-hero-desc" style={{ marginTop: 10 }}>
          {summary.error + summary.warn === 0
            ? 'Nothing blocking. Info items are multi-install notes — PATH order already decides the winner.'
            : 'Start with warnings. Most “issues” are multiple installs; PATH #1 is what shells actually run.'}
        </p>
      </div>

      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">PATH winners · harnesses</div>
        {pathWinners.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>No harnesses on PATH yet.</p>
        ) : (
          <ul className="hoist-winner-list">
            {pathWinners.map((w) => (
              <li key={w.catalogId}>
                <button type="button" className="hoist-winner-row" onClick={() => onOpenLibrary?.(w.catalogId)}>
                  <span className="hoist-winner-name">{w.name}</span>
                  <span className="mono hoist-winner-ver">{w.version ?? '—'}</span>
                </button>
                <div className="mono hoist-winner-path">{w.path}</div>
                <div className="hoist-winner-meta muted">
                  <span className="mono">{w.bin}</span>
                  {w.source ? ` · ${w.source}` : ''}
                  {w.multi > 1 ? ` · ${w.multi} on PATH` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {top.length > 0 && (
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label">Top findings</div>
          <ul className="hoist-finding-mini">
            {top.map((f) => (
              <li key={f.id}>
                <span className={`badge ${doctorSeverityBadge(f.severity)}`}>{f.severity}</span>
                <span className="hoist-finding-mini-title">{f.title}</span>
                {f.catalogId && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '0 6px', height: 22 }}
                    onClick={() => onOpenLibrary?.(f.catalogId!)}
                  >
                    Open
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">Quick commands</div>
        <div className="hoist-doctor-cmd" style={{ marginTop: 8 }}>
          <pre className="hoist-terminal">{multiCmd}</pre>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(multiCmd, 'which')}>
            {copied === 'which' ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div className="hoist-doctor-cmd" style={{ marginTop: 8 }}>
          <pre className="hoist-terminal">hash -r</pre>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy('hash -r', 'hash')}>
            {copied === 'hash' ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div className="hoist-rail-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => onNavigate?.('library')}>
            Open Library
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => onNavigate?.('harnesses')}>
            Open Harnesses
          </button>
        </div>
      </div>
    </aside>
  )
}

function WatchtowerDetailRail({
  keys,
  library,
  doctorReport,
  keysBusy,
  onReprobeAll,
  onNavigate,
  onOpenLibrary,
}: {
  keys: KeyRow[]
  library: LibraryEntry[]
  doctorReport?: ReturnType<typeof analyzeLibrary>
  keysBusy?: boolean
  onReprobeAll?: () => void
  onNavigate?: (s: SurfaceId) => void
  onOpenLibrary?: (catalogId: string) => void
}) {
  const valid = keys.filter((k) => k.probe?.valid && k.probe.status === 'ok').length
  const invalid = keys.filter((k) => k.probe && (!k.probe.valid || k.probe.status === 'invalid')).length
  const unprobed = keys.length - valid - invalid
  const summary = doctorReport?.summary ?? { error: 0, warn: 0, info: 0, ok: 0 }

  const winners = library
    .filter((e) => e.kind === 'harness' && e.primary)
    .map((e) => ({
      catalogId: e.catalogId,
      name: e.name,
      bin: catalogBinaryName(e.catalogId),
      path: e.path,
      version: e.version,
      status: e.status,
      multi: e.installs.length,
      source: e.source,
    }))

  const probed = [...keys]
    .filter((k) => k.probe)
    .sort((a, b) => Date.parse(b.probe!.checkedAt) - Date.parse(a.probe!.checkedAt))
    .slice(0, 6)

  return (
    <aside className="hoist-rail hoist-rail-detail">
      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">Health snapshot</div>
        <div className="hoist-rail-kv" style={{ marginTop: 8 }}>
          <KV k="keys" v={keys.length} />
          <KV k="valid" v={<span className="hoist-sev-ok">{valid}</span>} />
          <KV k="invalid" v={<span className={invalid ? 'hoist-sev-bad' : ''}>{invalid}</span>} />
          <KV k="unprobed" v={unprobed} />
          <KV k="doctor" v={`${summary.error}e · ${summary.warn}w · ${summary.info}i`} />
        </div>
        <div className="hoist-rail-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            disabled={keysBusy || keys.length === 0}
            onClick={onReprobeAll}
          >
            <RotateCw size={14} /> {keysBusy ? 'Probing…' : 'Re-probe all keys'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => onNavigate?.('doctor')}
          >
            <Stethoscope size={14} /> Open Doctor
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => onNavigate?.('keys')}
          >
            <KeyRound size={14} /> Provider keys
          </button>
        </div>
      </div>

      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">PATH winners · harnesses</div>
        {winners.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Scan Library to populate.</p>
        ) : (
          <ul className="hoist-winner-list">
            {winners.map((w) => (
              <li key={w.catalogId}>
                <button type="button" className="hoist-winner-row" onClick={() => onOpenLibrary?.(w.catalogId)}>
                  <span className="hoist-winner-name">{w.name}</span>
                  {w.status === 'installed' ? (
                    <span className="badge badge-ok">{w.version ? `v${w.version}` : 'on'}</span>
                  ) : (
                    <span className="badge">missing</span>
                  )}
                </button>
                {w.path && <div className="mono hoist-winner-path">{w.path}</div>}
                <div className="hoist-winner-meta muted">
                  <span className="mono">{w.bin}</span>
                  {w.source ? ` · ${w.source}` : ''}
                  {w.multi > 1 ? ` · ${w.multi} installs` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hoist-rail-section">
        <div className="hoist-rail-section-label">Recent probes</div>
        <ul className="hoist-rail-list">
          {probed.length === 0 && (
            <li className="muted">No probes yet — add keys and run Re-probe all.</li>
          )}
          {probed.map((k) => {
            const pb = probeBadge(k.probe)
            return (
              <li key={k.secretId}>
                <span className={`badge ${pb.cls}`}>{k.name}</span>{' '}
                <span className="muted">{relativeTime(k.probe?.checkedAt)}</span>
                {k.probe?.detail && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{k.probe.detail}</div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {(summary.error + summary.warn) > 0 && (
        <div className="hoist-rail-section">
          <div className="hoist-rail-section-label">Doctor attention</div>
          <ul className="hoist-finding-mini">
            {(doctorReport?.findings ?? [])
              .filter((f) => f.severity === 'error' || f.severity === 'warn')
              .slice(0, 4)
              .map((f) => (
                <li key={f.id}>
                  <span className={`badge ${doctorSeverityBadge(f.severity)}`}>{f.severity}</span>
                  <span className="hoist-finding-mini-title">{f.title}</span>
                </li>
              ))}
          </ul>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: 8 }}
            onClick={() => onNavigate?.('doctor')}
          >
            Review in Doctor
          </button>
        </div>
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
