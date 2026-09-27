import { ObjectValue } from './common';
import { ContextDocument } from './documents';
import { StoredRecord } from './record';
import type { Kind, RowFields } from './host-types';
/**
 * Reads a context-common/v2 record into the v3 model without writing. The same mapping drives read
 * compatibility and the explicit format migration. Unknown values are preserved, never guessed.
 */
export type RefHeaderPreset = 'howse' | null;
declare const HOWSE_REFS: Record<string, string>;
export interface LegacyNote {
    code: string;
    field?: string;
    detail?: string;
}
export interface Converted {
    record: StoredRecord;
    notes: LegacyNote[];
}
export declare const legacyKind: (schema: string) => Kind;
export declare function convertV2(doc: ContextDocument, state: 'current' | 'history', preset?: RefHeaderPreset): Converted;
/** v2 area index rows as v3 list fields. rawLine keeps the stored v2 line. */
export declare function rowFromV2(row: ObjectValue, kind: Kind): Omit<RowFields, 'path'> & {
    path: string;
};
export { HOWSE_REFS };
