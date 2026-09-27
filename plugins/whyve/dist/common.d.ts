export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
/** Dynamic protocol documents are validated at the boundary before use. */
export type ObjectValue = Record<string, any>;
export declare const contracts: ObjectValue;
export declare const PROTOCOL = "context-common/v3";
export declare const VERSION: string;
export declare const EXIT: {
    readonly usage: 2;
    readonly notFound: 3;
    readonly conflict: 5;
    readonly integrity: 6;
    readonly internal: 1;
};
export declare class WhyveError extends Error {
    readonly code: string;
    readonly details: ObjectValue;
    readonly exitCode: number;
    constructor(code: string, message: string, details?: ObjectValue, exitCode?: number);
    envelope(): {
        ok: false;
        error: {
            code: string;
            message: string;
            details: ObjectValue;
        };
    };
}
export declare function toWhyveError(error: unknown): WhyveError;
export declare function withErrors<T>(fn: () => T): T;
export declare function fail(code: string, message: string, details?: ObjectValue, exitCode?: number): never;
export declare function check(condition: unknown, code: string, message: string, details?: ObjectValue, exitCode?: number): asserts condition;
export declare function object(value: unknown): value is ObjectValue;
export declare function exact(value: unknown, keys: string[], code?: string): asserts value is ObjectValue;
export declare const nfc: (value: string) => string;
export declare const codepoints: (value: string) => number;
/** Python orders strings by Unicode scalar, not UTF-16 code units. */
export declare function compareText(a: string, b: string): number;
export declare const normalizedKey: (value: string) => string;
export declare function canonicalJson(value: unknown): string;
export declare const sha256: (value: string | Uint8Array) => string;
export declare const canonicalDigest: (value: unknown) => string;
export declare const compactJson: (value: unknown) => string;
export declare const fileBytes: (text: string) => Buffer<ArrayBuffer>;
export declare const newId: () => string;
export declare const newPlanId: () => string;
export declare function requireId(value: unknown, field?: string): asserts value is string;
export declare function strictJson(text: string, code?: string): any;
export declare function substantive(value: unknown): value is string;
export declare function shortText(value: unknown, field: string, maximum: number, multiline?: boolean): string;
export declare function stringList(value: unknown, field: string, minimum?: number, maximum?: number, itemMaximum?: number): string[];
export declare function timestamp(value?: string): string;
export declare function date(value: string): string;
export declare function canonicalScope(value: string): string;
export declare function canonicalKey(value: string): string;
export declare const scopesOverlap: (a: string, b: string) => boolean;
export declare function filename(value: string): string;
export declare function naturalFilename(title: string): string;
