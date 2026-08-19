import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveCargoWorkspaceRoot } from "./cargo-workspace-root.js";
const WORKSPACE_MARKERS = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"];
function isDirectoryPath(filePath) {
    try {
        return statSync(filePath).isDirectory();
    }
    catch {
        return false;
    }
}
export async function findWorkspaceRoot(filePath, server, options = {}) {
    const abs = resolve(filePath);
    let dir = abs;
    if (!isDirectoryPath(dir)) {
        dir = dirname(dir);
    }
    if (server?.id === "rust") {
        const cargoRoot = await resolveCargoWorkspaceRoot(dir, options);
        if (cargoRoot !== undefined)
            return cargoRoot;
    }
    let prevDir = "";
    while (dir !== prevDir) {
        for (const marker of WORKSPACE_MARKERS) {
            if (existsSync(join(dir, marker))) {
                return dir;
            }
        }
        prevDir = dir;
        dir = dirname(dir);
    }
    return dirname(abs);
}
