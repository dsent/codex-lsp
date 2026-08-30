# Vendoring decisions in this fork

This fork diverges from upstream in three deliberate ways. Each exists so that a
consumer can add this repository as a git submodule and run it immediately, with
no `npm install`, no build step, and no recursive submodule init.

Everything committed here is plain JavaScript and JSON. No binaries.

## 1. `lsp-tools-mcp` is a subtree, not a submodule

Upstream carries `packages/lsp-tools-mcp` as a git submodule. Here it is a
squashed `git subtree`, so this checkout is self-contained.

Refresh it with:

```bash
git subtree pull --prefix=packages/lsp-tools-mcp \
  https://github.com/dsent/lsp-tools-mcp.git main --squash
```

Upstream changes that move the old submodule pointer will conflict at that path.
Resolve by taking this fork's tree and running the pull above.

### Keeping the prefix pristine

Everything under `packages/lsp-tools-mcp/` is byte-identical to
`dsent/lsp-tools-mcp`, including the tracked `dist/`. There is no divergence to
resolve, which is what makes subtree pulls clean.

- The prefix's `.gitignore` is **not** edited here. It no longer ignores `dist/`
  upstream, so build output arrives with the pull and needs no force-add.
- The committed `node_modules` entries live at the repository root, not beside
  the runtime.

## 2. Build output is committed

`dist/` is tracked in both packages. A consumer pinning a SHA gets working code
at that SHA, which is the whole point of pinning. Building on the consumer side
would also fail where it is most needed: agent sandboxes commonly run without
network access, so `npm ci` is not available at the moment the server is
launched.

The runtime's `dist/` is owned upstream and arrives with each subtree pull, so
it is never stale here and is never rebuilt here. `dsent/lsp-tools-mcp` fails
its own `npm run check` when the committed output does not match a fresh build.

This repository's own `dist/` still needs rebuilding after any change to its
`src/`:

```bash
npm install && npm run build
```

## 3. Two `node_modules` entries are committed

`.gitignore` still ignores `node_modules`, with two explicit re-inclusions:

| Path | What | Why |
| --- | --- | --- |
| `node_modules/@code-yeongyu/lsp-tools-mcp` | relative symlink to `packages/lsp-tools-mcp` | `dist/cli.js` imports the runtime by package name; Node resolves bare ESM specifiers only through `node_modules`, so this link is structural |
| `node_modules/smol-toml` | the package, verbatim | the runtime declares it under `optionalDependencies` but imports it unguarded |

Both sit at the repository root. `smol-toml` is imported from inside
`packages/lsp-tools-mcp/`, and Node resolves bare specifiers by walking parent
directories, so a root-level copy serves it — which keeps the subtree prefix
free of divergence.

`smol-toml` is BSD-3-Clause. It is kept byte-for-byte with its own `LICENSE`
file, which the licence requires of redistributions — and committing it here is
redistribution. Do not tidy that file away.

### The `smol-toml` situation is an upstream bug

`packages/lsp-tools-mcp/src/lsp/cargo-metadata-parser.ts` imports `smol-toml` at
module scope while `package.json` lists it under `optionalDependencies`. `npm ci`
skips optional dependencies, and the unguarded import then fails the entire
module graph: every tool call returns `ERR_MODULE_NOT_FOUND`, not merely Rust
support degrading.

Committing the package works around it. The actual fix is to make the import
lazy, or to promote the dependency, and belongs upstream. Keep harness-neutral
runtime changes in <https://github.com/dsent/lsp-tools-mcp>; this repository
consumes them as a vendored snapshot, while other MCP-capable harnesses can
consume that repository directly.
