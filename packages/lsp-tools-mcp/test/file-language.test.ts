import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { classifyFileLanguage } from "../src/lsp/file-language.js";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("classifyFileLanguage", () => {
	it.each([
		"#!/bin/bash",
		"#!/usr/bin/bash -e",
		"#!/bin/sh",
		"#!/usr/bin/env bash",
		"#!/usr/bin/env sh -eu",
		"#!/usr/bin/env -S bash -eu",
		"#!/usr/bin/env -S sh -eu",
	])("classifies an extensionless shell script with %s", (shebang) => {
		const filePath = writeFixture("script", `${shebang}\necho ok\n`);

		expect(classifyFileLanguage(filePath)).toEqual({ extension: ".sh", languageId: "shellscript" });
	});

	it.each(["#!/usr/bin/env zsh", "#!/usr/bin/python3", "echo no-shebang"])(
		"does not classify another extensionless file with %s as shell",
		(firstLine) => {
			const filePath = writeFixture("script", `${firstLine}\n`);

			expect(classifyFileLanguage(filePath)).toEqual({ extension: "", languageId: "plaintext" });
		},
	);

	it("uses a real extension before inspecting file content", () => {
		const filePath = writeFixture("script.py", "#!/bin/sh\n");

		expect(classifyFileLanguage(filePath)).toEqual({ extension: ".py", languageId: "python" });
	});
});

function writeFixture(name: string, content: string): string {
	const root = mkdtempSync(join(tmpdir(), "lsp-file-language-"));
	tempDirectories.push(root);
	const filePath = join(root, name);
	writeFileSync(filePath, content);
	return filePath;
}
