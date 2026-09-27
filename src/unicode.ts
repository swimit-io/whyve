import data from './unicode-15.1.json';
export const UNICODE_VERSION = data.version;
const unassigned = new RegExp(`([${data.unassigned}])`, 'u');
const folds = data.casefold as Record<string, string>;
export const nonAlnum = new RegExp(`[^${data.alnum}]+`, 'gu');
export const nonFilename = new RegExp(`[^${data.alnum}\\-_.]+`, 'gu');
export const wordCharacters = data.alnum;
/** Unicode normalization is stable for assigned characters (UAX #15). Characters
 * unassigned in the Python 3.13 baseline remain unchanged, with combining class 0,
 * even when a newer Node/Electron ICU assigns them a normalization or case map. */
export function normalize(value: string, form: 'NFC' | 'NFKC'): string {
    return value.split(unassigned).map((segment, i) => i % 2 ? segment : segment.normalize(form)).join('');
}
export const casefold = (value: string) => [...value].map(c => folds[c] ?? c).join('');
