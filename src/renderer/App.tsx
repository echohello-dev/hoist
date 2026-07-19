import { useEffect, useState } from 'react'
import type { HoistAPI } from '../preload/api'

declare global {
  interface Window {
    hoist: HoistAPI
  }
}

type Step = 'tools' | 'keys' | 'gateway' | 'done'

interface HarnessState {
  installingId: string | null
  status: Record<string, { version: string | null; path: string | null; installed: boolean }>
  error: string | null
}

interface VaultState {
  entries: { id: string; label?: string; preview?: string; updatedAt?: string }[]
  savingId: string | null
  lastProbe: Record<string, { ok: boolean; detail?: string; status: string; checkedAt: string }>
}

export function App() {
  const [step, setStep] = useState<Step>('tools')

  return (
    <div style={styles.shell}>
      <Sidebar step={step} onNavigate={setStep} />
      <main style={styles.main}>
        {step === 'tools' && <ToolsStep onNext={() => setStep('keys')} />}
        {step === 'keys' && <KeysStep onBack={() => setStep('tools')} onNext={() => setStep('gateway')} />}
        {step === 'gateway' && <GatewayStep onBack={() => setStep('keys')} onNext={() => setStep('done')} />}
        {step === 'done' && <DoneStep />}
      </main>
    </div>
  )
}

function Sidebar({ step, onNavigate }: { step: Step; onNavigate: (s: Step) => void }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'tools', label: 'Harnesses' },
    { id: 'keys', label: 'Keys' },
    { id: 'gateway', label: 'Gateway' },
    { id: 'done', label: 'Done' },
  ]
  const stepIndex = steps.findIndex((s) => s.id === step)

  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>&#x26A1;</span>
        hoist
      </div>
      <nav style={styles.nav}>
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onNavigate(s.id)}
            style={{
              ...styles.navItem,
              ...(i <= stepIndex ? styles.navItemActive : {}),
              ...(i === stepIndex ? styles.navItemCurrent : {}),
            }}
          >
            <span style={styles.stepDot}>{i <= stepIndex ? '●' : '○'}</span>
            {s.label}
          </button>
        ))}
      </nav>
      <div style={styles.sidebarFooter}>
        <span style={styles.version}>v0.0.1-preview</span>
      </div>
    </aside>
  )
}

function ToolsStep({ onNext }: { onNext: () => void }) {
  const [harnesses, setHarnesses] = useState<{ id: string; name: string; description: string }[]>([])
  const [state, setState] = useState<HarnessState>({ installingId: null, status: {}, error: null })

  useEffect(() => {
    window.hoist.harness.list().then(setHarnesses)
    refreshStatus()
  }, [])

  async function refreshStatus() {
    const discovered = await window.hoist.harness.discover()
    setState((s) => ({
      ...s,
      status: Object.fromEntries(
        Object.entries(discovered).map(([id, tool]) => [
          id,
          { version: tool.version, path: tool.path, installed: !!tool.path },
        ]),
      ),
    }))
  }

  async function install(id: string) {
    setState((s) => ({ ...s, installingId: id, error: null }))
    try {
      const result = await window.hoist.harness.install(id)
      if (!result.ok) {
        setState((s) => ({ ...s, error: result.error ?? 'Install failed' }))
      } else if (result.tool) {
        setState((s) => ({
          ...s,
          status: {
            ...s.status,
            [id]: {
              version: result.tool!.version,
              path: result.tool!.path,
              installed: !!result.tool!.path,
            },
          },
        }))
      }
    } catch (err) {
      setState((s) => ({ ...s, error: errMsg(err) }))
    } finally {
      setState((s) => ({ ...s, installingId: null }))
    }
  }

  return (
    <div style={styles.step}>
      <h2 style={styles.heading}>Agent harnesses</h2>
      <p style={styles.subtitle}>Install the AI coding tools you use. Hoist runs <code style={styles.code}>npm i -g</code> on your behalf.</p>

      <div style={styles.cardList}>
        {harnesses.map((tool) => {
          const status = state.status[tool.id]
          const installing = state.installingId === tool.id
          return (
            <div key={tool.id} style={styles.card}>
              <div>
                <div style={styles.cardTitle}>{tool.name}</div>
                <div style={styles.cardStatus}>
                  {installing
                    ? 'Installing…'
                    : status?.installed
                      ? `Installed${status.version ? ` · ${status.version}` : ''}`
                      : 'Not installed'}
                </div>
              </div>
              <button
                style={{ ...styles.installBtn, ...(status?.installed ? styles.installBtnDone : {}) }}
                onClick={() => !installing && install(tool.id)}
                disabled={installing || status?.installed}
              >
                {status?.installed ? 'Ready' : installing ? '…' : 'Install'}
              </button>
            </div>
          )
        })}
      </div>

      {state.error && <div style={styles.error}>{state.error}</div>}

      <div style={styles.stepActions}>
        <button style={styles.primaryBtn} onClick={onNext}>
          Continue
        </button>
      </div>
    </div>
  )
}

function KeysStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [providers, setProviders] = useState<{ id: string; label: string; defaultBaseUrl?: string; envKeys: string[] }[]>([])
  const [state, setState] = useState<VaultState>({ entries: [], savingId: null, lastProbe: {} })
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [draftKey, setDraftKey] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.hoist.provider.list().then((list) => {
      setProviders(list)
      if (list.length > 0 && !activeProvider) setActiveProvider(list[0].id)
    })
    refreshVault()
  }, [])

  async function refreshVault() {
    const res = await window.hoist.vault.list()
    if (res.ok) {
      setState((s) => ({ ...s, entries: res.entries }))
    }
  }

  async function saveKey() {
    if (!activeProvider || !draftKey.trim()) return
    setState((s) => ({ ...s, savingId: activeProvider }))
    setError(null)
    try {
      const res = await window.hoist.vault.set({ id: secretIdFor(activeProvider), value: draftKey.trim(), label: draftLabel.trim() || undefined })
      if (!res.ok) {
        setError(res.error ?? 'Failed to save key')
      } else {
        setDraftKey('')
        setDraftLabel('')
        await refreshVault()
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setState((s) => ({ ...s, savingId: null }))
    }
  }

  async function probe(providerId: string) {
    setError(null)
    const res = await window.hoist.probe.run({ providerId, secretId: secretIdFor(providerId) })
    if (!res.ok) {
      setError(res.error ?? 'Probe failed')
      setState((s) => ({
        ...s,
        lastProbe: {
          ...s.lastProbe,
          [providerId]: { ok: false, status: 'error', detail: res.error, checkedAt: new Date().toISOString() },
        },
      }))
      return
    }
    const result = res.result!
    setState((s) => ({
      ...s,
      lastProbe: {
        ...s.lastProbe,
        [providerId]: {
          ok: result.valid,
          status: result.status,
          detail: result.detail,
          checkedAt: result.checkedAt,
        },
      },
    }))
  }

  async function copy(providerId: string) {
    await window.hoist.vault.copy(secretIdFor(providerId))
  }

  async function remove(providerId: string) {
    await window.hoist.vault.delete(secretIdFor(providerId))
    await refreshVault()
  }

  return (
    <div style={styles.step}>
      <h2 style={styles.heading}>Provider keys</h2>
      <p style={styles.subtitle}>Stored encrypted in your OS keychain via Electron safeStorage. Never leaves this machine.</p>

      <div style={styles.cardList}>
        {providers.map((provider) => {
          const entry = state.entries.find((e) => e.id === secretIdFor(provider.id))
          const probeResult = state.lastProbe[provider.id]
          const isActive = activeProvider === provider.id
          return (
            <div key={provider.id} style={{ ...styles.card, ...styles.cardVertical, ...(isActive ? styles.cardActive : {}) }}>
              <div style={styles.cardRow}>
                <div>
                  <div style={styles.cardTitle}>{provider.label}</div>
                  <div style={styles.cardStatus}>
                    {entry
                      ? `Saved · ${entry.preview ?? '••••'}${entry.updatedAt ? ` · ${new Date(entry.updatedAt).toLocaleDateString()}` : ''}`
                      : 'No key saved'}
                  </div>
                  <div style={styles.envHint}>{provider.envKeys.join(', ')}</div>
                </div>
                <div style={styles.cardActions}>
                  <button style={styles.miniBtn} onClick={() => setActiveProvider(provider.id)}>Edit</button>
                  <button
                    style={styles.miniBtn}
                    onClick={() => probe(provider.id)}
                    disabled={!entry}
                  >
                    Validate
                  </button>
                  <button style={styles.miniBtn} onClick={() => copy(provider.id)} disabled={!entry}>Copy</button>
                  <button style={styles.miniBtnDanger} onClick={() => remove(provider.id)} disabled={!entry}>Delete</button>
                </div>
              </div>
              {probeResult && (
                <div style={probeResult.ok ? styles.probeOk : styles.probeBad}>
                  {probeResult.ok ? '✓ ' : '✗ '}
                  {probeResult.status}{probeResult.detail ? ` · ${probeResult.detail}` : ''}
                  <span style={styles.probeTime}> · {new Date(probeResult.checkedAt).toLocaleTimeString()}</span>
                </div>
              )}
              {isActive && (
                <div style={styles.draftRow}>
                  <input
                    style={styles.input}
                    placeholder={`Paste ${provider.envKeys[0]}…`}
                    value={draftKey}
                    onChange={(e) => setDraftKey(e.target.value)}
                    type="password"
                  />
                  <input
                    style={{ ...styles.input, flexBasis: 160 }}
                    placeholder="Label (optional)"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                  />
                  <button
                    style={styles.primaryBtn}
                    onClick={saveKey}
                    disabled={!draftKey.trim() || state.savingId === provider.id}
                  >
                    {state.savingId === provider.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.stepActions}>
        <button style={styles.secondaryBtn} onClick={onBack}>
          Back
        </button>
        <button style={styles.primaryBtn} onClick={onNext}>
          Continue
        </button>
      </div>
    </div>
  )
}

function GatewayStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [gateways, setGateways] = useState<{
    id: string
    label: string
    baseUrl: string
    selfHostedHint?: string
    docUrl?: string
    endpoints: { openai?: string; anthropic?: string }
    auth: { header: string; scheme: string; envVar: string }
    modelIdFormat: string
    nativeProviders: string[]
    notes?: string
    placeholders: string[]
  }[]>([])
  const [providers, setProviders] = useState<{
    id: string
    label: string
    envKeys: string[]
    defaultBaseUrl?: string
    notes?: string
  }[]>([])
  const [harnesses, setHarnesses] = useState<{ id: string; name: string }[]>([])
  const [discovered, setDiscovered] = useState<Record<string, { installed: boolean; version: string | null }>>({})

  const [gatewayId, setGatewayId] = useState<string>('direct')
  const [providerId, setProviderId] = useState<string>('anthropic')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [harnessIds, setHarnessIds] = useState<Record<string, boolean>>({})
  const [applying, setApplying] = useState(false)
  const [results, setResults] = useState<{
    harnessId: string
    harnessName: string
    ok: boolean
    error?: string
    path?: string
    note?: string
    envHint?: Record<string, string>
  }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [effectiveBaseUrl, setEffectiveBaseUrl] = useState<string | null>(null)

  useEffect(() => {
    refreshAll()
  }, [])

  async function refreshAll() {
    const [g, p, h, d] = await Promise.all([
      window.hoist.gateway.list(),
      window.hoist.provider.list(),
      window.hoist.harness.list(),
      window.hoist.harness.discover(),
    ])
    setGateways(g)
    setProviders(p)
    setHarnesses(h.map((x) => ({ id: x.id, name: x.name })))
    const map = h.map((x) => ({ id: x.id, name: x.name }))
    setHarnessIds(
      map.reduce<Record<string, boolean>>((acc, x) => {
        acc[x.id] = !!d[x.id]?.path
        return acc
      }, {}),
    )
    setDiscovered(
      h.reduce<Record<string, { installed: boolean; version: string | null }>>((acc, _id, i) => {
        const x = h[i]
        acc[x.id] = { installed: !!d[x.id]?.path, version: d[x.id]?.version ?? null }
        return acc
      }, {}),
    )
    const initialProvider = p.find((x) => x.id === 'anthropic') ?? p[0]
    if (initialProvider) {
      setProviderId(initialProvider.id)
      setBaseUrl(initialProvider.defaultBaseUrl ?? '')
    }
  }

  const selectedGateway = gatewayId === 'direct' ? null : gateways.find((g) => g.id === gatewayId)

  function pickGateway(g: { id: string; baseUrl: string } | null) {
    if (!g) {
      const direct = providers.find((p) => p.id === providerId)
      setBaseUrl(direct?.defaultBaseUrl ?? '')
    } else {
      setBaseUrl(g.baseUrl)
    }
  }

  function pickProvider(p: { id: string; defaultBaseUrl?: string }) {
    setProviderId(p.id)
    if (gatewayId === 'direct') setBaseUrl(p.defaultBaseUrl ?? '')
  }

  async function apply() {
    setError(null)
    setResults([])
    setEffectiveBaseUrl(null)
    setApplying(true)
    try {
      const selectedHarnessIds = harnesses.filter((h) => harnessIds[h.id]).map((h) => h.id)
      if (selectedHarnessIds.length === 0) {
        setError('Select at least one harness to apply.')
        return
      }
      if (!apiKey.trim()) {
        setError('Paste an API key (or gateway token) first.')
        return
      }
      const res = await window.hoist.gateway.apply({
        gatewayId: gatewayId === 'direct' ? null : gatewayId,
        providerId,
        baseUrl,
        apiKey: apiKey.trim(),
        harnessIds: selectedHarnessIds,
      })
      if (!res.ok) {
        setError(res.error ?? 'Apply failed.')
        return
      }
      setResults(res.wiring ?? [])
      setEffectiveBaseUrl(res.effectiveBaseUrl ?? baseUrl)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setApplying(false)
    }
  }

  const providerObj = providers.find((p) => p.id === providerId)

  return (
    <div style={styles.step}>
      <h2 style={styles.heading}>Gateway routing</h2>
      <p style={styles.subtitle}>Point your tools at a hosted gateway or paste any OpenAI/Anthropic-compatible URL. Hoist writes per-harness config (Claude Code <code style={styles.code}>~/.claude/settings.json</code>, Codex <code style={styles.code}>config.toml</code>, OpenCode <code style={styles.code}>opencode.json</code>).</p>

      <div style={styles.subheading}>1. Gateway</div>
      <div style={styles.grid}>
        <button
          onClick={() => {
            setGatewayId('direct')
            pickGateway(null)
          }}
          style={{ ...styles.gatewayCard, ...(gatewayId === 'direct' ? styles.gatewayCardActive : {}) }}
        >
          <div style={styles.gatewayCardTitle}>Direct (no gateway)</div>
          <div style={styles.gatewayCardSub}>Use each provider's native API URL.</div>
        </button>
        {gateways.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setGatewayId(g.id)
              pickGateway({ id: g.id, baseUrl: g.baseUrl })
            }}
            style={{ ...styles.gatewayCard, ...(gatewayId === g.id ? styles.gatewayCardActive : {}) }}
          >
            <div style={styles.gatewayCardTitle}>{g.label}</div>
            <div style={styles.gatewayCardSub}>{g.baseUrl || '(custom URL)'}</div>
            {g.placeholders.length > 0 && (
              <div style={styles.gatewayCardWarn}>fill in {g.placeholders.map((p) => `<${p}>`).join(', ')}</div>
            )}
          </button>
        ))}
      </div>

      <div style={styles.subheading}>2. Provider & base URL</div>
      <div style={{ ...styles.card, ...styles.cardVertical }}>
        <div>
          <div style={styles.cardTitle}>Provider</div>
          <select
            style={{ ...styles.input, width: '100%' }}
            value={providerId}
            onChange={(e) => {
              const p = providers.find((x) => x.id === e.target.value)
              if (p) pickProvider(p)
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} {p.envKeys.length > 0 ? `(${p.envKeys[0]})` : '(cloud creds)'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={styles.cardTitle}>Base URL</div>
          <input
            style={{ ...styles.input, width: '100%' }}
            value={baseUrl}
            placeholder="https://gateway.example.com"
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          {selectedGateway?.selfHostedHint && (
            <div style={styles.envHint}>{selectedGateway.selfHostedHint}</div>
          )}
          {selectedGateway && (
            <div style={styles.gatewayDoc}>
              <span>
                Endpoint: <code style={styles.code}>{selectedGateway.endpoints.anthropic ?? selectedGateway.endpoints.openai ?? '/v1'}</code> · Auth: <code style={styles.code}>{selectedGateway.auth.header}</code>
                {selectedGateway.auth.scheme && selectedGateway.auth.scheme !== 'raw' ? ` (${selectedGateway.auth.scheme})` : ''} · Env: <code style={styles.code}>{selectedGateway.auth.envVar}</code>
              </span>
              {selectedGateway.docUrl && (
                <a href={selectedGateway.docUrl} target="_blank" rel="noreferrer" style={styles.docLink}>docs ↗</a>
              )}
            </div>
          )}
          {providerObj?.notes && (
            <div style={styles.envHint}>{providerObj.notes}</div>
          )}
        </div>

        <div>
          <div style={styles.cardTitle}>API key / token</div>
          <input
            style={{ ...styles.input, width: '100%' }}
            type="password"
            placeholder={providerObj?.envKeys?.[0] ?? 'paste token'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <div style={styles.envHint}>Encrypted at rest in OS keychain via safeStorage.</div>
        </div>
      </div>

      <div style={styles.subheading}>3. Apply to harnesses</div>
      <div style={styles.cardList}>
        {harnesses.map((h) => {
          const inst = discovered[h.id]
          return (
            <label key={h.id} style={styles.harnessRow}>
              <input
                type="checkbox"
                checked={!!harnessIds[h.id]}
                onChange={(e) => setHarnessIds((s) => ({ ...s, [h.id]: e.target.checked }))}
              />
              <span style={styles.harnessName}>{h.name}</span>
              <span style={styles.envHint}>
                {inst?.installed ? `installed · ${inst.version ?? '?'}` : 'not installed'}
              </span>
            </label>
          )
        })}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {results.length > 0 && (
        <div style={styles.resultsBlock}>
          <div style={styles.subheading}>Wiring results</div>
          {results.map((r, i) => (
            <div key={i} style={{ ...styles.resultRow, ...(r.ok ? styles.resultRowOk : styles.resultRowBad) }}>
              <div style={{ fontWeight: 600 }}>{r.harnessName}</div>
              {r.error && <div style={{ fontSize: 12 }}>{r.error}</div>}
              {r.path && <div style={styles.envHint}>{r.path}</div>}
              {r.note && <div style={styles.envHint}>{r.note}</div>}
              {r.envHint && (
                <pre style={styles.codeBlock}>
                  {Object.entries(r.envHint).map(([k, v]) => `${k} = ${v}`).join('\n')}
                </pre>
              )}
            </div>
          ))}
          {effectiveBaseUrl && (
            <div style={styles.envHint}>Effective base URL: <code style={styles.code}>{effectiveBaseUrl}</code></div>
          )}
        </div>
      )}

      <div style={styles.stepActions}>
        <button style={styles.secondaryBtn} onClick={onBack}>
          Back
        </button>
        <button
          style={{ ...styles.secondaryBtn }}
          onClick={onNext}
          disabled={applying}
        >
          Skip
        </button>
        <button
          style={styles.primaryBtn}
          onClick={apply}
          disabled={applying || !baseUrl || !apiKey}
        >
          {applying ? 'Applying…' : 'Apply wiring'}
        </button>
      </div>
    </div>
  )
}

function DoneStep() {
  return (
    <div style={{ ...styles.step, textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#x26A1;</div>
      <h2 style={styles.heading}>You're wired up</h2>
      <p style={styles.subtitle}>Agent harnesses installed, keys validated. Open Claude Code or your tool of choice and start coding.</p>
    </div>
  )
}

function secretIdFor(providerId: string): string {
  return `provider:${providerId}:api_key`
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width: 220,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px',
    flexShrink: 0,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 32,
  },
  logoIcon: {
    fontSize: 20,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'none',
    color: 'var(--text-muted)',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background 0.15s',
  },
  navItemActive: {
    color: 'var(--text)',
  },
  navItemCurrent: {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
  },
  stepDot: {
    fontSize: 8,
    width: 14,
    textAlign: 'center' as const,
  },
  sidebarFooter: {
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
  },
  version: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  main: {
    flex: 1,
    padding: '40px 48px',
    overflowY: 'auto' as const,
  },
  step: {
    maxWidth: 640,
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    marginBottom: 4,
  },
  subtitle: {
    color: 'var(--text-muted)',
    marginBottom: 28,
    fontSize: 13,
    lineHeight: 1.5,
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 28,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardVertical: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  cardActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent-glow)',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  cardTitle: {
    fontWeight: 600,
    fontSize: 14,
  },
  cardStatus: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  envHint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 4,
    opacity: 0.7,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  cardActions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  miniBtn: {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    border: '1px solid rgba(124, 92, 252, 0.3)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  miniBtnDanger: {
    background: 'transparent',
    color: '#ff6b6b',
    border: '1px solid rgba(255, 107, 107, 0.3)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  draftRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  installBtn: {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    border: '1px solid rgba(124, 92, 252, 0.3)',
    borderRadius: 6,
    padding: '6px 16px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  installBtnDone: {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    cursor: 'default',
  },
  probeOk: {
    fontSize: 12,
    color: '#4ade80',
    background: 'rgba(74, 222, 128, 0.08)',
    border: '1px solid rgba(74, 222, 128, 0.2)',
    padding: '8px 12px',
    borderRadius: 6,
  },
  probeBad: {
    fontSize: 12,
    color: '#ff6b6b',
    background: 'rgba(255, 107, 107, 0.08)',
    border: '1px solid rgba(255, 107, 107, 0.2)',
    padding: '8px 12px',
    borderRadius: 6,
  },
  probeTime: {
    opacity: 0.6,
    marginLeft: 4,
  },
  input: {
    flex: 1,
    minWidth: 200,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    color: 'var(--text)',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
  },
  code: {
    background: 'var(--bg)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    border: '1px solid var(--border)',
  },
  stepActions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
  },
  primaryBtn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  error: {
    background: 'rgba(255, 107, 107, 0.08)',
    color: '#ff6b6b',
    border: '1px solid rgba(255, 107, 107, 0.2)',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16,
  },
  subheading: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    marginBottom: 10,
    marginTop: 24,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 8,
    marginBottom: 16,
  },
  gatewayCard: {
    textAlign: 'left' as const,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  gatewayCardActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent-glow)',
  },
  gatewayCardTitle: {
    fontSize: 13,
    fontWeight: 600,
  },
  gatewayCardSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    wordBreak: 'break-all' as const,
  },
  gatewayCardWarn: {
    fontSize: 11,
    color: '#fbbf24',
    marginTop: 4,
  },
  gatewayDoc: {
    marginTop: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 8,
    fontSize: 12,
  },
  docLink: {
    color: 'var(--accent)',
    textDecoration: 'none',
    fontSize: 11,
  },
  select: {
    width: '100%',
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    outline: 'none',
    marginTop: 8,
    fontFamily: 'inherit',
  },
  harnessRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
  harnessName: {
    flex: 1,
    fontWeight: 500,
  },
  resultsBlock: {
    marginTop: 16,
    marginBottom: 16,
  },
  resultRow: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 16px',
    marginBottom: 6,
    fontSize: 13,
  },
  resultRowOk: {
    borderColor: 'rgba(74, 222, 128, 0.3)',
    background: 'rgba(74, 222, 128, 0.04)',
  },
  resultRowBad: {
    borderColor: 'rgba(255, 107, 107, 0.3)',
    background: 'rgba(255, 107, 107, 0.04)',
  },
  codeBlock: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 12px',
    margin: '8px 0 0',
    fontSize: 11,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    overflow: 'auto',
  },
}
