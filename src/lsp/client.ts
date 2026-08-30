import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { LspClientConnection } from "./connection.js";
import { LspDiagnosticsUnavailableError } from "./errors.js";
import { classifyFileLanguage } from "./file-language.js";
import type {
	Diagnostic,
	DocumentSymbol,
	Location,
	LocationLink,
	PrepareRenameDefaultBehavior,
	PrepareRenameResult,
	Range,
	SymbolInfo,
	WorkspaceEdit,
} from "./types.js";

const POST_OPEN_DELAY_MS = 1000;
// How long to let a push-only server finish analysing before reporting what it
// has. Sleeping a constant instead reports a large file as clean: ShellCheck on
// a 60 KB script does not answer within a second, and an empty store is
// indistinguishable from a file with no findings.
const DIAGNOSTICS_PUBLISH_TIMEOUT_MS = 10_000;

export class LspClient extends LspClientConnection {
	/** Overridable so tests need not wait the production deadline. */
	protected diagnosticsPublishTimeoutMs = DIAGNOSTICS_PUBLISH_TIMEOUT_MS;
	private readonly openedFiles = new Set<string>();
	private readonly documentVersions = new Map<string, number>();
	private readonly lastSyncedText = new Map<string, string>();
	private readonly diagnosticPullErrors: Error[] = [];

	getDiagnosticPullErrors(): readonly Error[] {
		return this.diagnosticPullErrors;
	}

	async openFile(filePath: string): Promise<void> {
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

	async definition(
		filePath: string,
		line: number,
		character: number,
	): Promise<Location | LocationLink | Array<Location | LocationLink> | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<Location | LocationLink | Array<Location | LocationLink> | null>(
			"textDocument/definition",
			{
				textDocument: { uri: pathToFileURL(absPath).href },
				position: { line: line - 1, character },
			},
		);
	}

	async references(filePath: string, line: number, character: number, includeDeclaration = true): Promise<Location[]> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<Location[]>("textDocument/references", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
			context: { includeDeclaration },
		});
	}

	async documentSymbols(filePath: string): Promise<Array<DocumentSymbol | SymbolInfo>> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<Array<DocumentSymbol | SymbolInfo>>("textDocument/documentSymbol", {
			textDocument: { uri: pathToFileURL(absPath).href },
		});
	}

	async workspaceSymbols(query: string): Promise<SymbolInfo[]> {
		const symbols = await this.sendRequest<SymbolInfo[] | null>("workspace/symbol", { query });
		return symbols ?? [];
	}

	private isUnsupportedDiagnosticPullError(error: unknown): boolean {
		if (!(error instanceof Error)) return false;
		const code = "code" in error && typeof error.code === "number" ? error.code : undefined;
		if (code === -32601) return true;
		return /unsupported|not supported|method not found|unknown request/i.test(error.message);
	}

	async diagnostics(filePath: string): Promise<{ items: Diagnostic[] }> {
		const absPath = resolve(filePath);
		const uri = pathToFileURL(absPath).href;
		await this.openFile(absPath);

		// A server that supports pull answers authoritatively and needs no waiting.
		try {
			const result = await this.sendRequest<{ items?: Diagnostic[] }>("textDocument/diagnostic", {
				textDocument: { uri },
			});
			if (result.items) {
				return { items: result.items };
			}
		} catch (error) {
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

	async prepareRename(
		filePath: string,
		line: number,
		character: number,
	): Promise<PrepareRenameResult | PrepareRenameDefaultBehavior | Range | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<PrepareRenameResult | PrepareRenameDefaultBehavior | Range | null>(
			"textDocument/prepareRename",
			{
				textDocument: { uri: pathToFileURL(absPath).href },
				position: { line: line - 1, character },
			},
		);
	}

	async rename(filePath: string, line: number, character: number, newName: string): Promise<WorkspaceEdit | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<WorkspaceEdit | null>("textDocument/rename", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
			newName,
		});
	}
}
