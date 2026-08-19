import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { awaitSharedAbortableOperation, createSharedAbortableOperation, } from "./abortable-shared-operation.js";
import { readAncestorManifestSnapshots, snapshotsAreFresh } from "./cargo-manifest-snapshot.js";
import { canonicalManifest, parseTrustedCargoMetadata } from "./cargo-metadata-parser.js";
import { defaultCargoMetadataLoader } from "./cargo-metadata-process.js";
const CARGO_METADATA_FAILURE_BACKOFF_MS = 1_000;
const cargoWorkspaceRootCache = new Map();
const cargoWorkspaceRootFailures = new Map();
const cargoWorkspaceRootInFlight = new Map();
function realpathSafe(path) {
    try {
        return realpathSync.native(path);
    }
    catch {
        return path;
    }
}
function nearestCargoManifestDir(startDir) {
    let dir = startDir;
    let prev = "";
    while (dir !== prev) {
        if (existsSync(join(dir, "Cargo.toml")))
            return dir;
        prev = dir;
        dir = dirname(dir);
    }
    return undefined;
}
function cacheEntryFor(root, memberManifestDir) {
    const snapshots = readAncestorManifestSnapshots(memberManifestDir);
    return snapshots === undefined ? undefined : { root, snapshots };
}
function prepareCargoWorkspaceCache(manifestDir, metadata) {
    const entries = new Map();
    for (const manifestPath of metadata.memberManifestPaths) {
        const manifestDir = dirname(manifestPath);
        const entry = cacheEntryFor(metadata.workspaceRoot, manifestDir);
        if (entry === undefined)
            return undefined;
        entries.set(manifestDir, entry);
    }
    const requestedManifestPath = canonicalManifest(join(manifestDir, "Cargo.toml"));
    if (requestedManifestPath === undefined)
        return undefined;
    const requestedEntry = cacheEntryFor(metadata.workspaceRoot, dirname(requestedManifestPath));
    if (requestedEntry === undefined)
        return undefined;
    entries.set(manifestDir, requestedEntry);
    return { root: metadata.workspaceRoot, entries };
}
function preparedCacheIsFresh(prepared) {
    for (const entry of prepared.entries.values()) {
        if (!snapshotsAreFresh(entry.snapshots))
            return false;
    }
    return true;
}
function commitCargoWorkspaceCache(prepared) {
    for (const [manifestDir, entry] of prepared.entries) {
        cargoWorkspaceRootCache.set(manifestDir, entry);
    }
}
function cacheCargoWorkspaceFailure(manifestDir, nowMs, snapshots) {
    cargoWorkspaceRootFailures.set(manifestDir, {
        expiresAtMs: nowMs + CARGO_METADATA_FAILURE_BACKOFF_MS,
        snapshots,
    });
}
function cacheCargoWorkspaceLoadFailure(request) {
    cacheCargoWorkspaceFailure(request.manifestDir, request.now(), request.generation.snapshots);
}
function cachedCargoWorkspaceFailure(manifestDir, nowMs) {
    const cached = cargoWorkspaceRootFailures.get(manifestDir);
    if (cached === undefined)
        return false;
    if (nowMs >= cached.expiresAtMs) {
        cargoWorkspaceRootFailures.delete(manifestDir);
        return false;
    }
    if (snapshotsAreFresh(cached.snapshots))
        return true;
    cargoWorkspaceRootFailures.delete(manifestDir);
    return false;
}
function isAbortError(error) {
    if (error instanceof DOMException && error.name === "AbortError")
        return true;
    return error instanceof Error && error.name === "AbortError";
}
function sameCargoWorkspaceGeneration(left, right) {
    if (left.snapshots.length !== right.snapshots.length)
        return false;
    return left.snapshots.every((snapshot, index) => {
        const candidate = right.snapshots[index];
        return (candidate !== undefined &&
            candidate.path === snapshot.path &&
            candidate.exists === snapshot.exists &&
            candidate.content === snapshot.content);
    });
}
function deleteInFlight(manifestDir, inFlight) {
    if (cargoWorkspaceRootInFlight.get(manifestDir)?.operation === inFlight) {
        cargoWorkspaceRootInFlight.delete(manifestDir);
    }
}
function createInFlightCargoWorkspaceRoot(request) {
    let inFlight;
    inFlight = createSharedAbortableOperation((signal) => loadCargoWorkspaceRoot({ ...request, signal }), () => {
        deleteInFlight(request.manifestDir, inFlight);
    }, () => {
        deleteInFlight(request.manifestDir, inFlight);
    });
    return inFlight;
}
async function loadCargoWorkspaceRoot(request) {
    try {
        request.signal?.throwIfAborted();
        const manifestPath = join(request.manifestDir, "Cargo.toml");
        const output = await request.loader(manifestPath, request.signal);
        request.signal?.throwIfAborted();
        if (!snapshotsAreFresh(request.generation.snapshots)) {
            cacheCargoWorkspaceLoadFailure(request);
            return undefined;
        }
        const metadata = parseTrustedCargoMetadata(manifestPath, output);
        if (metadata === undefined || !snapshotsAreFresh(request.generation.snapshots)) {
            cacheCargoWorkspaceLoadFailure(request);
            return undefined;
        }
        const prepared = prepareCargoWorkspaceCache(request.manifestDir, metadata);
        if (prepared === undefined ||
            !snapshotsAreFresh(request.generation.snapshots) ||
            !preparedCacheIsFresh(prepared)) {
            cacheCargoWorkspaceLoadFailure(request);
            return undefined;
        }
        commitCargoWorkspaceCache(prepared);
        cargoWorkspaceRootFailures.delete(request.manifestDir);
        return prepared.root;
    }
    catch (error) {
        if (request.signal?.aborted || isAbortError(error))
            throw error;
        cacheCargoWorkspaceLoadFailure(request);
        return undefined;
    }
}
function cachedCargoWorkspaceRoot(manifestDir) {
    const cached = cargoWorkspaceRootCache.get(manifestDir);
    if (cached === undefined)
        return undefined;
    if (snapshotsAreFresh(cached.snapshots))
        return cached.root;
    cargoWorkspaceRootCache.delete(manifestDir);
    return undefined;
}
async function cargoWorkspaceRoot(request) {
    request.signal?.throwIfAborted();
    const cached = cachedCargoWorkspaceRoot(request.manifestDir);
    if (cached !== undefined)
        return cached;
    const nowMs = request.now();
    if (cachedCargoWorkspaceFailure(request.manifestDir, nowMs))
        return undefined;
    const snapshots = readAncestorManifestSnapshots(request.manifestDir);
    if (snapshots === undefined)
        return undefined;
    const generation = { snapshots };
    const inFlight = cargoWorkspaceRootInFlight.get(request.manifestDir);
    if (inFlight !== undefined && sameCargoWorkspaceGeneration(inFlight.generation, generation)) {
        return awaitSharedAbortableOperation(inFlight.operation, request.signal);
    }
    const newInFlight = createInFlightCargoWorkspaceRoot({ ...request, generation });
    cargoWorkspaceRootInFlight.set(request.manifestDir, { generation, operation: newInFlight });
    return awaitSharedAbortableOperation(newInFlight, request.signal);
}
export async function resolveCargoWorkspaceRoot(startDir, options = {}) {
    const manifestDir = nearestCargoManifestDir(realpathSafe(startDir));
    if (manifestDir === undefined)
        return undefined;
    const canonicalManifestDir = realpathSafe(manifestDir);
    const root = await cargoWorkspaceRoot({
        manifestDir: canonicalManifestDir,
        loader: options.cargoMetadataLoader ?? defaultCargoMetadataLoader,
        now: options.now ?? Date.now,
        signal: options.signal,
    });
    return root ?? canonicalManifestDir;
}
