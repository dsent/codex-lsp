import type { ChildProcess } from "node:child_process";
export interface SpawnedProcess {
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    pid: number | undefined;
    exitCode: number | null;
    exited: Promise<number>;
    kill(signal?: NodeJS.Signals): void;
    killed: boolean;
}
export interface SpawnOptions {
    cwd: string;
    env: Record<string, string | undefined>;
}
export interface PreparedSpawnCommand {
    command: string;
    args: string[];
    shell: false;
}
export interface ProcessTreeTerminationOptions {
    readonly platform?: NodeJS.Platform;
    readonly spawnSync?: (command: string, args: string[], options: {
        readonly stdio: "ignore";
    }) => {
        readonly error?: Error;
        readonly status: number | null;
    };
}
export declare function validateCwd(cwd: string): {
    valid: boolean;
    error?: string;
};
export declare function terminateProcessTree(proc: ChildProcess, signal?: NodeJS.Signals, options?: ProcessTreeTerminationOptions): void;
export declare function createSpawnCommand(command: string[], platform?: NodeJS.Platform, commandProcessor?: string, env?: Record<string, string | undefined>): PreparedSpawnCommand;
export declare function spawnProcess(command: string[], options: SpawnOptions): SpawnedProcess;
