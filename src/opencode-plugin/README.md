# Hoist discovery plugin for OpenCode

Reports installed harness binaries to Hoist so the app does not have to
guess install locations across Homebrew, npm-global and version managers.

On OpenCode startup the plugin runs `which` for each binary in the hoist
catalog (claude, opencode, codex), reads `--version`, and writes
`~/.cache/hoist/discovery.json`:

```json
{
  "claude-code": { "path": "/opt/homebrew/bin/claude", "version": "2.1.204" }
}
```

Hoist reads the file when it is fresher than five minutes and otherwise
falls back to its own probe. No cache file means no behaviour change.

## Install (local development)

Point OpenCode at the plugin file from `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["/path/to/hoist/src/opencode-plugin/hoist-discover.ts"]
}
```

Once published, the equivalent is `opencode plugin install @hoist/discover`
with the published package name in the `plugin` array instead.
