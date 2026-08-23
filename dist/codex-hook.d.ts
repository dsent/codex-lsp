export type DiagnosticsRunner = (filePath: string) => Promise<string>;
export interface CodexPostToolUseInput {
    session_id?: unknown;
    transcript_path?: unknown;
    tool_name?: unknown;
    tool_input?: unknown;
    tool_response?: unknown;
}
export interface MissingServerNoticeStore {
    claim(sessionKey: string, serverId: string): boolean;
}
export declare function runLspDiagnosticsText(filePath: string): Promise<string>;
export declare function runLspPostToolUseHook(input: CodexPostToolUseInput, runDiagnostics?: DiagnosticsRunner, missingServerNotices?: MissingServerNoticeStore, ignoredExtensions?: ReadonlySet<string>): Promise<string>;
export declare function hookIgnoredExtensionsFromEnvironment(raw?: string | undefined): ReadonlySet<string>;
export declare function createFileMissingServerNoticeStore(directory?: string): MissingServerNoticeStore;
export declare function extractMutatedFilePaths(input: CodexPostToolUseInput): string[];
export declare function runPostToolUseHookCli(stdin?: NodeJS.ReadStream): Promise<void>;
