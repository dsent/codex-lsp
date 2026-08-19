export interface ManifestSnapshot {
    readonly path: string;
    readonly exists: boolean;
    readonly content: string | undefined;
}
export declare function readManifestSnapshot(path: string, allowMissing?: boolean): ManifestSnapshot | undefined;
export declare function snapshotsAreFresh(snapshots: readonly ManifestSnapshot[]): boolean;
export declare function readAncestorManifestSnapshots(manifestDir: string): readonly ManifestSnapshot[] | undefined;
