import * as childProcess from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { reportBestEffortCleanupError } from "./cleanup-errors.js";
import { LspInvalidPathError, LspProcessSpawnError } from "./errors.js";
function isMissingProcessError(error) {
    if (!(error instanceof Error) || !("code" in error))
        return false;
    return error.code === "ESRCH";
}
function reportKillError(context, error) {
    if (!isMissingProcessError(error)) {
        reportBestEffortCleanupError(context, error);
    }
}
export function validateCwd(cwd) {
    try {
        if (!existsSync(cwd)) {
            return { valid: false, error: `Working directory does not exist: ${cwd}` };
        }
        const stats = statSync(cwd);
        if (!stats.isDirectory()) {
            return { valid: false, error: `Path is not a directory: ${cwd}` };
        }
        return { valid: true };
    }
    catch (err) {
        return {
            valid: false,
            error: `Cannot access working directory: ${cwd} (${err instanceof Error ? err.message : String(err)})`,
        };
    }
}
function wrap(proc) {
    const exitedPromise = new Promise((resolve) => {
        proc.once("close", (code) => resolve(code ?? 0));
        proc.once("error", () => resolve(1));
    });
    if (!proc.stdin || !proc.stdout || !proc.stderr) {
        throw new LspProcessSpawnError("Spawned process is missing one of stdin/stdout/stderr pipes");
    }
    return {
        stdin: proc.stdin,
        stdout: proc.stdout,
        stderr: proc.stderr,
        get pid() {
            return proc.pid ?? undefined;
        },
        get exitCode() {
            return proc.exitCode;
        },
        get killed() {
            return proc.killed;
        },
        exited: exitedPromise,
        kill(signal) {
            terminateProcessTree(proc, signal ?? "SIGTERM");
        },
    };
}
export function terminateProcessTree(proc, signal = "SIGTERM", options = {}) {
    const platform = options.platform ?? process.platform;
    if (platform === "win32" && proc.pid) {
        const args = ["/pid", String(proc.pid), "/f", "/t"];
        const result = options.spawnSync === undefined
            ? childProcess.spawnSync("taskkill", args, { stdio: "ignore" })
            : options.spawnSync("taskkill", args, { stdio: "ignore" });
        if (!result.error && result.status === 0)
            return;
        if (result.error)
            reportKillError("windows process tree kill", result.error);
    }
    if (platform !== "win32" && proc.pid) {
        try {
            process.kill(-proc.pid, signal);
            return;
        }
        catch (error) {
            reportKillError("process group kill", error);
        }
        const descendants = findDescendantProcessIds(proc.pid);
        try {
            proc.kill(signal);
        }
        catch (error) {
            reportKillError("process kill", error);
        }
        for (const pid of descendants) {
            try {
                process.kill(pid, signal);
            }
            catch (error) {
                reportKillError("descendant process kill", error);
            }
        }
        return;
    }
    try {
        proc.kill(signal);
    }
    catch (error) {
        reportKillError("process kill", error);
    }
}
function findDescendantProcessIds(rootPid) {
    const result = childProcess.spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" });
    if (result.error) {
        reportKillError("process tree inspection", result.error);
        return [];
    }
    if (result.status !== 0 || typeof result.stdout !== "string")
        return [];
    const childrenByParent = new Map();
    for (const line of result.stdout.split("\n")) {
        const [pidText, parentPidText] = line.trim().split(/\s+/, 2);
        if (pidText === undefined || parentPidText === undefined)
            continue;
        const pid = Number(pidText);
        const parentPid = Number(parentPidText);
        if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(parentPid))
            continue;
        const children = childrenByParent.get(parentPid) ?? [];
        children.push(pid);
        childrenByParent.set(parentPid, children);
    }
    const descendants = [];
    const pendingParents = [rootPid];
    while (pendingParents.length > 0) {
        const parentPid = pendingParents.pop();
        if (parentPid === undefined)
            break;
        for (const childPid of childrenByParent.get(parentPid) ?? []) {
            descendants.push(childPid);
            pendingParents.push(childPid);
        }
    }
    return descendants.reverse();
}
function isWindowsShellShim(command) {
    const lowerCommand = command.toLowerCase();
    return lowerCommand.endsWith(".cmd") || lowerCommand.endsWith(".bat");
}
function splitPath(pathValue, platform) {
    const separator = platform === "win32" ? ";" : delimiter;
    return pathValue.split(separator).filter(Boolean);
}
function getWindowsPathExtensions(env) {
    const rawExtensions = env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD";
    const extensions = rawExtensions
        .split(";")
        .map((extension) => extension.trim())
        .filter(Boolean)
        .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`));
    return [...new Set(["", ...extensions, ".exe", ".cmd", ".bat"])];
}
function resolveWindowsCommand(command, env) {
    const hasPathSeparator = command.includes("/") || command.includes("\\");
    const pathValue = env["PATH"] ?? env["Path"] ?? "";
    const baseDirectories = hasPathSeparator ? [""] : splitPath(pathValue, "win32");
    const extensions = getWindowsPathExtensions(env);
    for (const baseDirectory of baseDirectories) {
        for (const extension of extensions) {
            const candidate = baseDirectory ? join(baseDirectory, `${command}${extension}`) : `${command}${extension}`;
            if (existsSync(candidate))
                return candidate;
        }
    }
    return command;
}
export function createSpawnCommand(command, platform = process.platform, commandProcessor = process.env["ComSpec"] ?? "cmd.exe", env = process.env) {
    const [cmd, ...args] = command;
    if (!cmd) {
        throw new LspProcessSpawnError("[lsp] empty command");
    }
    if (platform !== "win32") {
        return { command: cmd, args, shell: false };
    }
    const resolvedCommand = resolveWindowsCommand(cmd, env);
    if (!isWindowsShellShim(resolvedCommand)) {
        return { command: resolvedCommand, args, shell: false };
    }
    return {
        command: commandProcessor,
        args: ["/d", "/s", "/c", resolvedCommand, ...args],
        shell: false,
    };
}
export function spawnProcess(command, options) {
    const cwdValidation = validateCwd(options.cwd);
    if (!cwdValidation.valid) {
        throw new LspInvalidPathError(`[lsp] ${cwdValidation.error}`);
    }
    const [cmd] = command;
    if (!cmd) {
        throw new LspProcessSpawnError("[lsp] empty command");
    }
    const preparedCommand = createSpawnCommand(command, process.platform, process.env["ComSpec"] ?? "cmd.exe", options.env);
    const proc = childProcess.spawn(preparedCommand.command, preparedCommand.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: preparedCommand.shell,
        detached: process.platform !== "win32",
    });
    return wrap(proc);
}
