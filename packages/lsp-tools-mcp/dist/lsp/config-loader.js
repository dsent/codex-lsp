import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { BUILTIN_SERVERS } from "./server-definitions.js";
export function getConfigPaths() {
    const cwd = process.cwd();
    const projectOverride = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
    const userOverride = process.env["LSP_TOOLS_MCP_USER_CONFIG"];
    return {
        project: projectOverride
            ? isAbsolute(projectOverride)
                ? projectOverride
                : join(cwd, projectOverride)
            : join(cwd, ".codex", "lsp-client.json"),
        user: userOverride
            ? isAbsolute(userOverride)
                ? userOverride
                : join(homedir(), userOverride)
            : join(homedir(), ".codex", "lsp-client.json"),
    };
}
function loadJsonFile(path) {
    if (!existsSync(path))
        return null;
    try {
        const parsed = JSON.parse(readFileSync(path, "utf-8"));
        return isConfigJson(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function envServerList(name) {
    const raw = process.env[name];
    if (raw === undefined)
        return null;
    const ids = raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    return new Set(ids);
}
/**
 * Server scoping for this process, declared by whoever registered it.
 *
 * A harness that already integrates a language natively should not be offered a
 * second, less integrated path to it. The registration that starts this server
 * is harness-specific by construction, so it is where the scope belongs.
 * `LSP_TOOLS_MCP_ENABLED_SERVERS` is an allowlist and the durable form: a
 * denylist cannot name a server that does not exist yet, so it silently admits
 * every builtin added later.
 */
export function serverScoping() {
    return {
        enabledServers: envServerList("LSP_TOOLS_MCP_ENABLED_SERVERS"),
        disabledServers: new Set(envServerList("LSP_TOOLS_MCP_DISABLED_SERVERS") ?? []),
    };
}
export function loadAllConfigs() {
    const paths = getConfigPaths();
    const configs = new Map();
    const project = loadJsonFile(paths.project);
    if (project)
        configs.set("project", project);
    const user = loadJsonFile(paths.user);
    if (user)
        configs.set("user", user);
    return configs;
}
export function getMergedServers() {
    const configs = loadAllConfigs();
    const servers = [];
    const scoping = serverScoping();
    const allowed = scoping.enabledServers;
    const isAllowed = (id) => (allowed ? allowed.has(id) : !scoping.disabledServers.has(id));
    const disabled = new Set();
    const seen = new Set();
    const sources = ["project", "user"];
    for (const source of sources) {
        const config = configs.get(source);
        if (!config?.lsp)
            continue;
        for (const [id, rawEntry] of Object.entries(config.lsp)) {
            const entry = parseLspEntry(rawEntry);
            if (!entry)
                continue;
            if (entry.disabled) {
                disabled.add(id);
                continue;
            }
            if (seen.has(id))
                continue;
            if (!isAllowed(id))
                continue;
            if (!entry.command || !entry.extensions)
                continue;
            const server = {
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
        if (disabled.has(id) || seen.has(id) || !isAllowed(id))
            continue;
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
            const order = {
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
export function getScopingProblems() {
    const known = new Set(Object.keys(BUILTIN_SERVERS));
    for (const config of loadAllConfigs().values()) {
        for (const id of Object.keys(config.lsp ?? {}))
            known.add(id);
    }
    const scoping = serverScoping();
    const problems = [];
    for (const [source, ids] of [
        ["LSP_TOOLS_MCP_ENABLED_SERVERS", scoping.enabledServers ?? new Set()],
        ["LSP_TOOLS_MCP_DISABLED_SERVERS", scoping.disabledServers],
    ]) {
        for (const id of ids) {
            if (!known.has(id))
                problems.push(`${source} names an unknown server: "${id}"`);
        }
    }
    return problems;
}
export function getIgnoredExtensions() {
    const configs = loadAllConfigs();
    const ignored = new Set();
    for (const config of configs.values()) {
        for (const extension of config.ignoredExtensions ?? []) {
            ignored.add(extension);
        }
    }
    return ignored;
}
function isConfigJson(value) {
    if (!isRecord(value))
        return false;
    const lsp = value["lsp"];
    const ignoredExtensions = value["ignoredExtensions"];
    return ((lsp === undefined || isRecord(lsp)) && (ignoredExtensions === undefined || isExtensionArray(ignoredExtensions)));
}
function parseLspEntry(value) {
    return isLspEntry(value) ? value : null;
}
function isLspEntry(value) {
    if (!isRecord(value))
        return false;
    const disabled = value["disabled"];
    const command = value["command"];
    const extensions = value["extensions"];
    const priority = value["priority"];
    const env = value["env"];
    const initialization = value["initialization"];
    return ((disabled === undefined || typeof disabled === "boolean") &&
        (command === undefined || isStringArray(command)) &&
        (extensions === undefined || isStringArray(extensions)) &&
        (priority === undefined || typeof priority === "number") &&
        (env === undefined || isStringRecord(env)) &&
        (initialization === undefined || isRecord(initialization)));
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isExtensionArray(value) {
    return isStringArray(value) && value.every((extension) => extension.startsWith(".") && extension.length > 1);
}
function isStringRecord(value) {
    return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function getDisabledServerIds() {
    const configs = loadAllConfigs();
    const disabled = new Set();
    for (const config of configs.values()) {
        if (!config.lsp)
            continue;
        for (const [id, rawEntry] of Object.entries(config.lsp)) {
            const entry = parseLspEntry(rawEntry);
            if (!entry)
                continue;
            if (entry.disabled)
                disabled.add(id);
        }
    }
    return disabled;
}
