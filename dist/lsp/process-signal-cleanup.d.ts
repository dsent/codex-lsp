type ProcessSignalCleanup = () => void | Promise<void>;
export interface ProcessSignalCleanupOptions {
    readonly terminateParent?: boolean;
}
export declare function installProcessSignalCleanup(cleanup: ProcessSignalCleanup, options?: ProcessSignalCleanupOptions): () => void;
export {};
