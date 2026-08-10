/**
 * Language runtimes and package managers Hoist surfaces in the Library.
 * Discovery probes each `binaries` entry with `which -a` + version flags.
 */

export type RuntimeKind = 'runtime' | 'package-manager'

export interface RuntimeCatalogEntry {
  id: string
  name: string
  avatar: string
  kind: RuntimeKind
  description: string
  /** PATH binary names to probe, in preference order. */
  binaries: string[]
  /** Args that print a version line (default --version). */
  versionArgs?: string[]
  /** Optional family for grouping related tools (node ↔ npm). */
  family?: string
}

export const RUNTIME_CATALOG: RuntimeCatalogEntry[] = [
  {
    id: 'node',
    name: 'Node.js',
    avatar: 'N',
    kind: 'runtime',
    family: 'javascript',
    description: 'JavaScript runtime. Hosts most agent CLIs when installed via npm.',
    binaries: ['node'],
  },
  {
    id: 'npm',
    name: 'npm',
    avatar: 'npm',
    kind: 'package-manager',
    family: 'javascript',
    description: 'Node package manager. Default installer for many agent harnesses.',
    binaries: ['npm'],
  },
  {
    id: 'bun',
    name: 'Bun',
    avatar: 'B',
    kind: 'package-manager',
    family: 'javascript',
    description: 'Fast all-in-one JS toolkit. Runtime + package manager + bundler.',
    binaries: ['bun'],
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    avatar: 'pn',
    kind: 'package-manager',
    family: 'javascript',
    description: 'Efficient Node package manager with a content-addressable store.',
    binaries: ['pnpm'],
  },
  {
    id: 'yarn',
    name: 'Yarn',
    avatar: 'Y',
    kind: 'package-manager',
    family: 'javascript',
    description: 'Node package manager (Classic / Berry).',
    binaries: ['yarn'],
  },
  {
    id: 'deno',
    name: 'Deno',
    avatar: 'D',
    kind: 'runtime',
    family: 'javascript',
    description: 'Secure TypeScript-first runtime with built-in tooling.',
    binaries: ['deno'],
  },
  {
    id: 'python',
    name: 'Python',
    avatar: 'Py',
    kind: 'runtime',
    family: 'python',
    description: 'Python interpreter. Used by Aider and many data/ML agent tools.',
    binaries: ['python3', 'python'],
    versionArgs: ['--version'],
  },
  {
    id: 'pip',
    name: 'pip',
    avatar: 'pip',
    kind: 'package-manager',
    family: 'python',
    description: 'Python package installer.',
    binaries: ['pip3', 'pip'],
  },
  {
    id: 'go',
    name: 'Go',
    avatar: 'Go',
    kind: 'runtime',
    family: 'go',
    description: 'Go toolchain (compiler + runtime).',
    binaries: ['go'],
    versionArgs: ['version'],
  },
  {
    id: 'rust',
    name: 'Rust',
    avatar: 'Rs',
    kind: 'runtime',
    family: 'rust',
    description: 'Rust compiler (rustc). Pair with Cargo for packages.',
    binaries: ['rustc'],
  },
  {
    id: 'cargo',
    name: 'Cargo',
    avatar: 'Cr',
    kind: 'package-manager',
    family: 'rust',
    description: 'Rust package manager and build tool.',
    binaries: ['cargo'],
  },
  {
    id: 'ruby',
    name: 'Ruby',
    avatar: 'Rb',
    kind: 'runtime',
    family: 'ruby',
    description: 'Ruby interpreter.',
    binaries: ['ruby'],
  },
  {
    id: 'java',
    name: 'Java',
    avatar: 'Jv',
    kind: 'runtime',
    family: 'jvm',
    description: 'Java runtime (JRE/JDK).',
    binaries: ['java'],
    versionArgs: ['-version'],
  },
]

export function findRuntime(id: string): RuntimeCatalogEntry | undefined {
  return RUNTIME_CATALOG.find((r) => r.id === id)
}
