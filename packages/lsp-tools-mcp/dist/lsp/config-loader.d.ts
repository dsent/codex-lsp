import type { ResolvedServer } from "./types.js";
interface ConfigJson {
    ignoredExtensions?: string[];
    lsp?: Record<string, unknown>;
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
 * Server scoping for this process, declared by whoever registered it.
 *
 * A harness that already integrates a language natively should not be offered a
 * second, less integrated path to it. The registration that starts this server
 * is harness-specific by construction, so it is where the scope belongs.
 * `LSP_TOOLS_MCP_ENABLED_SERVERS` is an allowlist and the durable form: a
 * denylist cannot name a server that does not exist yet, so it silently admits
 * every builtin added later.
 */
export declare function serverScoping(): {
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
