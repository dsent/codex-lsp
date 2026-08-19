export interface SharedAbortableOperation<T> {
    readonly promise: Promise<T>;
    readonly controller: AbortController;
    readonly onAbandoned: () => void;
    waiterCount: number;
    settled: boolean;
}
export declare function createSharedAbortableOperation<T>(run: (signal: AbortSignal) => Promise<T>, onSettled: () => void, onAbandoned: () => void): SharedAbortableOperation<T>;
export declare function awaitSharedAbortableOperation<T>(operation: SharedAbortableOperation<T>, signal: AbortSignal | undefined): Promise<T>;
