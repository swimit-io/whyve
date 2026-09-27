import { ObjectValue } from './common';
export interface FileChange {
    path: string;
    content: Buffer | null;
    expected: string | null;
    mode?: number;
}
export interface FilesystemOptions {
    lockTimeoutMs?: number;
}
export declare function realDirectory(value: string): string;
export declare function identity(root: string): ObjectValue;
export declare function contained(root: string, relative: string): string;
export declare function bytes(root: string, relative: string, maximum?: number): Buffer | null;
export declare function utf8(raw: Buffer): string;
export declare function readText(root: string, relative: string): string;
export declare function syncDirectory(directory: string): void;
export declare function atomicWrite(root: string, relative: string, content: Buffer, mode?: number): void;
export declare function digestOrNull(root: string, relative: string): string | null;
/** Recovery reads at most this journal; transaction() refuses anything larger so a crash never locks the vault. */
export declare const JOURNAL_MAX_ENTRIES = 8192;
export declare const JOURNAL_MAX_BYTES: number;
/** All readers and writers in this runtime share the same lease. No process.env/cwd mutation. */
export declare class Filesystem {
    readonly root: string;
    private readonly timeout;
    constructor(root: string, options?: FilesystemOptions);
    private guard;
    adoptLegacy(confirmLegacyStopped: boolean): ObjectValue;
    recoverAbandoned(): Promise<ObjectValue>;
    locked<T>(fn: () => T | Promise<T>): Promise<T>;
    private restore;
    private cleanupTemps;
    recover(): void;
    /** Caller must hold locked(). The disk journal survives process termination. */
    transaction(changes: FileChange[]): string[];
}
