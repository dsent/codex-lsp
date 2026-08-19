import { type CargoWorkspaceRootOptions } from "./cargo-workspace-root.js";
import type { ResolvedServer } from "./types.js";
export type { CargoMetadataLoader } from "./cargo-workspace-root.js";
export interface FindWorkspaceRootOptions extends CargoWorkspaceRootOptions {
}
export declare function findWorkspaceRoot(filePath: string, server?: ResolvedServer, options?: FindWorkspaceRootOptions): Promise<string>;
