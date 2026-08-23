# Kotlin LSP

Kotlin language servers are useful for semantic navigation and advisory
diagnostics. The project's Gradle build remains authoritative.

- A cold Gradle import can take minutes. Retry empty symbol or definition
  results after indexing settles.
- Generate Android resources before relying on `R` symbols. After resources,
  dependencies, or the Gradle model change, regenerate them and restart the
  Kotlin language server; a running server can retain stale state.
- Treat generated `R` diagnostics and generated or library definition targets
  as advisory. Validate Kotlin changes with the project build.
- Avoid launching a fresh Kotlin JVM for every automatic edit check. With the
  `codex-lsp` hook, add `.kt,.kts` to
  `CODEX_LSP_HOOK_IGNORED_EXTENSIONS` and call `lsp.diagnostics` explicitly.
