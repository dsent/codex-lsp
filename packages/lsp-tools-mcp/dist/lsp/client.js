import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LspClientConnection } from "./connection.js";
import { LspDiagnosticsUnavailableError } from "./errors.js";
import { classifyFileLanguage } from "./file-language.js";
const POST_OPEN_DELAY_MS = 1000;
// How long to let a push-only server finish analysing before reporting what it
// has. Sleeping a constant instead reports a large file as clean: ShellCheck on
// a 60 KB script does not answer within a second, and an empty store is
// indistinguishable from a file with no findings.
const DIAGNOSTICS_PUBLISH_TIMEOUT_MS = 10_000;
export class LspClient extends LspClientConnection {
    constructor() {
        super(...arguments);
        /** Overridable so tests need not wait the production deadline. */
        this.diagnosticsPublishTimeoutMs = DIAGNOSTICS_PUBLISH_TIMEOUT_MS;
        this.openedFiles = new Set();
        this.documentVersions = new Map();
        this.lastSyncedText = new Map();
        this.diagnosticPullErrors = [];
    }
    getDiagnosticPullErrors() {
        return this.diagnosticPullErrors;
    }
    async openFile(filePath) {
        const absPath = resolve(filePath);
        const uri = pathToFileURL(absPath).href;
        const text = readFileSync(absPath, "utf-8");
        if (!this.openedFiles.has(absPath)) {
            const { languageId } = classifyFileLanguage(absPath, text);
            const version = 1;
            this.markDiagnosticsStale(uri);
            await this.sendNotification("textDocument/didOpen", {
                textDocument: {
                    uri,
                    languageId,
                    version,
                    text,
                },
            });
            this.openedFiles.add(absPath);
            this.documentVersions.set(uri, version);
            this.lastSyncedText.set(uri, text);
            await new Promise((r) => setTimeout(r, POST_OPEN_DELAY_MS));
            return;
        }
        const prevText = this.lastSyncedText.get(uri);
        if (prevText === text) {
            return;
        }
        const nextVersion = (this.documentVersions.get(uri) ?? 1) + 1;
        this.documentVersions.set(uri, nextVersion);
        this.lastSyncedText.set(uri, text);
        await this.sendNotification("textDocument/didChange", {
            textDocument: { uri, version: nextVersion },
            contentChanges: [{ text }],
        });
        await this.sendNotification("textDocument/didSave", {
            textDocument: { uri },
            text,
        });
    }
    async definition(filePath, line, character) {
        const absPath = resolve(filePath);
        await this.openFile(absPath);
        return this.sendRequest("textDocument/definition", {
            textDocument: { uri: pathToFileURL(absPath).href },
            position: { line: line - 1, character },
        });
    }
    async references(filePath, line, character, includeDeclaration = true) {
        const absPath = resolve(filePath);
        await this.openFile(absPath);
        return this.sendRequest("textDocument/references", {
            textDocument: { uri: pathToFileURL(absPath).href },
            position: { line: line - 1, character },
            context: { includeDeclaration },
        });
    }
    async documentSymbols(filePath) {
        const absPath = resolve(filePath);
        await this.openFile(absPath);
        return this.sendRequest("textDocument/documentSymbol", {
            textDocument: { uri: pathToFileURL(absPath).href },
        });
    }
    async workspaceSymbols(query) {
        const symbols = await this.sendRequest("workspace/symbol", { query });
        return symbols ?? [];
    }
    isUnsupportedDiagnosticPullError(error) {
        if (!(error instanceof Error))
            return false;
        const code = "code" in error && typeof error.code === "number" ? error.code : undefined;
        if (code === -32601)
            return true;
        return /unsupported|not supported|method not found|unknown request/i.test(error.message);
    }
    async diagnostics(filePath) {
        const absPath = resolve(filePath);
        const uri = pathToFileURL(absPath).href;
        await this.openFile(absPath);
        // A server that supports pull answers authoritatively and needs no waiting.
        try {
            const result = await this.sendRequest("textDocument/diagnostic", {
                textDocument: { uri },
            });
            if (result.items) {
                return { items: result.items };
            }
        }
        catch (error) {
            if (!this.isUnsupportedDiagnosticPullError(error)) {
                this.diagnosticPullErrors.push(error instanceof Error ? error : new Error(String(error)));
            }
        }
        // Push-only server: wait for it to answer for this document rather than
        // sleeping a constant and reporting whatever happened to arrive.
        // Throw only when the server has said nothing about this document at all.
        // A previous answer still on file is worth returning; silence is not.
        const published = await this.waitForDiagnostics(uri, this.diagnosticsPublishTimeoutMs);
        if (!published && !this.hasStoredDiagnostics(uri)) {
            throw new LspDiagnosticsUnavailableError(absPath, this.diagnosticsPublishTimeoutMs);
        }
        return { items: this.getStoredDiagnostics(uri) };
    }
    async prepareRename(filePath, line, character) {
        const absPath = resolve(filePath);
        await this.openFile(absPath);
        return this.sendRequest("textDocument/prepareRename", {
            textDocument: { uri: pathToFileURL(absPath).href },
            position: { line: line - 1, character },
        });
    }
    async rename(filePath, line, character, newName) {
        const absPath = resolve(filePath);
        await this.openFile(absPath);
        return this.sendRequest("textDocument/rename", {
            textDocument: { uri: pathToFileURL(absPath).href },
            position: { line: line - 1, character },
            newName,
        });
    }
}
