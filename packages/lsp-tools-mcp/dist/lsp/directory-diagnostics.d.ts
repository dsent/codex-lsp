import type { SeverityFilter } from "./types.js";
interface DirectoryDiagnosticsOptions {
    readonly signal?: AbortSignal;
}
export declare function collectFilesWithExtension(dir: string, extension: string, maxFiles: number, options?: DirectoryDiagnosticsOptions): string[];
export declare function aggregateDiagnosticsForDirectory(directory: string, extension: string, severity?: SeverityFilter, maxFiles?: number, options?: DirectoryDiagnosticsOptions): Promise<string>;
export {};
