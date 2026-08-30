export interface TrustedCargoMetadata {
    readonly workspaceRoot: string;
    readonly rootManifestPath: string;
    readonly memberManifestPaths: readonly string[];
}
export declare function canonicalManifest(path: string): string | undefined;
export declare function parseTrustedCargoMetadata(requestedManifestPath: string, output: string): TrustedCargoMetadata | undefined;
