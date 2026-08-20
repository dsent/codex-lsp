import { statSync } from "node:fs";
import { resolve } from "node:path";
import { isLspDeadConnectionError, LspInvalidPathError, LspRequestTimeoutError, LspServerInitializingError, LspServerLookupError, } from "./errors.js";
import { classifyFileLanguage } from "./file-language.js";
import { getLspManager } from "./manager.js";
import { findServerForExtension } from "./server-resolution.js";
import { findWorkspaceRoot } from "./workspace-root.js";
export { findWorkspaceRoot };
export function isDirectoryPath(filePath) {
    try {
        return statSync(filePath).isDirectory();
    }
    catch {
        return false;
    }
}
export function formatServerLookupError(result) {
    if (result.status === "ignored") {
        return `LSP lookup ignored for extension: ${result.extension}`;
    }
    if (result.status === "not_installed") {
        const { extension, server, installHint } = result;
        return [
            `LSP server '${server.id}' is configured but NOT INSTALLED.`,
            "",
            `Command not found: ${server.command[0]}`,
            "",
            "To install:",
            `  ${installHint}`,
            "",
            `Supported extensions: ${server.extensions.join(", ")}`,
            "",
            "After installation, the server will be available automatically.",
            "",
            "Alternatively, configure a different server for this extension in '.codex/lsp-client.json',",
            `or suppress automatic lookup by adding "${extension}" to its top-level "ignoredExtensions" array.`,
        ].join("\n");
    }
    return [
        `No LSP server configured for extension: ${result.extension}`,
        "",
        `Available servers: ${result.availableServers.slice(0, 10).join(", ")}${result.availableServers.length > 10 ? "..." : ""}`,
        "",
        "Configure a custom server in '.codex/lsp-client.json':",
        "  {",
        '    "lsp": {',
        '      "my-server": {',
        '        "command": ["my-lsp", "--stdio"],',
        `        "extensions": ["${result.extension}"]`,
        "      }",
        "    }",
        "  }",
    ].join("\n");
}
const READ_ONLY_RETRY_TOOLS = new Set([
    "diagnostics",
    "definition",
    "references",
    "documentSymbols",
    "workspaceSymbols",
    "prepareRename",
]);
export async function withLspClient(filePath, fn, toolName, options = {}) {
    const absPath = resolve(filePath);
    if (isDirectoryPath(absPath)) {
        throw new LspInvalidPathError("Directory paths are not supported by this LSP tool. " +
            "Use lsp.diagnostics with a directory path for directory diagnostics.");
    }
    const { extension: ext } = classifyFileLanguage(absPath);
    const result = findServerForExtension(ext);
    if (result.status !== "found") {
        throw new LspServerLookupError(formatServerLookupError(result));
    }
    const server = result.server;
    const { manager: optionManager, ...workspaceRootOptions } = options;
    const root = await findWorkspaceRoot(absPath, server, workspaceRootOptions);
    const manager = optionManager ?? getLspManager();
    const acquireAndCall = async (allowRetry) => {
        const client = await manager.getClient(root, server, options.signal);
        try {
            return await fn(client);
        }
        catch (err) {
            if (allowRetry && READ_ONLY_RETRY_TOOLS.has(toolName) && isLspDeadConnectionError(err)) {
                manager.invalidateClient(root, server.id, client);
                return acquireAndCall(false);
            }
            if (err instanceof LspRequestTimeoutError) {
                if (manager.isServerInitializing(root, server.id)) {
                    throw new LspServerInitializingError(err);
                }
            }
            throw err;
        }
        finally {
            manager.releaseClient(root, server.id);
        }
    };
    return acquireAndCall(true);
}
