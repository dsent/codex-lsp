# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- Top-level `ignoredExtensions` configuration that short-circuits server command lookup.
- Extensionless `bash` and `sh` shebang routing through the `.sh` language server.
- `.lsp-root` as an explicit workspace boundary for source trees without a suitable project marker.
- Per-harness scoping through `LSP_TOOLS_MCP_ENABLED_SERVERS`, `LSP_TOOLS_MCP_DISABLED_SERVERS`, and `LSP_TOOLS_MCP_IGNORED_EXTENSIONS`, declared by the registration that starts the server. The environment replaces the shared configuration rather than merging, and an empty value clears the constraint. The allowlist takes precedence and is the durable form, since a denylist cannot name a builtin added in a later release. `status` reports entries naming no known server.
- Project-level `enabledServers` and `disabledServers` beside `ignoredExtensions`, so a shared config states what the project wants and each harness narrows it.
- Tracked `dist/`, so a consumer pinning a revision gets runnable code with no install or build step. `npm run check` fails if the committed output does not match a fresh build.

### Changed

- Default config paths are harness-neutral: the nearest `lsp-client.json` at or above the working directory, bounded by the project markers, and `${XDG_CONFIG_HOME:-~/.config}/lsp-tools-mcp/lsp-client.json` for the user. Previously `.codex/lsp-client.json`, which named whichever harness had adopted the package most recently.

- Missing-server guidance now offers configuration and extension-suppression actions.
- Development lockfile resolves patched `nanoid` 3.3.18.

### Fixed

- Wait for a push-only server to report on a document instead of sleeping a fixed interval, and fail with `diagnostics_unavailable` when it never answers, telling the caller to retry rather than leaving an unactionable state. Previously a large file returned an empty list on first request, which is indistinguishable from a file with no findings.
- Prefer source extensions with available configured servers when inferring the language for directory diagnostics.
- Preserve non-file definition URIs such as Kotlin and Java archive locations.
- Launch JetBrains Kotlin LSP with its mandatory `--stdio` transport flag.
- Keep the stdio MCP transport alive until its host closes the connection while retaining idle cleanup of language-server children. Legacy idle-timeout options remain accepted as no-ops.
- Treat `null` workspace-symbol responses as an empty result set.

## [0.1.0] - 2026-05-18

### Added

- Initial standalone extraction from `codex-lsp`:
  - LSP runtime (`src/lsp/*`)
  - MCP server (`src/mcp.ts`)
  - Tool definitions (`src/tools.ts`)
  - Standalone CLI (`src/cli.ts`, `mcp` subcommand only)
- Config path override support:
  - `LSP_TOOLS_MCP_PROJECT_CONFIG`
  - `LSP_TOOLS_MCP_USER_CONFIG`
- Full test suite import (excluding Codex-specific hook tests)
- CI workflow matrix (ubuntu/macos/windows x node 20/22)
- Release-triggered npm publish workflow
- Repository governance files (ruleset, CODEOWNERS, dependabot, issue templates, PR template)
