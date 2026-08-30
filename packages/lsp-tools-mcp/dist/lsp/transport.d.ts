import { JsonRpcConnection } from "./json-rpc-connection.js";
import { type SpawnedProcess } from "./process.js";
import type { Diagnostic, ResolvedServer } from "./types.js";
export declare class LspClientTransport {
    protected readonly root: string;
    protected readonly server: ResolvedServer;
    protected proc: SpawnedProcess | null;
    protected connection: JsonRpcConnection | null;
    protected readonly stderrBuffer: string[];
    protected processExited: boolean;
    protected readonly diagnosticsStore: Map<string, Diagnostic[]>;
    protected readonly diagnosticsPublished: Set<string>;
    private readonly diagnosticsWaiters;
    constructor(root: string, server: ResolvedServer);
    pid(): number | undefined;
    command(): string[];
    start(): Promise<void>;
    protected startStderrReading(): void;
    private isConnectionClosedError;
    protected sendRequest<T>(method: string): Promise<T>;
    protected sendRequest<T>(method: string, params: unknown): Promise<T>;
    protected sendNotification(method: string): Promise<void>;
    protected sendNotification(method: string, params: unknown): Promise<void>;
    isAlive(): boolean;
    stop(): Promise<void>;
    getStoredDiagnostics(uri: string): Diagnostic[];
    hasStoredDiagnostics(uri: string): boolean;
    /** Forget that the server has answered for this URI, before its content changes. */
    markDiagnosticsStale(uri: string): void;
    /** Resolves true once the server publishes for this URI, false if the deadline passes first. */
    waitForDiagnostics(uri: string, timeoutMs: number): Promise<boolean>;
}
