type ExtensionPriority = (extension: string) => number;
export declare function inferExtensionFromDirectory(directory: string, extensionPriority?: ExtensionPriority): string | null;
export {};
