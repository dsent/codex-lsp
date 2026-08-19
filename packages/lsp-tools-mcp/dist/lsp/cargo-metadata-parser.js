import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { parse } from "smol-toml";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalDirectory(path) {
    try {
        const canonicalPath = realpathSync.native(path);
        return statSync(canonicalPath).isDirectory() ? canonicalPath : undefined;
    }
    catch {
        return undefined;
    }
}
export function canonicalManifest(path) {
    try {
        const canonicalPath = realpathSync.native(path);
        return statSync(canonicalPath).isFile() ? canonicalPath : undefined;
    }
    catch {
        return undefined;
    }
}
function readFile(path) {
    try {
        return readFileSync(path, "utf8");
    }
    catch {
        return undefined;
    }
}
function readCargoManifestKind(path) {
    const content = readFile(path);
    if (content === undefined)
        return undefined;
    try {
        return Object.hasOwn(parse(content), "workspace") ? "workspace" : "ordinary";
    }
    catch {
        return "invalid";
    }
}
function isContainedPath(root, path) {
    const relativePath = relative(root, path);
    return (relativePath === "" ||
        (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`)));
}
function parseCargoMetadata(output) {
    let parsed;
    try {
        parsed = JSON.parse(output);
    }
    catch {
        return undefined;
    }
    if (!isRecord(parsed))
        return undefined;
    const workspaceRoot = parsed["workspace_root"];
    const workspaceMembers = parsed["workspace_members"];
    const packages = parsed["packages"];
    if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0)
        return undefined;
    if (!Array.isArray(workspaceMembers) || !Array.isArray(packages))
        return undefined;
    const memberIds = new Set();
    for (const id of workspaceMembers) {
        if (typeof id !== "string")
            return undefined;
        memberIds.add(id);
    }
    const memberManifestPaths = [];
    for (const pkg of packages) {
        if (!isRecord(pkg))
            return undefined;
        const id = pkg["id"];
        const manifestPath = pkg["manifest_path"];
        if (typeof id !== "string" || typeof manifestPath !== "string")
            return undefined;
        if (memberIds.has(id))
            memberManifestPaths.push(manifestPath);
    }
    if (memberManifestPaths.length !== memberIds.size)
        return undefined;
    return { workspaceRoot, memberManifestPaths };
}
function validateCargoMetadata(requestedManifestPath, metadata) {
    const workspaceRoot = canonicalDirectory(metadata.workspaceRoot);
    if (workspaceRoot === undefined)
        return undefined;
    const rootManifestPath = canonicalManifest(join(workspaceRoot, "Cargo.toml"));
    const requestedManifest = canonicalManifest(requestedManifestPath);
    if (rootManifestPath === undefined || requestedManifest === undefined)
        return undefined;
    if (!isContainedPath(workspaceRoot, requestedManifest))
        return undefined;
    const rootManifestKind = readCargoManifestKind(rootManifestPath);
    const requestedManifestKind = requestedManifest === rootManifestPath ? rootManifestKind : readCargoManifestKind(requestedManifest);
    if (rootManifestKind === undefined || rootManifestKind === "invalid")
        return undefined;
    if (requestedManifestKind === undefined || requestedManifestKind === "invalid")
        return undefined;
    if (requestedManifest !== rootManifestPath && requestedManifestKind === "workspace")
        return undefined;
    const memberManifestPaths = [];
    const members = new Set();
    for (const manifestPath of metadata.memberManifestPaths) {
        const canonicalPath = canonicalManifest(manifestPath);
        if (canonicalPath === undefined)
            return undefined;
        if (!isContainedPath(workspaceRoot, canonicalPath))
            return undefined;
        const manifestKind = canonicalPath === rootManifestPath ? rootManifestKind : readCargoManifestKind(canonicalPath);
        if (manifestKind === undefined)
            return undefined;
        if (canonicalPath !== rootManifestPath && manifestKind !== "ordinary")
            continue;
        if (!members.has(canonicalPath)) {
            members.add(canonicalPath);
            memberManifestPaths.push(canonicalPath);
        }
    }
    if (requestedManifest !== rootManifestPath && !members.has(requestedManifest))
        return undefined;
    return { workspaceRoot, rootManifestPath, memberManifestPaths };
}
export function parseTrustedCargoMetadata(requestedManifestPath, output) {
    const parsed = parseCargoMetadata(output);
    return parsed === undefined ? undefined : validateCargoMetadata(requestedManifestPath, parsed);
}
