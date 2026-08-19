export type CargoMetadataLoader = (manifestPath: string, signal?: AbortSignal) => Promise<string>;
export declare function defaultCargoMetadataLoader(manifestPath: string, signal?: AbortSignal): Promise<string>;
