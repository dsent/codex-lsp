import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findWorkspaceRoot } from "../src/lsp/workspace-root.js";

describe("findWorkspaceRoot", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "lsp-workspace-root-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function write(relativePath: string): string {
		const absolute = join(root, relativePath);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, "");
		return absolute;
	}

	it.each(["settings.gradle", "settings.gradle.kts"])("uses %s above a nested Gradle module", async (settingsFile) => {
		// Given
		write(settingsFile);
		write("app/build.gradle.kts");
		const source = write("app/src/main/kotlin/example/Main.kt");

		// When
		const resolved = await findWorkspaceRoot(source);

		// Then
		expect(resolved).toBe(root);
	});

	it.each(["build.gradle", "build.gradle.kts"])(
		"uses a standalone %s project before an unrelated parent repository",
		async (buildFile) => {
			// Given
			mkdirSync(join(root, ".git"));
			write(`copy/${buildFile}`);
			const source = write("copy/src/main/kotlin/example/Main.kt");

			// When
			const resolved = await findWorkspaceRoot(source);

			// Then
			expect(resolved).toBe(join(root, "copy"));
		},
	);
});
