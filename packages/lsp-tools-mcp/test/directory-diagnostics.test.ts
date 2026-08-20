import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectFilesWithExtension } from "../src/lsp/directory-diagnostics.js";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("collectFilesWithExtension", () => {
	it("#given more matching files than max #when collecting diagnostics inputs #then traversal returns only capped files", () => {
		// given
		const root = mkdtempSync(join(tmpdir(), "codex-lsp-directory-"));
		tempDirectories.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		for (let index = 0; index < 5; index += 1) {
			writeFileSync(join(root, "src", `file-${index}.ts`), `export const value${index} = ${index};\n`);
		}

		// when
		const files = collectFilesWithExtension(root, ".ts", 2);

		// then
		expect(files).toHaveLength(2);
	});

	it("includes extensionless bash and sh scripts when collecting shell files", () => {
		const root = mkdtempSync(join(tmpdir(), "codex-lsp-directory-"));
		tempDirectories.push(root);
		writeFileSync(join(root, "bash-script"), "#!/usr/bin/env bash\necho bash\n");
		writeFileSync(join(root, "sh-script"), "#!/bin/sh\necho sh\n");
		writeFileSync(join(root, "python-script"), "#!/usr/bin/env python3\nprint('python')\n");

		const files = collectFilesWithExtension(root, ".sh", 10);

		expect(files.map((file) => file.slice(root.length + 1)).sort()).toEqual(["bash-script", "sh-script"]);
	});
});
