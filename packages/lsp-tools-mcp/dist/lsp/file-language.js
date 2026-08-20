import { closeSync, openSync, readSync } from "node:fs";
import { basename, extname } from "node:path";
import { getLanguageId } from "./language-mappings.js";
const MAX_SHEBANG_BYTES = 4096;
export function classifyFileLanguage(filePath, content) {
    const extension = extname(filePath);
    if (extension !== "") {
        return { extension, languageId: getLanguageId(extension) };
    }
    const firstLine = content === undefined ? readFirstLine(filePath) : content.split(/\r?\n/, 1)[0];
    if (firstLine !== undefined && hasShellShebang(firstLine)) {
        return { extension: ".sh", languageId: "shellscript" };
    }
    return { extension: "", languageId: "plaintext" };
}
function readFirstLine(filePath) {
    let fileDescriptor;
    try {
        fileDescriptor = openSync(filePath, "r");
        const buffer = Buffer.allocUnsafe(MAX_SHEBANG_BYTES);
        const bytesRead = readSync(fileDescriptor, buffer, 0, buffer.length, 0);
        return buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/, 1)[0];
    }
    catch {
        return undefined;
    }
    finally {
        if (fileDescriptor !== undefined)
            closeSync(fileDescriptor);
    }
}
function hasShellShebang(firstLine) {
    if (!firstLine.startsWith("#!"))
        return false;
    const tokens = firstLine.slice(2).trim().split(/\s+/);
    const executable = tokens.shift();
    if (executable === undefined)
        return false;
    const interpreter = basename(executable);
    if (isSupportedShell(interpreter))
        return true;
    if (interpreter !== "env")
        return false;
    while (tokens[0]?.startsWith("-")) {
        tokens.shift();
    }
    while (tokens[0]?.includes("=")) {
        tokens.shift();
    }
    const envInterpreter = tokens[0];
    return envInterpreter !== undefined && isSupportedShell(basename(envInterpreter));
}
function isSupportedShell(interpreter) {
    return interpreter === "bash" || interpreter === "sh";
}
