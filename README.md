# codex-lsp

[![ci](https://github.com/code-yeongyu/codex-lsp/actions/workflows/ci.yml/badge.svg)](https://github.com/code-yeongyu/codex-lsp/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Codex plugin that ports the standalone LSP runtime from [`pi-lsp-client`](https://github.com/code-yeongyu/pi-lsp-client). It gives Codex post-edit diagnostics plus explicit MCP tools for language-aware code work.

> **This is a fork.** It is consumed as a git submodule and must run straight
> from a checkout, so it carries the runtime as a subtree instead of a submodule
> and commits build output. **[VENDORING.md](VENDORING.md) is authoritative
> where it and this README disagree** — the rest of this file is upstream's and
> describes upstream's layout. Upstream: <https://github.com/code-yeongyu/codex-lsp>.

## Architecture

The LSP runtime lives in [`lsp-tools-mcp`](https://github.com/code-yeongyu/lsp-tools-mcp). Upstream consumes it as a git submodule at `packages/lsp-tools-mcp/`; this fork carries it as a squashed subtree at the same path.

- `codex-lsp` keeps Codex-specific integration (`hook post-tool-use`, plugin metadata, package wiring).
- `lsp-tools-mcp` owns MCP runtime, LSP manager, and tool implementations.
- `src/cli.ts` routes `mcp` to upstream runtime and keeps `hook post-tool-use` local.

## Behavior

| Case | Result |
|------|--------|
| `apply_patch` succeeds | parses `tool_input.command`, extracts added/updated/moved files, and checks each with LSP error diagnostics |
| `write` / `edit` / `multiedit` succeeds | checks `path`, `filePath`, or `file_path` aliases |
| diagnostics contain errors | returns Codex `PostToolUse` blocking feedback and injects the same diagnostics as additional context so Codex fixes the file |
| no diagnostics | emits no hook output |
| unsupported extension | emits no hook output |
| missing configured language server | surfaces the install/config message through hook or MCP output |

Deletes are ignored because they cannot introduce new diagnostics.

## MCP Tools

- `lsp.status`
- `lsp.diagnostics`
- `lsp.goto_definition`
- `lsp.find_references`
- `lsp.symbols`
- `lsp.prepare_rename`
- `lsp.rename`

`lsp.rename` applies the returned workspace edit to files. Use `lsp.prepare_rename` first when possible.

## Configuration

Project config:

```text
.codex/lsp-client.json
```

User config:

```text
~/.codex/lsp-client.json
```

Example:

```json
{
	"lsp": {
		"typescript": {
			"command": ["typescript-language-server", "--stdio"],
			"extensions": [".ts", ".tsx", ".js", ".jsx"]
		}
	}
}
```

Built-in server definitions are used when no custom config overrides them. `lsp.status` shows which configured servers are installed or missing.

## Using this fork as a submodule

Add it, then wire the two Codex surfaces by hand. The plugin route is not
available from a plain checkout (see the note under *Codex Plugin* below), and
wiring directly is fewer moving parts anyway.

```bash
git submodule add https://github.com/dsent/codex-lsp.git <path>/codex-lsp
```

No `npm install`, no build: the checkout is runnable as committed.

**`.codex/config.toml`** — Codex resolves neither relative `args` nor a relative
`cwd` against the project root, so the launcher must find the root itself.
`--show-superproject-working-tree` names the superproject when the session
started inside a submodule; at the top level it is empty and `--show-toplevel`
answers instead.

```toml
[mcp_servers.lsp]
command = "sh"
args = ["-c", 'root=$(git rev-parse --show-superproject-working-tree 2>/dev/null); [ -n "$root" ] || root=$(git rev-parse --show-toplevel); exec node "$root/<path>/codex-lsp/packages/lsp-tools-mcp/dist/cli.js" mcp']
startup_timeout_sec = 30
```

**`.codex/hooks.json`** — same resolution, pointed at the glue CLI.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "^(apply_patch|Write|Edit|MultiEdit|multi_edit|write|edit|multiedit)$",
        "hooks": [
          {
            "type": "command",
            "command": "sh -c 'root=$(git rev-parse --show-superproject-working-tree 2>/dev/null); [ -n \"$root\" ] || root=$(git rev-parse --show-toplevel); exec node \"$root/<path>/codex-lsp/dist/cli.js\" hook post-tool-use'",
            "statusMessage": "Checking LSP diagnostics",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

### Things that will otherwise cost you an afternoon

- **Codex scopes project config to the git root it starts in.** Started inside a
  submodule, it reads that submodule's `.codex/`, not the superproject's, and
  reports zero MCP servers. Launch agents from the top level.
- **Language servers need a VCS root.** `lua-language-server` publishes no
  diagnostics for a directory that is not under version control, so the hook is
  silent there. That is correct behaviour, not a failure.
- **Verify without spending model calls.** `codex doctor` reports whether the
  server is configured; piping an `initialize` plus `tools/list` into
  `packages/lsp-tools-mcp/dist/cli.js mcp` proves it actually runs. CI does
  exactly this on every push.
- **POSIX only.** `node_modules/@code-yeongyu/lsp-tools-mcp` is a committed
  symlink, so Windows checkouts need symlink support enabled. Not tested.

## Codex Plugin

The plugin ships:

- `.codex-plugin/plugin.json` for Codex plugin discovery.
- `.mcp.json` for the `lsp` MCP server.
- `hooks/hooks.json` for the `PostToolUse` diagnostics hook.
- `skills/lsp/SKILL.md` with MCP usage guidance.

The runtime depends on `@code-yeongyu/lsp-tools-mcp` via `file:./packages/lsp-tools-mcp`, so packaging must include those contents. In this fork they are subtree files already present in the checkout, and the `node_modules` link that resolves the package name is committed alongside them.

`.codex-plugin/plugin.json` is tracked here. Upstream generates it at pack time and does not commit it, which leaves its own `package-smoke` test failing on a fresh clone; committing the manifest fixes that test and lets plugin discovery work from a plain checkout.

The hook command is:

```bash
node "${PLUGIN_ROOT}/dist/cli.js" hook post-tool-use
```

The MCP command is:

```bash
node ./packages/lsp-tools-mcp/dist/cli.js mcp
```

## Local Development

```bash
# No submodule init: the runtime is a subtree, already in this checkout.
(cd packages/lsp-tools-mcp && npm ci && npm run build)
npm install
npm test
npm run typecheck
npm run check
npm pack --dry-run
```

`npm run bootstrap` is a no-op in this fork. It short-circuits when
`packages/lsp-tools-mcp/dist/cli.js` exists, and that file is committed here, so
`prebuild` will not rebuild the runtime. Build the runtime explicitly as above
after changing its sources or pulling the subtree, then commit the result
(`git add -f packages/lsp-tools-mcp/dist`).

The `bootstrap` script installs and builds the `lsp-tools-mcp` git submodule so
`@code-yeongyu/lsp-tools-mcp/dist/*.js` is available for the codex-lsp build.

Smoke-test the hook:

```bash
node dist/cli.js hook post-tool-use < test/fixtures/post-tool-use.json
```

Smoke-test the MCP server:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/cli.js mcp
```

## Local Codex Installation

From the marketplace root containing this plugin:

```bash
codex plugin marketplace add /path/to/codex-plugins
node /path/to/codex-plugins/scripts/install-local.mjs /path/to/codex-plugins
```

If your local Codex build exposes plugin install commands, you can install from the UI or CLI instead. For older local builds, the marketplace installer builds and copies the plugin into `~/.codex/plugins/cache/<marketplace>/omo/0.1.0` and enables:

```toml
[plugins."omo@code-yeongyu-codex-plugins"]
enabled = true
```

## Branch Rules and Releases

- `main` is protected by `.github/branch-ruleset.json`.
- CI runs Node 20 and 22 on Ubuntu, macOS, and Windows.
- Releases are GitHub Releases tagged as `v<semver>`.
- Publishing runs from the `publish` workflow after a GitHub Release is published.

## Privacy

This plugin runs locally. It starts configured language-server commands on your machine and does not call a network service by itself.

## License

[MIT](LICENSE).

## Related

- [pi-lsp-client](https://github.com/code-yeongyu/pi-lsp-client) - source extension this Codex plugin ports.
