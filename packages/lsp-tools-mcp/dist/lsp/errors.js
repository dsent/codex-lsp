export class LspConnectionClosedError extends Error {
    constructor(serverId, root, message) {
        super(message ?? `LSP connection closed for ${serverId} at ${root}`);
        this.serverId = serverId;
        this.root = root;
        this.name = "LspConnectionClosedError";
    }
}
export class LspProcessExitedError extends Error {
    constructor(serverId, root, exitCode, stderrTail) {
        const stderrSuffix = stderrTail ? `\nstderr tail: ${stderrTail}` : "";
        super(`LSP server ${serverId} at ${root} exited with code ${exitCode ?? "null"}${stderrSuffix}`);
        this.serverId = serverId;
        this.root = root;
        this.exitCode = exitCode;
        this.stderrTail = stderrTail;
        this.name = "LspProcessExitedError";
    }
}
export class LspRequestTimeoutError extends Error {
    constructor(method, stderrTail) {
        const stderrSuffix = stderrTail ? `\nrecent stderr: ${stderrTail}` : "";
        super(`LSP request timeout (method: ${method})${stderrSuffix}`);
        this.method = method;
        this.stderrTail = stderrTail;
        this.name = "LspRequestTimeoutError";
    }
}
export class LspInvalidPathError extends Error {
    constructor() {
        super(...arguments);
        this.name = "LspInvalidPathError";
    }
}
export class LspServerLookupError extends Error {
    constructor() {
        super(...arguments);
        this.name = "LspServerLookupError";
    }
}
export class LspServerInitializingError extends Error {
    constructor(originalError) {
        super(`LSP server is still initializing. Please retry in a few seconds. Original error: ${originalError.message}`);
        this.originalError = originalError;
        this.name = "LspServerInitializingError";
    }
}
export class LspProcessSpawnError extends Error {
    constructor() {
        super(...arguments);
        this.name = "LspProcessSpawnError";
    }
}
export function isLspDeadConnectionError(err) {
    return err instanceof LspConnectionClosedError || err instanceof LspProcessExitedError;
}
/**
 * The server never reported for a document. Distinct from an empty result on
 * purpose: a caller must be able to tell "no findings" from "no answer", and a
 * single empty array cannot say both.
 */
export class LspDiagnosticsUnavailableError extends Error {
    constructor(filePath, timeoutMs) {
        super(`Diagnostics for ${filePath} are not ready: the language server reported nothing within ${timeoutMs} ms. ` +
            "This is not a clean result and does not mean the file has no findings — the outcome is unknown. " +
            "The server is still analysing in the background, and the work is not wasted: " +
            "request diagnostics for this file again in about 10 seconds and it will normally answer from cache.");
        this.filePath = filePath;
        this.timeoutMs = timeoutMs;
        this.name = "LspDiagnosticsUnavailableError";
    }
}
