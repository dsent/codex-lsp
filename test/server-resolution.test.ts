import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { isServerInstalled } = vi.hoisted(() => ({ isServerInstalled: vi.fn() }));

vi.mock("../src/lsp/server-installation.js", () => ({ isServerInstalled }));

import { findServerForExtension } from "../src/lsp/server-resolution.js";

const tempDirectories: string[] = [];

afterEach(() => {
	vi.clearAllMocks();
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("findServerForExtension", () => {
	it("returns ignored before checking whether a configured server is installed", () => {
		const root = mkdtempSync(join(tmpdir(), "lsp-server-resolution-"));
		tempDirectories.push(root);
		const projectConfig = join(root, "project.json");
		mkdirSync(root, { recursive: true });
		writeFileSync(
			projectConfig,
			JSON.stringify({
				ignoredExtensions: [".ts"],
				lsp: { typescript: { command: ["typescript-language-server", "--stdio"], extensions: [".ts"] } },
			}),
		);
		const previousProject = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
		const previousUser = process.env["LSP_TOOLS_MCP_USER_CONFIG"];
		process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = projectConfig;
		process.env["LSP_TOOLS_MCP_USER_CONFIG"] = join(root, "missing-user.json");

		try {
			expect(findServerForExtension(".ts")).toEqual({ status: "ignored", extension: ".ts" });
			expect(isServerInstalled).not.toHaveBeenCalled();
		} finally {
			restoreEnv("LSP_TOOLS_MCP_PROJECT_CONFIG", previousProject);
			restoreEnv("LSP_TOOLS_MCP_USER_CONFIG", previousUser);
		}
	});
});

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
}
