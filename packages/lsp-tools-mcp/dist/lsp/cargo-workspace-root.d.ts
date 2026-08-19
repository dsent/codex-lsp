import { type CargoMetadataLoader } from "./cargo-metadata-process.js";
export type { CargoMetadataLoader } from "./cargo-metadata-process.js";
export type Clock = () => number;
export interface CargoWorkspaceRootOptions {
    readonly cargoMetadataLoader?: CargoMetadataLoader;
    readonly now?: Clock;
    readonly signal?: AbortSignal;
}
export declare function resolveCargoWorkspaceRoot(startDir: string, options?: CargoWorkspaceRootOptions): Promise<string | undefined>;
