import type { ResolvedServer } from "./types.js";
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
/**
 * Nearest `lsp-client.json` at or above the working directory, stopping at the
 * project boundary.
 *
 * Config is resolved before any request names a file, so the working directory
 * is the only anchor available. MCP does not promise one, which is why a
 * registration that cares should pass LSP_TOOLS_MCP_PROJECT_CONFIG explicitly.
 */
export declare function discoverProjectConfig(cwd: string): string;
export declare function getConfigPaths(): {
    project: string;
    user: string;
};
/**
 * Which servers this process may resolve.
 *
 * A harness that already integrates a language natively should not be offered a
 * second, less integrated path to it. `LSP_TOOLS_MCP_ENABLED_SERVERS` is an
 * allowlist and the durable form: a denylist cannot name a server that does not
 * exist yet, so it silently admits every builtin added in a later release.
 */
export declare function serverScoping(configs?: Map<ConfigSource, ConfigJson>): {
    enabledServers: Set<string> | null;
    disabledServers: Set<string>;
};
export declare function loadAllConfigs(): Map<ConfigSource, ConfigJson>;
export declare function getMergedServers(): ServerWithSource[];
/**
 * Scoping entries that name no server this build knows about.
 *
 * A misspelled id silently resolves nothing, which looks exactly like a
 * language with no findings, so `status` reports these rather than leaving the
 * caller to infer it from an empty list.
 */
export declare function getScopingProblems(): string[];
export declare function getIgnoredExtensions(): Set<string>;
export declare function getDisabledServerIds(): Set<string>;
export {};
