import type { LspClient } from "./client.js";
import { type LspManager } from "./manager.js";
import type { ServerLookupResult } from "./types.js";
import { type FindWorkspaceRootOptions, findWorkspaceRoot } from "./workspace-root.js";
export type { CargoMetadataLoader, FindWorkspaceRootOptions } from "./workspace-root.js";
export { findWorkspaceRoot };
export declare function isDirectoryPath(filePath: string): boolean;
export declare function formatServerLookupError(result: Exclude<ServerLookupResult, {
    status: "found";
}>): string;
export interface WithLspClientOptions extends FindWorkspaceRootOptions {
    readonly manager?: LspManager;
}
export declare function withLspClient<T>(filePath: string, fn: (client: LspClient) => Promise<T>, toolName: string, options?: WithLspClientOptions): Promise<T>;
