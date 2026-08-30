import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { LspClient } from "../src/lsp/client.js";
import { LspDiagnosticsUnavailableError } from "../src/lsp/errors.js";
import type { Diagnostic, ResolvedServer } from "../src/lsp/types.js";

const server: ResolvedServer = { id: "fake", command: ["fake-lsp"], extensions: [".sh"], priority: 0 };

const diagnostic: Diagnostic = {
	range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
	message: "example finding",
};

/** A push-only server: it rejects the pull request, as bash-language-server does. */
class PushOnlyClient extends LspClient {
	constructor(root: string, timeoutMs: number) {
		super(root, server);
		this.diagnosticsPublishTimeoutMs = timeoutMs;
	}

	override async start(): Promise<void> {}
	override async initialize(): Promise<void> {}
	override isAlive(): boolean {
		return true;
	}

	protected override async sendNotification(): Promise<void> {}

	protected override async sendRequest<T>(): Promise<T> {
		throw new Error("method not found");
	}

	publish(uri: string, items: Diagnostic[]): void {
		this.diagnosticsStore.set(uri, items);
		this.diagnosticsPublished.add(uri);
	}
}

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scriptIn(root: string): string {
	const file = join(root, "script.sh");
	writeFileSync(file, "#!/usr/bin/env bash\necho hi\n");
	return file;
}

describe("diagnostics on a push-only server", () => {
	it("reports unavailable rather than clean when the server never answers", async () => {
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-diag-"));
		roots.push(root);
		const client = new PushOnlyClient(root, 30);

		await expect(client.diagnostics(scriptIn(root))).rejects.toBeInstanceOf(LspDiagnosticsUnavailableError);
	});

	it("names the file and the deadline so the caller can tell why", async () => {
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-diag-"));
		roots.push(root);
		const client = new PushOnlyClient(root, 30);
		const file = scriptIn(root);

		await expect(client.diagnostics(file)).rejects.toThrow(/are not ready/);
		await expect(client.diagnostics(file)).rejects.toThrow(file);
	});

	it("returns an earlier answer rather than failing when the server stays silent", async () => {
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-diag-"));
		roots.push(root);
		const client = new PushOnlyClient(root, 30);
		const file = scriptIn(root);
		client.publish(pathToFileURL(file).href, [diagnostic]);

		await expect(client.diagnostics(file)).resolves.toEqual({ items: [diagnostic] });
	});

	it("waits for a publish that arrives after the request starts", async () => {
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-diag-"));
		roots.push(root);
		const client = new PushOnlyClient(root, 2_000);
		const file = scriptIn(root);

		const pending = client.diagnostics(file);
		setTimeout(() => client.publish(pathToFileURL(file).href, [diagnostic]), 50);

		await expect(pending).resolves.toEqual({ items: [diagnostic] });
	});
});
