import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import { BUILTIN_SERVERS } from "./server-definitions.js";
import type { ResolvedServer } from "./types.js";

interface LspEntry {
	disabled?: boolean;
	command?: string[];
	extensions?: string[];
	priority?: number;
	env?: Record<string, string>;
	initialization?: Record<string, unknown>;
}

interface ConfigJson {
	ignoredExtensions?: string[];
	enabledServers?: string[];
	disabledServers?: string[];
	lsp?: Record<string, unknown>;
}

type ConfigSource = "project" | "user";

export interface ServerWithSource extends ResolvedServer {
	source: "project" | "user" | "builtin";
}

const CONFIG_FILENAME = "lsp-client.json";

// The same boundaries workspace-root resolution uses. Config discovery must not
// escape the project: an unnoticed lsp-client.json in a parent directory would
// otherwise govern every repository beneath it.
const PROJECT_BOUNDARIES = [".lsp-root", ".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml"];

function isProjectBoundary(directory: string): boolean {
	return PROJECT_BOUNDARIES.some((marker) => existsSync(join(directory, marker)));
}

/**
 * Nearest `lsp-client.json` at or above the working directory, stopping at the
 * project boundary.
 *
 * Config is resolved before any request names a file, so the working directory
 * is the only anchor available. MCP does not promise one, which is why a
 * registration that cares should pass LSP_TOOLS_MCP_PROJECT_CONFIG explicitly.
 */
export function discoverProjectConfig(cwd: string): string {
	let directory = cwd;
	for (;;) {
		const candidate = join(directory, CONFIG_FILENAME);
		if (existsSync(candidate)) return candidate;
		if (isProjectBoundary(directory)) break;
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return join(cwd, CONFIG_FILENAME);
}

export function getConfigPaths(): { project: string; user: string } {
	const cwd = process.cwd();
	const projectOverride = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
	const userOverride = process.env["LSP_TOOLS_MCP_USER_CONFIG"];
	const configHome = process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
	return {
		project: projectOverride
			? isAbsolute(projectOverride)
				? projectOverride
				: join(cwd, projectOverride)
			: discoverProjectConfig(cwd),
		user: userOverride
			? isAbsolute(userOverride)
				? userOverride
				: join(homedir(), userOverride)
			: join(configHome, "lsp-tools-mcp", CONFIG_FILENAME),
	};
}

function loadJsonFile(path: string): ConfigJson | null {
	if (!existsSync(path)) return null;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
		return isConfigJson(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function parseList(raw: string): string[] {
	return raw
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/**
 * The registration's value if it set one, otherwise the shared configuration's.
 *
 * The environment replaces rather than merges, so a harness can narrow what the
 * project declares and not only widen it. An empty value is a deliberate clear:
 * it means "no constraint from me", never "an empty allowlist", which would
 * leave the server resolving nothing while looking healthy.
 */
function resolveList(envName: string, fromConfigs: string[]): string[] {
	const raw = process.env[envName];
	return raw === undefined ? fromConfigs : parseList(raw);
}

function configLists(configs: Map<ConfigSource, ConfigJson>): {
	enabled: string[];
	disabled: string[];
	ignored: string[];
} {
	const enabled: string[] = [];
	const disabled: string[] = [];
	const ignored: string[] = [];
	for (const config of configs.values()) {
		enabled.push(...(config.enabledServers ?? []));
		disabled.push(...(config.disabledServers ?? []));
		ignored.push(...(config.ignoredExtensions ?? []));
	}
	return { enabled, disabled, ignored };
}

/**
 * Which servers this process may resolve.
 *
 * A harness that already integrates a language natively should not be offered a
 * second, less integrated path to it. `LSP_TOOLS_MCP_ENABLED_SERVERS` is an
 * allowlist and the durable form: a denylist cannot name a server that does not
 * exist yet, so it silently admits every builtin added in a later release.
 */
export function serverScoping(configs: Map<ConfigSource, ConfigJson> = loadAllConfigs()): {
	enabledServers: Set<string> | null;
	disabledServers: Set<string>;
} {
	const lists = configLists(configs);
	const enabled = resolveList("LSP_TOOLS_MCP_ENABLED_SERVERS", lists.enabled);
	const disabled = resolveList("LSP_TOOLS_MCP_DISABLED_SERVERS", lists.disabled);
	return {
		enabledServers: enabled.length > 0 ? new Set(enabled) : null,
		disabledServers: new Set(disabled),
	};
}

export function loadAllConfigs(): Map<ConfigSource, ConfigJson> {
	const paths = getConfigPaths();
	const configs = new Map<ConfigSource, ConfigJson>();

	const project = loadJsonFile(paths.project);
	if (project) configs.set("project", project);

	const user = loadJsonFile(paths.user);
	if (user) configs.set("user", user);

	return configs;
}

export function getMergedServers(): ServerWithSource[] {
	const configs = loadAllConfigs();
	const servers: ServerWithSource[] = [];
	const scoping = serverScoping(configs);
	const allowed = scoping.enabledServers;
	const isAllowed = (id: string): boolean => (allowed ? allowed.has(id) : !scoping.disabledServers.has(id));
	const disabled = new Set<string>();
	const seen = new Set<string>();

	const sources: ConfigSource[] = ["project", "user"];

	for (const source of sources) {
		const config = configs.get(source);
		if (!config?.lsp) continue;

		for (const [id, rawEntry] of Object.entries(config.lsp)) {
			const entry = parseLspEntry(rawEntry);
			if (!entry) continue;
			if (entry.disabled) {
				disabled.add(id);
				continue;
			}

			if (seen.has(id)) continue;
			if (!isAllowed(id)) continue;
			if (!entry.command || !entry.extensions) continue;

			const server: ServerWithSource = {
				id,
				command: entry.command,
				extensions: entry.extensions,
				priority: entry.priority ?? 0,
				source,
			};
			if (entry.env !== undefined) {
				server.env = entry.env;
			}
			if (entry.initialization !== undefined) {
				server.initialization = entry.initialization;
			}
			servers.push(server);
			seen.add(id);
		}
	}

	for (const [id, config] of Object.entries(BUILTIN_SERVERS)) {
		if (disabled.has(id) || seen.has(id) || !isAllowed(id)) continue;

		servers.push({
			id,
			command: config.command,
			extensions: config.extensions,
			priority: -100,
			source: "builtin",
		});
	}

	return servers.sort((a, b) => {
		if (a.source !== b.source) {
			const order: Record<"project" | "user" | "builtin", number> = {
				project: 0,
				user: 1,
				builtin: 2,
			};
			return order[a.source] - order[b.source];
		}
		return b.priority - a.priority;
	});
}

/**
 * Scoping entries that name no server this build knows about.
 *
 * A misspelled id silently resolves nothing, which looks exactly like a
 * language with no findings, so `status` reports these rather than leaving the
 * caller to infer it from an empty list.
 */
export function getScopingProblems(): string[] {
	const known = new Set<string>(Object.keys(BUILTIN_SERVERS));
	for (const config of loadAllConfigs().values()) {
		for (const id of Object.keys(config.lsp ?? {})) known.add(id);
	}

	const scoping = serverScoping();
	const problems: string[] = [];
	for (const [source, ids] of [
		["LSP_TOOLS_MCP_ENABLED_SERVERS", scoping.enabledServers ?? new Set<string>()],
		["LSP_TOOLS_MCP_DISABLED_SERVERS", scoping.disabledServers],
	] as const) {
		for (const id of ids) {
			if (!known.has(id)) problems.push(`${source} names an unknown server: "${id}"`);
		}
	}
	return problems;
}

export function getIgnoredExtensions(): Set<string> {
	const configs = loadAllConfigs();
	return new Set(resolveList("LSP_TOOLS_MCP_IGNORED_EXTENSIONS", configLists(configs).ignored));
}

function isConfigJson(value: unknown): value is ConfigJson {
	if (!isRecord(value)) return false;
	const lsp = value["lsp"];
	const ignoredExtensions = value["ignoredExtensions"];
	const enabledServers = value["enabledServers"];
	const disabledServers = value["disabledServers"];
	return (
		(lsp === undefined || isRecord(lsp)) &&
		(ignoredExtensions === undefined || isExtensionArray(ignoredExtensions)) &&
		(enabledServers === undefined || isStringArray(enabledServers)) &&
		(disabledServers === undefined || isStringArray(disabledServers))
	);
}

function parseLspEntry(value: unknown): LspEntry | null {
	return isLspEntry(value) ? value : null;
}

function isLspEntry(value: unknown): value is LspEntry {
	if (!isRecord(value)) return false;
	const disabled = value["disabled"];
	const command = value["command"];
	const extensions = value["extensions"];
	const priority = value["priority"];
	const env = value["env"];
	const initialization = value["initialization"];
	return (
		(disabled === undefined || typeof disabled === "boolean") &&
		(command === undefined || isStringArray(command)) &&
		(extensions === undefined || isStringArray(extensions)) &&
		(priority === undefined || typeof priority === "number") &&
		(env === undefined || isStringRecord(env)) &&
		(initialization === undefined || isRecord(initialization))
	);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isExtensionArray(value: unknown): value is string[] {
	return isStringArray(value) && value.every((extension) => extension.startsWith(".") && extension.length > 1);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getDisabledServerIds(): Set<string> {
	const configs = loadAllConfigs();
	const disabled = new Set<string>();

	for (const config of configs.values()) {
		if (!config.lsp) continue;
		for (const [id, rawEntry] of Object.entries(config.lsp)) {
			const entry = parseLspEntry(rawEntry);
			if (!entry) continue;
			if (entry.disabled) disabled.add(id);
		}
	}

	return disabled;
}
