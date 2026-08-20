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

Everything under `packages/lsp-tools-mcp/` is byte-identical to upstream except
for the tracked `dist/`, which cannot move because the package's own `exports`
point at `./dist`. Divergence inside the prefix is what makes subtree pulls
conflict, so it is kept to that one unavoidable case:

- The prefix's `.gitignore` is **not** edited. `dist/` is tracked by force-adding
  it once (`git add -f`); `.gitignore` governs only untracked files, so it stays
  tracked afterwards regardless.
- The committed `node_modules` entries live at the repository root, not beside
  the runtime.

## 2. Build output is committed

`dist/` in both packages is tracked; upstream ignores it in the runtime package.
A consumer pinning a submodule SHA gets working code at that SHA, which is the
whole point of pinning. Building on the consumer side would also fail where it
is most needed: agent sandboxes commonly run without network access, so
`npm ci` is not available at the moment the server is launched.

`dist/` is stale after any subtree pull, and nothing flags that — upstream does
not track these paths, so a pull cannot conflict on them. Always rebuild and
commit after pulling.

Rebuild after any source change or subtree pull, and commit the result:

```bash
(cd packages/lsp-tools-mcp && npm ci && npm run build)
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
