import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	getConfigPaths,
	getIgnoredExtensions,
	getMergedServers,
	getScopingProblems,
} from "../src/lsp/config-loader.js";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("config loader", () => {
	it("uses Codex config locations instead of pi config locations", () => {
		const paths = getConfigPaths();
		const expectedSuffix = join(".codex", "lsp-client.json");
		const piMarker = `${sep}.pi${sep}`;

		expect(paths.project.endsWith(expectedSuffix)).toBe(true);
		expect(paths.user.endsWith(expectedSuffix)).toBe(true);
		expect(paths.project).not.toContain(piMarker);
		expect(paths.user).not.toContain(piMarker);
	});

	it("supports project and user config path overrides via environment variables", () => {
		const previousProject = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
		const previousUser = process.env["LSP_TOOLS_MCP_USER_CONFIG"];

		process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = "config/lsp-opencode.json";
		process.env["LSP_TOOLS_MCP_USER_CONFIG"] = ".opencode/lsp.json";

		try {
			const paths = getConfigPaths();

			expect(paths.project).toBe(join(process.cwd(), "config", "lsp-opencode.json"));
			expect(paths.user).toBe(join(process.env["HOME"] ?? "", ".opencode", "lsp.json"));
		} finally {
			if (previousProject === undefined) {
				delete process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = previousProject;
			}

			if (previousUser === undefined) {
				delete process.env["LSP_TOOLS_MCP_USER_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_USER_CONFIG"] = previousUser;
			}
		}
	});

	it("keeps absolute override paths unchanged", () => {
		const previousProject = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
		const previousUser = process.env["LSP_TOOLS_MCP_USER_CONFIG"];
		const absoluteProject = join(process.cwd(), "overrides", "project.json");
		const absoluteUser = join(process.cwd(), "overrides", "user.json");

		process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = absoluteProject;
		process.env["LSP_TOOLS_MCP_USER_CONFIG"] = absoluteUser;

		try {
			const paths = getConfigPaths();

			expect(paths.project).toBe(absoluteProject);
			expect(paths.user).toBe(absoluteUser);
		} finally {
			if (previousProject === undefined) {
				delete process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = previousProject;
			}

			if (previousUser === undefined) {
				delete process.env["LSP_TOOLS_MCP_USER_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_USER_CONFIG"] = previousUser;
			}
		}
	});

	it("#given one invalid LSP config entry #when merging servers #then keeps valid sibling entries", () => {
		// given
		const previousProject = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
		const previousUser = process.env["LSP_TOOLS_MCP_USER_CONFIG"];
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-config-"));
		tempDirectories.push(root);
		const projectConfig = join(root, "project.json");
		const userConfig = join(root, "user.json");
		mkdirSync(root, { recursive: true });
		writeFileSync(
			projectConfig,
			JSON.stringify({
				lsp: {
					valid: { command: ["valid-lsp", "--stdio"], extensions: [".valid"], priority: 7 },
					invalid: "not an object",
				},
			}),
		);
		writeFileSync(userConfig, JSON.stringify({ lsp: {} }));
		process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = projectConfig;
		process.env["LSP_TOOLS_MCP_USER_CONFIG"] = userConfig;

		try {
			// when
			const servers = getMergedServers();

			// then
			expect(servers).toContainEqual(
				expect.objectContaining({
					id: "valid",
					command: ["valid-lsp", "--stdio"],
					extensions: [".valid"],
					priority: 7,
					source: "project",
				}),
			);
			expect(servers.some((server) => server.id === "invalid")).toBe(false);
		} finally {
			if (previousProject === undefined) {
				delete process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = previousProject;
			}

			if (previousUser === undefined) {
				delete process.env["LSP_TOOLS_MCP_USER_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_USER_CONFIG"] = previousUser;
			}
		}
	});

	it("merges ignored extensions from project and user configuration", () => {
		const previousProject = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
		const previousUser = process.env["LSP_TOOLS_MCP_USER_CONFIG"];
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-config-"));
		tempDirectories.push(root);
		const projectConfig = join(root, "project.json");
		const userConfig = join(root, "user.json");
		writeFileSync(projectConfig, JSON.stringify({ ignoredExtensions: [".json", ".jsonc"] }));
		writeFileSync(userConfig, JSON.stringify({ ignoredExtensions: [".jsonc", ".md"] }));
		process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = projectConfig;
		process.env["LSP_TOOLS_MCP_USER_CONFIG"] = userConfig;

		try {
			expect(getIgnoredExtensions()).toEqual(new Set([".json", ".jsonc", ".md"]));
		} finally {
			if (previousProject === undefined) {
				delete process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = previousProject;
			}
			if (previousUser === undefined) {
				delete process.env["LSP_TOOLS_MCP_USER_CONFIG"];
			} else {
				process.env["LSP_TOOLS_MCP_USER_CONFIG"] = previousUser;
			}
		}
	});
});

describe("server scoping from the registration environment", () => {
	function withScope<T>(vars: Record<string, string | undefined>, config: unknown, run: () => T): T {
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-scope-"));
		tempDirectories.push(root);
		const projectConfig = join(root, "project.json");
		const userConfig = join(root, "user.json");
		writeFileSync(projectConfig, JSON.stringify(config));
		writeFileSync(userConfig, JSON.stringify({ lsp: {} }));

		const all: Record<string, string | undefined> = {
			LSP_TOOLS_MCP_PROJECT_CONFIG: projectConfig,
			LSP_TOOLS_MCP_USER_CONFIG: userConfig,
			LSP_TOOLS_MCP_ENABLED_SERVERS: undefined,
			LSP_TOOLS_MCP_DISABLED_SERVERS: undefined,
			...vars,
		};
		const previous = new Map(Object.keys(all).map((key) => [key, process.env[key]]));
		for (const [key, value] of Object.entries(all)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}

		try {
			return run();
		} finally {
			for (const [key, value] of previous) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
	}

	const declared = { lsp: { custom: { command: ["custom-lsp"], extensions: [".custom"] } } };
	const ids = () => getMergedServers().map((server) => server.id);

	it("resolves every server when nothing is scoped", () => {
		const resolved = withScope({}, declared, ids);

		expect(resolved).toContain("bash");
		expect(resolved).toContain("gopls");
		expect(resolved).toContain("custom");
	});

	it("keeps only the allowlisted servers, builtin or declared", () => {
		const resolved = withScope({ LSP_TOOLS_MCP_ENABLED_SERVERS: "bash,custom" }, declared, ids);

		expect(resolved).toEqual(expect.arrayContaining(["bash", "custom"]));
		expect(resolved).not.toContain("gopls");
		expect(resolved).not.toContain("typescript");
	});

	it("tolerates spacing and empty entries in the list", () => {
		const resolved = withScope({ LSP_TOOLS_MCP_ENABLED_SERVERS: " bash , , custom " }, declared, ids);

		expect(resolved).toEqual(expect.arrayContaining(["bash", "custom"]));
		expect(resolved).not.toContain("gopls");
	});

	it("removes named servers when only a denylist is given", () => {
		const resolved = withScope({ LSP_TOOLS_MCP_DISABLED_SERVERS: "bash,gopls" }, declared, ids);

		expect(resolved).not.toContain("bash");
		expect(resolved).not.toContain("gopls");
		expect(resolved).toContain("custom");
	});

	it("lets the allowlist win when both are given", () => {
		const resolved = withScope(
			{ LSP_TOOLS_MCP_ENABLED_SERVERS: "bash", LSP_TOOLS_MCP_DISABLED_SERVERS: "bash" },
			declared,
			ids,
		);

		expect(resolved).toEqual(["bash"]);
	});

	it("admits a newly added builtin under a denylist but not under an allowlist", () => {
		// A denylist cannot name a server that does not exist yet, which is why
		// the allowlist is the durable way to scope a harness.
		const underDenylist = withScope({ LSP_TOOLS_MCP_DISABLED_SERVERS: "bash" }, declared, ids);
		const underAllowlist = withScope({ LSP_TOOLS_MCP_ENABLED_SERVERS: "bash" }, declared, ids);

		expect(underDenylist).toContain("gopls");
		expect(underAllowlist).toEqual(["bash"]);
	});

	it("reports a scoping entry that names no known server", () => {
		const problems = withScope({ LSP_TOOLS_MCP_ENABLED_SERVERS: "bahs" }, declared, getScopingProblems);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("bahs");
	});

	it("accepts a declared server as known, and reports nothing when all ids resolve", () => {
		const problems = withScope({ LSP_TOOLS_MCP_ENABLED_SERVERS: "bash,custom" }, declared, getScopingProblems);

		expect(problems).toEqual([]);
	});
});
