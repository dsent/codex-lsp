function abortReason(signal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}
function releaseSharedOperationWaiter(operation) {
    operation.waiterCount -= 1;
    if (operation.waiterCount > 0 || operation.settled)
        return;
    operation.controller.abort();
    operation.onAbandoned();
    void operation.promise.catch(() => undefined);
}
export function createSharedAbortableOperation(run, onSettled, onAbandoned) {
    const controller = new AbortController();
    let operation;
    const promise = run(controller.signal).finally(() => {
        operation.settled = true;
        onSettled();
    });
    operation = {
        controller,
        promise,
        onAbandoned,
        waiterCount: 0,
        settled: false,
    };
    void promise.catch(() => undefined);
    return operation;
}
export function awaitSharedAbortableOperation(operation, signal) {
    signal?.throwIfAborted();
    operation.waiterCount += 1;
    return new Promise((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            releaseSharedOperationWaiter(operation);
            reject(signal === undefined ? new DOMException("Aborted", "AbortError") : abortReason(signal));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        operation.promise.then((value) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            releaseSharedOperationWaiter(operation);
            resolve(value);
        }, (error) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            releaseSharedOperationWaiter(operation);
            reject(error);
        });
    });
}
