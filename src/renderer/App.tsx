import { useState } from 'react'
import type { HoistAPI } from '../shared/types'

declare global {
  interface Window {
    hoist: HoistAPI
  }
}

const TOOLS = [
  { id: 'claude-code', name: 'Claude Code', status: 'not-installed' as const },
  { id: 'opencode', name: 'OpenCode', status: 'not-installed' as const },
  { id: 'codex', name: 'Codex', status: 'not-installed' as const },
]

type Step = 'tools' | 'sso' | 'gateway' | 'done'

export function App() {
  const [step, setStep] = useState<Step>('tools')

  return (
    <div style={styles.shell}>
      <Sidebar step={step} onNavigate={setStep} />
      <main style={styles.main}>
        {step === 'tools' && <ToolsStep onNext={() => setStep('sso')} />}
        {step === 'sso' && <SSOStep onBack={() => setStep('tools')} onNext={() => setStep('gateway')} />}
        {step === 'gateway' && <GatewayStep onBack={() => setStep('sso')} onNext={() => setStep('done')} />}
        {step === 'done' && <DoneStep />}
      </main>
    </div>
  )
}

function Sidebar({ step, onNavigate }: { step: Step; onNavigate: (s: Step) => void }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'tools', label: 'Harnesses' },
    { id: 'sso', label: 'SSO' },
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
        <span style={styles.version}>v0.0.0</span>
      </div>
    </aside>
  )
}

function ToolsStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={styles.step}>
      <h2 style={styles.heading}>Agent harnesses</h2>
      <p style={styles.subtitle}>Install the AI coding tools you use.</p>

      <div style={styles.cardList}>
        {TOOLS.map((tool) => (
          <div key={tool.id} style={styles.card}>
            <div>
              <div style={styles.cardTitle}>{tool.name}</div>
              <div style={styles.cardStatus}>{tool.status === 'not-installed' ? 'Not installed' : tool.status}</div>
            </div>
            <button style={styles.installBtn}>Install</button>
          </div>
        ))}
      </div>

      <div style={styles.stepActions}>
        <button style={styles.primaryBtn} onClick={onNext}>
          Continue
        </button>
      </div>
    </div>
  )
}

function SSOStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div style={styles.step}>
      <h2 style={styles.heading}>SSO setup</h2>
      <p style={styles.subtitle}>Connect your identity provider for gateway authentication.</p>

      <div style={styles.cardList}>
        {['Okta', 'Azure AD', 'Google Workspace'].map((provider) => (
          <div key={provider} style={styles.card}>
            <div style={styles.cardTitle}>{provider}</div>
            <button style={styles.installBtn}>Configure</button>
          </div>
        ))}
      </div>

      <div style={styles.stepActions}>
        <button style={styles.secondaryBtn} onClick={onBack}>
          Back
        </button>
        <button style={styles.primaryBtn} onClick={onNext}>
          Skip for now
        </button>
      </div>
    </div>
  )
}

function GatewayStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div style={styles.step}>
      <h2 style={styles.heading}>Gateway routing</h2>
      <p style={styles.subtitle}>Point your tools at an enterprise AI gateway.</p>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Base URL</div>
        <input placeholder="https://ai-gateway.your-org.com" style={styles.input} />
      </div>

      <div style={styles.stepActions}>
        <button style={styles.secondaryBtn} onClick={onBack}>
          Back
        </button>
        <button style={styles.primaryBtn} onClick={onNext}>
          Skip for now
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
      <p style={styles.subtitle}>Agent harnesses are ready. Start coding with OpenPi or your tool of choice.</p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width: 200,
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
    maxWidth: 540,
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
  cardTitle: {
    fontWeight: 600,
    fontSize: 14,
  },
  cardStatus: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 2,
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
  input: {
    width: '100%',
    marginTop: 12,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    color: 'var(--text)',
    fontSize: 14,
    outline: 'none',
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
}
