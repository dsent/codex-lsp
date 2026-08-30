import type { ResolvedServer } from "./types.js";
interface ConfigJson {
    ignoredExtensions?: string[];
    lsp?: Record<string, unknown>;
    agents?: Record<string, unknown>;
}
type ConfigSource = "project" | "user";
export interface ServerWithSource extends ResolvedServer {
    source: "project" | "user" | "builtin";
}
export declare function getConfigPaths(): {
    project: string;
    user: string;
};
/**
 * The harness this server is answering, from LSP_TOOLS_MCP_AGENT.
 *
 * `ignoredExtensions` and `disabled` are unioned across every loaded config, so
 * one shared config cannot express two scopes: narrowing it for a harness with
 * its own native integration narrows it for every other harness too. Naming the
 * caller lets a single config carry a section per harness.
 */
export declare function getActiveAgent(): string | null;
export declare function loadAllConfigs(): Map<ConfigSource, ConfigJson>;
export declare function getMergedServers(): ServerWithSource[];
export declare function getIgnoredExtensions(): Set<string>;
export declare function getDisabledServerIds(): Set<string>;
export {};
