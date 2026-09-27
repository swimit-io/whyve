export declare const UNICODE_VERSION: string;
export declare const nonAlnum: RegExp;
export declare const nonFilename: RegExp;
export declare const wordCharacters: string;
/** Unicode normalization is stable for assigned characters (UAX #15). Characters
 * unassigned in the Python 3.13 baseline remain unchanged, with combining class 0,
 * even when a newer Node/Electron ICU assigns them a normalization or case map. */
export declare function normalize(value: string, form: 'NFC' | 'NFKC'): string;
export declare const casefold: (value: string) => string;
