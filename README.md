# lsp-tools-mcp

[![ci](https://github.com/code-yeongyu/lsp-tools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/code-yeongyu/lsp-tools-mcp/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Standalone Language Server Protocol tools exposed as a stdio MCP server.

## Used By

This package is the upstream source of truth for two downstream plugins. Codex consumes the repository-level package directly; OpenCode consumes the same runtime as a built-in MCP package.

| Project | Path | Role |
|---------|------|------|
| **[codex-lsp](https://github.com/code-yeongyu/codex-lsp)** | `packages/lsp-tools-mcp/` | Codex plugin that reuses these LSP MCP tools plus a Codex-specific PostToolUse diagnostics hook. |
| **[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)** (a.k.a. `oh-my-opencode`) | `vendor/lsp-tools-mcp/` | OpenCode plugin that registers this server as a built-in Tier-1 stdio MCP. Exposes `lsp_diagnostics`, `lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`, `lsp_prepare_rename`, `lsp_rename`, and `lsp_status` to all agents. |

If you fix or extend the LSP runtime here, downstream adapters should reuse this package. Do not fork the runtime into a downstream; land changes here instead.

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

Default config paths (matches codex-lsp's historical layout):

- Project: `.codex/lsp-client.json`
- User: `~/.codex/lsp-client.json`

Project and user configuration can suppress automatic lookup for selected extensions before any server command is resolved:

```json
{
  "ignoredExtensions": [".json", ".jsonc"]
}
```

Extensionless files with `bash` or `sh` shebangs are routed as `.sh` with the `shellscript` language ID. Direct interpreter paths, `env`, and `env -S` shebangs are supported.

### Per-agent scoping

`ignoredExtensions` and per-server `disabled` are unioned across every loaded config, so one shared config cannot express two scopes: narrowing it for a harness that already has native language support narrows it for every other harness too. Name the calling harness in `LSP_TOOLS_MCP_AGENT` and give it a section:

```json
{
  "agents": {
    "claude": {
      "enabledServers": ["bash"],
      "ignoredExtensions": [".go", ".rs"]
    }
  }
}
```

`enabledServers` is an allowlist: only those servers resolve for that harness, builtin or declared. Prefer it. `disabledServers` is also accepted and names servers to remove, but it cannot name a server that does not exist yet, so a config written today silently admits every builtin added later. An allowlist states the intent once and stays correct across upstream additions. When both appear, `enabledServers` wins.

A harness with no section, or no `LSP_TOOLS_MCP_AGENT` set, sees every server as before. Excluded servers are hidden from `status` and never started, so the harness is not offered a second, less integrated path to a language it already covers.

### Workspace roots

Rust files first resolve their Cargo workspace through `cargo metadata`. Other files, and Rust files when Cargo resolution is unavailable, walk upward from the source file and select the nearest directory containing `.lsp-root`, `.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, or `build.gradle`. When no marker exists, discovery uses the source file's directory.

Create an empty `.lsp-root` file at the intended boundary for source trees that do not use another recognized marker or that live below an unrelated ancestor project. This avoids creating a fake `.git` directory, which can interfere with Git itself.

Path overrides via environment variables:

- `LSP_TOOLS_MCP_PROJECT_CONFIG`
- `LSP_TOOLS_MCP_USER_CONFIG`
- `LSP_TOOLS_MCP_AGENT` — names the calling harness, selecting its section under `agents`

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
