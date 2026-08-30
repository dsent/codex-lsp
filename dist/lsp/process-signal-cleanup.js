import { constants } from "node:os";
import { reportBestEffortCleanupError } from "./cleanup-errors.js";
const PROCESS_SIGNALS = process.platform === "win32" ? ["SIGINT", "SIGTERM", "SIGBREAK"] : ["SIGINT", "SIGTERM"];
const registrations = new Set();
const signalHandlers = new Map();
let handlersInstalled = false;
let handlingSignal = false;
function removeSignalHandlers() {
    if (!handlersInstalled)
        return;
    for (const [signal, handler] of signalHandlers)
        process.removeListener(signal, handler);
    signalHandlers.clear();
    handlersInstalled = false;
}
function signalExitCode(signal) {
    return 128 + (constants.signals[signal] ?? 1);
}
function terminateParent(signal) {
    if (process.platform === "win32" && signal === "SIGBREAK") {
        process.exit(signalExitCode(signal));
    }
    try {
        process.kill(process.pid, signal);
    }
    catch (error) {
        reportBestEffortCleanupError("signal re-delivery", error);
        process.exit(signalExitCode(signal));
    }
}
async function runCleanup(registration) {
    try {
        await registration.cleanup();
    }
    catch (error) {
        reportBestEffortCleanupError("signal cleanup", error);
    }
}
function handleSignal(signal) {
    if (handlingSignal)
        return;
    handlingSignal = true;
    const activeRegistrations = [...registrations];
    const shouldTerminateParent = activeRegistrations.some((registration) => registration.terminatesParent);
    void Promise.all(activeRegistrations.map(runCleanup)).then(() => {
        removeSignalHandlers();
        if (shouldTerminateParent) {
            terminateParent(signal);
            return;
        }
        handlingSignal = false;
        if (registrations.size > 0)
            ensureSignalHandlers();
    });
}
function ensureSignalHandlers() {
    if (handlersInstalled)
        return;
    for (const signal of PROCESS_SIGNALS) {
        const handler = () => handleSignal(signal);
        signalHandlers.set(signal, handler);
        process.on(signal, handler);
    }
    handlersInstalled = true;
}
export function installProcessSignalCleanup(cleanup, options = {}) {
    const registration = {
        cleanup,
        terminatesParent: options.terminateParent ?? false,
    };
    registrations.add(registration);
    ensureSignalHandlers();
    return () => {
        registrations.delete(registration);
        if (registrations.size === 0 && !handlingSignal)
            removeSignalHandlers();
    };
}
