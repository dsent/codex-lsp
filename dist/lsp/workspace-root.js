import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveCargoWorkspaceRoot } from "./cargo-workspace-root.js";
const WORKSPACE_MARKERS = [".lsp-root", ".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml"];
const GRADLE_SETTINGS_MARKERS = ["settings.gradle", "settings.gradle.kts"];
const GRADLE_BUILD_MARKERS = ["build.gradle", "build.gradle.kts"];
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
    let gradleBuildRoot;
    while (dir !== prevDir) {
        for (const marker of GRADLE_SETTINGS_MARKERS) {
            if (existsSync(join(dir, marker))) {
                return dir;
            }
        }
        if (gradleBuildRoot === undefined) {
            for (const marker of GRADLE_BUILD_MARKERS) {
                if (existsSync(join(dir, marker))) {
                    gradleBuildRoot = dir;
                    break;
                }
            }
        }
        for (const marker of WORKSPACE_MARKERS) {
            if (existsSync(join(dir, marker))) {
                return gradleBuildRoot ?? dir;
            }
        }
        prevDir = dir;
        dir = dirname(dir);
    }
    return gradleBuildRoot ?? dirname(abs);
}
