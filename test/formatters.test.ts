import { describe, expect, it } from "vitest";

import { filterDiagnosticsBySeverity, formatLocation, uriToPath } from "../src/lsp/formatters.js";
import type { Diagnostic } from "../src/lsp/types.js";

const range = {
	start: { line: 0, character: 0 },
	end: { line: 0, character: 1 },
};

function diagnostic(message: string, severity?: number): Diagnostic {
	return severity === undefined ? { range, message } : { range, message, severity };
}

describe("filterDiagnosticsBySeverity", () => {
	it("#given all severity filter #when filtering diagnostics #then returns the original diagnostics", () => {
		// given
		const diagnostics = [diagnostic("syntax", 1), diagnostic("note", 3)];

		// when
		const filtered = filterDiagnosticsBySeverity(diagnostics, "all");

		// then
		expect(filtered).toBe(diagnostics);
	});

	it("#given mixed severities #when filtering diagnostics #then returns only matching diagnostics", () => {
		// given
		const diagnostics = [
			diagnostic("syntax", 1),
			diagnostic("lint", 2),
			diagnostic("note", 3),
			diagnostic("hint", 4),
			diagnostic("unknown"),
		];

		// when / then
		expect(filterDiagnosticsBySeverity(diagnostics, "error")).toEqual([diagnostics[0]]);
		expect(filterDiagnosticsBySeverity(diagnostics, "warning")).toEqual([diagnostics[1]]);
		expect(filterDiagnosticsBySeverity(diagnostics, "information")).toEqual([diagnostics[2]]);
		expect(filterDiagnosticsBySeverity(diagnostics, "hint")).toEqual([diagnostics[3]]);
	});
});

describe("definition URI formatting", () => {
	it("#given a file URI #when formatting its path #then converts it to a filesystem path", () => {
		expect(uriToPath("file:///tmp/Example.kt")).toBe("/tmp/Example.kt");
	});

	it("#given a jar definition #when formatting its location #then preserves the non-file URI", () => {
		// given
		const location = {
			uri: "jar:///opt/android-sdk/platforms/android-37.0/android.jar!/android/app/admin/DevicePolicyManager.class",
			range: {
				start: { line: 6, character: 14 },
				end: { line: 6, character: 33 },
			},
		};

		// when / then
		expect(formatLocation(location)).toBe(
			"jar:///opt/android-sdk/platforms/android-37.0/android.jar!/android/app/admin/DevicePolicyManager.class:7:14",
		);
	});
});
