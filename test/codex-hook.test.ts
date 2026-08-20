import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	createFileMissingServerNoticeStore,
	extractMutatedFilePaths,
	type MissingServerNoticeStore,
	runLspPostToolUseHook,
} from "../src/codex-hook.js";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("codex PostToolUse hook", () => {
	it("extracts files from Codex apply_patch command payloads", () => {
		const paths = extractMutatedFilePaths({
			tool_name: "apply_patch",
			tool_input: {
				command: [
					"*** Begin Patch",
					"*** Add File: src/new.ts",
					"+export const value = 1;",
					"*** Update File: src/existing.ts",
					"@@",
					"-export const old = true;",
					"+export const old = false;",
					"*** End Patch",
				].join("\n"),
			},
			tool_response: "Success. Updated files.",
		});

		expect(paths).toEqual(["src/new.ts", "src/existing.ts"]);
	});

	it("extracts files from edit-style tool input aliases", () => {
		const paths = extractMutatedFilePaths({
			tool_name: "Edit",
			tool_input: { file_path: "src/edit.ts" },
			tool_response: { ok: true },
		});

		expect(paths).toEqual(["src/edit.ts"]);
	});

	it("returns blocking feedback when post-edit diagnostics contain errors", async () => {
		const output = await runLspPostToolUseHook(
			{
				tool_name: "apply_patch",
				tool_input: {
					command: "*** Begin Patch\n*** Update File: src/broken.ts\n@@\n+missing();\n*** End Patch\n",
				},
				tool_response: "Success. Updated files.",
			},
			async (filePath) => {
				expect(filePath).toBe("src/broken.ts");
				return "error[typescript] (2304) at 1:1: Cannot find name 'missing'.";
			},
		);

		expect(JSON.parse(output)).toEqual({
			decision: "block",
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext:
					"LSP diagnostics after editing src/broken.ts:\n" +
					"error[typescript] (2304) at 1:1: Cannot find name 'missing'.",
			},
			reason:
				"LSP diagnostics after editing src/broken.ts:\n" +
				"error[typescript] (2304) at 1:1: Cannot find name 'missing'.",
		});
	});

	it("injects only files with diagnostics when multiple files are edited", async () => {
		const checkedFilePaths: string[] = [];
		const output = await runLspPostToolUseHook(
			{
				tool_name: "MultiEdit",
				tool_input: {
					file_paths: ["src/clean.ts", "README.md", "src/broken.ts", "src/broken.ts"],
				},
				tool_response: { ok: true },
			},
			async (filePath) => {
				checkedFilePaths.push(filePath);
				if (filePath === "src/broken.ts") {
					return "error[typescript] (2322) at 1:7: Type 'number' is not assignable to type 'string'.";
				}
				if (filePath === "README.md") {
					return "No LSP server configured for extension: .md";
				}
				return "No diagnostics found";
			},
		);

		const expectedDiagnostics =
			"LSP diagnostics after editing src/broken.ts:\n" +
			"error[typescript] (2322) at 1:7: Type 'number' is not assignable to type 'string'.";

		expect(checkedFilePaths).toEqual(["src/clean.ts", "README.md", "src/broken.ts"]);
		expect(JSON.parse(output)).toEqual({
			decision: "block",
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext: expectedDiagnostics,
			},
			reason: expectedDiagnostics,
		});
	});

	it("does not run diagnostics for failed mutation tool responses", async () => {
		const output = await runLspPostToolUseHook(
			{
				tool_name: "apply_patch",
				tool_input: {
					command: "*** Begin Patch\n*** Update File: src/broken.ts\n@@\n+missing();\n*** End Patch\n",
				},
				tool_response: { isError: true },
			},
			async () => {
				throw new Error("diagnostics should not run after failed mutations");
			},
		);

		expect(output).toBe("");
	});

	it("is silent for clean diagnostics and unsupported extensions", async () => {
		const output = await runLspPostToolUseHook(
			{
				tool_name: "apply_patch",
				tool_input: {
					command: "*** Begin Patch\n*** Update File: README.md\n@@\n+hello\n*** End Patch\n",
				},
				tool_response: "Success. Updated files.",
			},
			async () => "No LSP server configured for extension: .md",
		);

		expect(output).toBe("");
	});

	it("is silent for extensions explicitly ignored by configuration", async () => {
		const output = await runLspPostToolUseHook(
			mutationInput("session-ignored", "src/data.json"),
			async () => "LSP lookup ignored for extension: .json",
		);

		expect(output).toBe("");
	});

	it("surfaces a missing server only once per Codex session", async () => {
		const notices = createMemoryNoticeStore();
		const diagnostics = [
			"LSP server 'typescript' is configured but NOT INSTALLED.",
			"",
			"Install or configure it, or add .ts to ignoredExtensions.",
		].join("\n");
		const input = mutationInput("session-one", "src/file.ts");

		const first = await runLspPostToolUseHook(input, async () => diagnostics, notices);
		const second = await runLspPostToolUseHook(input, async () => diagnostics, notices);

		expect(first).toContain("LSP server 'typescript' is configured but NOT INSTALLED.");
		expect(second).toBe("");
	});

	it("surfaces different missing servers in the same session", async () => {
		const notices = createMemoryNoticeStore();
		const input = mutationInput("session-one", "src/file.ts");

		const typescript = await runLspPostToolUseHook(
			input,
			async () => "LSP server 'typescript' is configured but NOT INSTALLED.",
			notices,
		);
		const biome = await runLspPostToolUseHook(
			input,
			async () => "LSP server 'biome' is configured but NOT INSTALLED.",
			notices,
		);

		expect(typescript).toContain("LSP server 'typescript'");
		expect(biome).toContain("LSP server 'biome'");
	});

	it("surfaces the same missing server again in a different session", async () => {
		const notices = createMemoryNoticeStore();
		const diagnostics = "LSP server 'typescript' is configured but NOT INSTALLED.";

		const first = await runLspPostToolUseHook(
			mutationInput("session-one", "src/file.ts"),
			async () => diagnostics,
			notices,
		);
		const second = await runLspPostToolUseHook(
			mutationInput("session-two", "src/file.ts"),
			async () => diagnostics,
			notices,
		);

		expect(first).not.toBe("");
		expect(second).not.toBe("");
	});

	it("shares missing-server claims between file-store instances", () => {
		const directory = mkdtempSync(join(tmpdir(), "codex-lsp-notices-"));
		tempDirectories.push(directory);
		const firstProcess = createFileMissingServerNoticeStore(directory);
		const secondProcess = createFileMissingServerNoticeStore(directory);

		expect(firstProcess.claim("session-one", "typescript")).toBe(true);
		expect(secondProcess.claim("session-one", "typescript")).toBe(false);
		expect(secondProcess.claim("session-one", "biome")).toBe(true);
		expect(secondProcess.claim("session-two", "typescript")).toBe(true);
	});
});

function mutationInput(
	sessionId: string,
	filePath: string,
): {
	readonly session_id: string;
	readonly tool_name: string;
	readonly tool_input: { readonly file_path: string };
	readonly tool_response: string;
} {
	return {
		session_id: sessionId,
		tool_name: "edit",
		tool_input: { file_path: filePath },
		tool_response: "Success. Updated files.",
	};
}

function createMemoryNoticeStore(): MissingServerNoticeStore {
	const claims = new Set<string>();
	return {
		claim(sessionKey, serverId) {
			const key = `${sessionKey}\0${serverId}`;
			if (claims.has(key)) return false;
			claims.add(key);
			return true;
		},
	};
}
