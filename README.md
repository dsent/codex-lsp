# lsp-tools-mcp

[![ci](https://github.com/dsent/lsp-tools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/dsent/lsp-tools-mcp/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Standalone Language Server Protocol tools exposed as a stdio MCP server.

A fork of [code-yeongyu/lsp-tools-mcp](https://github.com/code-yeongyu/lsp-tools-mcp). It diverges deliberately: `dist/` is committed so a consumer pinning a revision runs without an install or build step, and config discovery is harness-neutral rather than defaulting to one harness's directory.

## Used By

This fork is the source of truth for the downstream plugin below, which vendors it as a git subtree.

| Project | Path | Role |
|---------|------|------|
| **[codex-lsp](https://github.com/dsent/codex-lsp)** | `packages/lsp-tools-mcp/` | Codex plugin that reuses these LSP MCP tools plus a Codex-specific PostToolUse diagnostics hook. |

If you fix or extend the LSP runtime, land it here and let the downstream pull it; do not edit the vendored copy in a downstream.

## Quick Start

```bash
npm install
npm run check
npm test
npm run build
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/cli.js mcp
```

## MCP Tools

`diagnostics` distinguishes "no findings" from "no answer". A server that pushes diagnostics answers when it is ready, so the tool waits for it to report on the document rather than sleeping a fixed interval — ShellCheck on a large script does not finish within a second, and an empty result would otherwise read as a clean file. If the server has said nothing at all about the document by the deadline, the call fails with `diagnostics_unavailable` instead of returning an empty list, and says to ask again in about ten seconds: analysis continues in the background, so a second request normally answers immediately.


This server exposes the following tools:

- `lsp.status`
- `lsp.diagnostics`
- `lsp.goto_definition`
- `lsp.find_references`
- `lsp.symbols`
- `lsp.prepare_rename`
- `lsp.rename`

Tool aliases are also available for compatibility:

- `lsp_status`
- `lsp_diagnostics`
- `lsp_goto_definition`
- `lsp_find_references`
- `lsp_symbols`
- `lsp_prepare_rename`
- `lsp_rename`

When an MCP host registers this server under the name `lsp` (the default in both downstreams), the tools are exposed to agents as `lsp_status`, `lsp_diagnostics`, and so on, matching the alias names above.

## Configuration

Default config paths, harness-neutral:

- Project: the nearest `lsp-client.json` at or above the working directory, stopping at the project boundary (`.lsp-root`, `.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`). A config above the boundary never governs the project below it.
- User: `${XDG_CONFIG_HOME:-~/.config}/lsp-tools-mcp/lsp-client.json`

Config is resolved before any request names a file, so the working directory is the only anchor available — and MCP promises nothing about it. A registration that cares should pass `LSP_TOOLS_MCP_PROJECT_CONFIG` explicitly.

The shared configuration declares what a project wants, whichever harness is asking:

```json
{
  "ignoredExtensions": [".json", ".jsonc"],
  "enabledServers": ["bash", "typescript"],
  "disabledServers": []
}
```

`ignoredExtensions` suppresses lookup for those extensions before any server command is resolved. Note that shebang-detected shell scripts classify as `.sh`, so ignoring `.sh` also covers extensionless scripts — the extension here means "what this file is", not "how it is named".

Extensionless files with `bash` or `sh` shebangs are routed as `.sh` with the `shellscript` language ID. Direct interpreter paths, `env`, and `env -S` shebangs are supported.

### Scoping per harness

A harness that already integrates a language natively should not be offered a second, less integrated path to it. The registration that starts this server is harness-specific by construction, so it carries its own scope:

```jsonc
"env": { "LSP_TOOLS_MCP_ENABLED_SERVERS": "bash" }
```

- `LSP_TOOLS_MCP_ENABLED_SERVERS` — allowlist. Only these servers resolve, builtin or declared. **Prefer this.**
- `LSP_TOOLS_MCP_DISABLED_SERVERS` — denylist, applied when no allowlist is in force.
- `LSP_TOOLS_MCP_IGNORED_EXTENSIONS` — as `ignoredExtensions` above.

Each takes a comma-separated list and ignores surrounding whitespace.

**The environment replaces the shared configuration, it does not merge with it**, so a harness can narrow what the project declares and not only widen it. **An empty value clears the constraint** — it means "no restriction from me", never "an empty allowlist", which would leave the server resolving nothing while looking healthy.

Prefer the allowlist: a denylist cannot name a server that does not exist yet, so a config written today silently admits every builtin added in a later release. An allowlist states the intent once and stays correct across upstream additions. An allowlist wins over a denylist.

Unscoped, every server resolves. Excluded servers are hidden from `status` and never started. An entry naming no known server is reported under `Scoping problems` in `status`, because a misspelled id would otherwise resolve nothing and look exactly like a language with no findings.

### Workspace roots

Rust files first resolve their Cargo workspace through `cargo metadata`. Other files, and Rust files when Cargo resolution is unavailable, walk upward from the source file and select the nearest directory containing `.lsp-root`, `.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, or `build.gradle`. When no marker exists, discovery uses the source file's directory.

Create an empty `.lsp-root` file at the intended boundary for source trees that do not use another recognized marker or that live below an unrelated ancestor project. This avoids creating a fake `.git` directory, which can interfere with Git itself.

Path overrides via environment variables:

- `LSP_TOOLS_MCP_PROJECT_CONFIG`
- `LSP_TOOLS_MCP_USER_CONFIG`
- `LSP_TOOLS_MCP_ENABLED_SERVERS`, `LSP_TOOLS_MCP_DISABLED_SERVERS` — scope which servers this process resolves

The MCP process remains active until its host closes the stdio connection. Idle language-server child processes are cleaned up independently.

Examples (oh-my-openagent points the project config at `.opencode/lsp.json` via the env var):

```bash
LSP_TOOLS_MCP_PROJECT_CONFIG=.opencode/lsp.json node dist/cli.js mcp
LSP_TOOLS_MCP_USER_CONFIG=.opencode/lsp.json node dist/cli.js mcp
```

Example config file:

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

## Architecture

- `src/lsp/*` standalone LSP runtime (process management, JSON-RPC transport, configuration, diagnostics, workspace edits)
- `src/tools.ts` MCP tool definitions and handlers
- `src/mcp.ts` stdio MCP server entry and registration
- `src/cli.ts` standalone CLI entry (`mcp` subcommand only)

## Local Development

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

## License

[MIT](LICENSE)
