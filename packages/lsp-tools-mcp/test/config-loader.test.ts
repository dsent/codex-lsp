import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getActiveAgent, getConfigPaths, getIgnoredExtensions, getMergedServers } from "../src/lsp/config-loader.js";

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

describe("per-agent scoping", () => {
	function withAgentConfig<T>(config: unknown, agent: string | undefined, run: () => T): T {
		const root = mkdtempSync(join(tmpdir(), "lsp-tools-agent-"));
		tempDirectories.push(root);
		const projectConfig = join(root, "project.json");
		const userConfig = join(root, "user.json");
		writeFileSync(projectConfig, JSON.stringify(config));
		writeFileSync(userConfig, JSON.stringify({ lsp: {} }));

		const previous = {
			project: process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"],
			user: process.env["LSP_TOOLS_MCP_USER_CONFIG"],
			agent: process.env["LSP_TOOLS_MCP_AGENT"],
		};
		process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = projectConfig;
		process.env["LSP_TOOLS_MCP_USER_CONFIG"] = userConfig;
		if (agent === undefined) delete process.env["LSP_TOOLS_MCP_AGENT"];
		else process.env["LSP_TOOLS_MCP_AGENT"] = agent;

		try {
			return run();
		} finally {
			for (const [key, value] of [
				["LSP_TOOLS_MCP_PROJECT_CONFIG", previous.project],
				["LSP_TOOLS_MCP_USER_CONFIG", previous.user],
				["LSP_TOOLS_MCP_AGENT", previous.agent],
			] as const) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
	}

	const config = {
		lsp: { custom: { command: ["custom-lsp"], extensions: [".custom"] } },
		agents: {
			claude: { disabledServers: ["bash", "custom"], ignoredExtensions: [".go"] },
		},
	};

	it("reports the active agent from the environment", () => {
		expect(withAgentConfig(config, "claude", () => getActiveAgent())).toBe("claude");
		expect(withAgentConfig(config, undefined, () => getActiveAgent())).toBeNull();
	});

	it("hides builtin and declared servers the active agent disables", () => {
		const ids = withAgentConfig(config, "claude", () => getMergedServers().map((server) => server.id));

		expect(ids).not.toContain("bash");
		expect(ids).not.toContain("custom");
	});

	it("leaves servers alone for an agent with no section, and with no agent set", () => {
		const other = withAgentConfig(config, "codex", () => getMergedServers().map((server) => server.id));
		const none = withAgentConfig(config, undefined, () => getMergedServers().map((server) => server.id));

		for (const ids of [other, none]) {
			expect(ids).toContain("bash");
			expect(ids).toContain("custom");
		}
	});

	it("keeps only the allowlisted servers when enabledServers is present", () => {
		const allowlist = {
			lsp: { custom: { command: ["custom-lsp"], extensions: [".custom"] } },
			agents: { claude: { enabledServers: ["bash", "custom"] } },
		};

		const ids = withAgentConfig(allowlist, "claude", () => getMergedServers().map((server) => server.id));

		expect(ids).toContain("bash");
		expect(ids).toContain("custom");
		expect(ids).not.toContain("gopls");
		expect(ids).not.toContain("typescript");
	});

	it("lets the allowlist win over a denylist naming the same server", () => {
		const both = {
			agents: { claude: { enabledServers: ["bash"], disabledServers: ["bash"] } },
		};

		const ids = withAgentConfig(both, "claude", () => getMergedServers().map((server) => server.id));

		expect(ids).toEqual(["bash"]);
	});

	it("admits a newly added builtin under a denylist but not under an allowlist", () => {
		// A denylist cannot name a server that does not exist yet, which is why
		// the allowlist is the durable way to scope a harness.
		const denied = { agents: { claude: { disabledServers: ["bash"] } } };
		const allowed = { agents: { claude: { enabledServers: ["bash"] } } };

		const underDenylist = withAgentConfig(denied, "claude", () => getMergedServers().map((s) => s.id));
		const underAllowlist = withAgentConfig(allowed, "claude", () => getMergedServers().map((s) => s.id));

		expect(underDenylist).toContain("gopls");
		expect(underAllowlist).toEqual(["bash"]);
	});

	it("adds the active agent's ignored extensions to the shared set", () => {
		expect(withAgentConfig(config, "claude", () => getIgnoredExtensions()).has(".go")).toBe(true);
		expect(withAgentConfig(config, "codex", () => getIgnoredExtensions()).has(".go")).toBe(false);
	});
});
