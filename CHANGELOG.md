# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- Top-level `ignoredExtensions` configuration that short-circuits server command lookup.
- Extensionless `bash` and `sh` shebang routing through the `.sh` language server.

### Changed

- Missing-server guidance now offers configuration and extension-suppression actions.
- Development lockfile resolves patched `nanoid` 3.3.18.

### Fixed

- Keep the stdio MCP transport alive until its host closes the connection while retaining idle cleanup of language-server children. Legacy idle-timeout options remain accepted as no-ops.

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
