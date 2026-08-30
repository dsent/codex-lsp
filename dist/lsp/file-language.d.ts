export interface FileLanguage {
    readonly extension: string;
    readonly languageId: string;
}
export declare function classifyFileLanguage(filePath: string, content?: string): FileLanguage;
